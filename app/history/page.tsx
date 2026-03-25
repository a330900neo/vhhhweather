'use client'; // Charts need to run on the client side
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Link from 'next/link';

export default function HistoryPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/history') // We will create this mini-api next
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{padding: '50px', color: 'white'}}>Analyzing VHHH Archives...</div>;

  return (
    <main style={{ padding: '20px', backgroundColor: '#0b162a', color: 'white', minHeight: '100vh', fontFamily: 'monospace' }}>
      <Link href="/" style={{ color: '#3b82f6', textDecoration: 'none' }}>← BACK TO DASHBOARD</Link>
      <h1 style={{ margin: '20px 0' }}>VHHH PERFORMANCE HISTORY</h1>

      {/* CHART SECTION */}
      <div style={{ background: '#162540', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h3>WIND SPEED TREND (Actual vs Forecast)</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3b5a" />
              <XAxis dataKey="time" stroke="#88a" fontSize={10} />
              <YAxis stroke="#88a" />
              <Tooltip contentStyle={{ backgroundColor: '#162540', border: '1px solid #2a3b5a' }} />
              <Legend />
              <Line type="monotone" dataKey="actualSpd" stroke="#4ade80" name="Actual (METAR)" strokeWidth={2} dot={false} />
              <Line type="stepAfter" dataKey="tafSpd" stroke="#3b82f6" name="Forecast (TAF)" strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RAW TABLE */}
      <h3>RAW DATA LOG</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #2a3b5a', color: '#88a' }}>
              <th style={{ padding: '10px' }}>TIME (UTC)</th>
              <th>TYPE</th>
              <th>RAW DATA</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row: any, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1a2a4a' }}>
                <td style={{ padding: '10px', color: '#aaa' }}>{row.time}</td>
                <td><span style={{ color: row.type === 'METAR' ? '#4ade80' : '#3b82f6' }}>{row.type}</span></td>
                <td style={{ fontSize: '10px', color: '#ccc' }}>{row.raw}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}