/**
 * LUMINA Beautiful Animated Orb Component
 * Based on CodePen: https://codepen.io/Zaku/pen/nzqqwW
 * Enhanced particle orb with fluid motion and color transitions
 */

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Points, BufferGeometry, BufferAttribute } from 'three';

interface OrbProps {
  pulse?: boolean;
  heartbeat?: number;
  size?: number;
  fullScreen?: boolean; // If true, use full screen; if false, use container size
  hue?: number; // Optional hue for fixed color (e.g., 280 for purple/magenta for testnet)
}

// Helper function to convert HSL to hex
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Generate color palette from HSL hue (rotates through color wheel)
function getColorPalette(hue: number): [string, string, string] {
  const primary = hslToHex(hue, 100, 50);
  const secondary = hslToHex((hue + 30) % 360, 80, 45);
  const tertiary = hslToHex((hue + 60) % 360, 70, 40);
  return [primary, secondary, tertiary];
}

interface ParticleOrbProps extends OrbProps {
  hue?: number; // Optional hue prop from parent
}

function ParticleOrb({ pulse = true, heartbeat = 72, size = 1, hue: propHue }: ParticleOrbProps) {
  const pointsRef = useRef<Points>(null);
  const geometryRef = useRef<BufferGeometry>(null);
  const [hue, setHue] = useState(propHue ?? 180); // Use prop if provided, otherwise start with cyan
  const timeRef = useRef(0);
  
  // If hue is provided as prop, use it; otherwise manage it internally
  useEffect(() => {
    if (propHue !== undefined) {
      setHue(propHue);
    } else {
      // Fallback: smooth rotation if no prop provided
      const startTime = Date.now();
      const duration = 120000;
      const animationFrameRef = requestAnimationFrame(function animate() {
        const elapsed = Date.now() - startTime;
        const progress = (elapsed % duration) / duration;
        const newHue = (180 + progress * 360) % 360;
        setHue(newHue);
        requestAnimationFrame(animate);
      });
      return () => cancelAnimationFrame(animationFrameRef);
    }
  }, [propHue]);
  
  // Get current color palette based on hue
  const colors = getColorPalette(hue);
  
  // Create particle system with more sophisticated distribution
  useEffect(() => {
    if (!geometryRef.current) return;
    
    const particleCount = 800; // Further reduced for calmer, more minimal aesthetic
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    
    // Parse colors to RGB
    const parseColor = (hex: string) => {
      const r = parseInt(hex.substring(1, 3), 16) / 255;
      const g = parseInt(hex.substring(3, 5), 16) / 255;
      const b = parseInt(hex.substring(5, 7), 16) / 255;
      return [r, g, b];
    };
    
    const [primaryR, primaryG, primaryB] = parseColor(colors[0]);
    const [tertiaryR, tertiaryG, tertiaryB] = parseColor(colors[2] || colors[1]);
    
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Create layered spherical distribution (denser near center)
      const layer = Math.random();
      const radius = 0.5 + layer * 0.6; // 0.5 to 1.1
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      
      // Spherical coordinates to Cartesian
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);
      
      // Random velocities for fluid motion - slower
      velocities[i3] = (Math.random() - 0.5) * 0.01; // Reduced from 0.02
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.01; // Reduced from 0.02
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.01; // Reduced from 0.02
      
      // Color variation - blend between all three colors based on position
      const distFromCenter = Math.sqrt(
        positions[i3] ** 2 + 
        positions[i3 + 1] ** 2 + 
        positions[i3 + 2] ** 2
      );
      const normalizedDist = distFromCenter / 1.1; // Normalize to 0-1
      
      // Outer particles use primary, inner use tertiary, middle blend
      let r, g, b;
      if (normalizedDist > 0.7) {
        // Outer layer - primary color
        r = primaryR;
        g = primaryG;
        b = primaryB;
      } else if (normalizedDist < 0.3) {
        // Inner layer - tertiary color
        r = tertiaryR;
        g = tertiaryG;
        b = tertiaryB;
      } else {
        // Middle layer - blend
        const blend = (normalizedDist - 0.3) / 0.4;
        r = tertiaryR * (1 - blend) + primaryR * blend;
        g = tertiaryG * (1 - blend) + primaryG * blend;
        b = tertiaryB * (1 - blend) + primaryB * blend;
      }
      
      // Add some randomness
      const colorVariation = 0.7 + Math.random() * 0.3;
      particleColors[i3] = r * colorVariation;
      particleColors[i3 + 1] = g * colorVariation;
      particleColors[i3 + 2] = b * colorVariation;
    }
    
    geometryRef.current.setAttribute('position', new BufferAttribute(positions, 3));
    geometryRef.current.setAttribute('color', new BufferAttribute(particleColors, 3));
    
    // Store velocities in geometry userData for animation
    if (geometryRef.current.userData) {
      geometryRef.current.userData.velocities = velocities;
    } else {
      geometryRef.current.userData = { velocities };
    }
  }, [colors]);
  
  // Animate particles with fluid motion
  useFrame((state) => {
    if (pointsRef.current && geometryRef.current) {
      const time = state.clock.getElapsedTime();
      timeRef.current = time;
      
      // Rotate the entire system smoothly - very slow
      pointsRef.current.rotation.y = time * 0.008; // Even slower - reduced from 0.02
      pointsRef.current.rotation.x = Math.sin(time * 0.004) * 0.08; // Even slower - reduced from 0.01 and 0.1
      
      // Pulse effect - very slow, more breathable
      if (pulse) {
        // Very slow breathing - reduced to 15% of original
        const breathingRate = (heartbeat / 60) * 0.15; // Even slower breathing
        const pulseScale = 1 + Math.sin(time * breathingRate * 2) * 0.12; // Slightly larger pulse
        pointsRef.current.scale.setScalar(size * pulseScale);
      } else {
        pointsRef.current.scale.setScalar(size);
      }
      
      // Animate individual particles with fluid motion
      const positions = geometryRef.current.attributes.position.array as Float32Array;
      const velocities = geometryRef.current.userData?.velocities as Float32Array;
      if (!velocities) return;
      
      const particleCount = positions.length / 3;
      
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        
        // Get current position
        const x = positions[i3];
        const y = positions[i3 + 1];
        const z = positions[i3 + 2];
        
        // Calculate distance from center
        const dist = Math.sqrt(x * x + y * y + z * z);
        // Very slow breathing effect - even more reduced frequency
        const targetRadius = 0.6 + Math.sin(time * 0.05 + i * 0.01) * 0.25; // Reduced from 0.1 to 0.05
        
        // Attract particles to target radius (creates breathing effect) - very slow
        const radiusDiff = targetRadius - dist;
        const attraction = radiusDiff * 0.01; // Reduced from 0.015 for even slower movement
        
        // Normalize direction and apply attraction
        if (dist > 0.001) {
          positions[i3] += (x / dist) * attraction + velocities[i3] * Math.sin(time + i);
          positions[i3 + 1] += (y / dist) * attraction + velocities[i3 + 1] * Math.sin(time + i);
          positions[i3 + 2] += (z / dist) * attraction + velocities[i3 + 2] * Math.sin(time + i);
        }
        
        // Add orbital motion - very slow
        const orbitSpeed = 0.05; // Reduced from 0.15
        const orbitRadius = Math.sqrt(x * x + z * z);
        if (orbitRadius > 0.001) {
          const angle = Math.atan2(z, x) + orbitSpeed * 0.001; // Reduced from 0.003
          positions[i3] = orbitRadius * Math.cos(angle);
          positions[i3 + 2] = orbitRadius * Math.sin(angle);
        }
      }
      
      geometryRef.current.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial
        size={0.02 * size}
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
        sizeAttenuation={true}
      />
    </points>
  );
}

