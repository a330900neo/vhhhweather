import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';

// --- HELPERS ---
function extractZTime(text: string) {
  const match = text.match(/\d{4}Z/);
  return match ? match[0] : "----Z";
}

function parseWind(metar: string) {
  const match = metar.match(/(\d{3})(\d{2})KT/); 
  return match ? { dir: parseInt(match[1]), speed: match[2] } : { dir: 0, speed: "0" };
}

async function fetchATIS() {
  try {
    const res = await fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' });
    const html = await res.text();
    const clean = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
    
    const arrMatch = clean.match(/(VHHH ARR ATIS.*?FIRST CTC WITH APP)/i);
    const depMatch = clean.match(/(VHHH DEP ATIS.*?FIRST CTC WITH DELIVERY)/i);
    
    return {
      arr: arrMatch ? arrMatch[1].trim() : "",
      dep: depMatch ? depMatch[1].split('DEPARTURE')[1]?.trim() || depMatch[1].trim() : ""
    };
  } catch (e) { return null; }
}

export default async function Page() {
  // 1. Fetch Fresh Data
  const newAtis = await fetchATIS();
  const resMetar = await fetch(`https://aviationweather.gov/api/data/metar?ids=VHHH&format=json`, { cache: 'no-store' });
  const metarData = await resMetar.json();
  const latestMetar = metarData[0]?.rawOb || "";

  // 2. Database Sync (Lazy)
  if (newAtis?.arr) {
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_ARR', ${newAtis.arr}) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_DEP', ${newAtis.dep}) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${latestMetar}) ON CONFLICT DO NOTHING`;
  }

  const atisArr = newAtis?.arr || "";
  const atisDep = newAtis?.dep || "";
  const wind = parseWind(latestMetar);
  
  // Determine if we are on 07 or 25 ops based on ATIS text
  const isOps07 = atisArr.includes("07") || atisDep.includes("07");

  const runwayList = [
    { id: "07L/25R", label: "NORTH (07L/25R)" },
    { id: "07C/25C", label: "CENTRAL (07C/25C)" },
    { id: "07R/25L", label: "SOUTH (07R/25L)" }
  ];

  return (
    <main style={{ padding: '30px', fontFamily: 'monospace', backgroundColor: '#0a0a0a', color: '#00ff00', minHeight: '100vh' }}>
      <h1 style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>VHHH OPERATIONAL DASHBOARD</h1>

      <div style={{ display: 'flex', gap: '40px', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#888' }}>WIND</div>
          <div style={{ fontSize: '32px' }}>{wind.dir}° / {wind.speed} KT</div>
        </div>
        <div>
          <div style={{ fontSize: '12px', color: '#888' }}>ACTIVE OPS</div>
          <div style={{ fontSize: '32px' }}>{isOps07 ? "RWY 07" : "RWY 25"}</div>
        </div>
      </div>

      {/* VISUAL RUNWAYS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '50px', maxWidth: '900px', margin: '60px 0' }}>
        {runwayList.map((rwy) => {
          const activeArr = atisArr.includes(rwy.id.split('/')[isOps07 ? 0 : 1]);
          const activeDep = atisDep.includes(rwy.id.split('/')[isOps07 ? 0 : 1]);

          return (
            <div key={rwy.id} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-20px', fontSize: '12px', color: '#aaa' }}>{rwy.label}</div>
              
              <div style={{ height: '40px', background: '#1a1a1a', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 15px' }}>
                <span>07</span>
                <div style={{ flex: 1, borderTop: '2px dashed #444', margin: '0 20px' }} />
                <span>25</span>
              </div>

              {/* ARRIVAL ARROW */}
              {activeArr && (
                <div style={{ 
                  position: 'absolute', 
                  [isOps07 ? 'left' : 'right']: '-100px', 
                  top: '10px', color: '#3498db', fontWeight: 'bold' 
                }}>
                  {isOps07 ? 'ARR ➔' : '← ARR'}
                </div>
              )}

              {/* DEPARTURE ARROW */}
              {activeDep && (
                <div style={{ 
                  position: 'absolute', 
                  [isOps07 ? 'right' : 'left']: '-100px', 
                  top: '10px', color: '#f1c40f', fontWeight: 'bold' 
                }}>
                  {isOps07 ? '🛫 DEP' : 'DEP 🛫'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* TEXT DATA BOXES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '13px' }}>
        <div style={{ background: '#111', padding: '15px', borderLeft: '4px solid #3498db' }}>
          <div style={{ color: '#3498db', marginBottom: '5px' }}>ARRIVAL ATIS</div>
          {atisArr || "WAITING FOR UPDATE..." }
        </div>
        <div style={{ background: '#111', padding: '15px', borderLeft: '4px solid #f1c40f' }}>
          <div style={{ color: '#f1c40f', marginBottom: '5px' }}>DEPARTURE ATIS</div>
          {atisDep || "WAITING FOR UPDATE..." }
        </div>
      </div>
      
      <div style={{ marginTop: '20px', padding: '15px', background: '#111', borderLeft: '4px solid #fff' }}>
        <div style={{ color: '#fff', marginBottom: '5px' }}>METAR</div>
        {latestMetar}
      </div>
    </main>
  );
}