'use client';
import { useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';

export default function PredictorClient({ dbCurrentRwy, dbRatio24h }: { dbCurrentRwy: number, dbRatio24h: number }) {
    // 1. UPDATED: We now use tf.GraphModel instead of tf.LayersModel
    const [model, setModel] = useState<tf.GraphModel | null>(null);
    const [taf, setTaf] = useState('');
    const [results, setResults] = useState<string>('');

    useEffect(() => {
        async function loadAi() {
            try {
                // 2. UPDATED: The Keras patch is deleted! We just use loadGraphModel directly.
                const loadedModel = await tf.loadGraphModel('/model.json');
                setModel(loadedModel);
            } catch (e) {
                console.error("Failed to load model", e);
            }
        }
        loadAi();
    }, []);

    const runPrediction = async () => {
        if (!model) return;
        setResults("Calculating...");

        let baseDir = 'VRB'; let baseSpd = 0; let baseGust = 0;
        const windMatch = taf.toUpperCase().match(/(VRB|\d{3})(\d{2})(?:G(\d{2}))?KT/);
        
        if (windMatch) {
            baseDir = windMatch[1];
            baseSpd = parseInt(windMatch[2]);
            baseGust = windMatch[3] ? parseInt(windMatch[3]) : 0;
        }

        let html = "";
        let now = new Date();
        let simulatedPrevRwy = dbCurrentRwy;

        for (let i = 0; i < 48; i++) { 
            let futureTime = new Date(now.getTime() + i * 30 * 60000);
            
            let hw_07 = 0; let xw_07 = 0;
            if (baseDir !== 'VRB') {
                const rad = (parseInt(baseDir) - 73) * (Math.PI / 180);
                hw_07 = Math.cos(rad) * baseSpd;
                xw_07 = Math.sin(rad) * baseSpd;
            }
            const gustFactor = Math.max(0, baseGust - baseSpd);

            const inputTensor = tf.tensor2d([[
                hw_07, xw_07, gustFactor, futureTime.getMonth() + 1, futureTime.getHours(), 
                simulatedPrevRwy, dbRatio24h 
            ]]);

            const prediction = model.predict(inputTensor) as tf.Tensor;
            const score = (await prediction.data())[0];
            
            const is25 = score > 0.5;
            simulatedPrevRwy = is25 ? 1 : 0; 

            const timeStr = futureTime.getHours().toString().padStart(2, '0') + ":" + futureTime.getMinutes().toString().padStart(2, '0');
            html += `<div style="border-bottom: 1px solid #ddd; padding: 5px 0;">
                <strong>${timeStr}</strong>: RWY ${is25 ? '25' : '07'} (${Math.round((is25 ? score : 1-score)*100)}%)
            </div>`;
        }
        setResults(html);
    };

    return (
        <div>
            <textarea 
                rows={4} 
                style={{ width: '100%', padding: '10px', fontSize: '16px' }}
                placeholder="Paste TAF here..."
                value={taf}
                onChange={(e) => setTaf(e.target.value)}
            />
            <button 
                onClick={runPrediction}
                disabled={!model}
                style={{ width: '100%', padding: '15px', background: model ? '#0070f3' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', marginTop: '10px', cursor: 'pointer' }}
            >
                {model ? 'Predict Next 24 Hours' : 'Loading AI...'}
            </button>
            
            <div dangerouslySetInnerHTML={{ __html: results }} style={{ marginTop: '20px' }} />
        </div>
    );
}
