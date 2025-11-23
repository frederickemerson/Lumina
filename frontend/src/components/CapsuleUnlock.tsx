/**
 * LUMINA Capsule Unlock Component
 * Displays unlocked capsule with AI haiku and light etching animation
 */

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Unlock, Sparkles, Download, Eye, MessageSquare } from 'lucide-react';
import { colors, spacing, typography, cardStyles, buttonStyles, inputStyles } from '../styles/theme';
import Orb from './Orb';
import { OrbCrack } from './OrbCrack';
import type { CapsuleDecryptionResult } from '../hooks/useLumina';

interface CapsuleUnlockProps {
  capsuleId: string;
  onClose?: () => void;
  unlockCapsule: (capsuleId: string, userMessage?: string) => Promise<CapsuleDecryptionResult>;
}

export function CapsuleUnlock({ capsuleId, onClose, unlockCapsule }: CapsuleUnlockProps) {
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockPayload, setUnlockPayload] = useState<CapsuleDecryptionResult | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [showCrackAnimation, setShowCrackAnimation] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [showMessagePrompt, setShowMessagePrompt] = useState(false);
  // Removed heartbeat monitoring - feature removed

  useEffect(() => {
    if (!unlockPayload?.decryptedData) {
      setImageUrl(null);
      return;
    }
    const bytes = unlockPayload.decryptedData;
    const chunk = new Uint8Array(bytes);
    const blob = new Blob([chunk], {
      type: unlockPayload.mimeType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [unlockPayload?.decryptedData, unlockPayload?.mimeType]);

  useEffect(() => {
    if (!unlockPayload?.voice?.data) {
      setVoiceUrl(null);
      return;
    }
    const voiceBytes = unlockPayload.voice.data;
    const blob = new Blob([new Uint8Array(voiceBytes)], {
      type: unlockPayload.voice.mimeType,
    });
    const url = URL.createObjectURL(blob);
    setVoiceUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [unlockPayload?.voice]);

  const handleUnlock = async () => {
    try {
      setUnlocking(true);

      // Show crack animation first
      setShowCrackAnimation(true);
      
      // Unlock after animation
      setTimeout(async () => {
        try {
          const result = await unlockCapsule(capsuleId);
          setUnlockPayload(result);
          setUnlocked(true);
          setShowMessagePrompt(true);
          toast.success('Capsule unlocked! Light breaks at dawn.');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to unlock capsule';
          toast.error(errorMessage);
        } finally {
          setUnlocking(false);
        }
      }, 3000); // Wait for crack animation to complete
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unlock capsule';
      toast.error(errorMessage);
      setUnlocking(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      {/* Unlock Button */}
      {!unlocked && !showCrackAnimation && (
        <div style={{ ...cardStyles.base, padding: spacing.xl, textAlign: 'center' }}>
          <Unlock size={48} style={{ color: colors.primary, marginBottom: spacing.md, opacity: 0.8 }} />
          <h2 style={{ color: colors.text, fontSize: typography.fontSize.xl, marginBottom: spacing.sm, marginTop: 0 }}>
            Unlock Memory Vault
          </h2>
          <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginBottom: spacing.lg }}>
            When conditions are met, your memory will be revealed.
          </p>
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            style={{
              ...buttonStyles,
              width: '100%',
              background: unlocking ? colors.surface : colors.primary,
              color: unlocking ? colors.text : colors.background,
              border: `1px solid ${unlocking ? colors.border : colors.primary}`,
              cursor: unlocking ? 'not-allowed' : 'pointer',
              opacity: unlocking ? 0.6 : 1,
            }}
          >
            {unlocking ? (
              <>
                <Sparkles size={16} />
                <span>Unlocking...</span>
              </>
            ) : (
              <>
                <Unlock size={16} />
                <span>Unlock Capsule</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Crack Animation */}
      {showCrackAnimation && !unlocked && (
        <div style={{ textAlign: 'center', marginBottom: spacing.xl }}>
          <p style={{ color: colors.primary, marginBottom: spacing.lg, fontSize: typography.fontSize.lg }}>
            The orb cracks... light pours out...
          </p>
          <OrbCrack duration={3000} onComplete={() => {}} />
        </div>
      )}

      {/* Unlocked Content */}
      {unlocked && (
        <>
          {/* 3D Orb with pulse */}
          <div style={{ ...cardStyles.base, padding: spacing.lg, textAlign: 'center' }}>
            <h3 style={{ color: colors.text, fontSize: typography.fontSize.md, marginBottom: spacing.md, marginTop: 0 }}>
              Memory Unlocked
            </h3>
            <Orb pulse={true} heartbeat={0} size={1} />
          </div>

          {/* User Message Prompt */}
          {showMessagePrompt && (
            <div style={{ ...cardStyles.base, padding: spacing.lg, marginBottom: spacing.lg }}>
              <h3 style={{
                fontSize: typography.fontSize.md,
                color: colors.text,
                marginBottom: spacing.md,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
              }}>
                <MessageSquare size={20} style={{ color: colors.primary }} />
                Would you like to write a message in this capsule?
              </h3>
              <textarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Write your message here..."
                style={{
                  ...inputStyles,
                  width: '100%',
                  minHeight: '100px',
                  fontFamily: typography.fontFamily.sans,
                }}
              />
              <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
                <button
                  onClick={async () => {
                    if (userMessage.trim()) {
                      try {
                        // Re-unlock with message to save it
                        const saved = await unlockCapsule(capsuleId, userMessage);
                        setUnlockPayload(saved);
                        setShowMessagePrompt(false);
                        toast.success('Message saved');
                      } catch (error) {
                        // Message might already be saved, just close prompt
                        setShowMessagePrompt(false);
                      }
                    } else {
                      setShowMessagePrompt(false);
                    }
                  }}
                  style={{
                    ...buttonStyles,
                    background: colors.primary,
                    color: colors.background,
                    border: `1px solid ${colors.primary}`,
                  }}
                >
                  Save Message
                </button>
                <button
                  onClick={() => setShowMessagePrompt(false)}
                  style={{
                    ...buttonStyles,
                    background: colors.surface,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                  }}
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Decrypted Content Preview */}
          {unlockPayload?.message && (
            <div style={{ ...cardStyles.base, padding: spacing.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <MessageSquare size={18} style={{ color: colors.primary }} />
                <h3 style={{ margin: 0, color: colors.text, fontSize: typography.fontSize.md }}>Capsule Message</h3>
              </div>
              <p style={{
                color: colors.text,
                fontSize: typography.fontSize.sm,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {unlockPayload.message}
              </p>
            </div>
          )}

          {(imageUrl || unlockPayload?.decryptedData) && (
            <div style={{ ...cardStyles.base, padding: spacing.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                <Eye size={20} style={{ color: colors.primary }} />
                <h3 style={{ color: colors.text, fontSize: typography.fontSize.md, margin: 0 }}>
                  Your Memory
                </h3>
              </div>
              {imageUrl && unlockPayload?.mimeType?.startsWith('image/') ? (
                <div style={{ textAlign: 'center', marginBottom: spacing.md }}>
                  <img
                    src={imageUrl}
                    alt="Decrypted capsule"
                    style={{
                      maxWidth: '100%',
                      borderRadius: spacing.sm,
                      border: `1px solid ${colors.border}`,
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    padding: spacing.md,
                    background: colors.surface,
                    borderRadius: spacing.sm,
                    border: `1px solid ${colors.border}`,
                    textAlign: 'center',
                  }}
                >
                  <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, margin: 0 }}>
                    {unlockPayload?.decryptedData?.length || 0} bytes decrypted
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  if (!unlockPayload?.decryptedData) return;
                  const bytes = unlockPayload.decryptedData;
                  const chunk = new Uint8Array(bytes);
                  const blob = new Blob([chunk], {
                    type: unlockPayload.mimeType || 'application/octet-stream',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `capsule-${capsuleId.slice(0, 8)}.${unlockPayload?.mimeType?.split('/')[1] || 'bin'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  ...buttonStyles,
                  marginTop: spacing.sm,
                  background: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <Download size={14} />
                <span>Download</span>
              </button>
            </div>
          )}

          {voiceUrl && (
            <div style={{ ...cardStyles.base, padding: spacing.lg }}>
              <h3 style={{ color: colors.text, fontSize: typography.fontSize.md, marginTop: 0 }}>
                Voice Note
              </h3>
              <audio controls src={voiceUrl} style={{ width: '100%' }}>
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              style={{
                ...buttonStyles,
                width: '100%',
                background: colors.surface,
                color: colors.text,
                border: `1px solid ${colors.border}`,
              }}
            >
              Close
            </button>
          )}
        </>
      )}
    </div>
  );
}

