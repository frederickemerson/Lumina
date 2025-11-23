/**
 * Orb Crack Animation Component
 * Animates orb cracking with particle system, fracture shader, and dawn color transition
 */

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Mesh, MeshStandardMaterial, Points, BufferGeometry, BufferAttribute } from 'three';

interface OrbCrackProps {
  onComplete?: () => void;
  duration?: number; // Animation duration in milliseconds
}

function CrackedOrbMesh({ onComplete, duration = 3000 }: OrbCrackProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const particlesRef = useRef<Points>(null);
  const [crackProgress, setCrackProgress] = useState(0);
  const [lightProgress, setLightProgress] = useState(0);
  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      
      setCrackProgress(progress);
      
      // Light pour starts at 50% progress
      if (progress > 0.5) {
        setLightProgress((progress - 0.5) * 2); // 0 to 1 from 50% to 100%
      }

      if (progress >= 1 && onComplete) {
        onComplete();
        clearInterval(interval);
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [duration, onComplete]);

  // Animate crack and light pour
  useFrame(() => {
    if (meshRef.current && materialRef.current) {
      
      // Crack animation: increase roughness and add fracture pattern
      materialRef.current.roughness = 0.2 + (crackProgress * 0.8);
      materialRef.current.metalness = 0.3 - (crackProgress * 0.3);
      
      // Color transition: dark → dawn colors
      const dawnColor = {
        r: 0 + (crackProgress * 1),      // 0 → 1 (red)
        g: 0.2 + (crackProgress * 0.8),  // 0.2 → 1 (green)
        b: 0.5 + (crackProgress * 0.5),  // 0.5 → 1 (blue)
      };
      
      materialRef.current.color.setRGB(dawnColor.r, dawnColor.g, dawnColor.b);
      materialRef.current.emissive.setRGB(
        dawnColor.r * lightProgress,
        dawnColor.g * lightProgress,
        dawnColor.b * lightProgress
      );
      materialRef.current.emissiveIntensity = 0.8 + (lightProgress * 1.2);

      // Scale animation: slight expansion as it cracks
      const scale = 1 + (crackProgress * 0.1);
      meshRef.current.scale.setScalar(scale);

      // Particle system for "light pours out" effect
      if (particlesRef.current && particlesGeometry.current && lightProgress > 0) {
        const positionAttr = particlesGeometry.current.attributes.position;
        if (positionAttr) {
          const positions = positionAttr.array as Float32Array;
          
          for (let i = 0; i < positions.length; i += 3) {
            // Animate particles outward
            const speed = lightProgress * 0.02;
            positions[i] += (Math.random() - 0.5) * speed;     // x
            positions[i + 1] += (Math.random() - 0.5) * speed;  // y
            positions[i + 2] += (Math.random() - 0.5) * speed;  // z
          }
          
          positionAttr.needsUpdate = true;
        }
      }
    }
  });

  // Create particle system for light pour
  const particleCount = 500;
  const particlesGeometry = useRef<BufferGeometry | null>(null);
  
  useEffect(() => {
    if (!particlesGeometry.current) {
      particlesGeometry.current = new BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 0.1;
      }
      particlesGeometry.current.setAttribute('position', new BufferAttribute(positions, 3));
    }
  }, []);

  return (
    <>
      {/* Main orb with crack effect */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#00d4ff"
          emissive="#00d4ff"
          emissiveIntensity={0.8}
          metalness={0.3}
          roughness={0.2}
        />
      </mesh>

      {/* Particle system for light pour */}
      {lightProgress > 0 && particlesGeometry.current && (
        <points ref={particlesRef} geometry={particlesGeometry.current}>
          <pointsMaterial
            size={0.05}
            color="#ffffff"
            transparent
            opacity={lightProgress}
          />
        </points>
      )}
    </>
  );
}

export function OrbCrack({ onComplete, duration = 3000 }: OrbCrackProps) {
  return (
    <div style={{ width: '100%', height: '400px', background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00d4ff" />
        <CrackedOrbMesh onComplete={onComplete} duration={duration} />
      </Canvas>
    </div>
  );
}

