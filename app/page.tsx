import { sql } from '@vercel/postgres';
import Link from 'next/link';

// Forces Vercel to refresh data for your Uptime bot
export const dynamic = 'force-dynamic';

// --- HELPERS ---
function parseCloud(text: string) {
  const matches = text.match(/(FEW|SCT|BKN|OVC)(\d{3})/g);
  if (!matches) return "SKC";
  return matches.map(m => {
    const type = m.substring(0, 3);
    const alt = parseInt(m.substring(3)) * 100;
    return `${type} ${alt}ft`;
  }).join(' / ');
}

function parseMetar(metar: string) {
  const windMatch = metar.match(/(\d{3})(\d{2})KT/);
  const visMatch = metar.match(/\b(\d{4}|10KM)\b/);
  const tempMatch = metar.match(/\b(\d{2})\/(\d{2})\b/);
  return {
    dir: windMatch ? parseInt(windMatch[1]) : 0,
    speed: windMatch ? windMatch[2] : "0",
    vis: visMatch ? visMatch[1] : "---",
    temp: tempMatch ? tempMatch[1] : "--",
    clouds: parseCloud(metar)
  };
}

// NEW HELPER: Strictly extract runways only from the first sentence
function getActiveRunways(atis: string, type: 'ARRIVALS' | 'DEPARTURES'): string[] {
  // Look for "ARRIVALS, RWY..." or "DEPARTURES, RWY..." and stop at the first period
  const regex = new RegExp(`${type},\\s*RWY\\s*([^.]+)`, 'i');
  const match = atis.match(regex);
  if (!match) return [];
  
  // Find all runway codes (e.g., 07L, 25R) within that specific sentence
  const rwyMatch = match[1].match(/\b(07|25)[LRC]?\b/gi);
  if (!rwyMatch) return [];
  
  // Remove duplicates
  return [...new Set(rwyMatch.map(r => r.toUpperCase()))];
}

