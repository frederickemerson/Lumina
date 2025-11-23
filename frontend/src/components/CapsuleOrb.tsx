/**
 * Capsule Creator Orb Component
 * Based on CodePen particle sphere animation
 * With added smooth color rotation
 */

import { useEffect, useRef } from 'react';

interface Particle {
  fX: number;
  fY: number;
  fZ: number;
  fVX: number;
  fVY: number;
  fVZ: number;
  fAX: number;
  fAY: number;
  fAZ: number;
  fProjX: number;
  fProjY: number;
  fRotX: number;
  fRotZ: number;
  pPrev: Particle | null;
  pNext: Particle | null;
  fAngle: number;
  fForce: number;
  fGrowDuration: number;
  fWaitDuration: number;
  fShrinkDuration: number;
  fRadiusCurrent: number;
  fAlpha: number;
  iFramesAlive: number;
  bIsDead: boolean;
  fnInit: () => void;
  fnUpdate: () => void;
}

interface CapsuleOrbProps {
  color?: string; // HSL color string like "hsl(180, 70%, 50%)"
}

export function CapsuleOrb({ color }: CapsuleOrbProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const colorRef = useRef<string | undefined>(color);

  // Update color ref when prop changes
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Constants
    const fPI = Math.PI;
    const fnMax = Math.max;
    const fnMin = Math.min;
    const fnRnd = Math.random;
    const fnRnd2 = () => 2.0 * fnRnd() - 1.0;
    const fnCos = Math.cos;
    const fnACos = Math.acos;
    const fnSin = Math.sin;

    // Settings - scale based on container size
    const getContainerSize = () => {
      const rect = container.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    let containerSize = getContainerSize();
    let iRadiusSphere = Math.min(containerSize.width, containerSize.height) * 0.3; // Scale sphere to container
    let iProjSphereX = 0;
    let iProjSphereY = 0;
    const fMaxAX = 0.1;
    const fMaxAY = 0.1;
    const fMaxAZ = 0.1;
    const fStartVX = 0.001;
    const fStartVY = 0.001;
    const fStartVZ = 0.001;

    let iFramesToRotate = 2000.0;
    let iPerspective = 250;
    let iNewParticlePerFrame = 10;
    let fGrowDuration = 200.0;
    let fWaitDuration = 50.0;
    let fShrinkDuration = 250.0;

    let fVX = (2.0 * fPI) / iFramesToRotate;
    let fAngle = 0.0;
    let fSinAngle = 0.0;
    let fCosAngle = 0.0;
    
    // Pulsing animation
    let pulseTime = 0.0;
    let pulseSpeed = 0.005; // Slower pulse

    let w = 0;
    let h = 0;

    const oRender: { pFirst: Particle | null } = { pFirst: null };
    const oBuffer: { pFirst: Particle | null } = { pFirst: null };

    // Set canvas size based on container
    const fnSetSize = () => {
      containerSize = getContainerSize();
      canvas.width = w = containerSize.width;
      canvas.height = h = containerSize.height;
      iRadiusSphere = Math.min(w, h) * 0.3; // Update sphere radius on resize
      iProjSphereX = w / 2;
      iProjSphereY = h / 2;
    };
    fnSetSize();
    
    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      fnSetSize();
    });
    resizeObserver.observe(container);

    // Swap list function
    const fnSwapList = (p: Particle | null, oSrc: { pFirst: Particle | null }, oDst: { pFirst: Particle | null }): Particle => {
      if (p) {
        // Remove p from oSrc
        if (oSrc.pFirst === p) {
          oSrc.pFirst = p.pNext;
          if (p.pNext) p.pNext.pPrev = null;
        } else {
          if (p.pPrev) p.pPrev.pNext = p.pNext;
          if (p.pNext) p.pNext.pPrev = p.pPrev;
        }
      } else {
        // Create new p
        p = new ParticleClass();
      }

      p.pNext = oDst.pFirst;
      if (oDst.pFirst) oDst.pFirst.pPrev = p;
      oDst.pFirst = p;
      p.pPrev = null;
      return p;
    };

    // Particle class
    class ParticleClass implements Particle {
      fX = 0.0;
      fY = 0.0;
      fZ = 0.0;
      fVX = 0.0;
      fVY = 0.0;
      fVZ = 0.0;
      fAX = 0.0;
      fAY = 0.0;
      fAZ = 0.0;
      fProjX = 0.0;
      fProjY = 0.0;
      fRotX = 0.0;
      fRotZ = 0.0;
      pPrev: Particle | null = null;
      pNext: Particle | null = null;
      fAngle = 0.0;
      fForce = 0.0;
      fGrowDuration = 0.0;
      fWaitDuration = 0.0;
      fShrinkDuration = 0.0;
      fRadiusCurrent = 0.0;
      fAlpha = 0.0;
      iFramesAlive = 0;
      bIsDead = false;

      fnInit() {
        this.fAngle = fnRnd() * fPI * 2;
        this.fForce = fnACos(fnRnd2());
        this.fAlpha = 0;
        this.bIsDead = false;
        this.iFramesAlive = 0;
        this.fX = iRadiusSphere * fnSin(this.fForce) * fnCos(this.fAngle);
        this.fY = iRadiusSphere * fnSin(this.fForce) * fnSin(this.fAngle);
        this.fZ = iRadiusSphere * fnCos(this.fForce);
        this.fVX = fStartVX * this.fX;
        this.fVY = fStartVY * this.fY;
        this.fVZ = fStartVZ * this.fZ;
        this.fGrowDuration = fGrowDuration + fnRnd2() * (fGrowDuration / 4.0);
        this.fWaitDuration = fWaitDuration + fnRnd2() * (fWaitDuration / 4.0);
        this.fShrinkDuration = fShrinkDuration + fnRnd2() * (fShrinkDuration / 4.0);
        this.fAX = 0.0;
        this.fAY = 0.0;
        this.fAZ = 0.0;
      }

      fnUpdate() {
        if (this.iFramesAlive > this.fGrowDuration + this.fWaitDuration) {
          this.fVX += this.fAX + fMaxAX * fnRnd2();
          this.fVY += this.fAY + fMaxAY * fnRnd2();
          this.fVZ += this.fAZ + fMaxAZ * fnRnd2();
          this.fX += this.fVX;
          this.fY += this.fVY;
          this.fZ += this.fVZ;
        }

        this.fRotX = fCosAngle * this.fX + fSinAngle * this.fZ;
        this.fRotZ = -fSinAngle * this.fX + fCosAngle * this.fZ;
        this.fRadiusCurrent = fnMax(0.01, iPerspective / (iPerspective - this.fRotZ));
        this.fProjX = this.fRotX * this.fRadiusCurrent + iProjSphereX;
        this.fProjY = this.fY * this.fRadiusCurrent + iProjSphereY;

        this.iFramesAlive += 1;

        if (this.iFramesAlive < this.fGrowDuration) {
          this.fAlpha = this.iFramesAlive * 1.0 / this.fGrowDuration;
        } else if (this.iFramesAlive < this.fGrowDuration + this.fWaitDuration) {
          this.fAlpha = 1.0;
        } else if (this.iFramesAlive < this.fGrowDuration + this.fWaitDuration + this.fShrinkDuration) {
          this.fAlpha = (this.fGrowDuration + this.fWaitDuration + this.fShrinkDuration - this.iFramesAlive) * 1.0 / this.fShrinkDuration;
        } else {
          this.bIsDead = true;
        }

        if (this.bIsDead) {
          fnSwapList(this, oRender, oBuffer);
        }

        this.fAlpha *= fnMin(1.0, fnMax(0.5, this.fRotZ / iRadiusSphere));
        this.fAlpha = fnMin(1.0, fnMax(0.0, this.fAlpha));
      }
    }

    // Render function
    const fnRender = () => {
      // Update pulse animation
      pulseTime += pulseSpeed;
      const pulseScale = 1.0 + Math.sin(pulseTime) * 0.15; // Grow/shrink by 15%
      
      // Parse color from HSL string or use default cyan
      // Use ref to get latest color value
      const currentColor = colorRef.current;
      let aColor = [0, 212, 255]; // Default cyan color
      if (currentColor) {
        try {
          // Parse HSL string like "hsl(180, 70%, 50%)"
          const hslMatch = currentColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
          if (hslMatch) {
            const h = parseInt(hslMatch[1]);
            const s = parseInt(hslMatch[2]) / 100;
            const l = parseInt(hslMatch[3]) / 100;
            // Convert HSL to RGB
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = l - c / 2;
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; b = 0; }
            else if (h < 120) { r = x; g = c; b = 0; }
            else if (h < 180) { r = 0; g = c; b = x; }
            else if (h < 240) { r = 0; g = x; b = c; }
            else if (h < 300) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            aColor = [
              Math.round((r + m) * 255),
              Math.round((g + m) * 255),
              Math.round((b + m) * 255)
            ];
          } else {
            // If color doesn't match HSL format, try to parse as hex or other format
            // Silently use default - don't spam console
          }
        } catch (e) {
          // If parsing fails, use default color
          // Silently use default - don't spam console
        }
      }
      
      // Black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Scale factor for particle size based on container
      const scaleFactor = Math.min(w, h) / 400; // Base size on 400px reference
      const minParticleSize = 1;
      const maxParticleSize = 3;

      let p = oRender.pFirst;
      while (p) {
        // Scale particle size with pulse effect
        const baseSize = fnMin(maxParticleSize, fnMax(minParticleSize, p.fRadiusCurrent * scaleFactor));
        const particleSize = baseSize * pulseScale;
        ctx.fillStyle = `rgba(${aColor[0]},${aColor[1]},${aColor[2]},${p.fAlpha.toFixed(4)})`;
        ctx.beginPath();
        ctx.arc(p.fProjX, p.fProjY, particleSize, 0, 2 * fPI, false);
        ctx.closePath();
        ctx.fill();
        p = p.pNext;
      }
    };

    // Animation loop
    const fnNextFrame = () => {
      fAngle = (fAngle + fVX) % (2.0 * fPI);
      fSinAngle = fnSin(fAngle);
      fCosAngle = fnCos(fAngle);

      let iAddParticle = 0;
      while (iAddParticle++ < iNewParticlePerFrame) {
        const p = fnSwapList(oBuffer.pFirst, oBuffer, oRender);
        p.fnInit();
      }

      let p = oRender.pFirst;
      while (p) {
        const pNext = p.pNext;
        p.fnUpdate();
        p = pNext;
      }

      fnRender();
      animationFrameRef.current = requestAnimationFrame(fnNextFrame);
    };

    fnNextFrame();

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [color]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}

