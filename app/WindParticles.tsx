'use client';

import { useEffect, useRef } from 'react';

export default function WindParticles({ wx }: { wx: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Assert the type so TypeScript stops complaining inside the draw loop
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
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
    
    const MAX_LIFE = 1900; // 1.9s lifetime constraint
    const TRAIL_TIME = 1250; // 1.25s fading trail
    
    // --- CONFIGURABLE SWING SPEED ---
    const SWING_SPEED = 2.0; // Higher = faster swinging between variable directions

    // DYNAMIC WIND COLOR MAPPING (HSL VERSION)
    function getWindColor(s: number) {
      let h;
      if (s <= 1) {
        h = 260; // #5500ff equivalent Hue
      } else if (s <= 18) {
        let t = (s - 1) / 17;
        h = Math.floor(260 - t * (260 - 114)); // Interpolate to Green (114)
      } else {
        let t = Math.min((s - 18) / 52, 1);
        h = Math.floor(114 - t * 114); // Interpolate to Red (0)
      }
      return { h, s: 100, l: 50 }; // Locked at 100% saturation
    }

    // Pass the current angle when spawning or resetting a particle
    function initParticle(p: any = {}, spawnAngle: number = 0) {
      p.x = Math.random() * w; 
      p.y = Math.random() * h;
      p.life = Math.random() * MAX_LIFE; // Offset starts
      p.speed = spd + (gust > spd ? Math.random() * (gust - spd) : 0);
      p.offset = Math.random() * 100;
      p.color = getWindColor(p.speed);
      p.history = []; // Array of {x, y, time}

      // Lock this specific particle's direction vector based on the spawn angle
      let rad = (spawnAngle + 180) * Math.PI / 180;
      p.dirX = Math.sin(rad);
      p.dirY = -Math.cos(rad);

      return p;
    }

    // Get initial angle
    let initialAngle = parseFloat(dir as string) || 0;
    if (dir !== 'VRB' && vFrom !== null && vTo !== null) {
      let diff = vTo - vFrom;
      if (diff < -180) diff += 360; 
      if (diff > 180) diff -= 360;
      initialAngle = vFrom + diff / 2; // Start in the middle
    }

    for (let i = 0; i < numParticles; i++) {
      particles.push(initParticle({}, initialAngle));
    }

    let lastTime = performance.now();
    let animationId: number; // Stored so we can kill it on page change

    function draw(now: number) {
      animationId = requestAnimationFrame(draw);
      
      let dt = (now - lastTime) / 1000;
      if (dt > 0.1) dt = 0.016; // Safeguard if tab is backgrounded
      lastTime = now;
      
      // Full clear required for segmented fading path
      ctx.clearRect(0, 0, w, h);
      
      // Apply the user-configured swing speed
      globalPhase += dt * SWING_SPEED; 
      
      // 1. Compute the current Global Angle for this frame
      let currentAngle = parseFloat(dir as string) || 0;
      if (dir !== 'VRB' && vFrom !== null && vTo !== null) {
        let diff = vTo - vFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = vFrom + diff / 2;
        currentAngle = mid + (diff / 2) * Math.sin(globalPhase);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter'; // Neon blend effect

      particles.forEach(p => {
        p.life += dt * 1000;

        // SMOOTH EDGE FADE
        let margin = 45; 
        let distToEdgeX = Math.min(p.x, w - p.x);
        let distToEdgeY = Math.min(p.y, h - p.y);
        let edgeFade = Math.max(0, Math.min(1, Math.min(distToEdgeX, distToEdgeY) / margin));
        
        // LIFECYCLE FADE
        let lifeFade = 1;
        if (p.life < 300) lifeFade = p.life / 300; // Fade in 0.3s
        else if (p.life > MAX_LIFE - 400) lifeFade = Math.max(0, (MAX_LIFE - p.life) / 400); // Fade out last 0.4s
        
        let masterAlpha = Math.min(edgeFade, lifeFade);
        let pxPerSec = p.speed * 8; 
        let dx, dy;

        if (dir === 'VRB') {
          // Keep turbulence for VRB intact
          let cx = w / 2; let cy = h / 2;
          let dxC = p.x - cx; let dyC = p.y - cy;
          let dist = Math.sqrt(dxC*dxC + dyC*dyC) || 1;
          dx = (-dyC / dist) * pxPerSec * 0.4;
          dy = (dxC / dist) * pxPerSec * 0.4;
          dx += Math.sin(p.offset + globalPhase) * 15;
          dy += Math.cos(p.offset + globalPhase) * 15;
          dx *= dt; dy *= dt;
        } else {
          // Particles maintain their OWN direction, unaffected by immediate global phase
          dx = p.dirX * pxPerSec * dt;
          dy = p.dirY * pxPerSec * dt;
        }
        
        p.x += dx;
        p.y += dy;
        p.history.push({x: p.x, y: p.y, time: now});

        // Ensure trail represents exactly 1.25 seconds via filter
        while(p.history.length > 0 && now - p.history[0].time > TRAIL_TIME) {
          p.history.shift();
        }

        // SEGMENTED PATH RENDERING FOR WINDY-LIKE FADE
        if (masterAlpha > 0.01 && p.history.length > 1) {
          ctx.lineWidth = 3;
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            
            let trailAlpha = Math.max(0, 1 - (age / (TRAIL_TIME + 200)) - 0.55); // custom visual, dont change unless told
            
            ctx.strokeStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        // Resets strictly past 1.9s or completely out of viewport bounds
        if (p.life >= MAX_LIFE || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          // New particles spawn with the NEW calculated current global angle
          initParticle(p, currentAngle);
          p.life = 0; 
        }
      });
    }

    if (numParticles > 0) {
      animationId = requestAnimationFrame(draw);
    }

    // FIX FOR NEXT.JS ROUTING: Cleanup animation when leaving the dashboard
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [wx]); 

  return (
    <canvas 
      ref={canvasRef} 
      width="500" 
      height="500" 
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', background: '#0b162a' }} 
    />
  );
}
