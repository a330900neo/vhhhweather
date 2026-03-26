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
  const regex = new RegExp(`${type},?\\s*RWY\\s*([0-9]{2}[LCR/\\s]*)`, 'i');
  const match = atis.match(regex);
  if (!match) return [];
  
  const rawRunways = match[1].toUpperCase().replace(/\s+/g, ''); 
  const baseNumMatch = rawRunways.match(/(07|25)/);
  if (!baseNumMatch) return [];
  
  const baseNum = baseNumMatch[1];
  const lettersRaw = rawRunways.replace(baseNum, '');
  const letters = lettersRaw.match(/[LRC]/g);
  
  if (letters && letters.length > 0) {
    return [...new Set(letters.map(letter => `${baseNum}${letter}`))];
  }
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
    
    let maxForecastWind = 0;
    
    // EXCTRACT CURRENT ACTIVE TAF BLOCK FOR THE WIDGET
    let tafWindDir = 0;
    let tafWindSpd = 0;
    let tafTimeLabel = "N/A";

    if (tafJson[0]?.fcsts) {
      const now = Date.now();
      
      // Calculate max wind for modified TAF string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tafJson[0].fcsts.forEach((block: any) => {
        if (block.wspd && block.wspd > maxForecastWind) maxForecastWind = block.wspd;
        if (block.wgst && block.wgst > maxForecastWind) maxForecastWind = block.wgst;
      });

      // Find the forecast block currently in effect
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeBlock = tafJson[0].fcsts.find((block: any) => {
        const fromTime = typeof block.timeFrom === 'number' ? (block.timeFrom < 10000000000 ? block.timeFrom * 1000 : block.timeFrom) : new Date(block.timeFrom).getTime();
        const toTime = typeof block.timeTo === 'number' ? (block.timeTo < 10000000000 ? block.timeTo * 1000 : block.timeTo) : new Date(block.timeTo).getTime();
        return now >= fromTime && now < toTime;
      }) || tafJson[0].fcsts[0]; // fallback to first block if no strict match

      if (activeBlock) {
        tafWindDir = activeBlock.wdir || 0;
        tafWindSpd = activeBlock.wspd || 0;
        const fromTime = typeof activeBlock.timeFrom === 'number' ? (activeBlock.timeFrom < 10000000000 ? activeBlock.timeFrom * 1000 : activeBlock.timeFrom) : new Date(activeBlock.timeFrom).getTime();
        
        tafTimeLabel = new Date(fromTime).toLocaleTimeString('en-HK', { 
          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' 
        });
      }
    }

    const maxWindStr = maxForecastWind.toString().padStart(2, '0');
    const modifiedTaf = `[MAX: 000${maxWindStr}KT] ${currentTaf}`;

    if (currentMetar) {
      await Promise.all([
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('METAR', ${currentMetar}) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('TAF', ${modifiedTaf}) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_ARR', ${arrAtis}) ON CONFLICT DO NOTHING`,
        sql`INSERT INTO aero_data (data_type, raw_text) VALUES ('ATIS_DEP', ${depAtis}) ON CONFLICT DO NOTHING`
      ]);
    }

    return { 
      atisArr: arrAtis, 
      atisDep: depAtis, 
      metar: currentMetar, 
      taf: currentTaf,
      tafWindDir,
      tafWindSpd,
      tafTimeLabel
    };
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
  
  const has07 = arrRunways.some(r => r.includes("07")) || depRunways.some(r => r.includes("07"));
  const has25 = arrRunways.some(r => r.includes("25")) || depRunways.some(r => r.includes("25"));
  const isOps07 = has07 || !has25;

  const runwayConfig = [{ id: "N", l: "07L", r: "25R" }, { id: "C", l: "07C", r: "25C" }, { id: "S", l: "07R", r: "25L" }];

  return (
    <main style={{ padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      <style dangerouslySetInnerHTML={{__html: `
        .dashboard-container { width: 100%; max-width: 1400px; display: flex; flex-direction: column; gap: 20px; }
        .dashboard-row { display: flex; flex-direction: column; gap: 30px; }
        .compass-container { display: flex; flex-direction: column; align-items: center; gap: 20px; width: 100%; }
        .compass-box { position: relative; width: min(80vw, 300px); height: min(80vw, 300px); border: 1px solid #2a3b5a; border-radius: 50%; margin: 0 auto; }
        .taf-wind-box { background: #162540; padding: 15px; border-radius: 8px; border: 1px solid #2a3b5a; display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 110px; }
        .info-box { width: 100%; max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
        
        @media (min-width: 1024px) {
          .dashboard-row { flex-direction: row; align-items: center; justify-content: center; gap: 60px; }
          .compass-col { flex: 1; display: flex; justify-content: flex-end; }
          .compass-container { flex-direction: row; align-items: center; justify-content: flex-end; }
          .info-col { flex: 1; display: flex; justify-content: flex-start; }
          .compass-box { width: 500px; height: 500px; margin: 0; }
          .info-box { max-width: 700px; margin: 0; }
        }
      `}} />

      <div style={{ fontSize: '10px', color: '#556', textAlign: 'center', marginBottom: '15px' }}>
        SYSTEM LIVE // LAST DATA SYNC: {new Date().toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong' })} HKT
      </div>

      <div className="dashboard-container">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', padding: '0 20px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#88a' }}>WIND / VIS / TEMP</div>
            <div style={{ fontSize: '18px', color: '#4ade80' }}>{wx.dir}°/{wx.speed}KT <span style={{color: '#fff'}}>{wx.vis} {wx.temp}°C</span></div>
            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>☁️ {wx.clouds}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#88a' }}>ACTIVE</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>RWY {has25 && !has07 ? "25" : "07"}</div>
          </div>
        </div>

        <div className="dashboard-row">
          
          <div className="compass-col">
            <div className="compass-container">
              {/* MAIN METAR COMPASS */}
              <div className="compass-box">
                <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#555' }}>N</div>
                
                <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${wx.dir}deg)`, transition: 'transform 1s' }}>
                  <div style={{ width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '16px solid white', margin: '-8px auto' }} />
                  <div style={{ textAlign: 'center', marginTop: '-35px', fontWeight: 'bold', fontSize: '12px', transform: `rotate(-${wx.dir}deg)` }}>{wx.speed}KT</div>
                </div>

                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-17deg)', display: 'flex', flexDirection: 'column', gap: '10px', width: '55%' }}>
                  {runwayConfig.map((rwy) => {
                    const activeArr = arrRunways.includes(rwy.l) || arrRunways.includes(rwy.r);
                    const activeDep = depRunways.includes(rwy.l) || depRunways.includes(rwy.r);
                    
                    return (
                      <div key={rwy.id} style={{ position: 'relative', height: '14px', background: '#000', border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px', fontSize: '10px' }}>
                        <span style={{color: '#666'}}>{rwy.l}</span><div style={{ flex: 1, borderTop: '1px dashed #444', margin: '0 5px' }} /><span style={{color: '#666'}}>{rwy.r}</span>
                        {activeArr && <div style={{ position: 'absolute', [isOps07 ? 'left' : 'right']: '-60px', color: '#3b82f6', fontWeight: 'bold' }}>{isOps07 ? '➔ARR' : 'ARR←'}</div>}
                        {activeDep && <div style={{ position: 'absolute', [isOps07 ? 'right' : 'left']: '-60px', color: '#f59e0b', fontWeight: 'bold' }}>{isOps07 ? 'DEP➔' : '←DEP'}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* NEW: TAF PREDICT WIDGET */}
              <div className="taf-wind-box">
                <div style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: 'bold', marginBottom: '10px' }}>TAF PREDICT</div>
                
                {/* Mini Compass Arrow */}
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #2a3b5a', position: 'relative', background: '#0b162a' }}>
                  <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${data.tafWindDir}deg)`, transition: 'transform 1s' }}>
                    <div style={{ width: '0', height: '0', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '10px solid #8b5cf6', margin: '-5px auto' }} />
                  </div>
                </div>

                <div style={{ fontSize: '16px', color: '#fff', marginTop: '10px', fontWeight: 'bold' }}>{data.tafWindDir}°</div>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{data.tafWindSpd}KT</div>
                <div style={{ fontSize: '10px', color: '#88a', marginTop: '8px', background: '#07101e', padding: '3px 6px', borderRadius: '4px', border: '1px solid #162540' }}>AT {data.tafTimeLabel}</div>
              </div>

            </div>
          </div>

          <div className="info-col">
            <div className="info-box">
              <div style={{ padding: '15px', background: 'rgba(59, 130, 246, 0.1)', borderLeft: '3px solid #3b82f6', fontSize: '11px', lineHeight: '1.4' }}>{data.atisArr}</div>
              <div style={{ padding: '15px', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b', fontSize: '11px', lineHeight: '1.4' }}>{data.atisDep}</div>
              <div style={{ padding: '15px', background: '#111', borderLeft: '3px solid #fff', fontSize: '10px', color: '#888', lineHeight: '1.4' }}>{data.metar}</div>
              <div style={{ padding: '15px', background: '#0a101d', borderLeft: '3px solid #8b5cf6', fontSize: '10px', color: '#99a', lineHeight: '1.4' }}>{data.taf}</div>
              
              <Link href="/history" style={{ marginTop: '10px', color: '#445', fontSize: '12px', textDecoration: 'none', textAlign: 'right' }}>[ VIEW ARCHIVE ]</Link>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}