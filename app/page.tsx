import { query } from '@/lib/db';
import Link from 'next/link';
import WindParticles from './WindParticles'; // <-- IMPORT THE NEW COMPONENT HERE
import { Metadata } from 'next'; // <-- 1. Import Metadata

export const revalidate = 60; 
// --- 2. ADD THIS EXPORT ---
export const metadata: Metadata = {
  title: 'VHHH weather',
  description: 'Live weather and ATIS for Hong Kong International Airport (VHHH)',
};

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
  const windMatch = metar.match(/(VRB|\d{3})(\d{2})(?:G(\d{2}))?KT/);
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
      
      tafJson[0].fcsts.forEach((block: any) => {
        if (block.wspd && block.wspd > maxForecastWind) maxForecastWind = block.wspd;
        if (block.wgst && block.wgst > maxForecastWind) maxForecastWind = block.wgst;
      });

      const relevantBlocks = tafJson[0].fcsts.filter((block: any) => {
        const toTime = typeof block.timeTo === 'number' ? (block.timeTo < 10000000000 ? block.timeTo * 1000 : block.timeTo) : new Date(block.timeTo).getTime();
        return toTime > now;
      });

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
        query('INSERT INTO aero_data (data_type, raw_text) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['METAR', currentMetar]),
        query('INSERT INTO aero_data (data_type, raw_text) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['TAF', modifiedTaf]),
        query('INSERT INTO aero_data (data_type, raw_text) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['ATIS_ARR', arrAtis]),
        query('INSERT INTO aero_data (data_type, raw_text) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['ATIS_DEP', depAtis])
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
        .compass-box { position: relative; width: min(80vw, 300px); height: min(80vw, 300px); border: 1px solid #2a3b5a; border-radius: 50%; margin: 0 auto; flex-shrink: 0; overflow: hidden; back[...]`,