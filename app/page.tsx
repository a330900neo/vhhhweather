import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';

// Helper to find the "0000Z" time in a string
function extractZTime(text: string) {
  const match = text.match(/\d{4}Z/);
  return match ? match[0] : null;
}

async function fetchAviationWeather(type: 'metar' | 'taf') {
  const res = await fetch(`https://aviationweather.gov/api/data/${type}?ids=VHHH&format=json`, { cache: 'no-store' });
  const data = await res.json();
  return data[0]?.rawOb || data[0]?.rawTAF || "";
}

async function fetchATIS() {
  const res = await fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' });
  const html = await res.text();
  const match = html.replace(/<[^>]*>?/gm, '').match(/(VHHH ARR ATIS.*)Remarks/s);
  return match ? match[1].trim() : "";
}

export default async function Page() {
  // 1. Get latest entries
  const { rows: latest } = await sql`
    SELECT DISTINCT ON (data_type) data_type, raw_text FROM aero_data ORDER BY data_type, created_at DESC;
  `;

  const oldAtis = latest.find(r => r.data_type === 'ATIS')?.raw_text || "";
  const oldMetar = latest.find(r => r.data_type === 'METAR')?.raw_text || "";

  // 2. Fetch fresh data
  const newAtis = await fetchATIS();
  const newMetar = await fetchAviationWeather('metar');
  const newTaf = await fetchAviationWeather('taf');

  // 3. Compare Z-time (Only save if the 0000Z code is different)
  if (newAtis && extractZTime(newAtis) !== extractZTime(oldAtis)) {
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS', ${newAtis})`;
  }
  if (newMetar && extractZTime(newMetar) !== extractZTime(oldMetar)) {
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${newMetar})`;
    // We update TAF whenever METAR updates to keep them grouped
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('TAF', ${newTaf})`;
  }

  // Final pull for display
  const { rows: displayData } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 3`;

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>VHHH Real-time Dashboard</h1>
      {displayData.map((item) => (
        <div key={item.id} style={{ border: '1px solid #ccc', margin: '10px 0', padding: '10px' }}>
          <h3>{item.data_type} ({extractZTime(item.raw_text)})</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{item.raw_text}</pre>
        </div>
      ))}
      <p><a href="/history">View Full History</a></p>
    </main>
  );
}