import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 600`;
  
  // 1. Fetch LIVE structured JSON for the FUTURE predictions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveTafFcsts: any[] = [];
  try {
    const tafRes = await fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json', { 
      cache: 'no-store',
      headers: { 
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const tafJson = await tafRes.json();
    if (tafJson && tafJson.length > 0 && tafJson[0].fcsts) {
      liveTafFcsts = tafJson[0].fcsts;
    }
  } catch (err) {
    console.error("Failed to fetch live TAF JSON:", err);
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // Start 24 hours ago
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any = {};

  // 2. Create exact hourly slots (54 hours = 24h past + 30h future)
  for (let i = 0; i <= 54; i++) {
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
      actSpd: null, actDir: null, actTemp: null, 
      tafSpd: null, tafDir: null, tafTemp: null, 
      raw: null, dataType: null
    };
  }

  // 3. Map Actuals (METAR) and DB Logs into the timeline
  rows.forEach(r => {
    const rDate = new Date(r.created_at);
    const timeLabel = rDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    }).split(':')[0] + ':00';
    const uniqueKey = rDate.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    }) + '-' + timeLabel;

    if (groups[uniqueKey]) {
      if (r.data_type === 'METAR') {
        const wind = r.raw_text.match(/(\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
        const tempMatch = r.raw_text.match(/\b(M?\d{2})\/(M?\d{2})\b/); 

        if (!groups[uniqueKey].actSpd && wind) groups[uniqueKey].actSpd = parseInt(wind[2]);
        if (!groups[uniqueKey].actDir && wind) groups[uniqueKey].actDir = parseInt(wind[1]);
        if (!groups[uniqueKey].actTemp && tempMatch) {
          const tStr = tempMatch[1];
          groups[uniqueKey].actTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
        }
      }

      if (!groups[uniqueKey].raw && (r.data_type.includes('ATIS') || r.data_type === 'METAR' || r.data_type === 'TAF')) {
        groups[uniqueKey].raw = r.raw_text;
        groups[uniqueKey].dataType = r.data_type;
      }
    }
  });

  // 4. Extract all historical TAFs from DB
  const allTafs = rows
    .filter(r => r.data_type === 'TAF')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // 5. Apply PAST Forecasts (Find the closest DB TAF for each past hour)
  Object.values(groups).forEach((group: any) => {
    if (!group.isFuture) {
      // Find the most recent TAF issued *before* or *during* this specific hour
      const historicalTaf = allTafs.find(t => new Date(t.created_at).getTime() <= group.timestamp);
      
      if (historicalTaf) {
        const cleanTaf = historicalTaf.raw_text.replace(/\[MAX:.*?\]\s*/, '');
        const baseWind = cleanTaf.match(/(\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
        const txMatch = cleanTaf.match(/TX(M?\d{2})\//);
        
        if (baseWind) {
          group.tafDir = parseInt(baseWind[1]);
          group.tafSpd = parseInt(baseWind[2]);
        }
        if (txMatch) {
          const tStr = txMatch[1];
          group.tafTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
        }
      }
    }
  });

  // 6. Apply FUTURE Forecasts (Live JSON blocks)
  const latestTafRow = allTafs[0];
  let futureBaseSpd = 0, futureBaseDir = 0, futureBaseTemp: number | null = null;
  
  if (latestTafRow) {
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(\d{3})(\d{2,3})(?:G\d{2,3})?KT/);
    const txMatch = cleanTaf.match(/TX(M?\d{2})\//); 

    if (baseWind) {
      futureBaseDir = parseInt(baseWind[1]);
      futureBaseSpd = parseInt(baseWind[2]);
    }
    if (txMatch) {
      const tStr = txMatch[1];
      futureBaseTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
    }
  }

  Object.values(groups).forEach((group: any) => {
    if (group.isFuture) {
      // Set the baseline first
      group.tafSpd = futureBaseSpd;
      group.tafDir = futureBaseDir;
      group.tafTemp = futureBaseTemp;

      // Overwrite with detailed hour-by-hour JSON bumps
      if (liveTafFcsts.length > 0) {
        const activeFcsts = liveTafFcsts.filter((fcst: any) => {
          const fromTime = typeof fcst.timeFrom === 'number' 
            ? (fcst.timeFrom < 10000000000 ? fcst.timeFrom * 1000 : fcst.timeFrom) 
            : new Date(fcst.timeFrom).getTime();
          const toTime = typeof fcst.timeTo === 'number' 
            ? (fcst.timeTo < 10000000000 ? fcst.timeTo * 1000 : fcst.timeTo) 
            : new Date(fcst.timeTo).getTime();
          
          return group.timestamp >= fromTime && group.timestamp < toTime;
        });

        if (activeFcsts.length > 0) {
          activeFcsts.forEach((fcst: any) => {
            if (fcst.wspd !== undefined && fcst.wspd !== null) group.tafSpd = fcst.wspd;
            if (fcst.wdir !== undefined && fcst.wdir !== null) group.tafDir = fcst.wdir;
            if (fcst.temperature !== undefined && fcst.temperature !== null) group.tafTemp = fcst.temperature;
          });
        }
      }
    }
  });
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}