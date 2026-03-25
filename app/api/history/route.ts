import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 100`;
  
  const formatted = rows.map(r => {
    // Regex for Wind: (Dir)(Speed)KT
    const wind = r.raw_text.match(/(\d{3})(\d{2})KT/);
    // Regex for Temp: (Temp)/(Dew)
    const temp = r.raw_text.match(/\b(\d{2})\/(\d{2})\b/);
    
    const isMetar = r.data_type === 'METAR';
    const isTaf = r.data_type === 'TAF';

    return {
      time: new Date(r.created_at).toLocaleTimeString('en-HK', { hour: '2-digit', minute: '2-digit' }),
      type: r.data_type,
      // Actuals (METAR)
      actSpd: isMetar ? parseInt(wind?.[2] || "0") : null,
      actDir: isMetar ? parseInt(wind?.[1] || "0") : null,
      actTemp: isMetar ? parseInt(temp?.[1] || "0") : null,
      // Forecasts (TAF)
      tafSpd: isTaf ? parseInt(wind?.[2] || "0") : null,
      tafDir: isTaf ? parseInt(wind?.[1] || "0") : null,
      tafTemp: r.raw_text.match(/TX(\d{2})/)?.[1] ? parseInt(r.raw_text.match(/TX(\d{2})/)?.[1] || "0") : null,
      raw: r.raw_text
    };
  }).reverse();

  return NextResponse.json(formatted);
}