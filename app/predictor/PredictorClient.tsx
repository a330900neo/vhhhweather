'use client';
import { useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';

export default function PredictorClient({ dbCurrentRwy, dbRatio24h, dbHistory }: { 
    dbCurrentRwy: number, dbRatio24h: number, dbHistory: any[] 
}) {
    const [model, setModel] = useState<tf.GraphModel | null>(null);
    const [taf, setTaf] = useState('');
    const [decodedBlocks, setDecodedBlocks] = useState<any[]>([]);
    const [results, setResults] = useState<string>('');
    const [showHistory, setShowHistory] = useState(false); 

    useEffect(() => {
        async function loadAi() {
            try {
                const loadedModel = await tf.loadGraphModel('/model.json');
                setModel(loadedModel);
            } catch (e) { console.error("Failed to load model", e); }
        }
        loadAi();
    }, []);

    // --- UPGRADED TAF PARSER ---
    const parseTAF = (tafText: string) => {
        const blocks = tafText.replace(/=/g, '').split(/(?=BECMG|TEMPO|FM)/);
        let parsed: any[] = [];
        
        blocks.forEach((block) => {
            let type = "BASE";
            let durationHrs = 12; // Default for BASE

            if (block.startsWith("BECMG")) type = "BECMG";
            if (block.startsWith("TEMPO")) type = "TEMPO";
            if (block.startsWith("FM")) type = "FM";

            // Calculate ACTUAL Duration in Hours!
            let timeMatch = block.match(/(\d{2})(\d{2})\/(\d{2})(\d{2})/);
            let timeText = "Ongoing";
            if (timeMatch) {
                timeText = `${timeMatch[1]}/${timeMatch[2]}Z to ${timeMatch[3]}/${timeMatch[4]}Z`;
                let startHr = parseInt(timeMatch[2]);
                let endHr = parseInt(timeMatch[4]);
                // Handle midnight crossover (e.g., 2200 to 0400)
                durationHrs = endHr < startHr ? (endHr + 24) - startHr : endHr - startHr;
            }

            let windMatch = block.match(/(VRB|\d{3})(\d{2})(?:G(\d{2}))?KT/);
            let dir = windMatch ? windMatch[1] : null;
            let spd = windMatch ? parseInt(windMatch[2]) : null;
            let gust = windMatch && windMatch[3] ? parseInt(windMatch[3]) : null;

            parsed.push({ type, timeText, raw: block.trim(), dir, spd, gust, durationHrs });
        });
        return parsed;
    };

    const runPrediction = async () => {
        if (!model || !taf) return;
        setResults("Simulating ATC Logic...");

        const parsedBlocks = parseTAF(taf.toUpperCase());
        setDecodedBlocks(parsedBlocks); 

        let html = "<h3>Timeline Predictions</h3>";
        let now = new Date();

        let currentDir = parsedBlocks[0]?.dir || 'VRB';
        let currentSpd = parsedBlocks[0]?.spd || 0;
        let currentGust = parsedBlocks[0]?.gust || 0;
        let simulatedPrevRwy = dbCurrentRwy;

        for (let i = 0; i < 48; i++) {
            let futureTime = new Date(now.getTime() + i * 30 * 60000);
            let blockIndex = Math.floor((i / 48) * parsedBlocks.length);
            let activeBlock = parsedBlocks[blockIndex] || parsedBlocks[0];

            let activeDir = currentDir;
            let activeSpd = currentSpd;
            let activeGust = currentGust;
            let isTempo = 0;
            let isBecmg = 0;
            let duration = 12;

            if (activeBlock && activeBlock.dir) {
                activeDir = activeBlock.dir;
                activeSpd = activeBlock.spd;
                activeGust = activeBlock.gust || 0;
                duration = activeBlock.durationHrs || 12;
                
                if (activeBlock.type === 'TEMPO') isTempo = 1;
                if (activeBlock.type === 'BECMG') isBecmg = 1;
            }

            let hw_07 = 0; let xw_07 = 0;
            if (activeDir !== 'VRB') {
                const rad = (parseInt(activeDir) - 73) * (Math.PI / 180);
                hw_07 = Math.cos(rad) * activeSpd;
                xw_07 = Math.sin(rad) * activeSpd;
            }
            const gustFactor = Math.max(0, activeGust - activeSpd);

            // FEEDING THE 8 HUMAN-LOGIC VARIABLES
            const inputTensor = tf.tensor2d([[
                hw_07, xw_07, gustFactor, 
                isTempo, isBecmg, duration, 
                simulatedPrevRwy, dbRatio24h 
            ]]);

            const prediction = model.predict(inputTensor) as tf.Tensor;
            const score = (await prediction.data())[0];
            
            const is25 = score > 0.5;
            
            // Only strictly update inertia if it's not a TEMPO
            if (isTempo === 0) simulatedPrevRwy = is25 ? 1 : 0; 

            const timeStr = futureTime.getHours().toString().padStart(2, '0') + ":" + futureTime.getMinutes().toString().padStart(2, '0');
            const pct = Math.round((is25 ? score : 1-score)*100);

            html += `
            <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                <div style="display: flex; justify-content: space-between; font-size: 16px;">
                    <strong>${timeStr} ${isTempo ? '<span style="color:#e67e22; font-size:12px;">(TEMPO)</span>' : ''}</strong>
                    <span style="color: ${is25 ? '#004085' : '#1e7e34'}; font-weight:bold;">
                        RWY ${is25 ? '25' : '07'} (${pct}%)
                    </span>
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 4px; background: #f8f9fa; padding: 4px; border-radius: 4px; font-family: monospace;">
                    Data Fed: HW07: ${hw_07.toFixed(1)}kt | XW07: ${xw_07.toFixed(1)}kt | Duration: ${duration} hrs<br/>
                    Context: PrevRwy: ${simulatedPrevRwy === 0 ? '07' : '25'} | TEMPO: ${isTempo} | BECMG: ${isBecmg}
                </div>
            </div>`;
        }
        setResults(html);
    };

    return (
        <div>
            <button 
                onClick={() => setShowHistory(!showHistory)}
                style={{ width: '100%', padding: '10px', background: '#f1f3f5', border: '1px solid #ccc', borderRadius: '5px', marginBottom: '15px', cursor: 'pointer', color: '#333', fontWeight: 'bold' }}
            >
                {showHistory ? 'Hide Database History ▵' : 'View Raw Database ATIS History (Last 48h) ▿'}
            </button>

            {showHistory && (
                <div style={{ background: '#212529', color: '#00ff00', padding: '15px', borderRadius: '6px', fontSize: '11px', fontFamily: 'monospace', height: '300px', overflowY: 'scroll', marginBottom: '15px' }}>
                    <p style={{ color: '#fff', marginBottom: '10px' }}>--- RAW ATIS LOG (LAST 48 HOURS) ---</p>
                    {dbHistory.map((item, idx) => (
                        <div key={idx} style={{ marginBottom: '8px', borderBottom: '1px solid #444', paddingBottom: '4px' }}>
                            <strong style={{ color: '#ffcc00' }}>[{item.time}] - RWY {item.rwy}</strong><br />
                            {item.text}
                        </div>
                    ))}
                </div>
            )}

            <textarea 
                rows={4} 
                style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '6px', border: '1px solid #ccc' }}
                placeholder="Paste TAF here..."
                value={taf}
                onChange={(e) => setTaf(e.target.value)}
            />
            
            <button 
                onClick={runPrediction}
                disabled={!model}
                style={{ width: '100%', padding: '15px', background: model ? '#0056b3' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', marginTop: '10px', cursor: 'pointer', fontWeight: 'bold' }}
            >
                {model ? 'Decode TAF & Predict' : 'Loading AI Engine...'}
            </button>

            {decodedBlocks.length > 0 && (
                <div style={{ marginTop: '20px', background: '#2c3e50', color: '#ecf0f1', padding: '15px', borderRadius: '6px', fontSize: '13px', fontFamily: 'monospace' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#3498db' }}>--- DECODED HUMAN LOGIC ---</h4>
                    {decodedBlocks.map((b, idx) => (
                        <div key={idx} style={{ marginBottom: '8px' }}>
                            <strong>[{b.type}]</strong> {b.timeText} <span style={{color: '#f1c40f'}}>(Lasts {b.durationHrs} hours)</span><br/>
                            {b.dir ? `↳ Wind: ${b.dir}/${b.spd}kt` : '↳ Wind: No Change'}
                        </div>
                    ))}
                </div>
            )}
            
            <div dangerouslySetInnerHTML={{ __html: results }} style={{ marginTop: '20px' }} />
        </div>
    );
}
