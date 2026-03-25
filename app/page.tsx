import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';

// Fetchers
async function fetchAviationWeather(type: 'metar' | 'taf') {
  const res = await fetch(`https://aviationweather.gov/api/data/${type}?ids=VHHH&format=json`, { cache: 'no-store' });
  const data = await res.json();
  return data[0]?.rawOb || data[0]?.rawTAF || "No data";
}

async function fetchATIS() {
  const res = await fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' });
  const html = await res.text();
  // Simple extraction of the text content without images
  const match = html.replace(/<[^>]*>?/gm, '').match(/(VHHH ARR ATIS.*)Remarks/s);
  return match ? match[1].trim() : "ATIS parsing failed";
}

export default async function Page() {
  // 1. Get latest records from database
  const { rows: latestRecords } = await sql`
    SELECT DISTINCT ON (data_type) data_type, raw_text, created_at 
    FROM aero_data ORDER BY data_type, created_at DESC;
  `;

  const getRecord = (type: string) => latestRecords.find((r) => r.data_type === type);
  const atis = getRecord('ATIS');
  const metar = getRecord('METAR');
  const taf = getRecord('TAF');

  const now = new Date();
  
  // 2. Logic to update ATIS (every 10 mins)
  const atisAgeMins = atis ? (now.getTime() - new Date(atis.created_at).getTime()) / 60000 : 999;
  if (atisAgeMins > 10) {
    const newAtis = await fetchATIS();
    if (!atis || atis.raw_text !== newAtis) {
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS', ${newAtis})`;
      revalidatePath('/'); // Refresh page data
    }
  }

  // 3. Logic to update METAR & TAF (every 30 mins)
  const metarAgeMins = metar ? (now.getTime() - new Date(metar.created_at).getTime()) / 60000 : 999;
  if (metarAgeMins > 30) {
    const newMetar = await fetchAviationWeather('metar');
    const newTaf = await fetchAviationWeather('taf');
    
    if (!metar || metar.raw_text !== newMetar) {
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${newMetar})`;
    }
    if (!taf || taf.raw_text !== newTaf) {
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('TAF', ${newTaf})`;
    }
    revalidatePath('/');
  }

  return (
    <main style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>VHHH Weather & ATIS Dashboard</h1>
      <p>Data automatically fetches on page load if older than limits.</p>
      
      <div style={{ background: '#f4f4f4', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
        <h2>Latest ATIS</h2>
        <p><strong>Last Checked/Updated:</strong> {atis?.created_at ? new Date(atis.created_at).toLocaleString() : 'Never'}</p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{atis?.raw_text || "No data yet. Refresh to trigger fetch."}</pre>
      </div>

      <div style={{ background: '#eef4ff', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
        <h2>Latest METAR</h2>
        <p><strong>Last Checked/Updated:</strong> {metar?.created_at ? new Date(metar.created_at).toLocaleString() : 'Never'}</p>
        <pre>{metar?.raw_text}</pre>
      </div>

      <div style={{ background: '#eeffee', padding: '15px', borderRadius: '8px' }}>
        <h2>Latest TAF</h2>
        <p><strong>Last Checked/Updated:</strong> {taf?.created_at ? new Date(taf.created_at).toLocaleString() : 'Never'}</p>
        <pre>{taf?.raw_text}</pre>
      </div>
    </main>
  );
}