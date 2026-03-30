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
      swingSpeed: 1.6, 
      trailTime: 1250,
      maxLife: 1900,
      lineWidth: 3,
      speedMultiplier: 5,
      noiseScale: 0.005, 
      fluidInertia: 0.4 // Increased slightly so they lock tightly into parallel rivers without sliding across each other
    };
    (window as any).windDebug = debugConfig;

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

    // --- TRUE FLUID MATH (CURL NOISE) ---
    function getFluidVelocity(x: number, y: number, phase: number, scale: number) {
      let k1 = scale;
      let k2 = scale * 1.3;
      let k3 = scale * 1.7;
      
      let dx = Math.sin(x * k1 + phase) * -Math.sin(y * k2 - phase) * k2
             + Math.cos((x - y) * k3 + phase) * -k3;
             
      let dy = -( Math.cos(x * k1 + phase) * k1 * Math.cos(y * k2 - phase)
                + Math.cos((x - y) * k3 + phase) * k3 );
                
      let len = Math.sqrt(dx*dx + dy*dy) || 1;
      return { dx: dx/len, dy: dy/len };
    }

    function getScalarNoise(x: number, y: number, phase: number, scale: number) {
      let n = Math.sin(x * scale + phase) * Math.cos(y * scale * 1.3 - phase)
            + Math.sin((x - y) * scale * 1.7 + phase);
      return n / 2.0; 
    }

    // --- UNIFIED VECTOR FIELD CALCULATION ---
    // This guarantees particles at the same (x,y) ALWAYS point the exact same direction (No Crossing!)
    function getVectorFieldTarget(x: number, y: number, speed: number, phase: number) {
      let pxPerSec = speed * debugConfig.speedMultiplier;

      if (debugConfig.dir === 'VRB') {
        let flow = getFluidVelocity(x, y, phase, debugConfig.noiseScale);
        return { vdx: flow.dx * pxPerSec, vdy: flow.dy * pxPerSec };

      } else if (debugConfig.varFrom !== null && debugConfig.varTo !== null) {
        let diff = debugConfig.varTo - debugConfig.varFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = debugConfig.varFrom + diff / 2;

        // Pure spatial noise evaluated at this exact coordinate
        let spatialNoise = getScalarNoise(x, y, phase, debugConfig.noiseScale * 1.5);
        
        // Multiply by 1.5 to ensure the wind hits the visual outer boundary arrows, then safely clamp
        let combinedPush = Math.max(-1, Math.min(1, spatialNoise * 1.5)); 
        
        let localAngle = mid + (diff / 2) * combinedPush;
        let rad = (localAngle + 180) * Math.PI / 180;
        
        return { vdx: Math.sin(rad) * pxPerSec, vdy: -Math.cos(rad) * pxPerSec };

      } else {
        let rad = (parseFloat(debugConfig.dir as string) + 180) * Math.PI / 180;
        return { vdx: Math.sin(rad) * pxPerSec, vdy: -Math.cos(rad) * pxPerSec };
      }
    }

    // --- GUST ZONE ENGINE ---
    function initGustZone() {
      let moveAngle = Math.random() * Math.PI * 2;
      if (debugConfig.dir !== 'VRB') {
        moveAngle = (parseFloat(debugConfig.dir as string) + 180) * Math.PI / 180;
        moveAngle += (Math.random() - 0.5) * 0.8; 
      }
      
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        radius: 90 + Math.random() * 110, 
        dx: Math.sin(moveAngle) * 40, 
        dy: -Math.cos(moveAngle) * 40, 
        life: 0,
        maxLife: 3 + Math.random() * 4 
      };
    }

    for (let i = 0; i < 8; i++) gustZones.push(initGustZone());

    function initParticle(p: any = {}) {
      p.x = Math.random() * w; 
      p.y = Math.random() * h;
      p.life = Math.random() * debugConfig.maxLife; 
      p.speed = debugConfig.speed; 
      p.color = getWindColor(p.speed);
      p.history = []; 

      // Initialize perfectly locked into the spatial vector field at spawn to avoid early crossing
      let target = getVectorFieldTarget(p.x, p.y, p.speed, globalPhase);
      p.vdx = target.vdx;
      p.vdy = target.vdy;

      return p;
    }

    for (let i = 0; i < numParticles; i++) {
      particles.push(initParticle({}));
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
        let targetSpeed = debugConfig.speed;
        
        // Calculate Gust Influcence
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

        // Get the perfect non-crossing vector direction for this exact spatial coordinate
        let target = getVectorFieldTarget(p.x, p.y, p.speed, globalPhase);
        
        // Smoothly steer towards the target vector
        p.vdx += (target.vdx - p.vdx) * debugConfig.fluidInertia * dt;
        p.vdy += (target.vdy - p.vdy) * debugConfig.fluidInertia * dt;

        p.x += p.vdx * dt;
        p.y += p.vdy * dt;
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
            
            let trailAlpha = Math.max(0, 1 - (age / (debugConfig.trailTime + 200)) - 0.55); 
            
            ctx.strokeStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        if (p.life >= debugConfig.maxLife || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          initParticle(p);
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
