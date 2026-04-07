import { sql } from '@vercel/postgres';
import PredictorClient from './PredictorClient';

export default async function PredictorPage() {
    
    // Fetch ATIS data from the last 24 hours
    const { rows } = await sql`
        SELECT raw_text, created_at 
        FROM aero_data 
        WHERE data_type LIKE '%ATIS%' 
        AND created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY created_at ASC
    `;

    let currentRwy = 0;
    let rwy07Count = 0;
    let validAtisCount = 0;
    
    // Create an array to hold the history log for the frontend
    const historyLog: { time: string, text: string, rwy: string }[] = [];

    rows.forEach((row) => {
        const text = row.raw_text.toUpperCase();
        const match = text.match(/RWY\s*(07|25)/);
        
        if (match) {
            const rwyStr = match[1];
            const rwy = rwyStr === '07' ? 0 : 1;
            currentRwy = rwy; 
            
            validAtisCount++;
            if (rwy === 0) rwy07Count++;

            // Save this exact record to send to the UI (convert date to string for Next.js)
            historyLog.push({
                time: new Date(row.created_at).toLocaleString(),
                text: text,
                rwy: rwyStr
            });
        }
    });

    const ratio24h = validAtisCount > 0 ? (rwy07Count / validAtisCount) : 0.5;

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>VHHH AI Predictor</h1>
            
            <div style={{ background: '#e0f7fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3>🌍 Database Live Status</h3>
                <p><strong>Current Active Runway:</strong> {currentRwy === 0 ? '07' : '25'}</p>
                <p><strong>Last 24h Usage:</strong> Runway 07 was active {(ratio24h * 100).toFixed(1)}% of the time.</p>
                <p style={{ fontSize: '12px', color: '#555' }}>Analyzed {validAtisCount} ATIS records from Vercel DB.</p>
            </div>

            {/* Pass the new historyLog array to the client! */}
            <PredictorClient 
                dbCurrentRwy={currentRwy} 
                dbRatio24h={ratio24h} 
                dbHistory={historyLog} 
            />
        </div>
    );
}
