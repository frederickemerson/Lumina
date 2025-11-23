/**
 * LUMINA AR Viewer Component
 * Displays capsule orb in AR using WebXR (free, native browser API)
 * Falls back to marker-based AR.js if WebXR is not available
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Share2, QrCode } from 'lucide-react';
import { colors, spacing, typography, buttonStyles } from '../styles/theme';
import { Canvas, useFrame } from '@react-three/fiber';
import { ARButton, XR, useXR } from '@react-three/xr';
// import { OrbitControls } from '@react-three/drei';
import { Mesh, MeshStandardMaterial } from 'three';
import { QRScanner } from './QRScanner';
import { logger } from '../utils/logger';

interface ARViewerProps {
  capsuleId: string;
  blobId?: string;
  onClose: () => void;
}

export function ARViewer({ capsuleId, onClose }: ARViewerProps) {
  // const [isWebXRAvailable, setIsWebXRAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arMode, setArMode] = useState<'webxr' | 'marker' | 'none'>('none');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState<{ x: number; y: number; z: number; rotation: { x: number; y: number; z: number } } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Check WebXR availability
    const checkWebXR = async () => {
      if ('xr' in navigator) {
        try {
          const isSupported = await (navigator as any).xr?.isSessionSupported('immersive-ar');
          // setIsWebXRAvailable(isSupported || false);
          if (isSupported) {
            setArMode('webxr');
            setIsInitialized(true);
          } else {
            // Fallback to marker-based AR (AR.js)
            setArMode('marker');
            setIsInitialized(true);
          }
        } catch (err) {
          setError('WebXR not supported on this device');
          setArMode('none');
        }
      } else {
        // Fallback to marker-based AR
        setArMode('marker');
        setIsInitialized(true);
      }
    };

    checkWebXR();

    // Connect to WebSocket for shared AR
    const wsUrl = import.meta.env.VITE_AR_WS_URL || 'ws://localhost:8080';
    const ws = new WebSocket(`${wsUrl}?capsuleId=${capsuleId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      logger.info('AR WebSocket connected', { capsuleId });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'anchor_position') {
          setAnchorPosition(message.position);
        } else if (message.type === 'orb_position_update') {
          // Update orb position from other users for shared AR sync
          setAnchorPosition({
            x: message.position.x,
            y: message.position.y,
            z: message.position.z,
            rotation: message.rotation || { x: 0, y: 0, z: 0 },
          });
        }
      } catch (error) {
        logger.error('Error handling AR WebSocket message', { error });
      }
    };

    ws.onerror = (error) => {
      logger.error('AR WebSocket error', { error });
    };

    return () => {
      ws.close();
    };
  }, [capsuleId]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#000',
      zIndex: 2000,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* WebXR AR Canvas */}
      {arMode === 'webxr' && (
        <Canvas
          style={{ width: '100%', height: '100%' }}
          camera={{ position: [0, 0, 5] }}
        >
          <XR>
            <ARButton
              sessionInit={{
                requiredFeatures: ['local-floor'],
                optionalFeatures: ['bounded-floor', 'hand-tracking'],
              }}
            />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00d4ff" />
            <AROrbMesh 
              position={anchorPosition ? [anchorPosition.x, anchorPosition.y, anchorPosition.z] : [0, 0, -2]} 
              rotation={anchorPosition?.rotation || { x: 0, y: 0, z: 0 }}
              size={1.5} 
              capsuleId={capsuleId} 
              wsRef={wsRef}
              onPositionChange={(pos, rot) => {
                // Save anchor position when user places orb
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: 'set_anchor',
                    capsuleId,
                    position: { x: pos.x, y: pos.y, z: pos.z, rotation: rot },
                  }));
                }
              }}
            />
          </XR>
        </Canvas>
      )}

      {/* Marker-based AR (AR.js fallback) */}
      {arMode === 'marker' && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: spacing.md,
        }}>
          <div style={{
            background: 'rgba(0,212,255,0.1)',
            padding: spacing.xl,
            borderRadius: spacing.md,
            border: `1px solid rgba(0,212,255,0.3)`,
            textAlign: 'center',
          }}>
            <p style={{ color: '#00d4ff', fontSize: typography.fontSize.md, marginBottom: spacing.sm }}>
              Marker-Based AR
            </p>
            <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
              Point your camera at a marker to view the orb
            </p>
            <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs }}>
              (AR.js integration - requires marker image)
            </p>
          </div>
          {/* Placeholder for AR.js canvas */}
          <div style={{
            width: '80%',
            height: '60%',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: spacing.sm,
            border: `1px dashed ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
              AR.js canvas would appear here
            </p>
          </div>
        </div>
      )}

      {/* No AR available */}
      {arMode === 'none' && (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: 'rgba(255,0,0,0.1)',
            padding: spacing.xl,
            borderRadius: spacing.md,
            border: `1px solid ${colors.error}`,
            textAlign: 'center',
            maxWidth: '400px',
          }}>
            <p style={{ color: colors.error, fontSize: typography.fontSize.md, marginBottom: spacing.sm }}>
              AR Not Available
            </p>
            <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
              Your device or browser does not support AR. Try using a modern mobile device with Chrome or Safari.
            </p>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div style={{
        position: 'absolute',
        top: spacing.md,
        left: spacing.md,
        right: spacing.md,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
      }}>
        <button
          onClick={onClose}
          style={{
            ...buttonStyles,
            background: 'rgba(0,0,0,0.7)',
            color: colors.text,
            border: `1px solid ${colors.border}`,
            padding: spacing.sm,
          }}
        >
          <X size={16} />
        </button>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          <button
            onClick={() => setShowQRScanner(true)}
            style={{
              ...buttonStyles,
              background: 'rgba(0,0,0,0.7)',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              padding: spacing.sm,
            }}
          >
            <QrCode size={16} />
          </button>
          <button
            onClick={() => {
              // Share AR link
              const arUrl = `${window.location.origin}/ar/${capsuleId}`;
              navigator.clipboard.writeText(arUrl);
            }}
            style={{
              ...buttonStyles,
              background: 'rgba(0,0,0,0.7)',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              padding: spacing.sm,
            }}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {/* Instructions */}
      {!isInitialized && !error && (
        <div style={{
          position: 'absolute',
          bottom: spacing.xl,
          left: spacing.md,
          right: spacing.md,
          background: 'rgba(0,0,0,0.8)',
          padding: spacing.lg,
          borderRadius: spacing.sm,
          textAlign: 'center',
        }}>
          <p style={{ color: colors.text, fontSize: typography.fontSize.sm, margin: 0 }}>
            Initializing AR...
          </p>
          <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs, marginBottom: 0 }}>
            Point your camera at a flat surface to place the orb
          </p>
        </div>
      )}

      {error && (
        <div style={{
          position: 'absolute',
          bottom: spacing.xl,
          left: spacing.md,
          right: spacing.md,
          background: 'rgba(255,0,0,0.2)',
          padding: spacing.lg,
          borderRadius: spacing.sm,
          textAlign: 'center',
          border: `1px solid ${colors.error}`,
        }}>
          <p style={{ color: colors.error, fontSize: typography.fontSize.sm, margin: 0 }}>
            AR not available: {error}
          </p>
          <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs, marginBottom: 0 }}>
            AR requires a device with camera support
          </p>
        </div>
      )}

      {isInitialized && (
        <div style={{
          position: 'absolute',
          bottom: spacing.xl,
          left: spacing.md,
          right: spacing.md,
          background: 'rgba(0,212,255,0.1)',
          padding: spacing.md,
          borderRadius: spacing.sm,
          textAlign: 'center',
          border: `1px solid rgba(0,212,255,0.3)`,
        }}>
          <p style={{ color: '#00d4ff', fontSize: typography.fontSize.xs, margin: 0 }}>
            Your memory vault orb is floating in AR space
          </p>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          onScan={(scannedCapsuleId, anchorPos) => {
            setShowQRScanner(false);
            if (scannedCapsuleId === capsuleId && anchorPos) {
              // Update anchor position for current capsule
              setAnchorPosition(anchorPos);
            } else {
              // Load different capsule in AR
              window.location.href = `/ar/${scannedCapsuleId}`;
            }
          }}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </div>
  );
}

// AR Orb Mesh Component (for use in AR Canvas)
// Supports spatial anchors and shared AR sync
function AROrbMesh({ 
  position = [0, 0, 0], 
  rotation = { x: 0, y: 0, z: 0 },
  size = 1.5, 
  capsuleId, 
  wsRef,
  onPositionChange,
}: { 
  position?: [number, number, number]; 
  rotation?: { x: number; y: number; z: number };
  size?: number; 
  capsuleId?: string; 
  wsRef?: React.MutableRefObject<WebSocket | null>;
  onPositionChange?: (position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const xr = useXR();
  const lastBroadcastTime = useRef<number>(0);
  const broadcastInterval = 100; // Broadcast every 100ms for smooth sync

  // Update position when anchor position changes (from other users or initial load)
  React.useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(position[0], position[1], position[2]);
      meshRef.current.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }, [position, rotation]);

  // Create spatial anchor if WebXR is available
  React.useEffect(() => {
    if (xr.session && 'requestAnchor' in xr.session && meshRef.current) {
      // Create anchor at position for persistence
      const createAnchor = async () => {
        try {
          // WebXR anchor API (when available)
          // For now, we store anchor position in database via WebSocket
          if (onPositionChange && meshRef.current) {
            const pos = meshRef.current.position;
            const rot = meshRef.current.rotation;
            onPositionChange(
              { x: pos.x, y: pos.y, z: pos.z },
              { x: rot.x, y: rot.y, z: rot.z }
            );
          }
        } catch (error) {
          logger.error('Error creating spatial anchor', { error });
        }
      };
      createAnchor();
    }
  }, [xr.session, onPositionChange]);

  useFrame((state) => {
    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      const pulseScale = 1 + Math.sin(time * 2) * 0.05;
      meshRef.current.scale.setScalar(size * pulseScale);
      
      if (materialRef.current) {
        materialRef.current.emissiveIntensity = 0.8 + Math.sin(time * 2) * 0.2;
      }

      // Broadcast position for shared AR sync (throttled)
      const now = Date.now();
      if (capsuleId && wsRef?.current?.readyState === WebSocket.OPEN && now - lastBroadcastTime.current > broadcastInterval) {
        const pos = meshRef.current.position;
        const rot = meshRef.current.rotation;
        wsRef.current.send(JSON.stringify({
          type: 'orb_position',
          capsuleId,
          position: { x: pos.x, y: pos.y, z: pos.z },
          rotation: { x: rot.x, y: rot.y, z: rot.z },
          scale: meshRef.current.scale.x,
        }));
        lastBroadcastTime.current = now;
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position} rotation={[rotation.x, rotation.y, rotation.z]}>
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
  );
}

