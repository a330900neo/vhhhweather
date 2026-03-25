import { sql } from '@vercel/postgres';
import Link from 'next/link';

// --- HELPERS ---
function parseMetar(metar: string) {
  const windMatch = metar.match(/(\d{3})(\d{2})KT/);
  const visMatch = metar.match(/\b(\d{4}|10KM)\b/);
  const tempMatch = metar.match(/\b(\d{2})\/(\d{2})\b/);
  return {
    dir: windMatch ? parseInt(windMatch[1]) : 0,
    speed: windMatch ? windMatch[2] : "0",
    vis: visMatch ? visMatch[1] : "---",
    temp: tempMatch ? tempMatch[1] : "--"
  };
}

function decodeTAF(taf: string) {
  // Regex to find time periods (FM/BECMG/TEMPO) and their winds
  // Matches groups like "BECMG 2509/2511 12010KT" or "TEMPO 2604/2609 24010KT"
  const periods = taf.split(/(?=BECMG|TEMPO|FM)/);
  return periods.map(p => {
    const time = p.match(/(\d{4}\/\d{4})|FM\d{6}/)?.[0] || "BASE";
    const wind = p.match(/(\d{3})(\d{2})KT/);
    const type = p.startsWith("BECMG") ? "BCMG" : p.startsWith("TEMPO") ? "TMPO" : "BASE";
    return { time: time.replace(/\d{2}(\d{2})\/\d{2}(\d{2})/, "$1-$2Z"), dir: wind?.[1] || "---", spd: wind?.[2] || "--", type };
  });
}

async function fetchAeroData() {
  try {
    const [atisRes, metarRes, tafRes] = await Promise.all([
      fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' }),
      fetch('https://aviationweather.gov/api/data/metar?ids=VHHH&format=json', { cache: 'no-store' }),
      fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json', { cache: 'no-store' })
    ]);
    
    const html = await atisRes.text();
    const clean = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
    const metarJson = await metarRes.json();
    const tafJson = await tafRes.json();

    return {
      atisArr: clean.match(/(VHHH ARR ATIS.*?FIRST CTC WITH APP)/i)?.[1] || "",
      atisDep: clean.match(/(VHHH DEP ATIS.*?FIRST CTC WITH DELIVERY)/i)?.[1] || "",
      metar: metarJson[0]?.rawOb || "",
      taf: tafJson[0]?.rawTAF || ""
    };
  } catch (e) { return null; }
}

export default async function Page() {
  const data = await fetchAeroData();
  if (!data) return <div style={{color: 'white', padding: '20px'}}>Loading...</div>;

  const wx = parseMetar(data.metar);
  const tafBlocks = decodeTAF(data.taf);
  const isOps07 = data.atisArr.includes("07") || data.atisDep.includes("07");
  const runwayConfig = [
    { id: "N", l: "07L", r: "25R" },
    { id: "C", l: "07C", r: "25C" },
    { id: "S", l: "07R", r: "25L" }
  ];

  return (
    <main style={{ 
      padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', 
      fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center' 
    }}>
      
      {/* MOBILE RESPONSIVE HEADER */}
      <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ flex: '1 1 40%' }}>
          <div style={{ fontSize: '10px', color: '#88a' }}>WIND / VIS / TEMP</div>
          <div style={{ fontSize: '18px', color: '#4ade80' }}>{wx.dir}°/{wx.speed}K <span style={{color: '#fff'}}>{wx.vis} {wx.temp}°C</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#88a' }}>ACTIVE OPS</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>RWY {isOps07 ? "07" : "25"}</div>
        </div>
      </div>

      {/* COMPASS VISUALIZER (Scales on Mobile) */}
      <div style={{ 
        position: 'relative', width: 'min(85vw, 320px)', height: 'min(85vw, 320px)', 
        margin: '20px auto', border: '1px solid #2a3b5a', borderRadius: '50%' 
      }}>
        <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px' }}>N</div>
        
        {/* WIND ARROW */}
        <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${wx.dir}deg)`, transition: 'transform 1s' }}>
          <div style={{ width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '16px solid white', margin: '-8px auto' }} />
          <div style={{ textAlign: 'center', marginTop: '-40px', fontWeight: 'bold', fontSize: '12px', transform: `rotate(-${wx.dir}deg)` }}>{wx.speed}K</div>
        </div>

        {/* RUNWAYS */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-17deg)', display: 'flex', flexDirection: 'column', gap: '8px', width: '180px' }}>
          {runwayConfig.map((rwy) => {
            const activeArr = data.atisArr.includes(rwy.l) || data.atisArr.includes(rwy.r);
            const activeDep = data.atisDep.includes(rwy.l) || data.atisDep.includes(rwy.r);
            return (
              <div key={rwy.id} style={{ position: 'relative', height: '12px', background: '#000', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', fontSize: '9px' }}>
                <span>{rwy.l}</span><div style={{ flex: 1, borderTop: '1px dashed #444', margin: '0 5px' }} /><span>{rwy.r}</span>
                {activeArr && <div style={{ position: 'absolute', [isOps07 ? 'left' : 'right']: '-55px', color: '#3b82f6', fontWeight: 'bold' }}>{isOps07 ? '➔ARR' : 'ARR←'}</div>}
                {activeDep && <div style={{ position: 'absolute', [isOps07 ? 'right' : 'left']: '-55px', color: '#f59e0b', fontWeight: 'bold' }}>{isOps07 ? 'DEP➔' : '←DEP'}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* TAF TIMELINE (The "Small Thing") */}
      <div style={{ width: '100%', maxWidth: '500px', marginTop: '20px' }}>
        <div style={{ fontSize: '10px', color: '#88a', marginBottom: '5px' }}>TAF FORECAST WIND</div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
          {tafBlocks.map((b, i) => (
            <div key={i} style={{ flex: '0 0 75px', background: '#162540', padding: '8px', borderRadius: '4px', textAlign: 'center', border: '1px solid #2a3b5a' }}>
              <div style={{ fontSize: '9px', color: '#88a' }}>{b.type} {b.time}</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#4ade80' }}>{b.dir}°/{b.spd}</div>
              {/* Mini Runway Icon */}
              <div style={{ height: '3px', width: '20px', background: '#444', margin: '5px auto', transform: 'rotate(-17deg)' }} />
            </div>
          ))}
        </div>
      </div>

      {/* DATA BOXES */}
      <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
        <div style={{ padding: '8px', background: '#111', borderLeft: '3px solid #3b82f6', fontSize: '10px' }}>{data.atisArr}</div>
        <div style={{ padding: '8px', background: '#111', borderLeft: '3px solid #f59e0b', fontSize: '10px' }}>{data.atisDep}</div>
        <div style={{ padding: '8px', background: '#111', borderLeft: '3px solid #fff', fontSize: '10px', color: '#aaa' }}>{data.metar}</div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <Link href="/history" style={{ color: '#445', fontSize: '12px' }}>[ HISTORY LOG ]</Link>
      </div>
    </main>
  );
}