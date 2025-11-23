/**
 * NFT Card Component
 * Individual NFT card display
 */

import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { TentacleOrb } from './TentacleOrb';
import { colors, spacing, typography } from '../styles/theme';
import { encodeCapsuleIdToBase64 } from '../lib/utils';
import { logger } from '../utils/logger';
import { useUnlockProgress } from '../hooks/useUnlockProgress';
import type { NFT, CapsuleUnlockInfo } from '../hooks/useNFTs';

interface NFTCardProps {
  nft: NFT;
  unlockInfo?: CapsuleUnlockInfo;
  imageUrl?: string;
  showImageError: boolean;
  onLockedClick: () => void;
}

/**
 * Generate a deterministic random color palette based on capsule ID
 */
function generateColorPalette(capsuleId: string): { border: string; accent: string; gradient: string; orbColor: string } {
  const idString = String(capsuleId || '');
  let hash = 0;
  for (let i = 0; i < idString.length; i++) {
    const char = idString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  const seed = Math.abs(hash);
  const hue = (seed * 137.508) % 360;
  const saturation = 60 + (seed % 30);
  const lightness = 45 + (seed % 15);
  
  const accent = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const border = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
  const gradient = `linear-gradient(135deg, hsla(${hue}, ${saturation}%, ${lightness}%, 0.15), hsla(${hue}, ${saturation}%, ${lightness}%, 0.05))`;
  const orbColor = accent;
  
  return { border, accent, gradient, orbColor };
}

export function NFTCard({ nft, unlockInfo, imageUrl, showImageError, onLockedClick }: NFTCardProps) {
  const navigate = useNavigate();
  const unlockProgress = useUnlockProgress(nft, unlockInfo);
  const createdDate = new Date(nft.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const explorerUrl = `https://suiexplorer.com/object/${nft.nftId}?network=testnet`;
  
  const capsuleIdStr = typeof nft.capsuleId === 'string' ? nft.capsuleId : String(nft.capsuleId || nft.nftId || 'default');
  const cardColors = generateColorPalette(capsuleIdStr);

  const handleClick = () => {
    const now = Date.now();
    let isUnlocked = unlockProgress >= 100;
    
    if (unlockInfo?.unlockAt) {
      const unlockAt = typeof unlockInfo.unlockAt === 'number' ? unlockInfo.unlockAt : new Date(unlockInfo.unlockAt).getTime();
      if (now >= unlockAt) {
        isUnlocked = true;
      }
    }
    
    if (!isUnlocked) {
      onLockedClick();
      return;
    }

    try {
      const idForEncoding = capsuleIdStr.startsWith('0x') ? capsuleIdStr : `0x${capsuleIdStr}`;
      const encodedId = encodeCapsuleIdToBase64(idForEncoding);
      navigate(`/memory/${encodedId}`);
    } catch (error) {
      logger.error('Failed to encode capsule ID', { capsuleId: capsuleIdStr }, error instanceof Error ? error : undefined);
      navigate(`/memory/${capsuleIdStr}`);
    }
  };

  return (
    <div
      style={{
        background: '#000',
        borderRadius: '8px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        border: `1px solid ${cardColors.border}`,
        backgroundImage: cardColors.gradient,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `0 8px 24px ${cardColors.border}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: `${spacing.md} ${spacing.lg}`,
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: cardColors.accent,
          }} />
          <span style={{
            color: '#fff',
            fontSize: typography.fontSize.md,
            fontWeight: 500,
          }}>
            Memory Capsule
          </span>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: cardColors.accent,
            fontSize: typography.fontSize.xs,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <span>View on Sui Explorer</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Image or Orb */}
      <div style={{
        width: '100%',
        height: '280px',
        position: 'relative',
        background: '#000',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={handleClick}
      >
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          animation: 'breathe 4s ease-in-out infinite',
        }}>
              <TentacleOrb key={`tentacle-${capsuleIdStr}`} uniqueId={nft.nftId} />
        </div>
        
        {imageUrl && !showImageError ? (
          <img
            src={imageUrl}
            alt="Capsule memory"
            style={{
              position: 'relative',
              zIndex: 1,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : null}
      </div>

      {/* Information Section */}
      <div style={{
        padding: spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
      }}>
        {/* Status */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: typography.fontSize.xs,
            color: '#fff',
          }}>
            Status:
          </span>
          <span style={{
            fontSize: typography.fontSize.sm,
            color: cardColors.accent,
            fontWeight: 600,
          }}>
            Preserved
          </span>
        </div>

        {/* Memory Clarity */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: spacing.xs,
          }}>
            <span style={{
              fontSize: typography.fontSize.xs,
              color: '#fff',
            }}>
              Memory Clarity:
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <div style={{
              flex: 1,
              height: '6px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${unlockProgress}%`,
                background: `linear-gradient(90deg, ${cardColors.accent}, ${cardColors.accent}dd)`,
                borderRadius: '3px',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <span style={{
              fontSize: typography.fontSize.sm,
              color: cardColors.accent,
              fontWeight: 600,
              minWidth: '40px',
              textAlign: 'right',
            }}>
              {unlockProgress}%
            </span>
          </div>
        </div>

        {/* Captured */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: typography.fontSize.xs,
            color: '#fff',
          }}>
            Captured:
          </span>
          <span style={{
            fontSize: typography.fontSize.sm,
            color: '#fff',
          }}>
            {createdDate}
          </span>
        </div>

        {/* Memory ID */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: typography.fontSize.xs,
            color: '#fff',
          }}>
            Memory ID:
          </span>
          <span style={{
            fontSize: typography.fontSize.xs,
            color: '#fff',
            fontFamily: 'monospace',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {capsuleIdStr.slice(0, 16)}...
          </span>
        </div>
      </div>

      {/* Footer with View Memory Button */}
      <div style={{
        padding: `${spacing.md} ${spacing.lg}`,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          style={{
            background: cardColors.accent,
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            padding: `${spacing.sm} ${spacing.md}`,
            fontSize: typography.fontSize.sm,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            width: '100%',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          View Memory
        </button>
        <p style={{
          fontSize: typography.fontSize.xs,
          color: colors.textSecondary,
          margin: 0,
          textAlign: 'center',
          opacity: 0.7,
        }}>
          A personal memory preserved forever on the blockchain
        </p>
      </div>
    </div>
  );
}

