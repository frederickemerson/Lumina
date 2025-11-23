/**
 * Upload Progress Modal Component
 * Shows detailed progress and logs during file upload
 */

import { X, Upload, CheckCircle, Loader } from 'lucide-react';
import { colors, spacing, typography, borderRadius, animations } from '../styles/theme';
import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface UploadLog {
  stage: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'processing' | 'complete' | 'error';
}

interface UploadProgressModalProps {
  isOpen: boolean;
  progress: number;
  logs: UploadLog[];
  onClose: () => void;
  onComplete?: () => void;
}

export function UploadProgressModal({ isOpen, progress, logs, onClose, onComplete }: UploadProgressModalProps) {
  const confettiTriggered = useRef(false);
  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Check if upload is complete (100% progress AND all logs are complete/error)
  const isComplete = progress === 100 && logs.length > 0 && logs.every(log => 
    log.status === 'complete' || log.status === 'error'
  );
  
  const hasError = logs.some(log => log.status === 'error');
  
  // Trigger confetti and auto-close when complete
  useEffect(() => {
    if (isComplete && !hasError && !confettiTriggered.current) {
      confettiTriggered.current = true;
      
      // Trigger confetti animation
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00ff88', '#00ccff', '#ff00ff', '#ffff00'],
      });
      
      // Auto-close after 2 seconds
      autoCloseTimer.current = setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
        onClose();
      }, 2000);
    }
    
    return () => {
      if (autoCloseTimer.current) {
        clearTimeout(autoCloseTimer.current);
      }
    };
  }, [isComplete, hasError, onClose, onComplete]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        ...animations.fadeIn,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: borderRadius.md,
          padding: spacing.xl,
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
          ...animations.scaleIn,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            {isComplete && !hasError ? (
              <CheckCircle size={20} style={{ color: colors.success }} />
            ) : hasError ? (
              <X size={20} style={{ color: colors.error }} />
            ) : (
              <Upload size={20} style={{ color: colors.primary }} />
            )}
            <h3 style={{ color: colors.text, fontSize: typography.fontSize.md, margin: 0 }}>
              {isComplete && !hasError ? 'Memory Uploaded!' : hasError ? 'Upload Failed' : 'Uploading Evidence'}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: spacing.xs,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Success/Error Message */}
        {isComplete && (
          <div style={{
            padding: spacing.md,
            marginBottom: spacing.md,
            borderRadius: borderRadius.sm,
            background: hasError 
              ? 'rgba(255, 68, 68, 0.1)' 
              : 'rgba(0, 255, 136, 0.1)',
            border: `1px solid ${hasError ? colors.error : colors.success}`,
            color: hasError ? colors.error : colors.success,
            fontSize: typography.fontSize.sm,
            textAlign: 'center',
          }}>
            {hasError 
              ? 'Upload failed. Please check the logs above and try again.'
              : 'Memory uploaded successfully! This window will close automatically.'}
          </div>
        )}

        {/* Progress Bar */}
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <span style={{ color: colors.text, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>
              Progress
            </span>
            <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
              {progress}%
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: colors.surface,
            borderRadius: borderRadius.sm,
            overflow: 'hidden',
            position: 'relative',
            border: `1px solid ${colors.border}`,
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${colors.primary} 0%, ${colors.success} 100%)`,
              transition: 'width 0.3s ease',
              borderRadius: borderRadius.sm,
              position: 'relative',
              animation: progress < 100 ? 'pulse 2s ease-in-out infinite' : 'none',
            }}>
              <style>{`
                @keyframes pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.7; }
                }
              `}</style>
            </div>
          </div>
        </div>

        {/* Logs */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: borderRadius.sm,
          padding: spacing.md,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
          maxHeight: '300px',
        }}>
          {logs.map((log, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.sm,
                padding: spacing.xs,
                borderRadius: borderRadius.sm,
                background: log.status === 'complete' 
                  ? 'rgba(0, 255, 136, 0.1)' 
                  : log.status === 'error'
                  ? 'rgba(255, 68, 68, 0.1)'
                  : 'transparent',
                ...animations.fadeIn,
                animationDelay: `${index * 0.1}s`,
              }}
            >
              <div style={{ marginTop: '2px' }}>
                {log.status === 'complete' ? (
                  <CheckCircle size={14} style={{ color: colors.success }} />
                ) : log.status === 'error' ? (
                  <X size={14} style={{ color: colors.error }} />
                ) : log.status === 'processing' ? (
                  <Loader size={14} style={{ color: colors.primary, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${colors.border}` }} />
                )}
                <style>{`
                  @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ 
                  color: log.status === 'complete' ? colors.success : log.status === 'error' ? colors.error : colors.text,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.medium,
                  marginBottom: '2px',
                }}>
                  {log.stage}
                </div>
                <div style={{ 
                  color: colors.textSecondary,
                  fontSize: typography.fontSize.xs,
                }}>
                  {log.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

