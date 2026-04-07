import { sql } from '@vercel/postgres';
import PredictorClient from './PredictorClient';

// --- SERVER COMPONENT ---
// This runs purely on the Vercel Server. No API routes needed!
export default async function PredictorPage() {
    
    // 1. Fetch only the ATIS data from the last 24 hours directly from the DB
    const { rows } = await sql`
        SELECT raw_text, created_at 
        FROM aero_data 
        WHERE data_type LIKE '%ATIS%' 
        AND created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY created_at ASC
    `;

    // 2. Parse the DB rows to calculate our "Inertia" and "24h Trend"
    let currentRwy = 0; // Default to 07
    let rwy07Count = 0;
    let validAtisCount = 0;

    rows.forEach((row) => {
        const text = row.raw_text.toUpperCase();
        const match = text.match(/RWY\s*(07|25)/);
        
        if (match) {
            const rwy = match[1] === '07' ? 0 : 1;
            currentRwy = rwy; // The last row processed becomes the "Current Active Runway"
            
            validAtisCount++;
            if (rwy === 0) rwy07Count++;
        }
    });

    // Calculate the 24h ratio (0.0 to 1.0)
    const ratio24h = validAtisCount > 0 ? (rwy07Count / validAtisCount) : 0.5;

    return (
        <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>VHHH AI Predictor</h1>
            <div style={{ background: '#e0f7fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3>🌍 Database Live Status</h3>
                <p><strong>Current Active Runway:</strong> {currentRwy === 0 ? '07' : '25'}</p>
                <p><strong>Last 24h Usage:</strong> Runway 07 was active {(ratio24h * 100).toFixed(1)}% of the time.</p>
            </div>

            {/* Pass the server-calculated data directly to the client browser */}
            <PredictorClient dbCurrentRwy={currentRwy} dbRatio24h={ratio24h} />
        </div>
    );
}