export default function Orb({ pulse = true, heartbeat = 72, size = 1, fullScreen = false, hue: propHue }: OrbProps) {
  const [hue, setHue] = useState(propHue ?? 180); // Use prop if provided, otherwise start with cyan (180 degrees)
  const animationFrameRef = useRef<number | undefined>(undefined);
  
  // If hue is provided as prop, use it; otherwise rotate through color wheel
  useEffect(() => {
    if (propHue !== undefined) {
      setHue(propHue);
      return; // Don't animate if fixed hue is provided
    }
    
    // Smoothly rotate through color wheel (360 degrees over 600 seconds - very slow)
    const startTime = Date.now();
    const duration = 600000; // 600 seconds (10 minutes) for full rotation - very slow
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed % duration) / duration;
      const newHue = (180 + progress * 360) % 360; // Start at cyan, rotate through full spectrum
      setHue(newHue);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [propHue]);
  
  // Get current color palette based on hue
  const colors = getColorPalette(hue);
  
  // Container styles based on fullScreen prop
  const containerStyle = fullScreen ? {
    width: '100vw',
    height: '100vh',
    background: '#000',
    position: 'fixed' as const,
    top: 0,
    left: 0,
    overflow: 'hidden' as const,
  } : {
    width: '100%',
    height: '400px',
    background: 'transparent',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  };
  
  return (
    <div style={containerStyle}>
      {/* Animated glow background - full screen, smooth color transition */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${size * 1000}px`,
        height: `${size * 1000}px`,
        background: `radial-gradient(circle, ${colors[0]}25 0%, ${colors[1]}15 30%, transparent 60%)`,
        filter: 'blur(150px)',
        pointerEvents: 'none',
        zIndex: 0,
        animation: 'breathe 16s ease-in-out infinite', // Very slow breathing - 16s instead of 8s
        transition: 'background 0.1s linear', // Smooth transition as hue changes
      }} />
      
      {/* Secondary glow layer */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${size * 600}px`,
        height: `${size * 600}px`,
        background: `radial-gradient(circle, ${colors[0]}40 0%, transparent 70%)`,
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: 0,
        animation: 'breathe 12s ease-in-out infinite', // Very slow breathing - 12s instead of 6s
        animationDelay: '6s', // Adjusted delay
        transition: 'background 0.1s linear', // Smooth transition as hue changes
      }} />
      <style>{`
        @keyframes breathe {
          0%, 100% { 
            opacity: 0.8; 
            transform: translate(-50%, -50%) scale(1);
          }
          50% { 
            opacity: 1; 
            transform: translate(-50%, -50%) scale(1.12);
          }
        }
      `}</style>
      
      <Canvas 
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.15} />
        <pointLight position={[5, 5, 5]} intensity={0.6} color={colors[0]} />
        <pointLight position={[-5, -5, -5]} intensity={0.4} color={colors[1]} />
        <pointLight position={[0, 5, -5]} intensity={0.3} color={colors[2] || colors[1]} />
        <ParticleOrb 
          pulse={pulse} 
          heartbeat={heartbeat} 
          size={size}
          hue={hue} // Pass hue down so ParticleOrb can use it
        />
      </Canvas>
    </div>
  );
}
