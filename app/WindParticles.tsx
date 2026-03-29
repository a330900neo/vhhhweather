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

    // --- CONSOLE DEBUG CONFIG ---
    const debugConfig = {
      dir: wx.dir,
      speed: wx.speed,
      gust: wx.gust,
      varFrom: wx.varFrom,
      varTo: wx.varTo,
      swingSpeed: 1.5, 
      trailTime: 1250,
      maxLife: 1900,
      lineWidth: 3,
      speedMultiplier: 5,
      noiseScale: 0.01 // Controls how "tight" the VRB turbulence curves are
    };
    (window as any).windDebug = debugConfig;
    console.log('🌬️ Wind Debugger active! Type `windDebug` in console.');

    // --- SETUP VARIABLES ---
    let numParticles = debugConfig.speed === 0 ? 0 : Math.min(250, 60 + (debugConfig.speed * 3));
    if (debugConfig.dir === 'VRB' && debugConfig.speed > 0) numParticles = Math.max(120, numParticles);
    
    const particles: any[] = [];
    const gustZones: any[] = [];
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

    // --- GUST ZONE ENGINE ---
    function initGustZone() {
      // Gusts generally drift in the direction of the wind (or randomly if VRB)
      let moveAngle = Math.random() * Math.PI * 2;
      if (debugConfig.dir !== 'VRB') {
        moveAngle = (parseFloat(debugConfig.dir as string) + 180) * Math.PI / 180;
        moveAngle += (Math.random() - 0.5) * 0.8; // Wider variance for gust direction
      }
      
      let driftSpeed = 40 + Math.random() * 50; // Increased speed so they sweep across more often

      return {
        x: Math.random() * w,
        y: Math.random() * h,
        radius: 70 + Math.random() * 90, // Slightly larger zones
        dx: Math.sin(moveAngle) * driftSpeed, 
        dy: -Math.cos(moveAngle) * driftSpeed, 
        life: 0,
        maxLife: 1.5 + Math.random() * 2.5 // Shorter life so they constantly respawn elsewhere
      };
    }

    // Increased from 3 to 8 active gust zones to make them appear much more often
    for (let i = 0; i < 8; i++) gustZones.push(initGustZone());

    function initParticle(p: any = {}, spawnAngle: number = 0) {
      p.x = Math.random() * w; 
      p.y = Math.random() * h;
      p.life = Math.random() * debugConfig.maxLife; 
      p.baseSpeed = debugConfig.speed;
      p.speed = p.baseSpeed; 
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
      globalPhase += dt * debugConfig.swingSpeed; 
      
      // Update Global Angle
      let currentAngle = parseFloat(debugConfig.dir as string) || 0;
      if (debugConfig.dir !== 'VRB' && debugConfig.varFrom !== null && debugConfig.varTo !== null) {
        let diff = debugConfig.varTo - debugConfig.varFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = debugConfig.varFrom + diff / 2;
        currentAngle = mid + (diff / 2) * Math.sin(globalPhase);
      }

      // Update Gust Zones
      gustZones.forEach(g => {
        g.life += dt;
        g.x += g.dx * dt;
        g.y += g.dy * dt;
        if (g.life >= g.maxLife) Object.assign(g, initGustZone()); 
      });

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
        
        // --- DYNAMIC SPEED & COLOR (GUST LOGIC) ---
        let targetSpeed = debugConfig.speed;
        
        if (debugConfig.gust > debugConfig.speed) {
          let maxGustInfluence = 0;
          gustZones.forEach(g => {
            let dist = Math.hypot(p.x - g.x, p.y - g.y);
            if (dist < g.radius) {
              let lifePhase = Math.sin((g.life / g.maxLife) * Math.PI); 
              let distPhase = 1 - (dist / g.radius);
              maxGustInfluence = Math.max(maxGustInfluence, lifePhase * distPhase);
            }
          });
          targetSpeed = debugConfig.speed + (debugConfig.gust - debugConfig.speed) * maxGustInfluence;
        }

        p.speed += (targetSpeed - p.speed) * 10 * dt;
        p.color = getWindColor(p.speed); 

        let pxPerSec = p.speed * debugConfig.speedMultiplier; 
        let dx, dy;

        // --- UPGRADED TURBULENCE (VECTOR FIELD) LOGIC ---
        if (debugConfig.dir === 'VRB') {
          // Layered 3 sine waves at different phases and directions.
          // This creates highly complex, evolving, organic turbulence instead of a static grid.
          let noiseAngle = (
            Math.sin(p.x * debugConfig.noiseScale + globalPhase) + 
            Math.cos(p.y * debugConfig.noiseScale - globalPhase * 0.8) +
            Math.sin((p.x - p.y) * debugConfig.noiseScale * 0.5 + globalPhase * 1.2)
          ) * Math.PI; 
          
          dx = Math.cos(noiseAngle) * pxPerSec * dt;
          dy = Math.sin(noiseAngle) * pxPerSec * dt;
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
          ctx.lineWidth = debugConfig.lineWidth;
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            
            // Your custom visual math:
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
      delete (window as any).windDebug;
    };
  }, [wx]); 

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} 
    />
  );
}
