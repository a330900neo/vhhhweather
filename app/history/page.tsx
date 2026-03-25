'use client';
import { useEffect, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import Link from 'next/link';

export default function HistoryPage() {
  const [data, setData] = useState([]);
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

  if (loading) {
    return (
      <div style={{
        padding: '50px', color: 'white', backgroundColor: '#0b162a', 
        minHeight: '100vh', fontFamily: 'monospace'
      }}>
        LOADING VHHH ARCHIVES...
      </div>
    );
  }

  return (
    <main style={{ 
      padding: '15px', backgroundColor: '#0b162a', color: 'white', 
      minHeight: '100vh', fontFamily: 'monospace' 
    }}>
      <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '12px' }}>
        ← BACK TO DASHBOARD
      </Link>
      
      <h2 style={{ fontSize: '18px', margin: '15px 0' }}>VHHH PERFORMANCE HISTORY</h2>

      {/* HORIZONTAL SCROLL CONTAINER FOR CHARTS */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        overflowX: 'auto', 
        paddingBottom: '20px', 
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none' 
      }}>
        
        {/* 1. WIND SPEED CHART */}
        <div style={{ minWidth: '320px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND SPEED (KT)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis fontSize={10} stroke="#88a" />
                <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="actSpd" stroke="#4ade80" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                <Line type="stepAfter" dataKey="tafSpd" stroke="#3b82f6" name="Forecast" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. WIND DIRECTION CHART */}
        <div style={{ minWidth: '320px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>WIND DIRECTION (°)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} fontSize={10} stroke="#88a" />
                <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="actDir" stroke="#4ade80" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                <Line type="stepAfter" dataKey="tafDir" stroke="#3b82f6" name="Forecast" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. TEMPERATURE CHART */}
        <div style={{ minWidth: '320px', flex: '1', background: '#162540', padding: '15px', borderRadius: '8px', border: '1px solid #2a3b5a' }}>
          <div style={{ fontSize: '11px', color: '#88a', marginBottom: '10px', fontWeight: 'bold' }}>TEMPERATURE (°C)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#2a3b5a" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis fontSize={10} stroke="#88a" domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ backgroundColor: '#0b162a', border: '1px solid #2a3b5a', fontSize: '10px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="actTemp" stroke="#f87171" name="Actual" strokeWidth={3} dot={{ r: 2 }} connectNulls />
                <Line type="stepAfter" dataKey="tafTemp" stroke="#fb923c" name="Forecast (TX)" strokeDasharray="5 5" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* RAW LOG TABLE */}
      <h3 style={{ fontSize: '14px', marginTop: '30px', color: '#88a' }}>RAW DATA LOG</h3>
      <div style={{ overflowX: 'auto', background: '#07101e', borderRadius: '4px', border: '1px solid #162540' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #2a3b5a', color: '#556' }}>
              <th style={{ padding: '12px' }}>TIME (HKT)</th>
              <th style={{ width: '80px' }}>TYPE</th>
              <th>RAW DATA CONTENT</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((row: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #162540' }}>
                <td style={{ padding: '12px', color: '#88a', whiteSpace: 'nowrap' }}>{row.time}</td>
                <td style={{ 
                  color: row.type?.includes('METAR') ? '#4ade80' : 
                         row.type?.includes('TAF') ? '#3b82f6' : '#f59e0b', 
                  fontWeight: 'bold' 
                }}>
                  {row.type}
                </td>
                <td style={{ color: '#ccc', paddingRight: '20px', fontSize: '9px' }}>
                  {row.raw}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}