import { sql } from '@vercel/postgres';
import PredictorClient from './PredictorClient';

export default async function PredictorPage() {
    
    // 1. Let the Database do the Timezone Math!
    // We fetch 48 hours, but we ask SQL to flag if a row is strictly within the last 24 hours.
    const { rows } = await sql`
        SELECT 
            raw_text, 
            created_at,
            (created_at >= NOW() - INTERVAL '24 hours') as is_last_24h
        FROM aero_data 
        WHERE data_type LIKE '%ATIS%' 
        AND created_at >= NOW() - INTERVAL '48 hours'
        ORDER BY created_at ASC
    `;

    let currentRwy = 0;
    let rwy07Count24h = 0;
    let validAtisCount24h = 0;
    
    const historyLog: { time: string, text: string, rwy: string }[] = [];

    rows.forEach((row) => {
        const text = row.raw_text.toUpperCase();
        const match = text.match(/RWY\s*(07|25)/);
        
        if (match) {
            const rwyStr = match[1];
            const rwy = rwyStr === '07' ? 0 : 1;
            currentRwy = rwy; 
            
            // 2. We use the Database's perfectly accurate boolean flag
            if (row.is_last_24h) {
                validAtisCount24h++;
                if (rwy === 0) rwy07Count24h++;
            }

            // 3. Save all 48 hours to the History Log
            historyLog.push({
                time: new Date(row.created_at).toLocaleString(),
                text: text,
                rwy: rwyStr
            });
        }
    });

    const ratio24h = validAtisCount24h > 0 ? (rwy07Count24h / validAtisCount24h) : 0.5;

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>VHHH AI Predictor</h1>
            
            <div style={{ background: '#e0f7fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3>🌍 Database Live Status</h3>
                <p><strong>Current Active Runway:</strong> {currentRwy === 0 ? '07' : '25'}</p>
                <p><strong>AI 24h Trend:</strong> Runway 07 was active {(ratio24h * 100).toFixed(1)}% of the time.</p>
                <p style={{ fontSize: '12px', color: '#555', marginTop: '8px' }}>
                    * Used {validAtisCount24h} ATIS records for 24h AI math.<br/>
                    * Displaying {historyLog.length} ATIS records for 48h visual history.
                </p>
            </div>

            <PredictorClient 
                dbCurrentRwy={currentRwy} 
                dbRatio24h={ratio24h} 
                dbHistory={historyLog} 
            />
        </div>
    );
}
