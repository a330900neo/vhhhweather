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
    
    // --- CONSOLE DEBUG OBJECT ---
    // We bundle everything into this object so you can modify it from Chrome
    const debugConfig = {
      dir: wx.dir,
      speed: wx.speed,
      gust: wx.gust,
      varFrom: wx.varFrom,
      varTo: wx.varTo,
      
      // Internal config variables made editable
      swingSpeed: 0.45, 
      trailTime: 1250,
      maxLife: 1900,
      lineWidth: 3,
      speedMultiplier: 5, // The * 5 multiplier you used for pxPerSec
    };

    // Attach to the window object so Chrome Console can see it
    (window as any).windDebug = debugConfig;
    console.log('🌬️ Wind Particle Debugger active! Type `windDebug` in the console to inspect/edit.');

    let numParticles = debugConfig.speed === 0 ? 0 : Math.min(250, 60 + (debugConfig.speed * 3));
    if (debugConfig.dir === 'VRB' && debugConfig.speed > 0) numParticles = Math.max(100, numParticles);
    
    const particles: any[] = [];
    let globalPhase = 0; 

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
      p.life = Math.random() * debugConfig.maxLife; 
      p.speed = debugConfig.speed + (debugConfig.gust > debugConfig.speed ? Math.random() * (debugConfig.gust - debugConfig.speed) : 0);
      p.offset = Math.random() * 100;
      p.color = getWindColor(p.speed);
      p.history = []; 

      let rad = (spawnAngle + 180) * Math.PI / 180;
      p.dirX = Math.sin(rad);
      p.dirY = -Math.cos(rad);

      return p;
    }

    let initialAngle = parseFloat(debugConfig.dir as string) || 0;
    if (debugConfig.dir !== 'VRB' && debugConfig.varFrom !== null && debugConfig.varTo !== null) {
      let diff = debugConfig.varTo - debugConfig.varFrom;
      if (diff < -180) diff += 360; 
      if (diff > 180) diff -= 360;
      initialAngle = debugConfig.varFrom + diff / 2; 
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
      globalPhase += dt * debugConfig.swingSpeed; // uses debug value
      
      let currentAngle = parseFloat(debugConfig.dir as string) || 0;
      if (debugConfig.dir !== 'VRB' && debugConfig.varFrom !== null && debugConfig.varTo !== null) {
        let diff = debugConfig.varTo - debugConfig.varFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = debugConfig.varFrom + diff / 2;
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
        else if (p.life > debugConfig.maxLife - 400) lifeFade = Math.max(0, (debugConfig.maxLife - p.life) / 400); 
        
        let masterAlpha = Math.min(edgeFade, lifeFade);
        let pxPerSec = p.speed * debugConfig.speedMultiplier; // uses debug value
        let dx, dy;

        if (debugConfig.dir === 'VRB') {
          let cx = w / 2; let cy = h / 2;
          let dxC = p.x - cx; let dyC = p.y - cy;
          let dist = Math.sqrt(dxC*dxC + dyC*dyC) || 1;
          dx = (-dyC / dist) * pxPerSec * 0.4;
          dy = (dxC / dist) * pxPerSec * 0.4;
          dx += Math.sin(p.offset + globalPhase) * 15;
          dy += Math.cos(p.offset + globalPhase) * 15;
          dx *= dt; dy *= dt;
        } else {
          dx = p.dirX * pxPerSec * dt;
          dy = p.dirY * pxPerSec * dt;
        }
        
        p.x += dx;
        p.y += dy;
        p.history.push({x: p.x, y: p.y, time: now});

        while(p.history.length > 0 && now - p.history[0].time > debugConfig.trailTime) {
          p.history.shift();
        }

        if (masterAlpha > 0.01 && p.history.length > 1) {
          ctx.lineWidth = debugConfig.lineWidth; // uses debug value
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            
            let trailAlpha = Math.max(0, 1 - (age / (debugConfig.trailTime + 200)) - 0.55); 
            
            ctx.strokeStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        if (p.life >= debugConfig.maxLife || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
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
      delete (window as any).windDebug; // cleanup memory leaks
    };
  }, [wx]); 

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} 
    />
  );
}