// --- DATA FETCHING ---
async function fetchAeroData() {
  try {
    const [atisRes, metarRes, tafRes] = await Promise.all([
      fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php', { cache: 'no-store' }),
      fetch('https://aviationweather.gov/api/data/metar?ids=VHHH&format=json', { cache: 'no-store' }),
      fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json', { cache: 'no-store' })
    ]);
    
    const html = await atisRes.text();
    const clean = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
    
    // Precise ATIS Splitting
    const arrPart = clean.match(/VHHH ARR ATIS.*?(?=VHHH DEP ATIS|FIRST CTC WITH APP)/i)?.[0] || "";
    const arrAtis = arrPart + " FIRST CTC WITH APP";
    
    const depPart = clean.split(/VHHH DEP ATIS/i)[1]?.split("FIRST CTC WITH DELIVERY")[0] || "";
    const depAtis = "VHHH DEP ATIS " + depPart.trim() + " FIRST CTC WITH DELIVERY";

    const metarJson = await metarRes.json();
    const tafJson = await tafRes.json();

    // Save to Database for the History Chart
    const currentMetar = metarJson[0]?.rawOb || "";
    const currentTaf = tafJson[0]?.rawTAF || "";
    
    if (currentMetar) {
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${currentMetar}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('TAF', ${currentTaf}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_ARR', ${arrAtis}) ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_DEP', ${depAtis}) ON CONFLICT DO NOTHING`;
    }

    return { atisArr: arrAtis, atisDep: depAtis, metar: currentMetar, taf: currentTaf };
  } catch (e) {
    console.error(e);
    return null; 
  }
}

export default async function Page() {
  const data = await fetchAeroData();
  if (!data) return <div style={{color: 'white', padding: '20px'}}>SYNCING WITH HKCAD...</div>;

  const wx = parseMetar(data.metar);
  
  // Extract specific runways to prevent false positives (like "EXP RWY 07C")
  const arrRunways = getActiveRunways(data.atisArr, 'ARRIVALS');
  const depRunways = getActiveRunways(data.atisDep, 'DEPARTURES');
  
  // Fallback to check general direction if the strict parser missed it
  const isOps07 = arrRunways.some(r => r.includes("07")) || 
                  depRunways.some(r => r.includes("07")) || 
                  data.atisArr.includes("07");

  const runwayConfig = [{ id: "N", l: "07L", r: "25R" }, { id: "C", l: "07C", r: "25C" }, { id: "S", l: "07R", r: "25L" }];

  return (
    <main style={{ padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* LAST UPDATE TIMESTAMP */}
      <div style={{ fontSize: '10px', color: '#556', textAlign: 'center', marginBottom: '10px' }}>
        SYSTEM LIVE // LAST DATA SYNC: {new Date().toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong' })} HKT
      </div>

      {/* HEADER STATS */}
      <div style={{ width: '100%', maxWidth: '500px', display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '10px', color: '#88a' }}>WIND / VIS / TEMP</div>
          <div style={{ fontSize: '18px', color: '#4ade80' }}>{wx.dir}°/{wx.speed}K <span style={{color: '#fff'}}>{wx.vis} {wx.temp}°C</span></div>
          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>☁️ {wx.clouds}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: '#88a' }}>ACTIVE</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>RWY {isOps07 ? "07" : "25"}</div>
        </div>
      </div>

      {/* COMPASS (Visualizer) */}
      <div style={{ position: 'relative', width: 'min(80vw, 300px)', height: 'min(80vw, 300px)', margin: '20px auto', border: '1px solid #2a3b5a', borderRadius: '50%' }}>
        <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#555' }}>N</div>
        
        {/* WIND ARROW */}
        <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${wx.dir}deg)`, transition: 'transform 1s' }}>
          <div style={{ width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '16px solid white', margin: '-8px auto' }} />
          <div style={{ textAlign: 'center', marginTop: '-35px', fontWeight: 'bold', fontSize: '12px', transform: `rotate(-${wx.dir}deg)` }}>{wx.speed}K</div>
        </div>

        {/* RUNWAYS */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-17deg)', display: 'flex', flexDirection: 'column', gap: '8px', width: '160px' }}>
          {runwayConfig.map((rwy) => {
            // STRICT CHECK: Only mark active if found in the isolated sentence
            const activeArr = arrRunways.includes(rwy.l) || arrRunways.includes(rwy.r);
            const activeDep = depRunways.includes(rwy.l) || depRunways.includes(rwy.r);
            
            return (
              <div key={rwy.id} style={{ position: 'relative', height: '12px', background: '#000', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', fontSize: '9px' }}>
                <span style={{color: '#666'}}>{rwy.l}</span><div style={{ flex: 1, borderTop: '1px dashed #444', margin: '0 5px' }} /><span style={{color: '#666'}}>{rwy.r}</span>
                {activeArr && <div style={{ position: 'absolute', [isOps07 ? 'left' : 'right']: '-55px', color: '#3b82f6', fontWeight: 'bold' }}>{isOps07 ? '➔ARR' : 'ARR←'}</div>}
                {activeDep && <div style={{ position: 'absolute', [isOps07 ? 'right' : 'left']: '-55px', color: '#f59e0b', fontWeight: 'bold' }}>{isOps07 ? 'DEP➔' : '←DEP'}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ATIS BOXES */}
      <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderLeft: '3px solid #3b82f6', fontSize: '10px' }}>{data.atisArr}</div>
        <div style={{ padding: '10px', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b', fontSize: '10px' }}>{data.atisDep}</div>
        <div style={{ padding: '10px', background: '#111', borderLeft: '3px solid #fff', fontSize: '9px', color: '#888' }}>{data.metar}</div>
      </div>

      <Link href="/history" style={{ marginTop: '20px', color: '#445', fontSize: '12px', textDecoration: 'none' }}>[ VIEW ARCHIVE ]</Link>
    </main>
  );
}
