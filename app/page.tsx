import { sql } from '@vercel/postgres';
import Link from 'next/link';

// --- HELPERS ---
function parseMetar(metar: string) {
  const windMatch = metar.match(/(\d{3})(\d{2})KT/);
  const visMatch = metar.match(/\b(\d{4}|10KM)\b/);
  const tempMatch = metar.match(/\b(\d{2})\/(\d{2})\b/); // Matches 27/21
  
  return {
    dir: windMatch ? parseInt(windMatch[1]) : 0,
    speed: windMatch ? windMatch[2] : "0",
    vis: visMatch ? visMatch[1] : "---",
    temp: tempMatch ? tempMatch[1] : "--"
  };
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
  const atis = await fetchATIS();
  const resMetar = await fetch(`https://aviationweather.gov/api/data/metar?ids=VHHH&format=json`, { cache: 'no-store' });
  const metarData = await resMetar.json();
  const rawMetar = metarData[0]?.rawOb || "";
  const wx = parseMetar(rawMetar);

  const isOps07 = atis.arr.includes("07") || atis.dep.includes("07");
  
  // Logical mapping for 3 runways
  const runwayConfig = [
    { id: "NORTH", l: "07L", r: "25R" },
    { id: "CENTER", l: "07C", r: "25C" },
    { id: "SOUTH", l: "07R", r: "25L" }
  ];

  return (
    <main style={{ padding: '30px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      
      {/* HEADER INFO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '30px' }}>
          <div><div style={{ fontSize: '10px', color: '#88a' }}>WIND</div><div style={{ fontSize: '24px', color: '#4ade80' }}>{wx.dir}° / {wx.speed} KT</div></div>
          <div><div style={{ fontSize: '10px', color: '#88a' }}>VIS</div><div style={{ fontSize: '24px' }}>{wx.vis}</div></div>
          <div><div style={{ fontSize: '10px', color: '#88a' }}>TEMP</div><div style={{ fontSize: '24px' }}>{wx.temp}°C</div></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#88a' }}>ACTIVE OPS</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>RWY {isOps07 ? "07" : "25"}</div>
        </div>
      </div>

      {/* COMPASS VISUALIZER */}
      <div style={{ position: 'relative', width: '400px', height: '400px', margin: '40px auto', border: '1px solid #2a3b5a', borderRadius: '50%' }}>
        
        {/* Cardinal Points */}
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)' }}>N</div>
        <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)' }}>S</div>
        <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>W</div>
        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>E</div>

        {/* WIND ARROW + SPEED (Outside Circle) */}
        <div style={{ 
          position: 'absolute', width: '100%', height: '100%', 
          transform: `rotate(${wx.dir}deg)`, transition: 'transform 1s' 
        }}>
          {/* The Arrow */}
          <div style={{ width: '0', height: '0', borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '20px solid white', margin: '-10px auto' }} />
          {/* Speed Text following arrow */}
          <div style={{ textAlign: 'center', marginTop: '-45px', fontWeight: 'bold', fontSize: '14px', transform: `rotate(-${wx.dir}deg)` }}>
            {wx.speed} KT
          </div>
        </div>

        {/* RUNWAY GROUP (Rotated -17deg for 073 heading) */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-17deg)', display: 'flex', flexDirection: 'column', gap: '12px', width: '240px' }}>
          {runwayConfig.map((rwy) => {
            const activeArr = atis.arr.includes(rwy.l) || atis.arr.includes(rwy.r);
            const activeDep = atis.dep.includes(rwy.l) || atis.dep.includes(rwy.r);

            return (
              <div key={rwy.id} style={{ position: 'relative', height: '16px', background: '#000', border: '1px solid #444', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 5px', fontSize: '10px' }}>
                <span>{rwy.l}</span>
                <div style={{ flex: 1, borderTop: '1px dashed #555', margin: '0 10px' }} />
                <span>{rwy.r}</span>

                {/* ARRIVAL ARROW */}
                {activeArr && (
                  <div style={{ position: 'absolute', [isOps07 ? 'left' : 'right']: '-75px', color: '#3b82f6', fontWeight: 'bold', transform: `rotate(${isOps07 ? 0 : 180}deg)` }}>
                    ➔ ARR
                  </div>
                )}

                {/* DEPARTURE ARROW */}
                {activeDep && (
                  <div style={{ position: 'absolute', [isOps07 ? 'right' : 'left']: '-75px', color: '#f59e0b', fontWeight: 'bold', transform: `rotate(${isOps07 ? 0 : 180}deg)` }}>
                    DEP ➔
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RAW DATA BOXES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '20px' }}>
        <div style={{ padding: '10px', background: '#162540', borderRadius: '4px', borderLeft: '4px solid #3b82f6', fontSize: '12px' }}>
          <strong style={{color: '#3b82f6'}}>ARR ATIS:</strong> {atis.arr || "N/A"}
        </div>
        <div style={{ padding: '10px', background: '#162540', borderRadius: '4px', borderLeft: '4px solid #f59e0b', fontSize: '12px' }}>
          <strong style={{color: '#f59e0b'}}>DEP ATIS:</strong> {atis.dep || "N/A"}
        </div>
        <div style={{ padding: '10px', background: '#162540', borderRadius: '4px', borderLeft: '4px solid #ccc', fontSize: '12px' }}>
          <strong>METAR:</strong> {rawMetar}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <Link href="/history" style={{ color: '#88a', textDecoration: 'none', fontSize: '14px' }}>
          📊 VIEW FULL HISTORY
        </Link>
      </div>
    </main>
  );
}