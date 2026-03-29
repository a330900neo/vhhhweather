'use client';

import { useEffect, useRef } from 'react';

export default function WindParticles({ wx }: { wx: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth || 500;
    const h = canvas.offsetHeight || 500;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    
    ctx.scale(dpr, dpr);
    
    const dir = wx.dir;
    const spd = wx.speed;
    const gust = wx.gust;
    const vFrom = wx.varFrom;
    const vTo = wx.varTo;
    
    let numParticles = spd === 0 ? 0 : Math.min(250, 60 + (spd * 3));
    if (dir === 'VRB' && spd > 0) numParticles = Math.max(100, numParticles);
    
    const particles: any[] = [];
    let globalPhase = 0; 
    
    const MAX_LIFE = 1900; 
    const TRAIL_TIME = 1250; 
    
    const SWING_SPEED = 0.45; 

    function getWindColor(s: number) {
      let h;
      if (s <= 1) {
        h = 260; 
      } else if (s <= 18) {
        let t = (s - 1) / 17;
        h = Math.floor(260 - t * (260 - 114)); 
      } else {
        let t = Math.min((s - 18) / 52, 1);
        h = Math.floor(114 - t * 114); 
      }
      return { h, s: 100, l: 50 }; 
    }

    function initParticle(p: any = {}, spawnAngle: number = 0) {
      p.x = Math.random() * w; 
      p.y = Math.random() * h;
      p.life = Math.random() * MAX_LIFE; 
      p.offset = Math.random() * 100;
      p.history = []; 

      let rad = (spawnAngle + 180) * Math.PI / 180;
      p.dirX = Math.sin(rad);
      p.dirY = -Math.cos(rad);

      return p;
    }

    let initialAngle = parseFloat(dir as string) || 0;
    if (dir !== 'VRB' && vFrom !== null && vTo !== null) {
      let diff = vTo - vFrom;
      if (diff < -180) diff += 360; 
      if (diff > 180) diff -= 360;
      initialAngle = vFrom + diff / 2; 
    }

    for (let i = 0; i < numParticles; i++) {
      particles.push(initParticle({}, initialAngle));
    }

    let lastTime = performance.now();
    let animationId: number; 

    function draw(now: number) {
      animationId = requestAnimationFrame(draw);
      
      let dt = (now - lastTime) / 1000;
      if (dt > 0.1) dt = 0.016; 
      lastTime = now;
      
      ctx.clearRect(0, 0, w, h);
      globalPhase += dt * SWING_SPEED; 
      
      let currentAngle = parseFloat(dir as string) || 0;
      if (dir !== 'VRB' && vFrom !== null && vTo !== null) {
        let diff = vTo - vFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = vFrom + diff / 2;
        currentAngle = mid + (diff / 2) * Math.sin(globalPhase);
      }

      ctx.lineCap = 'butt'; 
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter'; 

      particles.forEach(p => {
        p.life += dt * 1000;

        let margin = 45; 
        let distToEdgeX = Math.min(p.x, w - p.x);
        let distToEdgeY = Math.min(p.y, h - p.y);
        let edgeFade = Math.max(0, Math.min(1, Math.min(distToEdgeX, distToEdgeY) / margin));
        
        let lifeFade = 1;
        if (p.life < 300) lifeFade = p.life / 300; 
        else if (p.life > MAX_LIFE - 400) lifeFade = Math.max(0, (MAX_LIFE - p.life) / 400); 
        
        let masterAlpha = Math.min(edgeFade, lifeFade);

        // --- GUST ZONES LOGIC ---
        // Creates sweeping "blobs" across the screen where wind speeds up
        let currentSpeed = spd;
        if (gust > spd) {
          let gustBlob = Math.sin(p.x * 0.01 + globalPhase * 2) * Math.cos(p.y * 0.01 - globalPhase * 2);
          let gustIntensity = Math.max(0, (gustBlob - 0.4) / 0.6); // Peaks between 0 and 1
          currentSpeed = spd + (gust - spd) * gustIntensity;
        }

        let pxPerSec = currentSpeed * 5; 
        let colorH = getWindColor(currentSpeed).h;
        let dx, dy;

        // --- VRB TURBULENCE VECTOR FIELD ---
        if (dir === 'VRB') {
          // Generates a fluid, divergence-like noise field based on (x, y, time)
          let noiseAngle = Math.sin(p.x * 0.006 + globalPhase) * 2.5 + Math.cos(p.y * 0.006 - globalPhase) * 2.5;
          dx = Math.cos(noiseAngle) * pxPerSec * 0.4 * dt;
          dy = Math.sin(noiseAngle) * pxPerSec * 0.4 * dt;
        } else {
          // Normal directional wind
          dx = p.dirX * pxPerSec * dt;
          dy = p.dirY * pxPerSec * dt;
        }
        
        p.x += dx;
        p.y += dy;
        
        // Push the dynamic color 'h' into history so trails change color properly through gusts
        p.history.push({x: p.x, y: p.y, time: now, h: colorH});

        while(p.history.length > 0 && now - p.history[0].time > TRAIL_TIME) {
          p.history.shift();
        }

        if (masterAlpha > 0.01 && p.history.length > 1) {
          ctx.lineWidth = 3;
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            
            let trailAlpha = Math.max(0, 1 - (age / (TRAIL_TIME + 200)) - 0.55); 
            
            // Read color from the historical point
            ctx.strokeStyle = `hsla(${pt2.h}, 100%, 50%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        if (p.life >= MAX_LIFE || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          initParticle(p, currentAngle);
          p.life = 0; 
        }
      });
    }

    if (numParticles > 0) {
      animationId = requestAnimationFrame(draw);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [wx]); 

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} 
    />
  );
}
