import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  // Fetch more rows to ensure we have a good overlap
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 150`;
  
  // Create a map to group data by the same minute
  const groups: any = {};

  rows.forEach(r => {
    const timeKey = new Date(r.created_at).toLocaleTimeString('en-HK', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });

    if (!groups[timeKey]) {
      groups[timeKey] = { time: timeKey };
    }

    const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
    const temp = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);

    if (r.data_type === 'METAR') {
      groups[timeKey].actSpd = parseInt(wind?.[2] || "0");
      groups[timeKey].actDir = parseInt(wind?.[1] || "0");
      groups[timeKey].actTemp = parseInt(temp?.[1] || "0");
    } else if (r.data_type === 'TAF') {
      groups[timeKey].tafSpd = parseInt(wind?.[2] || "0");
      groups[timeKey].tafDir = parseInt(wind?.[1] || "0");
    }
  });

  // Convert map back to array and sort by time
  const formatted = Object.values(groups).sort((a: any, b: any) => 
    a.time.localeCompare(b.time)
  );

  return NextResponse.json(formatted);
}