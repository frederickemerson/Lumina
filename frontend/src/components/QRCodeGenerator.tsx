/**
 * QR Code Generator Component
 * Generates QR codes for AR sharing of capsules
 */

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { colors, spacing, typography, cardStyles, buttonStyles, borderRadius } from '../styles/theme';

interface QRCodeGeneratorProps {
  capsuleId: string;
  blobId?: string;
  onClose?: () => void;
}

export function QRCodeGenerator({ capsuleId, blobId, onClose }: QRCodeGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const [arUrl, setArUrl] = useState('');

  useEffect(() => {
    // Generate AR URL
    const origin = window.location.origin;
    const url = `${origin}/ar/${capsuleId}${blobId ? `?blob=${blobId}` : ''}`;
    setArUrl(url);
  }, [capsuleId, blobId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(arUrl);
      setCopied(true);
      toast.success('AR link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'LUMINA Memory Capsule',
          text: 'View my memory capsule in AR',
          url: arUrl,
        });
        toast.success('Shared successfully!');
      } catch (error) {
        // User cancelled or error
        if ((error as Error).name !== 'AbortError') {
          toast.error('Failed to share');
        }
      }
    } else {
      // Fallback to copy
      handleCopy();
    }
  };

  return (
    <div style={{
      ...cardStyles.base,
      padding: spacing.xl,
      textAlign: 'center',
      background: colors.background,
      color: colors.text,
      border: `1px solid ${colors.border}`,
    }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: spacing.md,
            right: spacing.md,
            background: 'none',
            border: 'none',
            color: colors.textSecondary,
            cursor: 'pointer',
            fontSize: typography.fontSize.lg,
          }}
        >
          ×
        </button>
      )}

      <h3 style={{
        fontSize: typography.fontSize.lg,
        fontWeight: 600,
        marginBottom: spacing.md,
        color: colors.primary,
      }}>
        Share Capsule in AR
      </h3>

      <p style={{
        fontSize: typography.fontSize.sm,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
      }}>
        Scan this QR code to view your capsule in augmented reality
      </p>

      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: spacing.lg,
        padding: spacing.md,
        background: colors.surface,
        borderRadius: borderRadius.md,
      }}>
        <QRCodeSVG
          value={arUrl}
          size={256}
          level="H"
          includeMargin={true}
          fgColor={colors.primary}
          bgColor={colors.background}
        />
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        marginTop: spacing.lg,
      }}>
        <div style={{
          padding: spacing.sm,
          background: colors.surface,
          borderRadius: borderRadius.sm,
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
          wordBreak: 'break-all',
          fontFamily: typography.fontFamily.mono,
        }}>
          {arUrl}
        </div>

        <div style={{
          display: 'flex',
          gap: spacing.sm,
        }}>
          <button
            onClick={handleCopy}
            style={{
              ...buttonStyles,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              background: colors.surface,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          <button
            onClick={handleShare}
            style={{
              ...buttonStyles,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              background: colors.primary,
              color: colors.background,
              border: `1px solid ${colors.primary}`,
            }}
          >
            <Share2 size={16} />
            <span>Share</span>
          </button>
        </div>
      </div>
    </div>
  );
}

