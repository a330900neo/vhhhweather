import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 600`;
  
  // 1. Fetch LIVE structured JSON with a User-Agent header so they don't block us
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

  // 2. Create hourly slots using the Unique Key
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
      isFuture: slot > now 
    };
  }

  // 3. Map real DB data (METARs)
  rows.forEach(r => {
    const rDate = new Date(r.created_at);
    const timeLabel = rDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    }).split(':')[0] + ':00';
    const uniqueKey = rDate.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    }) + '-' + timeLabel;

    if (groups[uniqueKey] && r.data_type === 'METAR') {
      const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
      if (!groups[uniqueKey].actSpd) groups[uniqueKey].actSpd = parseInt(wind?.[2] || "0");
      if (!groups[uniqueKey].actDir) groups[uniqueKey].actDir = parseInt(wind?.[1] || "0");
      groups[uniqueKey].raw = r.raw_text;
    }
  });

  // 4. SAFETY NET: Use DB TAF as a global fallback for the chart
  // (In case AviationWeather API is down or blocks the request)
  const latestTafRow = rows.find(r => r.data_type === 'TAF');
  if (latestTafRow) {
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
    const fallbackSpd = parseInt(baseWind?.[2] || "0");
    const fallbackDir = parseInt(baseWind?.[1] || "0");

    Object.values(groups).forEach((group: any) => {
      // Set the baseline flat forecast so the chart is never completely empty
      if (!group.tafSpd) group.tafSpd = fallbackSpd;
      if (!group.tafDir) group.tafDir = fallbackDir;
    });
  }

  // 5. THE MAGIC: Overwrite the safety net with precise API hour-by-hour JSON data
  if (liveTafFcsts.length > 0) {
    Object.values(groups).forEach((group: any) => {
      const activeFcst = liveTafFcsts.find((fcst: any) => {
        // Bulletproof time converter: handles both Unix seconds AND ISO Strings seamlessly
        const fromTime = typeof fcst.timeFrom === 'number' ? (fcst.timeFrom < 10000000000 ? fcst.timeFrom * 1000 : fcst.timeFrom) : new Date(fcst.timeFrom).getTime();
        const toTime = typeof fcst.timeTo === 'number' ? (fcst.timeTo < 10000000000 ? fcst.timeTo * 1000 : fcst.timeTo) : new Date(fcst.timeTo).getTime();
        
        return group.timestamp >= fromTime && group.timestamp < toTime;
      });

      if (activeFcst) {
        group.tafSpd = activeFcst.wspd ?? group.tafSpd;
        group.tafDir = activeFcst.wdir ?? group.tafDir;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}
