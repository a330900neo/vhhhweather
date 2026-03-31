// --- CONSOLE DEBUG CONFIG ---
    const debugConfig = {
      dir: wx.dir,
      speed: wx.speed,
      gust: wx.gust,
      varFrom: wx.varFrom,
      varTo: wx.varTo,
      swingSpeed: 0.8,     // TEMPORAL NOISE: How fast the wind direction shifts over time (lower = slower shifts)
      noiseScale: 0.003,   // SPATIAL NOISE: How wide the "rivers" of wind are (lower = wider, smoother fluid)
      trailTime: 1250,
      maxLife: 2400,
      lineWidth: 3,
      speedMultiplier: 5,
      fluidInertia: 0.15   // Lower = particles lock instantly into fluid rivers to prevent crossing
    };
    (window as any).windDebug = debugConfig;

    // ... (keep getWindColor the same) ...

    // --- TRUE FLUID MATH (CURL NOISE) ---
    // This generates a divergence-free field (no crossing paths)
    function getFluidVelocity(x: number, y: number, phase: number, scale: number) {
      // Create a potential field \Psi and take its analytical derivative
      let psiX = x * scale;
      let psiY = y * scale;
      
      // Calculate derivatives for the curl: \vec{V} = (\partial \Psi / \partial y, -\partial \Psi / \partial x)
      let dx = Math.cos(psiX + phase) * Math.sin(psiY - phase) 
             + Math.sin(psiY * 1.5 + phase) * 0.5;
             
      let dy = -(Math.sin(psiX + phase) * Math.cos(psiY - phase) 
             + Math.cos(psiX * 1.5 - phase) * 0.5);
                
      let len = Math.sqrt(dx*dx + dy*dy) || 1;
      return { dx: dx/len, dy: dy/len }; // Returns a normalized pure fluid swirl
    }

    // --- UNIFIED VECTOR FIELD CALCULATION ---
    function getVectorFieldTarget(x: number, y: number, speed: number, phase: number) {
      let pxPerSec = speed * debugConfig.speedMultiplier;

      if (debugConfig.dir === 'VRB') {
        // Pure fluid swirl for VRB
        let flow = getFluidVelocity(x, y, phase, debugConfig.noiseScale);
        return { vdx: flow.dx * pxPerSec, vdy: flow.dy * pxPerSec };

      } else if (debugConfig.varFrom !== null && debugConfig.varTo !== null) {
        // FLUID VARIABLE WIND MATH
        // Find the midpoint of the variation
        let diff = debugConfig.varTo - debugConfig.varFrom;
        if (diff < -180) diff += 360; 
        if (diff > 180) diff -= 360;
        let mid = debugConfig.varFrom + diff / 2;
        let radBase = (mid + 180) * Math.PI / 180;
        
        // Calculate the base forward flow vector
        let baseX = Math.sin(radBase);
        let baseY = -Math.cos(radBase);

        // Get the pure fluid noise at this coordinate
        let flow = getFluidVelocity(x, y, phase, debugConfig.noiseScale);
        
        // Calculate how hard the fluid is allowed to push perpendicularly 
        // without exceeding the varFrom/varTo limits
        let maxDevRad = Math.abs((diff / 2) * Math.PI / 180);
        let maxOrthoPush = Math.tan(maxDevRad); 
        
        // Blend the base flow with the fluid curl
        let finalX = baseX + flow.dx * maxOrthoPush;
        let finalY = baseY + flow.dy * maxOrthoPush;
        
        let len = Math.sqrt(finalX*finalX + finalY*finalY);
        return { vdx: (finalX/len) * pxPerSec, vdy: (finalY/len) * pxPerSec };

      } else {
        // Static Wind Direction
        let rad = (parseFloat(debugConfig.dir as string) + 180) * Math.PI / 180;
        return { vdx: Math.sin(rad) * pxPerSec, vdy: -Math.cos(rad) * pxPerSec };
      }
    }
