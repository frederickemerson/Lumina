/**
 * QR Code Scanner Component
 * Scans QR codes to load capsules in AR
 */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { colors, spacing, typography, buttonStyles } from '../styles/theme';
import { logger } from '../utils/logger';

interface QRScannerProps {
  onScan: (capsuleId: string, anchorPosition?: { x: number; y: number; z: number; rotation: { x: number; y: number; z: number } }) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const startScanning = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setScanning(true);
        }
      } catch (err) {
        setError('Camera access denied or not available');
      }
    };

    startScanning();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!scanning || !videoRef.current || !canvasRef.current) return;

    const scanQR = async () => {
      try {
        logger.warn('QR scanning requires html5-qrcode package. Install with: npm install html5-qrcode');
        // Fallback: use basic camera access
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }
      } catch (err) {
        logger.error('Camera access failed', {}, err instanceof Error ? err : undefined);
        setError('Camera access not available. Please enter capsule ID manually.');
      }
    };

    scanQR();
  }, [scanning, onScan]);

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
      <div id="qr-scanner-container" style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <button
        onClick={onClose}
        style={{
          ...buttonStyles,
          position: 'absolute',
          top: spacing.md,
          left: spacing.md,
          background: 'rgba(0,0,0,0.7)',
          color: colors.text,
          border: `1px solid ${colors.border}`,
          padding: spacing.sm,
        }}
      >
        <X size={16} />
      </button>

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
          <p style={{ color: colors.error, fontSize: typography.fontSize.sm }}>
            {error}
          </p>
        </div>
      )}

      {!error && (
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
          <p style={{ color: '#00d4ff', fontSize: typography.fontSize.sm }}>
            Point camera at QR code to load capsule
          </p>
        </div>
      )}
    </div>
  );
}

