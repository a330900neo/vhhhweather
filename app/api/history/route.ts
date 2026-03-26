import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 600`;
  
  // 1. Fetch LIVE structured JSON with a User-Agent header
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveTafFcsts: any[] = [];
  try {
    const tafRes = await fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json', { 
      cache: 'no-store',
      headers: { 'User-Agent': 'VHHH-Weather-App/1.0' }
    });
    const tafJson = await tafRes.json();
    if (tafJson && tafJson.length > 0 && tafJson[0].fcsts) {
      liveTafFcsts = tafJson[0].fcsts;
    }
  } catch (err) {
    console.error("Failed to fetch live TAF JSON:", err);
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); 
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any = {};

  // 2. Create exact hourly slots to map data onto
  for (let i = 0; i <= 36; i++) {
    const slot = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
    const timeLabel = slot.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    }).split(':')[0] + ':00';
    
    const uniqueKey = slot.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    }) + '-' + timeLabel;
    
    groups[uniqueKey] = { 
      time: timeLabel, 
      timestamp: slot.getTime(),
      isFuture: slot > now,
      actSpd: null, 
      actDir: null,
      actTemp: null, // NEW: Temperature
      tafSpd: null, 
      tafDir: null,
      tafTemp: null, // NEW: Temperature
      raw: null,
      dataType: null
    };
  }

  // 3. Map real DB data (METARs & ATIS) into the timeline
  rows.forEach(r => {
    const rDate = new Date(r.created_at);
    const timeLabel = rDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    }).split(':')[0] + ':00';
    const uniqueKey = rDate.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    }) + '-' + timeLabel;

    if (groups[uniqueKey]) {
      // If it's a METAR, extract the actual observed wind and temperature points
      if (r.data_type === 'METAR') {
        const wind = r.raw_text.match(/(\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
        const tempMatch = r.raw_text.match(/\b(M?\d{2})\/(M?\d{2})\b/); // Extracts e.g. 25/20 or M02/M05

        if (!groups[uniqueKey].actSpd && wind) groups[uniqueKey].actSpd = parseInt(wind[2]);
        if (!groups[uniqueKey].actDir && wind) groups[uniqueKey].actDir = parseInt(wind[1]);
        
        if (!groups[uniqueKey].actTemp && tempMatch) {
          const tStr = tempMatch[1];
          groups[uniqueKey].actTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
        }
      }

      // Attach the raw text and type for the frontend LOG table (Favors the most recent log in that hour, which includes ATIS)
      if (!groups[uniqueKey].raw && (r.data_type.includes('ATIS') || r.data_type === 'METAR')) {
        groups[uniqueKey].raw = r.raw_text;
        groups[uniqueKey].dataType = r.data_type;
      }
    }
  });

  // 4. Extract TAF Fallback Data (Base Forecast & Max Temp)
  const latestTafRow = rows.find(r => r.data_type === 'TAF');
  let fallbackSpd = 0, fallbackDir = 0, fallbackTemp: number | null = null;
  
  if (latestTafRow) {
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
    const txMatch = cleanTaf.match(/TX(M?\d{2})\//); // Extract TX (Max Temp) e.g., TX32/

    if (baseWind) {
      fallbackDir = parseInt(baseWind[1]);
      fallbackSpd = parseInt(baseWind[2]);
    }
    if (txMatch) {
      const tStr = txMatch[1];
      fallbackTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
    }

    // Apply baseline to all slots so the chart is never totally empty
    Object.values(groups).forEach((group: any) => {
      if (!group.tafSpd) group.tafSpd = fallbackSpd;
      if (!group.tafDir) group.tafDir = fallbackDir;
      if (!group.tafTemp && fallbackTemp !== null) group.tafTemp = fallbackTemp;
    });
  }

  // 5. THE MAGIC: Map complex JSON timeframe blocks to overwrite the flat lines hour-by-hour
  if (liveTafFcsts.length > 0) {
    Object.values(groups).forEach((group: any) => {
      
      // Filter out all forecast blocks that overlap with this specific hour
      const activeFcsts = liveTafFcsts.filter((fcst: any) => {
        const fromTime = typeof fcst.timeFrom === 'number' 
          ? (fcst.timeFrom < 10000000000 ? fcst.timeFrom * 1000 : fcst.timeFrom) 
          : new Date(fcst.timeFrom).getTime();
        const toTime = typeof fcst.timeTo === 'number' 
          ? (fcst.timeTo < 10000000000 ? fcst.timeTo * 1000 : fcst.timeTo) 
          : new Date(fcst.timeTo).getTime();
        
        return group.timestamp >= fromTime && group.timestamp < toTime;
      });

      // Apply them in order. TEMPO/BECMG blocks apply last, generating the accurate "bumpy" lines
      if (activeFcsts.length > 0) {
        activeFcsts.forEach((fcst: any) => {
          if (fcst.wspd !== undefined && fcst.wspd !== null) group.tafSpd = fcst.wspd;
          if (fcst.wdir !== undefined && fcst.wdir !== null) group.tafDir = fcst.wdir;
          // If the NOAA JSON explicitly provides an hourly temperature block, use it over the TX Fallback
          if (fcst.temperature !== undefined && fcst.temperature !== null) group.tafTemp = fcst.temperature;
        });
      }
    });
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}