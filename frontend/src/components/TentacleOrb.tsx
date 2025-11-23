/**
 * Tentacle Orb Component
 * Based on CodePen tentacle animation
 * https://codepen.io/Thibka/pen/XMvKZX
 */

import { useEffect, useRef } from 'react';

interface TentacleOrbProps {
  color?: string; // HSL color string like "hsl(180, 70%, 50%)" - will be ignored, using random color
  uniqueId: string; // Unique identifier to ensure different colors
}

interface Line {
  x: number;
  y: number;
  endAngle: number;
  endSpeed: number;
  endDir: number;
  endChangeFreq: number;
  c1Angle: number;
  c1Speed: number;
  c1Dir: number;
  c1ChangeFreq: number;
  c2Angle: number;
  c2Speed: number;
  c2Dir: number;
  c2ChangeFreq: number;
  c1: { x: number; y: number };
  end: { x: number; y: number };
  c2: { x: number; y: number };
  color: string;
  width: number;
  move(scale?: number): void;
  draw(): void;
  definePoints(scale?: number): void;
}

export function TentacleOrb({ uniqueId }: TentacleOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const linesRef = useRef<Line[]>([]);
  const breathingTimeRef = useRef<number>(0);
  
  // Generate a unique random color based on uniqueId to ensure different colors
  const generateUniqueColor = (id: string): string => {
    // Use the ID as a seed to generate a deterministic but varied color
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    // Generate hue from hash (0-360)
    const hue = Math.abs(hash) % 360;
    // Use high saturation and medium lightness for vibrant colors
    const saturation = 70 + (Math.abs(hash) % 20); // 70-90%
    const lightness = 50 + (Math.abs(hash * 7) % 20); // 50-70%
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };
  
  const randomColor = generateUniqueColor(uniqueId);
  const colorRef = useRef<string>(randomColor);

  // Breathing animation speed
  const breathingSpeed = 0.003;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get container size
    const getSize = () => {
      const rect = container.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    };

    let size = getSize();
    const WIDTH = size.width;
    const HEIGHT = size.height;

    canvas.setAttribute('width', String(WIDTH));
    canvas.setAttribute('height', String(HEIGHT));

    const totalTentacles = 200;

    // Convert HSL color to RGB for rgba
    const getColorFromHSL = (hslColor?: string): string => {
      if (!hslColor) {
        return 'rgba(43, 205, 255, 0.1)'; // Default cyan
      }

      try {
        // Parse HSL string like "hsl(180, 70%, 50%)"
        const hslMatch = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
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

          const rgb = [
            Math.round((r + m) * 255),
            Math.round((g + m) * 255),
            Math.round((b + m) * 255)
          ];

          return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.1)`;
        }
      } catch (e) {
        // Fall through to default
      }

      return 'rgba(43, 205, 255, 0.1)'; // Default cyan
    };

    const tentacleColor = getColorFromHSL(randomColor);

    // Helper functions
    const degToRad = (deg: number): number => deg * (Math.PI / 180);

    const aroundPoint = (x: number, y: number, dist: number, ang: number): { x: number; y: number } => {
      const angle = degToRad(ang);
      return {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
      };
    };

    // Line class
    class LineClass implements Line {
      x: number;
      y: number;
      endAngle: number;
      endSpeed: number;
      endDir: number;
      endChangeFreq: number;
      c1Angle: number;
      c1Speed: number;
      c1Dir: number;
      c1ChangeFreq: number;
      c2Angle: number;
      c2Speed: number;
      c2Dir: number;
      c2ChangeFreq: number;
      c1: { x: number; y: number };
      end: { x: number; y: number };
      c2: { x: number; y: number };
      color: string;
      width: number;
      private ctx: CanvasRenderingContext2D;

      constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx;
        this.x = WIDTH / 2;
        this.y = HEIGHT / 2;
        this.endAngle = Math.floor(Math.random() * 360);
        this.endSpeed = (Math.floor(Math.random() * 10) + 1) / 50;
        this.endDir = Math.floor(Math.random() * 2) === 0 ? -1 : 1;
        this.endChangeFreq = Math.floor(Math.random() * 200) + 1;
        this.c1Angle = Math.floor(Math.random() * 360);
        this.c1Speed = (Math.floor(Math.random() * 10) + 1) / 20;
        this.c1Dir = Math.floor(Math.random() * 2) === 0 ? -1 : 1;
        this.c1ChangeFreq = Math.floor(Math.random() * 200) + 1;
        this.c2Angle = Math.floor(Math.random() * 360);
        this.c2Speed = (Math.floor(Math.random() * 10) + 1) / 20;
        this.c2Dir = Math.floor(Math.random() * 2) === 0 ? -1 : 1;
        this.c2ChangeFreq = Math.floor(Math.random() * 200) + 1;
        this.c1 = { x: 0, y: 0 };
        this.end = { x: 0, y: 0 };
        this.c2 = { x: 0, y: 0 };
        this.color = tentacleColor;
        this.width = 1;
        this.definePoints(1); // Initialize with scale 1
      }

      definePoints(scale: number = 1) {
        const baseDist1 = 50; // Reduced from 100
        const baseDist2 = 75; // Reduced from 150
        this.c1 = aroundPoint(this.x, this.y, baseDist1 * scale, this.c1Angle);
        this.end = aroundPoint(this.x, this.y, baseDist2 * scale, this.endAngle);
        this.c2 = aroundPoint(this.end.x, this.end.y, baseDist1 * scale, this.c2Angle);
      }

      move(scale: number = 1) {
        this.endChangeFreq--;
        if (this.endChangeFreq === 0) {
          this.endDir *= -1;
          this.endChangeFreq = Math.floor(Math.random() * 200) + 1;
        }

        this.c1ChangeFreq--;
        if (this.c1ChangeFreq === 0) {
          this.c1Dir *= -1;
          this.c1ChangeFreq = Math.floor(Math.random() * 200) + 1;
        }

        this.c2ChangeFreq--;
        if (this.c2ChangeFreq === 0) {
          this.c2Dir *= -1;
          this.c2ChangeFreq = Math.floor(Math.random() * 200) + 1;
        }

        this.c1Angle = this.c1Angle + this.c1Dir * this.c1Speed;
        this.c2Angle = this.c2Angle + this.c2Dir * this.c2Speed;
        this.endAngle = this.endAngle + this.endDir * this.endSpeed;

        this.definePoints(scale);
      }

      draw() {
        this.ctx.beginPath();
        this.ctx.moveTo(this.x, this.y);
        this.ctx.bezierCurveTo(this.c1.x, this.c1.y, this.c2.x, this.c2.y, this.end.x, this.end.y);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.width;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
      }
    }

    // Initialize lines
    const lines: Line[] = [];
    for (let i = 0; i <= totalTentacles - 1; i++) {
      lines.push(new LineClass(ctx));
    }
    linesRef.current = lines;

    // Set shadow
    ctx.shadowColor = tentacleColor.replace('0.1', '1');
    ctx.shadowBlur = 10;

    // Animation loop
    const animate = () => {
      // Update breathing animation
      breathingTimeRef.current += breathingSpeed;
      const breathingScale = 1.0 + Math.sin(breathingTimeRef.current) * 0.15; // Scale between 0.85 and 1.15 (15% variation)
      
      // Update size if container changed
      const newSize = getSize();
      if (newSize.width !== size.width || newSize.height !== size.height) {
        size = newSize;
        canvas.setAttribute('width', String(size.width));
        canvas.setAttribute('height', String(size.height));
        // Recalculate center for all lines
        lines.forEach(line => {
          line.x = size.width / 2;
          line.y = size.height / 2;
        });
      }

      ctx.clearRect(0, 0, size.width, size.height);

      // Use the random color (always the same for this unique ID)
      const currentColor = getColorFromHSL(colorRef.current);
      lines.forEach(line => {
        line.color = currentColor;
      });
      ctx.shadowColor = currentColor.replace('0.1', '1');

      for (const line of lines) {
        line.move(breathingScale); // Pass breathing scale to move method
        line.draw();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [uniqueId]);

  return (
    <div
      ref={containerRef}
      className="opa"
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
      <style>{`
        .opa {
          animation: flickr 6s ease-in-out infinite;
          animation-fill-mode: both;
        }
        canvas {
          animation: floatting 10s ease-in-out infinite;
          animation-fill-mode: both;
        }
        @keyframes floatting {
          0%, 100% {
            transform: translate3d(0, -5px, 0);
          }
          50% {
            transform: translate3d(0, 5px, 0);
          }
        }
        @keyframes flickr {
          0%, 100% {
            opacity: 1;
            transform: translate3d(-5px, 0px, 0);
          }
          25%, 75% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
            transform: translate3d(5px, 0px, 0);
          }
        }
      `}</style>
    </div>
  );
}

