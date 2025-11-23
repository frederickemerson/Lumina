/**
 * NFT Share Component
 * Allows users to share NFTs with other wallet addresses
 */

import { useState } from 'react';
import { useWalletKit } from '@mysten/wallet-kit';
import { useZkLogin } from '../wallet/zkLogin';
import apiClient from '../services/api';
import { colors, spacing, typography, cardStyles, buttonStyles, inputStyles } from '../styles/theme';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Send, CheckCircle, X, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { logger } from '../utils/logger';

interface NFTShareProps {
  nftId: string;
  capsuleId?: string;
  onShareComplete?: () => void;
}

interface ShareRecord {
  shareId: string;
  nftId: string;
  fromAddress: string;
  toAddress: string;
  sharedAt: string;
  unlocked: boolean;
}

export function NFTShare({ nftId, onShareComplete }: NFTShareProps) {
  const { currentWallet } = useWalletKit();
  const zkLogin = useZkLogin();
  const address = currentWallet?.accounts[0]?.address || null;
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sharedNFTs, setSharedNFTs] = useState<ShareRecord[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  const userAddress = address || zkLogin.address || '';

  const handleShare = async () => {
    if (!recipientAddress.trim()) {
      toast.error('Please enter a recipient address');
      return;
    }

    if (recipientAddress === userAddress) {
      toast.error('Cannot share NFT with yourself');
      return;
    }

    // Basic address validation (Sui addresses start with 0x and are 66 chars)
    if (!recipientAddress.startsWith('0x') || recipientAddress.length !== 66) {
      toast.error('Invalid Sui address format');
      return;
    }

    try {
      setSharing(true);
      const res = await apiClient.post('/api/capsule/nft/share', {
        userAddress,
        nftId,
        recipientAddress: recipientAddress.trim(),
      });

      if (res.data.success) {
        toast.success('NFT shared successfully!');
        setRecipientAddress('');
        if (onShareComplete) {
          onShareComplete();
        }
        // Reload shared NFTs
        loadSharedNFTs();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to share NFT';
      logger.error('Failed to share NFT', {}, error instanceof Error ? error : undefined);
      toast.error(errorMessage);
    } finally {
      setSharing(false);
    }
  };

  const loadSharedNFTs = async () => {
    try {
      setLoadingShares(true);
      // For now, we'll show a placeholder
      setSharedNFTs([]);
    } catch (error) {
      logger.error('Failed to load shared NFTs', {}, error instanceof Error ? error : undefined);
    } finally {
      setLoadingShares(false);
    }
  };

  return (
    <div style={{
      ...cardStyles.base,
      padding: spacing.xl,
    }}>
      <h3 style={{
        fontSize: typography.fontSize.lg,
        fontWeight: typography.fontWeight.bold,
        color: colors.text,
        marginBottom: spacing.lg,
      }}>
        Share NFT
      </h3>

      {/* Share Form */}
      <div style={{ marginBottom: spacing.xl }}>
        <Label style={{ marginBottom: spacing.xs }}>
          Recipient Wallet Address
        </Label>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            style={{
              ...inputStyles.base,
              flex: 1,
              fontFamily: typography.fontFamily.mono,
              fontSize: typography.fontSize.sm,
            }}
          />
          <Button
            onClick={handleShare}
            disabled={sharing || !recipientAddress.trim()}
            style={{
              ...buttonStyles,
              background: colors.primary,
              color: colors.background,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
            }}
          >
            {sharing ? (
              <>
                <div style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${colors.background}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span>Sharing...</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span>Share</span>
              </>
            )}
          </Button>
        </div>
        <p style={{
          color: colors.textSecondary,
          fontSize: typography.fontSize.xs,
          marginTop: spacing.xs,
        }}>
          Transfer this NFT to another wallet address. They can unlock it with the vault's secret phrase.
        </p>
      </div>

      {/* Shared NFTs List */}
      <div>
        <h4 style={{
          fontSize: typography.fontSize.md,
          fontWeight: typography.fontWeight.medium,
          color: colors.text,
          marginBottom: spacing.md,
        }}>
          Shared NFTs
        </h4>
        {loadingShares ? (
          <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
            Loading...
          </p>
        ) : sharedNFTs.length === 0 ? (
          <div style={{
            ...cardStyles.base,
            padding: spacing.md,
            textAlign: 'center',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.fontSize.sm,
              margin: 0,
            }}>
              No NFTs shared yet
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {sharedNFTs.map((share) => (
              <div
                key={share.shareId}
                style={{
                  ...cardStyles.base,
                  padding: spacing.md,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    marginBottom: spacing.xs,
                  }}>
                    {share.unlocked ? (
                      <CheckCircle size={16} style={{ color: colors.success }} />
                    ) : (
                      <X size={16} style={{ color: colors.warning }} />
                    )}
                    <span style={{
                      color: colors.text,
                      fontSize: typography.fontSize.sm,
                      fontWeight: typography.fontWeight.medium,
                    }}>
                      {share.unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <p style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                    fontFamily: typography.fontFamily.mono,
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    To: {share.toAddress}
                  </p>
                  <p style={{
                    color: colors.textSecondary,
                    fontSize: typography.fontSize.xs,
                    margin: 0,
                    marginTop: spacing.xs,
                  }}>
                    {new Date(share.sharedAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    window.open(`https://suiexplorer.com/object/${share.nftId}`, '_blank');
                  }}
                  style={{
                    ...buttonStyles,
                    background: 'transparent',
                    border: `1px solid ${colors.border}`,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    fontSize: typography.fontSize.xs,
                  }}
                >
                  <ExternalLink size={14} />
                  <span>View on Explorer</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

