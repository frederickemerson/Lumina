/**
 * Memory Viewer Component
 * Displays a single memory with WalrusScan link and NFT display
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { colors, spacing, typography, borderRadius, cardStyles, buttonStyles } from '../styles/theme';
import { ExternalLink, Image as ImageIcon, Lock, Unlock, Calendar, Clock, MessageSquare, Mic, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { CapsuleOrb } from './CapsuleOrb';
import { Logo } from './Logo';
import { useLumina } from '../hooks/useLumina';
import { InheritanceClaim } from './InheritanceClaim';
import { logger } from '../utils/logger';

interface Memory {
  memoryId: string;
  vaultId: string;
  blobId: string;
  encryptedDataId: string;
  fileSize: number;
  fileType: string;
  description: string | null;
  createdAt: string;
  unlockCondition?: 'time' | 'manual' | 'secret_phrase';
  unlockDateTime?: string;
  status?: 'locked' | 'unlocked';
  nftId?: string;
}

interface NFTData {
  nftId: string;
  glowIntensity: number;
  createdAt: string;
  capsuleId: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function MemoryViewer() {
  const { memoryId: rawMemoryId } = useParams<{ memoryId: string }>();
  const navigate = useNavigate();
  const { address, unlockCapsule } = useLumina();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [nftData, setNftData] = useState<NFTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [unlockMessage, setUnlockMessage] = useState<string | null>(null);
  const [voiceData, setVoiceData] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [inheritanceInfo, setInheritanceInfo] = useState<any>(null);

  // Decode memoryId - handle comma-separated ASCII codes (current format), base64, or hex strings
  const memoryId = rawMemoryId ? (() => {
    try {
      // First try URL decoding (React Router might have encoded it)
      let decoded = rawMemoryId;
      try {
        decoded = decodeURIComponent(rawMemoryId);
      } catch {
        // If URL decoding fails, use original
        decoded = rawMemoryId;
      }
      
      // Check if it's comma-separated ASCII codes (current format)
      if (decoded.includes(',') && /^\d+(,\d+)+$/.test(decoded)) {
        // Convert comma-separated ASCII codes to hex string
        const chars = decoded.split(',').map(code => String.fromCharCode(parseInt(code, 10)));
        const hexString = chars.join('');
        // If it's a valid hex string, add 0x prefix
        if (/^[a-fA-F0-9]{64}$/.test(hexString)) {
          return `0x${hexString}`;
        }
        return hexString;
      }
      
      // Check if it's already a hex string with 0x prefix
      if (/^0x[a-fA-F0-9]{64}$/.test(decoded)) {
        return decoded;
      }
      
      // Check if it's a hex string without 0x prefix
      if (/^[a-fA-F0-9]{64}$/.test(decoded)) {
        return `0x${decoded}`;
      }
      
      // Otherwise, assume it's base64 and send it as-is (backend will decode it)
      return decoded;
    } catch {
      // If decoding fails, use original
      return rawMemoryId;
    }
  })() : null;

  useEffect(() => {
    if (memoryId) {
      loadMemory();
    }
  }, [memoryId]);

  const getNormalizedCapsuleId = () => {
    if (!memory) return null;
    return memory.memoryId.startsWith('0x') ? memory.memoryId : `0x${memory.memoryId}`;
  };

  const loadMemory = async () => {
    if (!memoryId) return;
    
    try {
      setLoading(true);
      
      // Get memory details - send memoryId directly to API
      // Backend's router.param will handle comma-separated ASCII codes or base64 decoding
      const res = await apiClient.get(`/api/capsule/${memoryId}`);
      if (res.data.success && res.data.capsule) {
        setMemory(res.data.capsule);
        
        // Try to get NFT data if available
        if (res.data.capsule.nftId) {
          try {
            const nftRes = await apiClient.get(`/api/nft/${res.data.capsule.nftId}`);
            if (nftRes.data.success) {
              setNftData(nftRes.data.nft);
            }
          } catch (nftError) {
            logger.warn('NFT not found or not minted yet', { error: nftError instanceof Error ? nftError.message : String(nftError) });
          }
        } else {
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load memory';
      logger.error('Failed to load memory', { error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error : undefined);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDecrypt = async () => {
    if (!memory || !address) {
      toast.error('Please connect your wallet to unlock memory');
      return;
    }
    
    try {
      setDecrypting(true);
      
      const normalizedCapsuleId = getNormalizedCapsuleId();
      if (!normalizedCapsuleId) {
        throw new Error('Invalid capsule identifier');
      }
      
      const result = await unlockCapsule(normalizedCapsuleId);
      if (!result.decryptedData) {
        throw new Error('Capsule decrypted but returned empty payload');
      }

      // Log what we received for debugging
      logger.debug('Unlock result', {
        hasDecryptedData: !!result.decryptedData,
        dataSize: result.decryptedData?.length,
        hasMessage: !!result.message,
        messageLength: result.message?.length,
        hasVoice: !!result.voice?.data,
        voiceSize: result.voice?.data?.length,
        voiceMimeType: result.voice?.mimeType,
      });

      const mimeType = result.mimeType || memory?.fileType || 'application/octet-stream';
      const base64Data = bytesToBase64(new Uint8Array(result.decryptedData));
      
      // Set decrypted content as data URL
      setDecryptedContent(`data:${mimeType};base64,${base64Data}`);
      
      // Set message - make sure it's not empty string
      const message = result.message && result.message.trim() ? result.message : null;
      setUnlockMessage(message);
      logger.debug('Setting unlock message', { hasMessage: !!message, messageLength: message?.length });

      if (result.voice?.data && result.voice.data.length > 0) {
        const voiceMime = result.voice.mimeType || 'audio/webm';
        const voiceBase64 = bytesToBase64(new Uint8Array(result.voice.data));
        setVoiceData(`data:${voiceMime};base64,${voiceBase64}`);
        logger.debug('Setting voice data', { size: result.voice.data.length, mimeType: voiceMime });
      } else {
        setVoiceData(null);
        logger.debug('No voice data received');
      }

      setAiPreview(result.aiPreview || null);
      setInheritanceInfo(result.inheritance || null);

      toast.success('Memory unlocked!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unlock memory';
      toast.error(errorMessage);
    } finally {
      setDecrypting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: `3px solid ${colors.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto',
          }} />
          <p style={{ color: colors.textSecondary, marginTop: spacing.md }}>
            Loading memory...
          </p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (!memory) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: spacing.lg,
      }}>
        <p style={{ color: colors.text, fontSize: typography.fontSize.lg }}>
          Memory not found
        </p>
      </div>
    );
  }

  const walrusScanUrl = `https://walruscan.com/testnet/blob/${memory.blobId}`;
  const isImage = memory.fileType?.startsWith('image/') || false;
  const isVideo = memory.fileType?.startsWith('video/') || false;
  const isPDF = memory.fileType === 'application/pdf';
  const isText = memory.fileType?.startsWith('text/') || memory.fileType === 'application/json';
  const isAudio = memory.fileType?.startsWith('audio/') || false;
  const isUnlocked = memory.status === 'unlocked' || decryptedContent !== null;

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: spacing.xl,
    }}>
      {/* Header */}
      <div style={{
        ...cardStyles.base,
        padding: spacing.lg,
        marginBottom: spacing.lg,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: spacing.md,
          marginBottom: spacing.md,
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
            }}>
              <button
                onClick={() => navigate(-1)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.sm,
                  padding: spacing.sm,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.text,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.surfaceHover;
                  e.currentTarget.style.borderColor = colors.borderHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = colors.border;
                }}
              >
                <ArrowLeft size={20} />
              </button>
              <Logo size={28} showText={false} />
              <h1 style={{
                fontSize: typography.fontSize['2xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text,
                margin: 0,
              }}>
                Memory
              </h1>
            </div>
            
            {/* Inheritance Claim Component */}
            {address && (
              <InheritanceClaim 
                userAddress={address}
                onClaimed={(capsuleId) => {
                  // Refresh memory if this is the current capsule
                  if (memory && memory.memoryId === capsuleId) {
                    loadMemory();
                  }
                }}
              />
            )}
            
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: spacing.md,
              alignItems: 'center',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}>
                {isUnlocked ? (
                  <>
                    <Unlock size={16} style={{ color: colors.success }} />
                    <span style={{ color: colors.success, fontSize: typography.fontSize.sm }}>
                      Unlocked
                    </span>
                  </>
                ) : (
                  <>
                    <Lock size={16} style={{ color: colors.warning }} />
                    <span style={{ color: colors.warning, fontSize: typography.fontSize.sm }}>
                      Locked
                    </span>
                  </>
                )}
              </div>
              
              {memory.unlockCondition === 'time' && memory.unlockDateTime && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                }}>
                  <Calendar size={16} style={{ color: colors.textSecondary }} />
                  <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
                    Unlocks: {new Date(memory.unlockDateTime).toLocaleString()}
                  </span>
                </div>
              )}
              
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}>
                <Clock size={16} style={{ color: colors.textSecondary }} />
                <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
                  Created: {new Date(memory.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            gap: spacing.sm,
            flexWrap: 'wrap',
          }}>
            {!isUnlocked && (
              <button
                onClick={handleDecrypt}
                disabled={decrypting}
                style={{
                  ...buttonStyles,
                  background: colors.primary,
                  color: colors.background,
                  opacity: decrypting ? 0.6 : 1,
                  cursor: decrypting ? 'not-allowed' : 'pointer',
                }}
              >
                <Unlock size={16} />
                <span>{decrypting ? 'Unlocking...' : 'Unlock Memory'}</span>
              </button>
            )}
            
            <a
              href={walrusScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                ...buttonStyles,
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing.sm,
                background: colors.surface,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={16} />
              <span>View on WalrusScan</span>
            </a>
            {decryptedContent && (
              <button
                onClick={async () => {
                  try {
                    if (!memory || !address) return;
                    const memoryId = memory.memoryId;
                    const normalizedId = memoryId.startsWith('0x') ? memoryId : `0x${memoryId}`;
                    const response = await fetch(
                      `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/capsule/${encodeURIComponent(normalizedId)}/download?userAddress=${address}`,
                      {
                        headers: {
                          'X-API-Key': import.meta.env.VITE_API_KEY || '',
                          'x-user-address': address || '',
                        },
                      }
                    );
                    if (response.ok) {
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `capsule-${memoryId.slice(0, 8)}.jpg`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      toast.success('Image downloaded!');
                    } else {
                      const error = await response.json();
                      toast.error(error.error || 'Failed to download image');
                    }
                  } catch (error) {
                    logger.error('Download error', {}, error instanceof Error ? error : undefined);
                    toast.error('Failed to download image');
                  }
                }}
                style={{
                  ...buttonStyles,
                  background: 'transparent',
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <ImageIcon size={16} />
                <span>Download Image</span>
              </button>
            )}
          </div>
        </div>

        {/* File Info */}
        <div style={{
          display: 'flex',
          gap: spacing.md,
          flexWrap: 'wrap',
          paddingTop: spacing.md,
          borderTop: `1px solid ${colors.border}`,
        }}>
          <div>
            <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
              File Size: {((memory.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          <div>
            <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
              Type: {memory.fileType}
            </span>
          </div>
          <div>
            <span style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
              Blob ID: {memory.blobId.slice(0, 20)}...
            </span>
          </div>
        </div>

      {inheritanceInfo && (
        <div style={{
          marginTop: spacing.sm,
          padding: spacing.sm,
          background: colors.surface,
          borderRadius: borderRadius.sm,
          border: `1px solid ${colors.border}`,
        }}>
          <div style={{ color: colors.text, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold }}>
            Inheritance Mode Active
          </div>
          <div style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, marginTop: spacing.xs }}>
            Fallback wallets: {(inheritanceInfo.fallbackAddresses || []).join(', ') || 'n/a'}
          </div>
          <div style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs }}>
            Inactive after: {inheritanceInfo.inactiveAfterDays || 0} days
          </div>
        </div>
      )}
      </div>

      {/* Content Preview */}
      {decryptedContent && (
        <div style={{
          ...cardStyles.base,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}>
          <h2 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            Decrypted Content
          </h2>
          {isImage ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '200px',
            }}>
              <img
                src={decryptedContent}
                alt={memory.description || 'Memory'}
                style={{
                  maxWidth: '100%',
                  maxHeight: '600px',
                  height: 'auto',
                  borderRadius: borderRadius.md,
                  objectFit: 'contain',
                }}
                onError={(e) => {
                  logger.error('Image failed to load', {}, e instanceof Error ? e : undefined);
                  toast.error('Failed to load image. The data may be corrupted or in an unsupported format.');
                }}
              />
            </div>
          ) : isVideo ? (
            <video
              src={decryptedContent}
              controls
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: borderRadius.md,
              }}
            />
          ) : isAudio ? (
            <audio
              src={decryptedContent}
              controls
              style={{
                width: '100%',
              }}
            />
          ) : isPDF ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: spacing.md,
              alignItems: 'center',
            }}>
              <p style={{ color: colors.textSecondary, margin: 0 }}>
                PDF Document ({memory.fileType})
              </p>
              <iframe
                src={decryptedContent}
                style={{
                  width: '100%',
                  minHeight: '600px',
                  border: `1px solid ${colors.border}`,
                  borderRadius: borderRadius.md,
                }}
                title="PDF Viewer"
              />
              <a
                href={decryptedContent}
                download={`memory-${memory.memoryId.slice(0, 8)}.pdf`}
                style={{
                  ...buttonStyles,
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Download PDF
              </a>
            </div>
          ) : isText ? (
            <div style={{
              padding: spacing.lg,
              background: colors.surface,
              borderRadius: borderRadius.md,
              color: colors.text,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              fontSize: typography.fontSize.sm,
              maxHeight: '600px',
              overflow: 'auto',
              border: `1px solid ${colors.border}`,
            }}>
              {decryptedContent ? (() => {
                try {
                  // Extract base64 from data URL and decode
                  const base64Match = decryptedContent.match(/^data:[^;]+;base64,(.+)$/);
                  if (base64Match) {
                    const binaryString = atob(base64Match[1]);
                    // Convert binary string to text using TextDecoder for proper UTF-8 handling
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    const decoder = new TextDecoder('utf-8');
                    return decoder.decode(bytes);
                  }
                  return decryptedContent;
                } catch (e) {
                  logger.error('Failed to decode text content', {}, e instanceof Error ? e : undefined);
                  return 'Failed to decode text content';
                }
              })() : 'No content'}
            </div>
          ) : (
            <div style={{
              padding: spacing.lg,
              background: colors.surface,
              borderRadius: borderRadius.md,
              color: colors.text,
              border: `1px solid ${colors.border}`,
            }}>
              <p style={{ color: colors.textSecondary, marginBottom: spacing.md }}>
                File Type: {memory.fileType || 'unknown'}
              </p>
              <a
                href={decryptedContent}
                download={`memory-${memory.memoryId.slice(0, 8)}`}
                style={{
                  ...buttonStyles,
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Download File
              </a>
            </div>
          )}
        </div>
      )}

      {/* User Message Section */}
      {unlockMessage ? (
          <div style={{
            ...cardStyles.base,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            border: `1px solid rgba(0, 170, 255, 0.3)`,
            background: `linear-gradient(135deg, rgba(0, 170, 255, 0.08) 0%, rgba(0, 170, 255, 0.03) 100%)`,
            boxShadow: '0 4px 20px rgba(0, 170, 255, 0.1)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}>
              <MessageSquare size={20} style={{ color: colors.info }} />
              <h3 style={{
                color: colors.text,
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                margin: 0,
              }}>
                Your Message
              </h3>
            </div>
            <p style={{
              color: colors.text,
              fontSize: typography.fontSize.sm,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.8,
            }}>
              {unlockMessage}
            </p>
          </div>
      ) : null}

      {/* Voice Recording Section */}
      {voiceData ? (
          <div style={{
            ...cardStyles.base,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            border: `1px solid rgba(0, 255, 136, 0.3)`,
            background: `linear-gradient(135deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 255, 136, 0.03) 100%)`,
            boxShadow: '0 4px 20px rgba(0, 255, 136, 0.1)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}>
              <Mic size={20} style={{ color: colors.success }} />
              <h3 style={{
                color: colors.text,
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                margin: 0,
              }}>
                Voice Recording
              </h3>
            </div>
            <audio
              src={voiceData}
              controls
              style={{
                width: '100%',
                borderRadius: borderRadius.sm,
              }}
            />
          </div>
      ) : null}

      {/* AI Haiku Section */}
      {aiPreview && (
          <div style={{
            ...cardStyles.base,
            padding: spacing.lg,
            marginBottom: spacing.lg,
            border: `1px solid rgba(255, 255, 255, 0.15)`,
            background: `linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)`,
          }}>
            <h3 style={{
              color: colors.text,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.semibold,
              marginBottom: spacing.md,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              opacity: 0.8,
            }}>
              AI Glimpse
            </h3>
            <p style={{ 
              margin: 0, 
              color: colors.text, 
              fontSize: typography.fontSize.sm,
              fontStyle: 'italic',
              lineHeight: 1.8,
              opacity: 0.9,
            }}>
              {aiPreview}
            </p>
          </div>
        )}

      {/* NFT Display */}
      {nftData && (
        <div style={{ 
          marginBottom: spacing.lg,
          background: '#000',
          borderRadius: '8px',
          overflow: 'hidden',
          height: '300px',
        }}>
          <CapsuleOrb />
        </div>
      )}

    </div>
  );
}

