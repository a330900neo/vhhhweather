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
}

export default function HistoryPage() {
  const [chartData, setChartData] = useState<AeroHistory[]>([]);
  const [logData, setLogData] = useState<AeroHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeStamp = new Date().getTime(); 
    
    fetch(`/api/history?t=${timeStamp}`, { cache: 'no-store' })
      .then(res => res.json())
      .then((json: AeroHistory[]) => {
        setLogData(json); // Save original raw data for the table

        // 1. Group by time to prevent Recharts from dot-stacking duplicate timestamps
        const grouped: Record<string, AeroHistory> = {};
        json.forEach(p => {
          if (!grouped[p.time]) {
            grouped[p.time] = { ...p };
          } else {
            // Merge properties so we don't have sparse gaps at the exact same minute
            if (typeof p.actDir === 'number') grouped[p.time].actDir = p.actDir;
            if (typeof p.actSpd === 'number') grouped[p.time].actSpd = p.actSpd;
            if (typeof p.actGust === 'number') grouped[p.time].actGust = p.actGust;
            if (typeof p.actTemp === 'number') grouped[p.time].actTemp = p.actTemp;
            
            if (typeof p.tafDir === 'number') grouped[p.time].tafDir = p.tafDir;
            if (typeof p.tafSpd === 'number') grouped[p.time].tafSpd = p.tafSpd;
            if (typeof p.tafGust === 'number') grouped[p.time].tafGust = p.tafGust;
            if (typeof p.tafTemp === 'number') grouped[p.time].tafTemp = p.tafTemp;
          }
        });

        const mergedList = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);

        // 2. Forward Fill sparse gaps & Apply Continuous Angle unrolling
        let lastActDir: number | null = null;
        let lastTafDir: number | null = null;
        
        let actOffset = 0;
        let prevRawAct: number | null = null;
        
        let tafOffset = 0;
        let prevRawTaf: number | null = null;

        mergedList.forEach(p => {
          // --- ACTUAL DIR PROCESSOR ---
          if (typeof p.actDir === 'number') {
            lastActDir = p.actDir;
          } else if (typeof p.actSpd === 'number') {
            // VRB Deteced: Speed exists, but Dir is null. This forces the line to disconnect!
            lastActDir = null; 
          } else if (!p.isFuture) {
            // Sparse gap from a TAF update in the past. Forward-fill to keep line connected!
            p.actDir = lastActDir;
          }

          // Unroll Actual Dir so 350 -> 10 draws beautifully instead of crisscrossing
          if (typeof p.actDir === 'number') {
            if (prevRawAct !== null) {
              const diff = p.actDir - prevRawAct;
              if (diff > 180) actOffset -= 360;
              else if (diff < -180) actOffset += 360;
            }
            prevRawAct = p.actDir;
            p.actDir = p.actDir + actOffset;
          } else {
            prevRawAct = null; // Reset anchor if VRB breaks the line
          }

          // --- FORECAST DIR PROCESSOR ---
          if (typeof p.tafDir === 'number') {
            lastTafDir = p.tafDir;
          } else if (typeof p.tafSpd === 'number') {
            lastTafDir = null; // TAF VRB
          } else {
            p.tafDir = lastTafDir;
          }

          // Unroll Forecast Dir
          if (typeof p.tafDir === 'number') {
            if (prevRawTaf !== null) {
              const diff = p.tafDir - prevRawTaf;
              if (diff > 180) tafOffset -= 360;
              else if (diff < -180) tafOffset += 360;
            }
            prevRawTaf = p.tafDir;
            p.tafDir = p.tafDir + tafOffset;
          } else {
            prevRawTaf = null;
          }
        });

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
                  
                  <Line type="linear" dataKey="actSpd" stroke="#4ade80" name="Actual Spd" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line type="linear" dataKey="actGust" stroke="#facc15" name="Actual Gust" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2 }} connectNulls={false} />
                  
                  <Line type="stepAfter" dataKey="tafSpd" stroke="#3b82f6" name="Forecast Spd" strokeDasharray="5 5" strokeWidth={2} connectNulls={false} />
                  <Line type="stepAfter" dataKey="tafGust" stroke="#c084fc" name="Forecast Gust" strokeDasharray="3 3" strokeWidth={2} connectNulls={false} />
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
                  
                  {/* Notice domain is removed so lines can wrap mathematically. We format the ticks to always show 0-360 visually! */}
                  <YAxis 
                    tickFormatter={(val) => {
                     let v = val % 360;
                     if (v < 0) v += 360;
                     // Add .toString() to satisfy TypeScript's string return requirement
                     return (v === 0 ? 360 : v).toString(); 
                    }} 
                    fontSize={10} 
                    stroke="#88a" 
                  />
                  
                  <Tooltip 
                   contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} 
                   formatter={(value: any, name: any) => {
                     // Ensure tooltip always shows standard aviation degrees
                     if (typeof value === 'number' && typeof name === 'string' && name.includes('Dir')) {
                       let v = Math.round(value) % 360;
                       if (v < 0) v += 360;
                       return [`${v === 0 ? 360 : v}°`, name];
                     }
                     return [value, name];
                    }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actDir" stroke="#4ade80" name="Actual Dir" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line type="stepAfter" dataKey="tafDir" stroke="#3b82f6" name="Forecast Dir" strokeDasharray="5 5" strokeWidth={2} connectNulls={false} />
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
                  
                  <Line type="linear" dataKey="actTemp" stroke="#f87171" name="Actual Temp" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line type="stepAfter" dataKey="tafTemp" stroke="#fb923c" name="Forecast Temp" strokeDasharray="5 5" strokeWidth={2} connectNulls={false} />
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
            {/* Note: We map logData here so the table still shows EVERY row untouched! */}
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
                  <td style={{ color: '#ccc', fontSize: '9px', paddingRight: '10px' }}>{row.raw}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}