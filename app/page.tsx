import { sql } from '@vercel/postgres';

// --- HELPERS ---
function extractZTime(text: string) {
  const match = text.match(/\d{4}Z/);
  return match ? match[0] : "----Z";
}

function parseWind(metar: string) {
  const match = metar.match(/(\d{3})(\d{2})KT/); // Matches 04008KT -> 040 and 08
  return match ? { dir: match[1], speed: match[2] } : { dir: "000", speed: "0" };
}

function getRunwayStatus(atis: string) {
  const arrMatch = atis.match(/ARRIVALS?,?\s+RWY\s+([\w\/]+)/i);
  const depMatch = atis.match(/DEPARTURES?,?\s+RWY\s+([\w\/]+)/i);
  return {
    arr: arrMatch ? arrMatch[1].split('/') : [],
    dep: depMatch ? depMatch[1].split('/') : []
  };
}

export default async function Page() {
  const { rows } = await sql`SELECT * FROM aero_data ORDER BY created_at DESC LIMIT 10`;
  
  const atis = rows.find(r => r.data_type === 'ATIS')?.raw_text || "";
  const metar = rows.find(r => r.data_type === 'METAR')?.raw_text || "";
  
  const wind = parseWind(metar);
  const rwys = getRunwayStatus(atis);
  
  const runwayList = ["07L/25R", "07C/25C", "07R/25L"];

  return (
    <main style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#1a1a1a', color: 'white', minHeight: '100vh' }}>
      <h1>VHHH Visual Dashboard</h1>

      {/* WIND SECTION */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', alignItems: 'center' }}>
        <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#00ff00' }}>
          WIND: {wind.dir}° / {wind.speed} KT
        </div>
        <div style={{ 
          width: '50px', height: '50px', border: '2px solid white', borderRadius: '50%', position: 'relative',
          transform: `rotate(${wind.dir}deg)`
        }}>
          <div style={{ position: 'absolute', top: '0', left: '50%', height: '50%', width: '2px', background: 'red' }} />
        </div>
      </div>

      {/* RUNWAY VISUALIZER */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '800px' }}>
        {runwayList.map((id) => {
          const isArr = rwys.arr.some(r => id.includes(r));
          const isDep = rwys.dep.some(r => id.includes(r));
          
          return (
            <div key={id} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-25px', left: '0', fontSize: '12px' }}>{id}</div>
              
              {/* The Runway Rectangle */}
              <div style={{ height: '40px', width: '100%', backgroundColor: '#333', border: '2px solid #555', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
                <span style={{color: '#aaa'}}>07</span>
                <div style={{ height: '2px', flex: 1, borderTop: '2px dashed #555', margin: '0 20px' }} />
                <span style={{color: '#aaa'}}>25</span>
              </div>

              {/* Arrival Arrow (Points TOWARDS runway from the right for 25 ops) */}
              {isArr && (
                <div style={{ position: 'absolute', right: '-60px', top: '10px', color: '#3498db', fontWeight: 'bold' }}>
                  ARR ➔
                </div>
              )}

              {/* Departure Arrow (Points AWAY from runway to the left for 25 ops) */}
              {isDep && (
                <div style={{ position: 'absolute', left: '-80px', top: '10px', color: '#e67e22', fontWeight: 'bold' }}>
                   🛫 DEP
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RAW TEXT DATA */}
      <div style={{ marginTop: '50px', fontSize: '12px', color: '#888' }}>
        <p>ATIS: {atis || "Waiting for ATIS update..."}</p>
        <p>METAR: {metar}</p>
        <a href="/history" style={{ color: '#3498db' }}>View Full History</a>
      </div>
    </main>
  );
}