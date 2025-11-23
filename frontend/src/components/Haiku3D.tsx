/**
 * 3D Calligraphy Haiku Component
 * Displays haiku in 3D space with light-etched effect
 */

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Mesh, MeshStandardMaterial } from 'three';

interface Haiku3DProps {
  haiku: string;
  glowIntensity?: number;
  animationSpeed?: number;
}

function Haiku3DMesh({ haiku, glowIntensity = 1.0, animationSpeed = 1.0 }: Haiku3DProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const lines = haiku.split(' / ');

  // Animate glow and position
  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime() * animationSpeed;
      // Gentle floating animation
      meshRef.current.position.y = Math.sin(time * 0.5) * 0.1;
      
      // Pulse glow intensity
      if (materialRef.current) {
        materialRef.current.emissiveIntensity = glowIntensity + Math.sin(time * 2) * 0.3;
      }
    }
  });

  return (
    <group ref={meshRef}>
      {lines.map((line, index) => (
        <Text
          key={index}
          position={[0, (lines.length - index - 1) * -0.3, 0]}
          fontSize={0.15}
          color="#00d4ff"
          anchorX="center"
          anchorY="middle"
          font="/fonts/calligraphy.woff" // Placeholder - use actual calligraphy font
          maxWidth={5}
        >
          {line}
        </Text>
      ))}
    </group>
  );
}

export function Haiku3D({ haiku, glowIntensity = 1.0, animationSpeed = 1.0 }: Haiku3DProps) {
  return (
    <div style={{ width: '100%', height: '400px', background: 'transparent' }}>
      <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
        <ambientLight intensity={0.3} />
        <pointLight position={[5, 5, 5]} intensity={1} color="#00d4ff" />
        <pointLight position={[-5, -5, -5]} intensity={0.5} color="#007bff" />
        <Haiku3DMesh haiku={haiku} glowIntensity={glowIntensity} animationSpeed={animationSpeed} />
      </Canvas>
    </div>
  );
}

