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
  actSpd?: number;
  actDir?: number;
  actTemp?: number;
  tafSpd?: number;
  tafDir?: number;
  tafTemp?: number;
  raw?: string;
  dataType?: string; 
  isFuture: boolean;
}

export default function HistoryPage() {
  const [data, setData] = useState<AeroHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => console.error("History fetch error:", err));
  }, []);

  // Auto-scroll charts to show the "NOW" line in the center
  useEffect(() => {
    if (!loading) {
      setTimeout(() => {
        const scrollers = document.querySelectorAll('.chart-scroll-container');
        scrollers.forEach((el: any) => {
          // Scrolls slightly left of center to put "NOW" in view
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

  // UPDATED: Dynamically format the "NOW" label to match either HH:00 or DD/HH:00 depending on API output
  const nowD = new Date();
  const hkHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', hour12: false }).format(nowD);
  const hkDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', day: '2-digit' }).format(nowD);
  
  let currentHourLabel = `${hkHour}:00`;
  if (data.length > 0 && data[0].time && data[0].time.includes('/')) {
    currentHourLabel = `${hkDay}/${hkHour}:00`;
  }

  const formatXAxis = (tickItem: any, index: number) => {
    return index % 2 === 0 ? tickItem : ''; // Show every 2nd hour to keep it clean
  };

  return (
    <main style={{ padding: '15px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      
      {/* CSS to handle mobile vertical stacking vs desktop horizontal layout */}
      <style dangerouslySetInnerHTML={{__html: `
        .chart-grid { display: flex; flex-direction: column; gap: 20px; padding-bottom: 20px; }
        @media (min-width: 1024px) {
          .chart-grid { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
        }
      `}} />

      <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '12px' }}>← DASHBOARD</Link>
      
      <h2 style={{ fontSize: '18px', margin: '15px 0' }}>VHHH 54-HOUR TREND & FORECAST</h2>

      <div className="chart-grid">
        
        {/* WIND SPEED */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND SPEED (KT) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '1200px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={formatXAxis} interval={0} fontSize={10} stroke="#556" />
                  <YAxis fontSize={10} stroke="#88a" />
                  <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actSpd" stroke="#4ade80" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                  <Line type="stepAfter" dataKey="tafSpd" stroke="#3b82f6" name="Forecast" strokeDasharray="5 5" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* WIND DIRECTION */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND DIRECTION (°) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '1200px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={formatXAxis} interval={0} fontSize={10} stroke="#556" />
                  <YAxis domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} fontSize={10} stroke="#88a" />
                  <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actDir" stroke="#4ade80" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                  <Line type="stepAfter" dataKey="tafDir" stroke="#3b82f6" name="Forecast" strokeDasharray="5 5" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* TEMPERATURE */}
        <div style={{ minWidth: '340px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>TEMP (°C) &lt;-- SCROLL --&gt;</div>
          <div className="chart-scroll-container" style={{ overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: '10px' }}>
            <div style={{ width: '1200px', height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={formatXAxis} interval={0} fontSize={10} stroke="#556" />
                  <YAxis fontSize={10} stroke="#88a" domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                  <ReferenceLine x={currentHourLabel} stroke="#ef4444" strokeWidth={2} label={{ value: 'NOW', fill: '#ef4444', fontSize: 10, position: 'top' }} />
                  
                  <Line type="linear" dataKey="actTemp" stroke="#f87171" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                  <Line type="stepAfter" dataKey="tafTemp" stroke="#fb923c" name="Forecast (TX)" strokeDasharray="5 5" strokeWidth={2} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* DATA LOG */}
      <h3 style={{ fontSize: '14px', marginTop: '10px', color: '#88a' }}>LOG ARCHIVE</h3>
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
            {[...data].reverse().filter(d => d.raw).map((row, i) => {
              let typeColor = '#3b82f6'; // TAF default blue
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
