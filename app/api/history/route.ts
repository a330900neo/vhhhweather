import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 600`;
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24h ago
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any = {};

  // 1. Create hourly slots using a UNIQUE KEY (Day + Hour) to prevent overlaps
  for (let i = 0; i <= 36; i++) {
    const slot = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
    
    const timeLabel = slot.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
    }).split(':')[0] + ':00';
    
    // Creates a key like "25-16:00" so yesterday and today are separated
    const uniqueKey = slot.toLocaleDateString('en-HK', { 
      day: '2-digit', timeZone: 'Asia/Hong_Kong' 
    }) + '-' + timeLabel;
    
    groups[uniqueKey] = { 
      time: timeLabel, 
      timestamp: slot.getTime(),
      isFuture: slot > now 
    };
  }

  // 2. Map real data into the slots
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
        
        // Only save actual METAR text to the log table, NOT ATIS
        groups[uniqueKey].raw = r.raw_text;
      } 
      else if (r.data_type === 'TAF') {
        const maxMatch = r.raw_text.match(/\[MAX:\s*\d{3}(\d{2})KT\]/);
        const cleanTaf = r.raw_text.replace(/\[MAX:.*?\]\s*/, '');
        const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
        const tafTempMatch = cleanTaf.match(/TX(\d{2})/);

        if (!groups[uniqueKey].tafSpd) {
          groups[uniqueKey].tafSpd = maxMatch ? parseInt(maxMatch[1]) : parseInt(baseWind?.[2] || "0");
          groups[uniqueKey].tafDir = parseInt(baseWind?.[1] || "0");
          groups[uniqueKey].tafTemp = tafTempMatch ? parseInt(tafTempMatch[1]) : null;
        }
      }
    }
  });

  // 3. Fill future slots
  const latestTafRow = rows.find(r => r.data_type === 'TAF');
  
  if (latestTafRow) {
    const maxMatch = latestTafRow.raw_text.match(/\[MAX:\s*\d{3}(\d{2})KT\]/);
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
    const tafTempMatch = cleanTaf.match(/TX(\d{2})/);

    const latestTafSpd = maxMatch ? parseInt(maxMatch[1]) : parseInt(baseWind?.[2] || "0");
    const latestTafDir = parseInt(baseWind?.[1] || "0");
    const latestTafTemp = tafTempMatch ? parseInt(tafTempMatch[1]) : null;

    Object.values(groups).forEach((group: any) => {
      if (group.isFuture) {
        group.tafSpd = latestTafSpd;
        group.tafDir = latestTafDir;
        group.tafTemp = latestTafTemp;
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}
