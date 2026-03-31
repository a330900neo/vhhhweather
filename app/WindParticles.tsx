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

    // Calculate how wide the variance is (e.g., 020V120 = 100 degrees of variance)
    let varianceSpread = 0;
    if (wx.varFrom !== undefined && wx.varTo !== undefined && wx.varFrom !== null && wx.varTo !== null) {
      let diff = wx.varTo - wx.varFrom;
      if (diff < -180) diff += 360; 
      if (diff > 180) diff -= 360;
      varianceSpread = Math.abs(diff);
    }

    // --- FLUID SIMULATION CONFIG ---
    const config = {
      dir: wx.dir,
      speed: wx.speed || 0,
      gust: wx.gust || wx.speed || 0,
      varFrom: wx.varFrom,
      varTo: wx.varTo,
      
      // 1. RATE OF CHANGE (TIME): How fast the vector map shifts and evolves.
      // VRB gets highly chaotic rapid shifting. Varied winds scale based on their spread.
      noiseTimeRate: wx.dir === 'VRB' ? 2.5 : 0.5 + (varianceSpread * 0.015), 
      
      // 2. VECTOR SCALE (SPACE): How tight or wide the fluid "rivers" are.
      // VRB gets tighter, smaller chaotic swirls. Standard variance gets wider waves.
      noiseSpatialScale: wx.dir === 'VRB' ? 0.007 : 0.003, 
      
      trailTime: 1250,
      maxLife: 2400,
      lineWidth: 3,
      speedMultiplier: 5,
    };
    (window as any).windDebug = config;

    // --- SETUP VARIABLES ---
    let numParticles = config.speed === 0 ? 0 : Math.min(250, 60 + (config.speed * 3));
    if (config.dir === 'VRB' && config.speed > 0) numParticles = Math.max(120, numParticles);
    
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
    // Curl noise guarantees a divergence-free vector field (meaning fluid lines mathematically cannot cross)
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

    // Scalar noise for bounded variable wind (e.g., 020V120)
    function getScalarNoise(x: number, y: number, phase: number, scale: number) {
      let n = Math.sin(x * scale + phase) * Math.cos(y * scale * 1.3 - phase)
            + Math.sin((x - y) * scale * 1.7 + phase);
      return n / 2.0; 
    }

    // --- UNIFIED VECTOR FIELD CALCULATION ---
    function getVectorFieldTarget(x: number, y: number, speed: number, phase: number) {
      let pxPerSec = speed * config.speedMultiplier;

      if (config.dir === 'VRB') {
        let flow = getFluidVelocity(x, y, phase, config.noiseSpatialScale);
        return { vdx: flow.dx * pxPerSec, vdy: flow.dy * pxPerSec };

      } else if (config.varFrom !== null && config.varTo !== null && config.varFrom !== undefined) {
        let diff = config.varTo - config.varFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = config.varFrom + diff / 2;

        let spatialNoise = getScalarNoise(x, y, phase, config.noiseSpatialScale * 1.5);
        let combinedPush = Math.max(-1, Math.min(1, spatialNoise * 1.5)); 
        
        let localAngle = mid + (diff / 2) * combinedPush;
        let rad = (localAngle + 180) * Math.PI / 180;
        
        return { vdx: Math.sin(rad) * pxPerSec, vdy: -Math.cos(rad) * pxPerSec };

      } else {
        let rad = (parseFloat(config.dir as string) + 180) * Math.PI / 180;
        return { vdx: Math.sin(rad) * pxPerSec, vdy: -Math.cos(rad) * pxPerSec };
      }
    }

    // --- GUST ZONE ENGINE ---
    function initGustZone() {
      let moveAngle = Math.random() * Math.PI * 2;
      if (config.dir !== 'VRB') {
        moveAngle = (parseFloat(config.dir as string) + 180) * Math.PI / 180;
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
      p.life = Math.random() * config.maxLife; 
      p.speed = config.speed; 
      p.color = getWindColor(p.speed);
      p.history = []; 

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
      
      // Update the vector field's evolution over time
      globalPhase += dt * config.noiseTimeRate; 

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
        else if (p.life > config.maxLife - 400) lifeFade = Math.max(0, (config.maxLife - p.life) / 400); 
        
        let masterAlpha = Math.min(edgeFade, lifeFade);
        let targetSpeed = config.speed;
        
        if (config.gust > config.speed) {
          let maxGustInfluence = 0;
          gustZones.forEach(g => {
            let dist = Math.hypot(p.x - g.x, p.y - g.y);
            if (dist < g.radius) {
              let lifePhase = Math.sin((g.life / g.maxLife) * Math.PI); 
              let distPhase = 1 - (dist / g.radius);
              maxGustInfluence = Math.max(maxGustInfluence, lifePhase * distPhase);
            }
          });
          targetSpeed = config.speed + (config.gust - config.speed) * maxGustInfluence;
        }

        p.speed += (targetSpeed - p.speed) * 10 * dt;
        p.color = getWindColor(p.speed); 

        // Get the perfect vector direction for this exact spatial coordinate
        let target = getVectorFieldTarget(p.x, p.y, p.speed, globalPhase);
        
        // STRICT LOCK: Massless tracer particles perfectly adhere to the field. 
        // Removing momentum/inertia completely guarantees streams cannot cross.
        p.vdx = target.vdx;
        p.vdy = target.vdy;

        p.x += p.vdx * dt;
        p.y += p.vdy * dt;
        p.history.push({x: p.x, y: p.y, time: now});

        while(p.history.length > 0 && now - p.history[0].time > config.trailTime) {
          p.history.shift();
        }

        if (masterAlpha > 0.01 && p.history.length > 1) {
          ctx.lineWidth = config.lineWidth;
          for (let i = 1; i < p.history.length; i++) {
            let pt1 = p.history[i-1];
            let pt2 = p.history[i];
            let age = now - pt2.time; 
            
            let trailAlpha = Math.max(0, 1 - (age / (config.trailTime + 200)) - 0.55); 
            
            ctx.strokeStyle = `hsla(${p.color.h}, ${p.color.s}%, ${p.color.l}%, ${masterAlpha * trailAlpha})`;
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
        }

        if (p.life >= config.maxLife || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
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
