import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
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
        'User-Agent': 'Mozilla/5.0'
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
  const past24h = new Date(now.getTime() - (24 * 60 * 60 * 1000)); 

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timeline: any[] = [];

  // 2. Map PAST Actuals (Every single DB log gets its own point on the chart)
  const validPastRows = rows.filter(r => new Date(r.created_at) >= past24h);
  
  validPastRows.forEach(r => {
    const rDate = new Date(r.created_at);
    const timeLabel = rDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    });
    const dayLabel = rDate.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    });

    const point: any = {
      time: `${dayLabel}/${timeLabel}`,
      timestamp: rDate.getTime(),
      isFuture: false,
      actSpd: null, actDir: null, actGust: null, actTemp: null, 
      tafSpd: null, tafDir: null, tafGust: null, tafTemp: null, 
      raw: r.raw_text, dataType: r.data_type
    };

    if (r.data_type === 'METAR') {
      // UPDATED: Now captures VRB, Speed, and Gusts
      const wind = r.raw_text.match(/(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT/);
      const tempMatch = r.raw_text.match(/\b(M?\d{2})\/(M?\d{2})\b/); 

      if (wind) {
        point.actDir = wind[1] === 'VRB' ? null : parseInt(wind[1]);
        point.actSpd = parseInt(wind[2]);
        if (wind[3]) point.actGust = parseInt(wind[3]); // Assign actual gust
      }
      if (tempMatch) {
        const tStr = tempMatch[1];
        point.actTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
      }
    }
    
    timeline.push(point);
  });

  // 3. Generate hourly slots for the FUTURE (+30 hours forecast line)
  for (let i = 1; i <= 30; i++) {
    const fDate = new Date(now.getTime() + (i * 60 * 60 * 1000));
    fDate.setMinutes(0, 0, 0); // Round future to exact hour

    const timeLabel = fDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    });
    const dayLabel = fDate.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    });
    
    timeline.push({ 
      time: `${dayLabel}/${timeLabel}`, 
      timestamp: fDate.getTime(),
      isFuture: true,
      actSpd: null, actDir: null, actGust: null, actTemp: null, 
      tafSpd: null, tafDir: null, tafGust: null, tafTemp: null, 
      raw: null, dataType: null
    });
  }

  // Ensure perfect chronological order from oldest to furthest future
  timeline.sort((a, b) => a.timestamp - b.timestamp);

  // 4. Extract all historical TAFs from DB to back-fill forecast lines
  const allTafs = rows
    .filter(r => r.data_type === 'TAF')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestTafRow = allTafs[0];
  let futureBaseSpd = 0, futureBaseDir: number | null = 0, futureBaseGust: number | null = null, futureBaseTemp: number | null = null;
  
  if (latestTafRow) {
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT/);
    const txMatch = cleanTaf.match(/TX(M?\d{2})\//); 

    if (baseWind) {
      futureBaseDir = baseWind[1] === 'VRB' ? null : parseInt(baseWind[1]);
      futureBaseSpd = parseInt(baseWind[2]);
      if (baseWind[3]) futureBaseGust = parseInt(baseWind[3]); // Assign future baseline gust
    }
    if (txMatch) {
      const tStr = txMatch[1];
      futureBaseTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
    }
  }

  // 5. Apply TAF data to EVERY point in the timeline
  timeline.forEach((point) => {
    if (!point.isFuture) {
      // Find the most recent TAF issued *before* or *during* this specific timestamp
      const historicalTaf = allTafs.find(t => new Date(t.created_at).getTime() <= point.timestamp);
      
      if (historicalTaf) {
        const cleanTaf = historicalTaf.raw_text.replace(/\[MAX:.*?\]\s*/, '');
        const baseWind = cleanTaf.match(/(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT/);
        const txMatch = cleanTaf.match(/TX(M?\d{2})\//);
        
        if (baseWind) {
          point.tafDir = baseWind[1] === 'VRB' ? null : parseInt(baseWind[1]);
          point.tafSpd = parseInt(baseWind[2]);
          if (baseWind[3]) point.tafGust = parseInt(baseWind[3]); // Assign past forecast gust
        }
        if (txMatch) {
          const tStr = txMatch[1];
          point.tafTemp = tStr.startsWith('M') ? -parseInt(tStr.substring(1)) : parseInt(tStr);
        }
      }
    } else {
      // FUTURE Forecasts (Live JSON blocks)
      point.tafSpd = futureBaseSpd;
      point.tafDir = futureBaseDir;
      point.tafGust = futureBaseGust;
      point.tafTemp = futureBaseTemp;

      if (liveTafFcsts.length > 0) {
        const activeFcsts = liveTafFcsts.filter((fcst: any) => {
          const fromTime = typeof fcst.timeFrom === 'number' ? (fcst.timeFrom < 10000000000 ? fcst.timeFrom * 1000 : fcst.timeFrom) : new Date(fcst.timeFrom).getTime();
          const toTime = typeof fcst.timeTo === 'number' ? (fcst.timeTo < 10000000000 ? fcst.timeTo * 1000 : fcst.timeTo) : new Date(fcst.timeTo).getTime();
          
          return point.timestamp >= fromTime && point.timestamp < toTime;
        });

        if (activeFcsts.length > 0) {
          activeFcsts.forEach((fcst: any) => {
            if (fcst.wspd !== undefined && fcst.wspd !== null) point.tafSpd = fcst.wspd;
            if (fcst.wgst !== undefined && fcst.wgst !== null) point.tafGust = fcst.wgst; // Extract wgst from JSON
            if (fcst.wdir !== undefined && fcst.wdir !== null) point.tafDir = fcst.wdir === 'VRB' ? null : fcst.wdir;
            if (fcst.temperature !== undefined && fcst.temperature !== null) point.tafTemp = fcst.temperature;
          });
        }
      }
    }
  });
  
  return NextResponse.json(timeline);
}
