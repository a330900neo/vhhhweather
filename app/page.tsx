import { sql } from '@vercel/postgres';
import Link from 'next/link';

export const revalidate = 60;

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

function getActiveRunways(atis: string, type: 'ARRIVALS' | 'DEPARTURES'): string[] {
  // 1. Find the text chunk like "ARRIVALS, RWY 25R/L"
  const regex = new RegExp(`${type},?\\s*RWY\\s*([0-9]{2}[LCR/\\s]*)`, 'i');
  const match = atis.match(regex);
  if (!match) return [];
  
  // Clean up the match (e.g., "25R/L" or " 07C ")
  const rawRunways = match[1].toUpperCase().replace(/\s+/g, ''); 
  
  // 2. Extract the base runway number ("07" or "25")
  const baseNumMatch = rawRunways.match(/(07|25)/);
  if (!baseNumMatch) return [];
  const baseNum = baseNumMatch[1];
  
  // 3. Extract just the letters (e.g. "R/L" becomes ["R", "L"])
  const lettersRaw = rawRunways.replace(baseNum, '');
  const letters = lettersRaw.match(/[LRC]/g);
  
  // 4. Map the base number back to each letter! 
  // This turns ["R", "L"] into ["25R", "25L"]
  if (letters && letters.length > 0) {
    return [...new Set(letters.map(letter => `${baseNum}${letter}`))];
  }
  
  // Fallback if there are no letters (e.g., just "25" or "07")
  return [baseNum];
}

// --- DATA FETCHING ---
async function fetchAeroData() {
  try {
    const [atisRes, metarRes, tafRes] = await Promise.all([
      fetch('https://atis.cad.gov.hk/ATIS/ATISweb/atis.php'),
      fetch('https://aviationweather.gov/api/data/metar?ids=VHHH&format=json'),
      fetch('https://aviationweather.gov/api/data/taf?ids=VHHH&format=json')
    ]);
    
    const html = await atisRes.text();
    const clean = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
    
    const arrPart = clean.match(/VHHH ARR ATIS.*?(?=VHHH DEP ATIS|FIRST CTC WITH APP)/i)?.[0] || "";
    const arrAtis = arrPart + " FIRST CTC WITH APP";
    
    const depPart = clean.split(/VHHH DEP ATIS/i)[1]?.split("FIRST CTC WITH DELIVERY")[0] || "";
    const depAtis = "VHHH DEP ATIS " + depPart.trim() + " FIRST CTC WITH DELIVERY";

    const metarJson = await metarRes.json();
    const tafJson = await tafRes.json();

    const currentMetar = metarJson[0]?.rawOb || "";
    const currentTaf = tafJson[0]?.rawTAF || "";
    
    // --- OPTION B: EXTRACT MAX WIND FROM JSON ---
    let maxForecastWind = 0;
    
    // Loop through all forecast time blocks to find the highest wind or gust
    if (tafJson[0]?.fcsts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tafJson[0].fcsts.forEach((block: any) => {
        if (block.wspd && block.wspd > maxForecastWind) maxForecastWind = block.wspd;
        if (block.wgst && block.wgst > maxForecastWind) maxForecastWind = block.wgst;
      });
    }

    // Inject the absolute max wind at the start of the string so your chart's regex catches it first
    const maxWindStr = maxForecastWind.toString().padStart(2, '0');
    const modifiedTaf = `[MAX: 000${maxWindStr}KT] ${currentTaf}`;

    if (currentMetar) {
      await Promise.all([
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${currentMetar}) ON CONFLICT DO NOTHING`,
        // Save the modified TAF to the database
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('TAF', ${modifiedTaf}) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_ARR', ${arrAtis}) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_DEP', ${depAtis}) ON CONFLICT DO NOTHING`
      ]);
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
  
  const arrRunways = getActiveRunways(data.atisArr, 'ARRIVALS');
  const depRunways = getActiveRunways(data.atisDep, 'DEPARTURES');
  
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
