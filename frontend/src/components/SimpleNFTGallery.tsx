/**
 * Simple NFT Gallery Component
 * Displays NFTs as simple cards with the CapsuleOrb and metadata
 */

import { useState } from 'react';
import { useLumina } from '../hooks/useLumina';
import { colors, spacing } from '../styles/theme';
import { CapsuleOrb } from './CapsuleOrb';
import { useNFTs } from '../hooks/useNFTs';
import { useNFTImages } from '../hooks/useNFTImages';
import { NFTCard } from './NFTCard';
import { LockedModal } from './LockedModal';

export function SimpleNFTGallery() {
  const { isConnected, address } = useLumina();
  const { nfts, loading, capsuleUnlockInfo } = useNFTs();
  const { imageUrls, imageErrors } = useNFTImages(nfts, address);

  const [showLockedModal, setShowLockedModal] = useState(false);
  const [selectedLockedCapsule, setSelectedLockedCapsule] = useState<{ unlockAt?: number | string } | null>(null);

  if (!isConnected || !address) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: spacing.lg,
      }}>
        <p style={{ color: colors.textSecondary }}>
          Please connect your wallet to view your NFTs
        </p>
      </div>
    );
  }

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
            width: '200px',
            height: '200px',
            margin: '0 auto',
          }}>
            <CapsuleOrb />
          </div>
          <p style={{ color: colors.textSecondary, marginTop: spacing.md }}>
            Loading your NFTs...
          </p>
        </div>
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: spacing.lg,
      }}>
        <div style={{
          width: '200px',
          height: '200px',
        }}>
          <CapsuleOrb />
        </div>
        <p style={{ color: colors.textSecondary }}>
          No NFTs found. Mint an NFT for your capsule to see it here!
        </p>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: spacing.lg,
        padding: spacing.lg,
      }}>
        {nfts.map((nft) => (
          <NFTCard
            key={nft.nftId}
            nft={nft}
            unlockInfo={capsuleUnlockInfo[nft.nftId]}
            imageUrl={imageUrls[nft.nftId]}
            showImageError={imageErrors[nft.nftId] || false}
            onLockedClick={() => {
              setSelectedLockedCapsule({ unlockAt: capsuleUnlockInfo[nft.nftId]?.unlockAt });
              setShowLockedModal(true);
            }}
          />
        ))}
      </div>
      
      {showLockedModal && (
        <LockedModal
          unlockAt={selectedLockedCapsule?.unlockAt}
          onClose={() => setShowLockedModal(false)}
        />
      )}
    </>
  );
}
