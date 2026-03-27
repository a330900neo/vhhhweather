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
  // Extract Speed, Direction, and Gusts
  const windMatch = metar.match(/(VRB|\d{3})(\d{2})(?:G(\d{2}))?KT/);
  // Extract Variable Wind Bounds (e.g. 060V180)
  const varyMatch = metar.match(/\b(\d{3})V(\d{3})\b/);
  const visMatch = metar.match(/\b(\d{4}|10KM)\b/);
  const tempMatch = metar.match(/\b(\d{2})\/(\d{2})\b/);
  
  return {
    dir: windMatch ? (windMatch[1] === 'VRB' ? 'VRB' : parseInt(windMatch[1])) : 0,
    speed: windMatch ? parseInt(windMatch[2]) : 0,
    gust: windMatch && windMatch[3] ? parseInt(windMatch[3]) : 0,
    varFrom: varyMatch ? parseInt(varyMatch[1]) : null,
    varTo: varyMatch ? parseInt(varyMatch[2]) : null,
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

// FORMAT DATE & TIME HELPER (HKT)
function formatTafTime(ms: number) {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day}/${time}`;
}

// --- DATA FETCHING ---
async function fetchAeroData() {
  fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/cleanup`);
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
    
    let upcomingForecasts: { dir: number | string, spd: number, gust: number | null, type: string, timeLabel: string }[] = [];

    if (tafJson[0]?.fcsts) {
      const now = Date.now();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tafJson[0].fcsts.forEach((block: any) => {
        if (block.wspd && block.wspd > maxForecastWind) maxForecastWind = block.wspd;
        if (block.wgst && block.wgst > maxForecastWind) maxForecastWind = block.wgst;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relevantBlocks = tafJson[0].fcsts.filter((block: any) => {
        const toTime = typeof block.timeTo === 'number' ? (block.timeTo < 10000000000 ? block.timeTo * 1000 : block.timeTo) : new Date(block.timeTo).getTime();
        return toTime > now;
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upcomingForecasts = relevantBlocks.slice(0, 4).map((block: any) => {
        const fromTime = typeof block.timeFrom === 'number' ? (block.timeFrom < 10000000000 ? block.timeFrom * 1000 : block.timeFrom) : new Date(block.timeFrom).getTime();
        const toTime = typeof block.timeTo === 'number' ? (block.timeTo < 10000000000 ? block.timeTo * 1000 : block.timeTo) : new Date(block.timeTo).getTime();
        
        const timeLabel = `${formatTafTime(fromTime)} - ${formatTafTime(toTime)}`;
        const wdirRaw = block.wdir;
        const dir = (wdirRaw === "VRB" || wdirRaw === 'VRB') ? 'VRB' : (wdirRaw || 0);

        return {
          dir: dir,
          spd: block.wspd || 0,
          gust: block.wgst || null,
          type: block.fcstType || block.changeIndicator || "", 
          timeLabel: timeLabel
        };
      });
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
      upcomingForecasts
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
        .compass-box { position: relative; width: min(80vw, 300px); height: min(80vw, 300px); border: 1px solid #2a3b5a; border-radius: 50%; margin: 0 auto; flex-shrink: 0; overflow: hidden; }
        .compass-layer { position: absolute; z-index: 10; width: 100%; height: 100%; top: 0; left: 0; pointer-events: none; }
        
        .taf-row-wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 100vw; overflow: hidden; }
        .taf-scroll-container { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; scrollbar-width: none; max-width: 100%; }
        .taf-wind-box { background: #162540; padding: 15px; border-radius: 8px; border: 1px solid #2a3b5a; display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 120px; flex: 0 0 auto; position: relative; }
        
        .info-box { width: 100%; max-width: 500px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
        
        @media (min-width: 1024px) {
          .dashboard-row { flex-direction: row; align-items: center; justify-content: center; gap: 60px; }
          .compass-col { flex: 1; display: flex; justify-content: flex-end; }
          .compass-container { flex-direction: row; align-items: center; justify-content: flex-end; }
          .info-col { flex: 1; display: flex; justify-content: flex-start; }
          .compass-box { width: 500px; height: 500px; margin: 0; }
          .info-box { max-width: 700px; margin: 0; }
          .taf-row-wrapper { width: auto; max-width: 400px; align-items: flex-start; }
          .taf-scroll-container { flex-wrap: wrap; overflow-x: visible; justify-content: flex-start; }
        }
      `}} />

      <div style={{ fontSize: '10px', color: '#556', textAlign: 'center', marginBottom: '15px' }}>
        SYSTEM LIVE // LAST DATA SYNC: {new Date().toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong' })} HKT
      </div>

      <div className="dashboard-container">
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', padding: '0 20px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#88a' }}>WIND / VIS / TEMP</div>
            <div style={{ fontSize: '18px', color: '#4ade80' }}>
              {wx.dir === 'VRB' ? 'VRB' : `${wx.dir}°`}/{wx.speed}KT {wx.gust > 0 && <span style={{color: '#facc15'}}>G{wx.gust}KT</span>} <span style={{color: '#fff'}}>{wx.vis} {wx.temp}°C</span>
            </div>
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
                {/* WIND PARTICLE ENGINE CANVAS */}
                <canvas id="wind-particles" width="500" height="500" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} />
                
                {/* COMPASS OVERLAYS */}
                <div className="compass-layer">
                  <div style={{ position: 'absolute', top: '5px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: '#555' }}>N</div>
                  
                  {wx.dir !== 'VRB' ? (
                    <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${wx.dir}deg)`, transition: 'transform 1s' }}>
                      <div style={{ width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '16px solid white', margin: '-8px auto' }} />
                      <div style={{ textAlign: 'center', marginTop: '-35px', fontWeight: 'bold', fontSize: '12px', transform: `rotate(-${wx.dir}deg)` }}>
                        {wx.speed}KT {wx.gust > 0 && <span style={{color: '#facc15'}}><br/>G{wx.gust}</span>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#fff' }}>VRB</div>
                      <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#aaa', marginTop: '2px' }}>{wx.speed}KT {wx.gust > 0 && `G${wx.gust}`}</div>
                    </div>
                  )}

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

                {/* WIND PARTICLE LOGIC SCRIPT */}
                <script dangerouslySetInnerHTML={{__html: `
                  (function() {
                    const canvas = document.getElementById('wind-particles');
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    const w = canvas.width; const h = canvas.height;
                    
                    const dir = "${wx.dir}";
                    const spd = ${wx.speed};
                    const gust = ${wx.gust};
                    const vFrom = ${wx.varFrom !== null ? wx.varFrom : 'null'};
                    const vTo = ${wx.varTo !== null ? wx.varTo : 'null'};
                    
                    // Adjust particle amount roughly based on speed
                    let numParticles = spd === 0 ? 0 : Math.min(120, spd * 4);
                    const particles = [];
                    
                    function getRandomAngle() {
                      if (dir === 'VRB') return Math.random() * 360;
                      if (vFrom !== null && vTo !== null) {
                        let diff = vTo - vFrom;
                        if (diff < 0) diff += 360; // handle wrap around 360
                        return (vFrom + Math.random() * diff) % 360;
                      }
                      return parseFloat(dir) || 0;
                    }

                    for (let i = 0; i < numParticles; i++) {
                      particles.push({
                        x: Math.random() * w,
                        y: Math.random() * h,
                        life: Math.random(),
                        // Base speed + variance if gusting
                        speed: spd + (gust > spd ? Math.random() * (gust - spd) : 0),
                        angle: getRandomAngle()
                      });
                    }

                    function draw() {
                      ctx.clearRect(0, 0, w, h);
                      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)'; 
                      ctx.lineWidth = 1.5;

                      particles.forEach(p => {
                        // Math: Aviation direction is "Wind from X". 
                        // So a North wind (360) moves South (Positive Y). East wind (090) moves West (Negative X).
                        let rad = (p.angle + 180) * Math.PI / 180;
                        let dx = Math.sin(rad) * (p.speed * 0.15);
                        let dy = -Math.cos(rad) * (p.speed * 0.15);
                        
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        
                        p.x += dx;
                        p.y += dy;
                        p.life -= 0.015;

                        // Draw particle trail streak
                        ctx.lineTo(p.x + dx * 2, p.y + dy * 2);
                        ctx.stroke();

                        // Reset particle if dead or out of bounds
                        if (p.life <= 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
                          p.angle = getRandomAngle();
                          p.speed = spd + (gust > spd ? Math.random() * (gust - spd) : 0);
                          p.life = 1;
                          
                          // Respawn logically opposite to the wind to flow across
                          if (dir !== 'VRB') {
                             let respawnRad = p.angle * Math.PI / 180;
                             p.x = w/2 + Math.sin(respawnRad) * (w/2) * Math.random();
                             p.y = h/2 - Math.cos(respawnRad) * (h/2) * Math.random();
                          } else {
                             p.x = Math.random() * w;
                             p.y = Math.random() * h;
                          }
                        }
                      });
                      requestAnimationFrame(draw);
                    }
                    if (numParticles > 0) draw();
                  })();
                `}} />
              </div>

              {/* TAF PREDICT WIDGETS */}
              <div className="taf-row-wrapper">
                <div style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: 'bold', marginBottom: '10px' }}>UPCOMING TAF SHIFTS</div>
                <div className="taf-scroll-container">
                  {data.upcomingForecasts.map((fcst, i) => (
                    <div key={i} className="taf-wind-box">
                      
                      {/* BECMG Indicator */}
                      {fcst.type === "BECMG" && (
                        <div style={{ position: 'absolute', top: '-8px', background: '#eab308', color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                          BECMG
                        </div>
                      )}

                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #2a3b5a', position: 'relative', background: '#0b162a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {fcst.dir !== 'VRB' ? (
                          <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `rotate(${fcst.dir}deg)`, transition: 'transform 1s' }}>
                            <div style={{ width: '0', height: '0', borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '8px solid #8b5cf6', margin: '-4px auto' }} />
                          </div>
                        ) : (
                          <div style={{ fontSize: '9px', color: '#8b5cf6', fontWeight: 'bold' }}>VRB</div>
                        )}
                      </div>

                      <div style={{ fontSize: '14px', color: '#fff', marginTop: '8px', fontWeight: 'bold' }}>
                        {fcst.dir === 'VRB' ? 'VRB' : `${fcst.dir}°`}
                      </div>
                      
                      <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {fcst.spd}KT
                        {fcst.gust && <span style={{color: '#f87171', fontWeight: 'bold'}}>G{fcst.gust}KT</span>}
                      </div>
                      
                      <div style={{ fontSize: '9px', color: '#88a', marginTop: '8px', background: '#07101e', padding: '4px 6px', borderRadius: '4px', border: '1px solid #162540', whiteSpace: 'nowrap' }}>
                        {fcst.timeLabel}
                      </div>
                    </div>
                  ))}
                  {data.upcomingForecasts.length === 0 && (
                    <div style={{ fontSize: '10px', color: '#556' }}>NO PENDING SHIFTS</div>
                  )}
                </div>
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