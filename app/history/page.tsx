'use client';
import { useEffect, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import Link from 'next/link';

interface AeroHistory {
  time: string;
  timestamp: number;
  actSpd?: number | null;
  actDir?: number | null;
  actGust?: number | null;
  tafSpd?: number | null;
  tafDir?: number | null;
  tafGust?: number | null;
  actTemp?: number | null;
  tafTemp?: number | null;
  raw?: string;
  dataType?: string; 
  isFuture: boolean;
  actVrbSpd?: number | null;
  actVrbDir?: number | null;
  tafVrbSpd?: number | null;
  tafVrbDir?: number | null;
  actVarFrom?: number | null;
  actVarTo?: number | null;
  tafVarFrom?: number | null;
  tafVarTo?: number | null;
}

export default function HistoryPage() {
  const [chartData, setChartData] = useState<AeroHistory[]>([]);
  const [logData, setLogData] = useState<AeroHistory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dynamic Y-Axis settings for the unrolled wind direction
  const [dirTicks, setDirTicks] = useState<number[]>([0, 90, 180, 270, 360]);
  const [dirDomain, setDirDomain] = useState<[number, number]>([0, 360]);

  useEffect(() => {
    const timeStamp = new Date().getTime(); 
    
    fetch(`/api/history?t=${timeStamp}`, { cache: 'no-store' })
      .then(res => res.json())
      .then((json: AeroHistory[]) => {
        setLogData(json);

        // Pre-parse and Filter Data
        json.forEach(p => {
          if (p.dataType !== 'METAR') {
            p.actSpd = null;
            p.actDir = null;
            p.actGust = null;
            p.actTemp = null;
            p.actVarFrom = null;
            p.actVarTo = null;
            p.actVrbSpd = null;
            p.actVrbDir = null;
          }

          if (p.raw && p.dataType === 'METAR') {
            const varyMatch = p.raw.match(/\b(\d{3})V(\d{3})\b/);
            if (varyMatch) {
              p.actVarFrom = parseInt(varyMatch[1], 10);
              p.actVarTo = parseInt(varyMatch[2], 10);
            }
          }
          if (p.raw && p.dataType === 'TAF') {
             const varyMatch = p.raw.match(/\b(\d{3})V(\d{3})\b/);
             if (varyMatch) {
               p.tafVarFrom = parseInt(varyMatch[1], 10);
               p.tafVarTo = parseInt(varyMatch[2], 10);
             }
          }
        });

        // Group by time
        const grouped: Record<string, AeroHistory> = {};
        json.forEach(p => {
          if (!grouped[p.time]) {
            grouped[p.time] = { ...p };
          } else {
            if (typeof p.actDir === 'number') grouped[p.time].actDir = p.actDir;
            if (typeof p.actSpd === 'number') grouped[p.time].actSpd = p.actSpd;
            if (typeof p.actGust === 'number') grouped[p.time].actGust = p.actGust;
            if (typeof p.actTemp === 'number') grouped[p.time].actTemp = p.actTemp;
            if (typeof p.actVarFrom === 'number') grouped[p.time].actVarFrom = p.actVarFrom;
            if (typeof p.actVarTo === 'number') grouped[p.time].actVarTo = p.actVarTo;
            
            if (typeof p.tafDir === 'number') grouped[p.time].tafDir = p.tafDir;
            if (typeof p.tafSpd === 'number') grouped[p.time].tafSpd = p.tafSpd;
            if (typeof p.tafGust === 'number') grouped[p.time].tafGust = p.tafGust;
            if (typeof p.tafTemp === 'number') grouped[p.time].tafTemp = p.tafTemp;
            if (typeof p.tafVarFrom === 'number') grouped[p.time].tafVarFrom = p.tafVarFrom;
            if (typeof p.tafVarTo === 'number') grouped[p.time].tafVarTo = p.tafVarTo;
          }
        });

        const mergedList = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

        // --- INFINITY UNROLLING MATH ---
        // Finds the shortest path to the next angle to prevent steep 360 lines
        const unwrap = (curr: number, prev: number) => {
          let diff = curr - prev;
          while (diff > 180) diff -= 360;
          while (diff <= -180) diff += 360;
          return prev + diff;
        };

        let lastActDir: number | null = null;
        let lastTafDir: number | null = null;

        mergedList.forEach(p => {
          // --- ACTUAL DIR PROCESSOR ---
          if (typeof p.actDir === 'number') {
            if (lastActDir !== null) {
              p.actDir = unwrap(p.actDir, lastActDir);
            }
            lastActDir = p.actDir;

            if (p.actVrbSpd !== undefined) p.actVrbDir = p.actDir;

            // Make the variance lines tightly hug the main direction line
            if (typeof p.actVarFrom === 'number' && typeof p.actVarTo === 'number') {
              p.actVarFrom = unwrap(p.actVarFrom, p.actDir);
              p.actVarTo = unwrap(p.actVarTo, p.actDir);
            }
          } else if (typeof p.actSpd === 'number') {
            p.actDir = lastActDir;
            p.actVrbSpd = p.actSpd;
            if (p.actDir !== null) p.actVrbDir = p.actDir;
          } else if (!p.isFuture) {
            p.actDir = lastActDir;
          }

          // --- FORECAST DIR PROCESSOR ---
          if (typeof p.tafDir === 'number') {
            
            // FIX: Strong priority anchoring!
            // 1. If Actual Dir exists right now, strictly align TAF to its unrolled plane to prevent detachment.
            // 2. Otherwise (in the future), continue off its own last TAF position for smooth rolling.
            // 3. Fallback to the very last Actual point.
            let refDir: number | null = null;
            if (typeof p.actDir === 'number') {
              refDir = p.actDir;
            } else if (lastTafDir !== null) {
              refDir = lastTafDir;
            } else if (lastActDir !== null) {
              refDir = lastActDir;
            }

            if (refDir !== null) {
              p.tafDir = unwrap(p.tafDir, refDir);
            }
            lastTafDir = p.tafDir;

            if (p.tafVrbSpd !== undefined) p.tafVrbDir = p.tafDir;

            // Make the forecast variance lines tightly hug the TAF direction line
            if (typeof p.tafVarFrom === 'number' && typeof p.tafVarTo === 'number') {
              p.tafVarFrom = unwrap(p.tafVarFrom, p.tafDir);
              p.tafVarTo = unwrap(p.tafVarTo, p.tafDir);
            }
          } else if (typeof p.tafSpd === 'number') {
            p.tafDir = lastTafDir;
            p.tafVrbSpd = p.tafSpd;
            if (p.tafDir !== null) p.tafVrbDir = p.tafDir;
          } else {
            p.tafDir = lastTafDir;
          }
        });

        // --- CALCULATE DYNAMIC CHART BOUNDS ---
        const allDirs = mergedList.flatMap(p => [
          p.actDir, p.tafDir, p.actVarFrom, p.actVarTo, p.tafVarFrom, p.tafVarTo
        ]).filter(v => v !== null && v !== undefined) as number[];
        
        if (allDirs.length > 0) {
          const minD = Math.min(...allDirs);
          const maxD = Math.max(...allDirs);
          
          // Generate custom ticks aligned to perfect 90-degree intervals covering the entire infinite sweep
          const startTick = Math.floor(minD / 90) * 90 - 90;
          const endTick = Math.ceil(maxD / 90) * 90 + 90;
          const generatedTicks = [];
          for(let t = startTick; t <= endTick; t += 90) {
            generatedTicks.push(t);
          }
          setDirTicks(generatedTicks);
          setDirDomain([startTick, endTick]);
        }

        setChartData(mergedList);
        setLoading(false);
      })
      .catch(err => console.error("History fetch error:", err));
  }, []);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const scrollers = document.querySelectorAll('.chart-scroll-container');
        scrollers.forEach((el: any) => {
          el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.45; 
        });
      }, 100);
    }
  }, [loading]);

  if (loading) {
    return (
      <div style={{ padding: '50px', color: 'white', backgroundColor: '#0b162a', minHeight: '100vh', fontFamily: 'monospace' }}>
        CALIBRATING TIMELINE...
      </div>
    );
  }

  const nowD = new Date();
  const hkHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false }).format(nowD);
  const hkDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', day: '2-digit' }).format(nowD);
  
  let currentHourLabel = `${hkHour}:00`;
  if (chartData.length > 0 && chartData[0].time && chartData[0].time.includes('/')) {
    currentHourLabel = `${hkDay}/${hkHour}:00`;
  }

  return (
    <main style={{ padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      
      <style dangerouslySetInnerHTML={{__html: `
        .chart-grid { display: flex; flex-direction: column; gap: 20px; padding-bottom: 20px; }
        @media (min-width: 1024px) {
          .chart-grid { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
        }
      `}} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '12px' }}>
          ← DASHBOARD
        </Link>
        <Link href="/all-history" style={{ background: '#1e293b', color: '#4ade80', padding: '6px 12px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none', border: '1px solid #2a3b5a', fontWeight: 'bold' }}>
          DATA ARCHIVE ❯
        </Link>
      </div>
      
      <h2 style={{ fontSize: '18px', margin: '15px 0' }}>VHHH 54-HOUR TREND & FORECAST (DETAILED)</h2>

      <div className="chart-grid">
        
        {/* WIND SPEED & GUSTS */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND SPEED & GUST (KT) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '3600px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={15} fontSize={10} stroke="#556" />
                  <YAxis fontSize={10} stroke="#88a" />
                  <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actSpd" stroke="#4ade80" name="Actual Spd" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={true} />
                  <Line type="linear" dataKey="actGust" stroke="#facc15" name="Actual Gust" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} connectNulls={true} />
                  
                  <Line type="stepAfter" dataKey="tafSpd" stroke="#3b82f6" name="Forecast Spd" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} />
                  <Line type="stepAfter" dataKey="tafGust" stroke="#c084fc" name="Forecast Gust" strokeDasharray="3 3" strokeWidth={2} connectNulls={true} />

                  <Line type="monotone" dataKey="actVrbSpd" name="Actual VRB" stroke="none" dot={{ r: 5, stroke: '#ef4444', strokeWidth: 2, fill: '#0b162a' }} isAnimationActive={false} connectNulls={false} />
                  <Line type="monotone" dataKey="tafVrbSpd" name="Forecast VRB" stroke="none" dot={{ r: 5, stroke: '#ef4444', strokeWidth: 2, fill: '#0b162a' }} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* WIND DIRECTION */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND DIRECTION (°) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '3600px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={15} fontSize={10} stroke="#556" />
                  
                  {/* Dynamic infinite unrolled Y-Axis */}
                  <YAxis 
                    domain={dirDomain}
                    ticks={dirTicks}
                    interval={0}
                    tickFormatter={(val) => {
                     // Reverse mathematically unrolled numbers (like 400, 720, or -50) back to 360 aviation heading format!
                     let v = Math.round(val) % 360;
                     if (v <= 0) v += 360; 
                     return v.toString().padStart(3, '0');
                    }} 
                    fontSize={10} 
                    stroke="#88a" 
                  />
                  
                  <Tooltip 
                   contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} 
                   formatter={(value: any, name: any) => {
                     if (typeof value === 'number' && typeof name === 'string' && (name.includes('Dir') || name.includes('Var'))) {
                       let v = Math.round(value) % 360;
                       if (v <= 0) v += 360;
                       return [`${v.toString().padStart(3, '0')}°`, name];
                     }
                     if (typeof name === 'string' && name.includes('VRB')) {
                       return ['Variable Wind', name];
                     }
                     return [value, name];
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  {/* Variable Bounds Layered Behind Main Lines */}
                  <Line type="monotone" dataKey="actVarFrom" stroke="#93c5fd" name="Act Var Min" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls={false} />
                  <Line type="monotone" dataKey="actVarTo" stroke="#93c5fd" name="Act Var Max" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls={false} />
                  <Line type="stepAfter" dataKey="tafVarFrom" stroke="#a78bfa" name="Taf Var Min" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls={false} />
                  <Line type="stepAfter" dataKey="tafVarTo" stroke="#a78bfa" name="Taf Var Max" strokeDasharray="4 4" dot={false} strokeWidth={1.5} connectNulls={false} />

                  <Line type="linear" dataKey="actDir" stroke="#4ade80" name="Actual Dir" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={true} />
                  <Line type="stepAfter" dataKey="tafDir" stroke="#3b82f6" name="Forecast Dir" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} />

                  <Line type="monotone" dataKey="actVrbDir" name="Actual VRB" stroke="none" dot={{ r: 5, stroke: '#ef4444', strokeWidth: 2, fill: '#0b162a' }} isAnimationActive={false} connectNulls={false} />
                  <Line type="monotone" dataKey="tafVrbDir" name="Forecast VRB" stroke="none" dot={{ r: 5, stroke: '#ef4444', strokeWidth: 2, fill: '#0b162a' }} isAnimationActive={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* TEMPERATURE */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>TEMP (°C) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '3600px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" minTickGap={15} fontSize={10} stroke="#556" />
                  <YAxis fontSize={10} stroke="#88a" domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actTemp" stroke="#f87171" name="Actual Temp" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={true} />
                  <Line type="stepAfter" dataKey="tafTemp" stroke="#fb923c" name="Forecast Temp" strokeDasharray="5 5" strokeWidth={2} connectNulls={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* DATA LOG */}
      <h3 style={{ fontSize: '14px', marginTop: '10px', color: '#88a' }}>RECENT LOGS</h3>
      <div style={{ overflowX: 'auto', background: '#07101e', borderRadius: '4px', border: '1px solid #162540' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #2a3b5a', color: '#556' }}>
              <th style={{ padding: '12px' }}>HKT</th>
              <th>TYPE</th>
              <th>DATA</th>
            </tr>
          </thead>
          <tbody>
            {[...logData].filter(d => d.raw).reverse().slice(0, 10).map((row, i) => {
              let typeColor = '#3b82f6';
              if (row.dataType === 'METAR') typeColor = '#4ade80'; 
              if (row.dataType?.includes('ATIS')) typeColor = '#f59e0b'; 

              return (
                <tr key={i} style={{ borderBottom: '1px solid #162540' }}>
                  <td style={{ padding: '12px', color: '#88a', whiteSpace: 'nowrap' }}>{row.time}</td>
                  <td style={{ color: typeColor, fontWeight: 'bold', whiteSpace: 'nowrap', paddingRight: '10px' }}>
                      {row.dataType || 'UNKNOWN'}
                  </td>
                  <td style={{ color: '#ccc', fontSize: '9px', padding: '12px 12px 12px 0' }}>{row.raw}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
