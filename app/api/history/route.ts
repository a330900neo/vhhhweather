import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 300`;
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24h ago
  const endTime = new Date(now.getTime() + (12 * 60 * 60 * 1000));  // 12h future
  
  const groups: any = {};

  // 1. Create hourly slots for the full 36-hour range to force the scale
  for (let i = 0; i <= 36; i++) {
    const slot = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
    const label = slot.toLocaleTimeString('en-HK', { 
      hour: '2-digit', minute: '00', hour12: false, timeZone: 'Asia/Hong_Kong' 
    });
    groups[label] = { 
      time: label, 
      timestamp: slot.getTime(),
      isFuture: slot > now 
    };
  }

  // 2. Map real data into the closest hourly slots
  rows.forEach(r => {
    const rDate = new Date(r.created_at);
    // Inside your API loop
    const label = slot.toLocaleTimeString('en-HK', { 
     hour: '2-digit', 
     minute: '2-digit', // Changed from '00' to '2-digit'
     hour12: false, 
     timeZone: 'Asia/Hong_Kong' 
  }).split(':')[0] + ':00'; // Force to :00

    if (groups[label]) {
      const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
      const temp = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);
      const tafTempMatch = r.raw_text.match(/TX(\d{2})/);

      if (r.data_type === 'METAR') {
        groups[label].actSpd = parseInt(wind?.[2] || "0");
        groups[label].actDir = parseInt(wind?.[1] || "0");
        groups[label].actTemp = parseInt(temp?.[1] || "0");
      } else if (r.data_type === 'TAF') {
        groups[label].tafSpd = parseInt(wind?.[2] || "0");
        groups[label].tafDir = parseInt(wind?.[1] || "0");
        groups[label].tafTemp = tafTempMatch ? parseInt(tafTempMatch[1]) : null;
      }
      // Store raw data for the table (optional)
      groups[label].raw = r.raw_text;
      groups[label].type = r.data_type;
    }
  });

  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}