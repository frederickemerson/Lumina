/**
 * Locked Modal Component
 * Displays modal when user tries to access a locked memory
 */

import { Lock } from 'lucide-react';
import { colors, spacing, typography } from '../styles/theme';

interface LockedModalProps {
  unlockAt?: number | string;
  onClose: () => void;
}

export function LockedModal({ unlockAt, onClose }: LockedModalProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(5px)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: 'fadeIn 0.3s ease-out',
    }} onClick={onClose}>
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.error}`,
        borderRadius: '12px',
        padding: spacing.xl,
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        position: 'relative',
        animation: 'scaleIn 0.3s ease-out',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'rgba(255, 68, 68, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <Lock size={32} color={colors.error} />
        </div>
        <h3 style={{ 
          color: colors.text, 
          margin: `0 0 ${spacing.md}`,
          fontSize: typography.fontSize.lg 
        }}>
          Memory Locked
        </h3>
        <p style={{ 
          color: colors.textSecondary, 
          marginBottom: spacing.lg,
          lineHeight: 1.5 
        }}>
          This memory cannot be unlocked yet. It is time-locked until the specified date.
        </p>
        {unlockAt && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            padding: spacing.md,
            borderRadius: '8px',
            marginBottom: spacing.lg,
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{ 
              color: colors.text, 
              margin: 0, 
              fontSize: typography.fontSize.md,
              fontWeight: 'bold', 
            }}>
              Unlocks on: {new Date(typeof unlockAt === 'number' ? unlockAt : String(unlockAt)).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </p>
            <p style={{ 
              color: colors.textSecondary, 
              margin: '4px 0 0', 
              fontSize: typography.fontSize.sm 
            }}>
              {new Date(typeof unlockAt === 'number' ? unlockAt : String(unlockAt)).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: typography.fontSize.md,
            width: '100%',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = colors.surface}
        >
          Close
        </button>
      </div>
    </div>
  );
}

