/**
 * Hook for calculating unlock progress for NFTs
 */

import { useMemo } from 'react';
import { logger } from '../utils/logger';
import type { NFT, CapsuleUnlockInfo } from './useNFTs';

export function useUnlockProgress(
  nft: NFT,
  unlockInfo: CapsuleUnlockInfo | undefined
): number {
  return useMemo(() => {
    let unlockProgress = 0;

    if (nft.glowIntensity === 255 || unlockInfo?.status === 'unlocked') {
      unlockProgress = 100;
    } else if (unlockInfo) {
      const now = Date.now();

      if (unlockInfo.unlockCondition === 'manual') {
        unlockProgress = 100;
      } else if (unlockInfo.unlockAt) {
        const unlockAt = typeof unlockInfo.unlockAt === 'number' ? unlockInfo.unlockAt : new Date(unlockInfo.unlockAt).getTime();

        if (now >= unlockAt) {
          unlockProgress = 100;
          if (unlockInfo.unlockCondition === 'time') {
            logger.info('Time-locked NFT is now unlocked', { nftId: nft.nftId });
          }
        } else if (unlockInfo.unlockCondition === 'time') {
          const createdAt = typeof nft.createdAt === 'number' ? nft.createdAt : new Date(nft.createdAt).getTime();
          const totalTime = unlockAt - createdAt;
          const elapsedTime = now - createdAt;

          if (totalTime > 0 && elapsedTime >= 0) {
            const rawProgress = (elapsedTime / totalTime) * 100;
            unlockProgress = Math.min(99, Math.max(1, Math.round(rawProgress)));
            if (rawProgress > 0 && rawProgress < 0.5) {
              unlockProgress = 1;
            }
            logger.debug('Progress calculated for NFT', {
              nftId: nft.nftId,
              elapsedTime,
              totalTime,
              rawProgress,
              roundedProgress: unlockProgress,
              unlockAtDate: new Date(unlockAt).toISOString(),
              createdAtDate: new Date(createdAt).toISOString()
            });
          } else {
            unlockProgress = 0;
            logger.warn('Invalid time range for NFT', { nftId: nft.nftId, totalTime, elapsedTime });
          }
        } else {
          unlockProgress = 0;
        }
      } else {
        if (nft.glowIntensity > 200) {
          unlockProgress = Math.round((nft.glowIntensity / 255) * 99);
        } else {
          unlockProgress = 0;
        }
      }
    } else {
      if (nft.glowIntensity === 255) {
        unlockProgress = 100;
      } else if (nft.glowIntensity > 200) {
        unlockProgress = Math.round((nft.glowIntensity / 255) * 99);
      } else {
        unlockProgress = 0;
      }
    }

    return unlockProgress;
  }, [nft, unlockInfo]);
}

