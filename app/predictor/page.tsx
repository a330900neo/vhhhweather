import { sql } from '@vercel/postgres';
import PredictorClient from './PredictorClient';

export default async function PredictorPage() {
    
    // 1. Fetch ATIS data from the last 48 HOURS for the transparency log
    const { rows } = await sql`
        SELECT raw_text, created_at 
        FROM aero_data 
        WHERE data_type LIKE '%ATIS%' 
        AND created_at >= NOW() - INTERVAL '48 hours'
        ORDER BY created_at ASC
    `;

    let currentRwy = 0;
    let rwy07Count24h = 0;
    let validAtisCount24h = 0;
    
    const historyLog: { time: string, text: string, rwy: string }[] = [];

    // Establish the 24-hour cutoff for the AI's math
    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    rows.forEach((row) => {
        const text = row.raw_text.toUpperCase();
        const match = text.match(/RWY\s*(07|25)/);
        
        if (match) {
            const rwyStr = match[1];
            const rwy = rwyStr === '07' ? 0 : 1;
            currentRwy = rwy; 
            
            const rowDate = new Date(row.created_at);

            // 2. Only count the last 24 hours for the AI's trend formula
            if (rowDate >= cutoff24h) {
                validAtisCount24h++;
                if (rwy === 0) rwy07Count24h++;
            }

            // 3. But save ALL 48 hours to the History Log for you to read
            historyLog.push({
                time: rowDate.toLocaleString(),
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
                <p style={{ fontSize: '12px', color: '#555' }}>Displaying {historyLog.length} ATIS records from the last 48 hours.</p>
            </div>

            <PredictorClient 
                dbCurrentRwy={currentRwy} 
                dbRatio24h={ratio24h} 
                dbHistory={historyLog} 
            />
        </div>
    );
}
