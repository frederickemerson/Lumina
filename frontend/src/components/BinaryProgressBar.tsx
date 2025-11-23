/**
 * Binary Progress Bar Component
 * Displays upload progress with animated binary (1s and 0s) effect
 */

import { useEffect, useState } from 'react';
import { colors, typography, borderRadius } from '../styles/theme';

interface BinaryProgressBarProps {
  progress: number; // 0-100
  height?: number;
}

export function BinaryProgressBar({ progress, height = 6 }: BinaryProgressBarProps) {
  const [binaryString, setBinaryString] = useState<string>('');

  // Generate random binary string that updates
  useEffect(() => {
    const generateBinary = () => {
      const length = 50; // Number of binary digits to show
      let binary = '';
      for (let i = 0; i < length; i++) {
        binary += Math.random() > 0.5 ? '1' : '0';
      }
      setBinaryString(binary);
    };

    generateBinary();
    const interval = setInterval(generateBinary, 100); // Update every 100ms

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: '100%',
      height: `${height}px`,
      background: colors.surface,
      borderRadius: borderRadius.sm,
      overflow: 'hidden',
      position: 'relative',
      border: `1px solid ${colors.border}`,
    }}>
      {/* Progress fill */}
      <div style={{
        width: `${progress}%`,
        height: '100%',
        background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.success} 100%)`,
        transition: 'width 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Animated binary overlay */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: '4px',
          fontFamily: typography.fontFamily.mono,
          fontSize: '8px',
          color: 'rgba(255, 255, 255, 0.3)',
          letterSpacing: '2px',
          whiteSpace: 'nowrap',
          animation: 'binaryScroll 2s linear infinite',
        }}>
          {binaryString}
        </div>
      </div>
      
      {/* Binary text overlay on background */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: '4px',
        fontFamily: typography.fontFamily.mono,
        fontSize: '8px',
        color: 'rgba(255, 255, 255, 0.05)',
        letterSpacing: '2px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        {binaryString}
      </div>

      <style>{`
        @keyframes binaryScroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(20px);
          }
        }
      `}</style>
    </div>
  );
}

