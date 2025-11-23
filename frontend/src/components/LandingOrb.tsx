/**
 * Landing Page Orb Component
 * Exact implementation from CodePen: https://codepen.io/gadgetgnome/pen/jbPxwQ
 * With added smooth color rotation
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function LandingOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const parentContainerRef = useRef<THREE.Object3D | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const mousePosRef = useRef({ x: 0.5, y: 0.5 });
  const phaseRef = useRef(0);
  const hueRef = useRef(180); // Starting hue for color rotation
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mouse tracking (exact from CodePen)
    const handleMouseMove = (event: MouseEvent) => {
      mousePosRef.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
    };
    document.addEventListener('mousemove', handleMouseMove);

    // Scene setup (exact from CodePen)
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(95, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 30;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Box geometry and material (exact from CodePen)
    const boxSize = 0.2;
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    
    // Material with color rotation
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      color: 0xff0000, // Will be updated dynamically
      opacity: 0.4,
      side: THREE.DoubleSide,
    });
    materialRef.current = material;

    // Particle system setup (exact from CodePen)
    const pitchSegments = 60;
    const elevationSegments = pitchSegments / 2;
    const particles = pitchSegments * elevationSegments;
    const side = Math.pow(particles, 1 / 3);
    const radius = 16;

    const parentContainer = new THREE.Object3D();
    scene.add(parentContainer);
    parentContainerRef.current = parentContainer;

    function posInBox(place: number) {
      return ((place / side) - 0.5) * radius * 1.2;
    }

    // Create particles (exact from CodePen)
    for (let p = 0; p < pitchSegments; p++) {
      const pitch = (Math.PI * 2 * p) / pitchSegments;
      for (let e = 0; e < elevationSegments; e++) {
        const elevation = Math.PI * ((e / elevationSegments) - 0.5);
        const particle = new THREE.Mesh(geometry, material);

        parentContainer.add(particle);

        const dest = new THREE.Vector3();
        dest.z = Math.sin(pitch) * Math.cos(elevation) * radius; // z pos in sphere
        dest.x = Math.cos(pitch) * Math.cos(elevation) * radius; // x pos in sphere
        dest.y = Math.sin(elevation) * radius; // y pos in sphere

        particle.position.x = posInBox(parentContainer.children.length % side);
        particle.position.y = posInBox(Math.floor(parentContainer.children.length / side) % side);
        particle.position.z = posInBox(
          Math.floor(parentContainer.children.length / Math.pow(side, 2)) % side
        );

        particle.userData = {
          dests: [dest, particle.position.clone()],
          speed: new THREE.Vector3(),
        };
      }
    }

    // Render function (exact from CodePen + color rotation)
    const render = () => {
      phaseRef.current += 0.002;
      
      // Smooth color rotation (added feature)
      hueRef.current = (hueRef.current + 0.1) % 360;
      const hsl = `hsl(${hueRef.current}, 100%, 50%)`;
      const color = new THREE.Color(hsl);
      if (materialRef.current) {
        materialRef.current.color = color;
      }

      const parentContainer = parentContainerRef.current;
      if (!parentContainer) return;

      for (let i = 0, l = parentContainer.children.length; i < l; i++) {
        const particle = parentContainer.children[i] as THREE.Mesh;
        const dest = particle.userData.dests[
          Math.floor(phaseRef.current) % particle.userData.dests.length
        ].clone();
        const diff = dest.sub(particle.position);
        particle.userData.speed.divideScalar(1.02); // Some drag on the speed
        particle.userData.speed.add(diff.divideScalar(400)); // Modify speed by a fraction of the distance to the dest
        particle.position.add(particle.userData.speed);
        particle.lookAt(dest);
      }

      parentContainer.rotation.y = phaseRef.current * 3;
      parentContainer.rotation.x = (mousePosRef.current.y - 0.5) * Math.PI;
      parentContainer.rotation.z = (mousePosRef.current.x - 0.5) * Math.PI;

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Start animation
    render();

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current && container.contains(rendererRef.current.domElement)) {
        container.removeChild(rendererRef.current.domElement);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (materialRef.current) {
        materialRef.current.dispose();
      }
      if (sceneRef.current) {
        sceneRef.current.clear();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        background: '#000',
      }}
    />
  );
}
