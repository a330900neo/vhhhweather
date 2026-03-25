import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  // 1. Fetch your historical actuals from the database
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 600`;
  
  // 2. NEW: Fetch LIVE structured JSON directly from AviationWeather for perfect charting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveTafFcsts: any[] = [];
  try {
    const tafRes = await fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json', { cache: 'no-store' });
    const tafJson = await tafRes.json();
    if (tafJson && tafJson.length > 0 && tafJson[0].fcsts) {
      liveTafFcsts = tafJson[0].fcsts; // This is the hour-by-hour array!
    }
  } catch (err) {
    console.error("Failed to fetch live TAF JSON:", err);
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24h ago
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any = {};

  // 3. Create hourly slots using the Unique Key
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

  // 4. Map real DB data (METARs for actuals, old TAFs as a fallback)
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
        const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
        const temp = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);
        
        if (!groups[uniqueKey].actSpd) groups[uniqueKey].actSpd = parseInt(wind?.[2] || "0");
        if (!groups[uniqueKey].actDir) groups[uniqueKey].actDir = parseInt(wind?.[1] || "0");
        if (!groups[uniqueKey].actTemp) groups[uniqueKey].actTemp = parseInt(temp?.[1] || "0");
        groups[uniqueKey].raw = r.raw_text; // Keep for the table
      } 
      else if (r.data_type === 'TAF' && !groups[uniqueKey].tafSpd) {
        // Fallback reading just in case the JSON fetch fails
        const cleanTaf = r.raw_text.replace(/\[MAX:.*?\]\s*/, '');
        const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
        groups[uniqueKey].tafSpd = parseInt(baseWind?.[2] || "0");
        groups[uniqueKey].tafDir = parseInt(baseWind?.[1] || "0");
      }
    }
  });

  // 5. THE MAGIC: Snap the precise hour-by-hour JSON data onto the timeline
  if (liveTafFcsts.length > 0) {
    Object.values(groups).forEach((group: any) => {
      // Find the specific forecast block that covers this exact hour's timestamp
      const activeFcst = liveTafFcsts.find((fcst: any) => {
        const fromTime = new Date(fcst.timeFrom).getTime();
        const toTime = new Date(fcst.timeTo).getTime();
        // Check if our chart's hour falls inside this block
        return group.timestamp >= fromTime && group.timestamp < toTime;
      });

      if (activeFcst) {
        // AviationWeather gives us clean numbers, no regex needed!
        // We set BOTH past and future slots so the blue line acts as a complete trend line
        group.tafSpd = activeFcst.wspd ?? group.tafSpd;
        group.tafDir = activeFcst.wdir ?? group.tafDir;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}
