'use client';

import { useEffect, useRef } from 'react';

export default function WindParticles({ wx }: { wx: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width; 
    const h = canvas.height;
    
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

    function initParticle(p: any = {}) {
      p.x = Math.random() * w; 
      p.y = Math.random() * h;
      p.life = Math.random() * MAX_LIFE; 
      p.speed = spd + (gust > spd ? Math.random() * (gust - spd) : 0);
      p.offset = Math.random() * 100;
      p.color = getWindColor(p.speed);
      p.history = []; 
      return p;
    }

    for (let i = 0; i < numParticles; i++) {
      particles.push(initParticle());
    }

    let lastTime = performance.now();
    let animationId: number; // For cleanup

    function draw(now: number) {
      animationId = requestAnimationFrame(draw);
      
      let dt = (now - lastTime) / 1000;
      if (dt > 0.1) dt = 0.016; 
      lastTime = now;
      
      ctx.clearRect(0, 0, w, h);
      globalPhase += dt * 2; 
      
      let currentAngle = parseFloat(dir) || 0;

      if (dir !== 'VRB' && vFrom !== null && vTo !== null) {
        let diff = vTo - vFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = vFrom + diff / 2;
        currentAngle = mid + (diff / 2) * Math.sin(globalPhase);
      }

      let rad = (currentAngle + 180) * Math.PI / 180;
      let globalDx = Math.sin(rad);
      let globalDy = -Math.cos(rad);

      ctx.lineCap = 'round';
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
        let pxPerSec = p.speed * 8; 
        let dx, dy;

        if (dir === 'VRB') {
          let cx = w / 2; let cy = h / 2;
          let dxC = p.x - cx; let dyC = p.y - cy;
          let dist = Math.sqrt(dxC*dxC + dyC*dyC) || 1;
          dx = (-dyC / dist) * pxPerSec * 0.4;
          dy = (dxC / dist) * pxPerSec * 0.4;
          dx += Math.sin(p.offset + globalPhase) * 15;
          dy += Math.cos(p.offset + globalPhase) * 15;
          dx *= dt; dy *= dt;
        } else {
          dx = globalDx * pxPerSec * dt;
          dy = globalDy * pxPerSec * dt;
        }
        
        p.x += dx;
        p.y += dy;
        p.history.push({x: p.x, y: p.y, time: now});

        while(p.history.length > 0 && now - p.history[0].time > TRAIL_TIME) {
          p.history.shift();
        }

        if (masterAlpha > 0.01 && p.history.length > 0.15) {
          ctx.lineWidth = 1.8;
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            let trailAlpha = Math.max(0, 1 - (age / (TRAIL_TIME + 200)) - 0.55); 
            
            ctx.strokeStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        if (p.life >= MAX_LIFE || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          initParticle(p);
          p.life = 0; 
        }
      });
    }

    if (numParticles > 0) {
      animationId = requestAnimationFrame(draw);
    }

    // THIS IS THE MAGIC FIX: It kills the background loop when you leave the dashboard
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [wx]); // The effect safely restarts if weather data changes

  return (
    <canvas 
      ref={canvasRef} 
      width="500" 
      height="500" 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} 
    />
  );
}
