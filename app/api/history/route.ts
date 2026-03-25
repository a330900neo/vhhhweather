import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  // Increase limit to ensure we capture enough historical data points
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 400`;
  
  const now = new Date();
  const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24h ago
  
  const groups: any = {};

  // 1. Create hourly slots for the full 36-hour range (Fixed TypeScript Logic)
  for (let i = 0; i <= 36; i++) {
    const slot = new Date(startTime.getTime() + (i * 60 * 60 * 1000));
    const rawLabel = slot.toLocaleTimeString('en-HK', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false, 
      timeZone: 'Asia/Hong_Kong' 
    });
    // Force to :00 format to ensure clean hourly buckets
    const label = rawLabel.split(':')[0] + ':00';
    
    groups[label] = { 
      time: label, 
      timestamp: slot.getTime(),
      isFuture: slot > now 
    };
  }

  // 2. Map real data into the slots
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
      // Keep raw data for the table display
      groups[label].raw = r.raw_text;
    }
  });

  const formatted = Object.values(groups).sort((a: any, b: any) => a.timestamp - b.timestamp);
  return NextResponse.json(formatted);
}