import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  // Grab the last 50 entries to show on the chart
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 50`;
  
  const formatted = rows.map(r => {
    const windMatch = r.raw_text.match(/(\d{3})(\d{2})KT/);
    const tempMatch = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);
    
    return {
      time: new Date(r.created_at).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit' }),
      type: r.data_type,
      // If it's METAR, it's 'Actual'. If it's TAF, it's 'Forecast'.
      actualSpd: r.data_type === 'METAR' ? parseInt(windMatch?.[2] || "0") : null,
      tafSpd: r.data_type === 'TAF' ? parseInt(windMatch?.[2] || "0") : null,
      temp: tempMatch ? parseInt(tempMatch[1]) : null,
      raw: r.raw_text
    };
  }).reverse(); // Reverse so the chart goes left-to-right (old to new)

  return NextResponse.json(formatted);
}