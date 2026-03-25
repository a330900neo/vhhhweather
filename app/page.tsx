import { sql } from '@vercel/postgres';

function parseWind(metar: string) {
  const match = metar.match(/(\d{3})(\d{2})KT/); 
  return match ? { dir: parseInt(match[1]), speed: parseInt(match[2]) } : { dir: 0, speed: 0 };
}

async function fetchATIS() {
  try {
    const res = await fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' });
    const html = await res.text();
    const clean = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
    const arr = clean.match(/(VHHH ARR ATIS.*?FIRST CTC WITH APP)/i)?.[1] || "";
    const dep = clean.match(/(VHHH DEP ATIS.*?FIRST CTC WITH DELIVERY)/i)?.[1] || "";
    return { arr, dep };
  } catch (e) { return { arr: "", dep: "" }; }
}

export default async function Page() {
  const newAtis = await fetchATIS();
  const resMetar = await fetch(`https://aviationweather.gov/api/data/metar?ids=VHHH&format=json`, { cache: 'no-store' });
  const metarData = await resMetar.json();
  const metar = metarData[0]?.rawOb || "";
  const wind = parseWind(metar);

  const isOps07 = newAtis.arr.includes("07") || newAtis.dep.includes("07");
  const runwayIds = ["07L/25R", "07C/25C", "07R/25L"];

  return (
    <main style={{ padding: '20px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      
      {/* TOP BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#88a' }}>WIND</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4ade80' }}>{wind.dir}° / {wind.speed} KT</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#88a' }}>ACTIVE OPS</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{isOps07 ? "07" : "25"}</div>
        </div>
      </div>

      {/* COMPASS & RUNWAY VISUALIZER */}
      <div style={{ position: 'relative', width: '350px', height: '350px', margin: '0 auto', border: '2px solid #2a3b5a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* Degree Markers (N, E, S, W) */}
        <span style={{ position: 'absolute', top: '10px' }}>N</span>
        <span style={{ position: 'absolute', right: '10px' }}>E</span>
        <span style={{ position: 'absolute', bottom: '10px' }}>S</span>
        <span style={{ position: 'absolute', left: '10px' }}>W</span>

        {/* THE WIND ARROW */}
        <div style={{ 
          position: 'absolute', width: '100%', height: '100%', 
          transform: `rotate(${wind.dir}deg)`, transition: 'transform 1s' 
        }}>
          <div style={{ 
            width: '0', height: '0', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', 
            borderTop: '20px solid white', margin: '5px auto' 
          }} />
        </div>

        {/* RUNWAY GROUP (Rotated to match 073° heading) */}
        <div style={{ transform: 'rotate(-17deg)', display: 'flex', flexDirection: 'column', gap: '8px', width: '220px' }}>
          {runwayIds.map((rwy) => {
            // Check if specific runway is in ATIS
            const [r07, r25] = rwy.split('/');
            const activeArr = newAtis.arr.includes(isOps07 ? r07 : r25);
            const activeDep = newAtis.dep.includes(isOps07 ? r07 : r25);

            return (
              <div key={rwy} style={{ position: 'relative', height: '14px', background: '#000', border: '1px solid #444', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '-25px', fontSize: '10px' }}>{isOps07 ? '07' : '25'}</span>
                
                {/* Visual Runway dashed line */}
                <div style={{ width: '100%', borderTop: '1px dashed #666' }} />

                {/* ARR/DEP LABELS */}
                {activeArr && <div style={{ position: 'absolute', [isOps07 ? 'left' : 'right']: '-60px', color: '#3b82f6', fontSize: '10px', fontWeight: 'bold' }}>{isOps07 ? '→ ARR' : 'ARR ←'}</div>}
                {activeDep && <div style={{ position: 'absolute', [isOps07 ? 'right' : 'left']: '-60px', color: '#f59e0b', fontSize: '10px', fontWeight: 'bold' }}>{isOps07 ? 'DEP 🛫' : '🛫 DEP'}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* DATA BOXES */}
      <div style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
        <div style={{ padding: '15px', background: '#162540', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: '11px', color: '#3b82f6', marginBottom: '5px' }}>ARRIVAL ATIS</div>
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>{newAtis.arr || "NO DATA"}</div>
        </div>
        <div style={{ padding: '15px', background: '#162540', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '5px' }}>DEPARTURE ATIS</div>
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>{newAtis.dep || "NO DATA"}</div>
        </div>
      </div>
    </main>
  );
}