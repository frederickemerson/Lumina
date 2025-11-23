/**
 * Landing Page Component
 * Full-page minimal aesthetic with orb and LUMINA text
 */

import { useWalletKit } from '@mysten/wallet-kit';
import { useZkLogin } from '../wallet/zkLogin';
import { LandingOrb } from './LandingOrb';
import { TextPressure } from './TextPressure';
import { spacing, typography, animations } from '../styles/theme';

export function LandingPage() {
  const { isConnected } = useWalletKit();
  const zkLogin = useZkLogin();

  if (isConnected || zkLogin.isConnected) {
    return null; // Don't show landing if connected
  }


  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      background: '#000',
      overflow: 'hidden',
      ...animations.fadeIn,
    }}>
      {/* Animated orb canvas */}
      <LandingOrb />

      {/* LUMINA text overlay */}
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        zIndex: 5,
        ...animations.fadeIn,
      }}>
        <TextPressure
          text="LUMINA"
          style={{
            fontSize: 'clamp(24px, 4vw, 36px)',
            fontWeight: 300,
            color: '#00d4ff',
            marginBottom: spacing.md,
            letterSpacing: '0.15em',
            fontFamily: typography.fontFamily.display,
            textShadow: '0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3)',
            display: 'block',
            animation: 'pulse 4s ease-in-out infinite',
            lineHeight: 1.2,
          }}
          delay={0.1}
        />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; filter: brightness(1); }
            50% { opacity: 0.9; filter: brightness(1.2); }
          }
        `}</style>
      </div>

    </div>
  );
}
