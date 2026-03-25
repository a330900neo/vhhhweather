import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const revalidate = 0; 

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 400`;
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24h ago
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: any = {};

  // 1. Create hourly slots for the full 36-hour range
  for (let i = 0; i <= 36; i++) {
    const slot = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
    const rawLabel = slot.toLocaleTimeString('en-HK', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false, 
      timeZone: 'Asia/Hong_Kong' 
    });
    const label = rawLabel.split(':')[0] + ':00';
    
    groups[label] = { 
      time: label, 
      timestamp: slot.getTime(),
      isFuture: slot > now 
    };
  }

  // 2. Map real data into the slots (Past Data)
  rows.forEach(r => {
    const rDate = new Date(r.created_at);
    const rawLabel = rDate.toLocaleTimeString('en-HK', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false, 
      timeZone: 'Asia/Hong_Kong' 
    });
    const label = rawLabel.split(':')[0] + ':00';

    if (groups[label]) {
      if (r.data_type === 'METAR') {
        const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
        const temp = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);
        
        groups[label].actSpd = parseInt(wind?.[2] || "0");
        groups[label].actDir = parseInt(wind?.[1] || "0");
        groups[label].actTemp = parseInt(temp?.[1] || "0");
      } 
      else if (r.data_type === 'TAF') {
        const maxMatch = r.raw_text.match(/\[MAX:\s*\d{3}(\d{2})KT\]/);
        const cleanTaf = r.raw_text.replace(/\[MAX:.*?\]\s*/, '');
        const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
        const tafTempMatch = cleanTaf.match(/TX(\d{2})/);

        groups[label].tafSpd = maxMatch ? parseInt(maxMatch[1]) : parseInt(baseWind?.[2] || "0");
        groups[label].tafDir = parseInt(baseWind?.[1] || "0");
        groups[label].tafTemp = tafTempMatch ? parseInt(tafTempMatch[1]) : null;
      }
      groups[label].raw = r.raw_text;
    }
  });

  // 3. --- FILL THE FUTURE SLOTS WITH THE LATEST FORECAST ---
  const latestTafRow = rows.find(r => r.data_type === 'TAF');
  
  if (latestTafRow) {
    // Parse the most recent TAF we have
    const maxMatch = latestTafRow.raw_text.match(/\[MAX:\s*\d{3}(\d{2})KT\]/);
    const cleanTaf = latestTafRow.raw_text.replace(/\[MAX:.*?\]\s*/, '');
    const baseWind = cleanTaf.match(/(\d{3})(\d{2})KT/);
    const tafTempMatch = cleanTaf.match(/TX(\d{2})/);

    const latestTafSpd = maxMatch ? parseInt(maxMatch[1]) : parseInt(baseWind?.[2] || "0");
    const latestTafDir = parseInt(baseWind?.[1] || "0");
    const latestTafTemp = tafTempMatch ? parseInt(tafTempMatch[1]) : null;

    // Loop through our time slots, and if it's in the future, project these values forward
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
