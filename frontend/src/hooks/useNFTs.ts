/**
 * Hook for loading and managing NFTs
 */

import { useState, useEffect, useCallback } from 'react';
import { useLumina } from './useLumina';
import { batchGetUnlockInfo } from '../services/capsuleService';
import { logger } from '../utils/logger';
import toast from 'react-hot-toast';

export interface NFT {
  nftId: string;
  capsuleId: string;
  glowIntensity: number;
  createdAt: number;
  mediaBlobId?: string;
}

export interface CapsuleUnlockInfo {
  unlockCondition?: 'time' | 'manual';
  unlockAt?: number;
  status?: 'locked' | 'unlocked';
}

export function useNFTs() {
  const { address, isConnected, listMyNFTs } = useLumina();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [loading, setLoading] = useState(false);
  const [capsuleUnlockInfo, setCapsuleUnlockInfo] = useState<Record<string, CapsuleUnlockInfo>>({});

  const loadNFTs = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    try {
      const myNFTs = await listMyNFTs();
      logger.info('Loaded NFTs from backend', {
        count: myNFTs.length,
        nfts: myNFTs.map(n => ({ 
          nftId: n.nftId, 
          capsuleId: n.capsuleId,
          glowIntensity: n.glowIntensity 
        }))
      });
      
      setNfts(myNFTs);
      
      if (myNFTs.length === 0) {
        toast('No NFTs found. Mint an NFT for your capsule to see it here!', { icon: '💎' });
      } else {
        loadCapsuleUnlockInfo(myNFTs).catch(err => {
          logger.error('Failed to load unlock info (non-critical)', {}, err instanceof Error ? err : undefined);
          const defaultUnlockInfo: Record<string, CapsuleUnlockInfo> = {};
          myNFTs.forEach(nft => {
            defaultUnlockInfo[nft.nftId] = {
              unlockCondition: 'manual',
              status: 'locked',
            };
          });
          setCapsuleUnlockInfo(defaultUnlockInfo);
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load NFTs';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address, listMyNFTs]);

  const loadCapsuleUnlockInfo = useCallback(async (nfts: NFT[]) => {
    if (!address) return;

    try {
      const capsuleIds = nfts.map(nft => {
        const capsuleIdStr = typeof nft.capsuleId === 'string' ? nft.capsuleId : String(nft.capsuleId || nft.nftId || '');
        return capsuleIdStr.startsWith('0x') ? capsuleIdStr.slice(2) : capsuleIdStr;
      });

      logger.debug('Loading unlock info for NFTs', {
        nftCount: nfts.length,
        capsuleIds: capsuleIds.slice(0, 5),
        nfts: nfts.map(n => ({ nftId: n.nftId, capsuleId: n.capsuleId })).slice(0, 5)
      });

      const batchUnlockInfo = await batchGetUnlockInfo(address, capsuleIds);
      
      logger.debug('Batch unlock info response', {
        responseKeys: Object.keys(batchUnlockInfo),
        responseCount: Object.keys(batchUnlockInfo).length,
        timeLockedCount: Object.values(batchUnlockInfo).filter((info: any) => info.unlockCondition === 'time').length,
        sampleData: Object.entries(batchUnlockInfo).slice(0, 5).map(([id, info]) => ({ id, info }))
      });

      const unlockInfoMap: Record<string, CapsuleUnlockInfo> = {};
      let timeLockedFound = 0;
      nfts.forEach(nft => {
        const capsuleIdStr = typeof nft.capsuleId === 'string' ? nft.capsuleId : String(nft.capsuleId || nft.nftId || '');
        const normalizedId = capsuleIdStr.startsWith('0x') ? capsuleIdStr.slice(2) : capsuleIdStr;
        const info = batchUnlockInfo[normalizedId] || batchUnlockInfo[`0x${normalizedId}`] || batchUnlockInfo[capsuleIdStr];
        
        const isTimeLocked = info?.unlockCondition === 'time';
        if (isTimeLocked) {
          timeLockedFound++;
          logger.info('Time-locked NFT found', {
            nftId: nft.nftId,
            capsuleIdStr,
            normalizedId,
            unlockCondition: info.unlockCondition,
            unlockAt: info.unlockAt,
            unlockAtDate: info.unlockAt ? new Date(info.unlockAt).toISOString() : 'N/A'
          });
        }
        
        logger.debug('Mapping unlock info for NFT', {
          nftId: nft.nftId,
          capsuleIdStr,
          normalizedId,
          availableKeys: Object.keys(batchUnlockInfo).slice(0, 5),
          foundInfo: !!info,
          isTimeLocked
        });
        
        if (info) {
          unlockInfoMap[nft.nftId] = {
            unlockCondition: info.unlockCondition,
            unlockAt: info.unlockAt,
            status: info.status,
          };
        } else {
          logger.warn('No unlock info found for NFT', {
            nftId: nft.nftId,
            capsuleIdStr,
            normalizedId,
            searchedKeys: [normalizedId, `0x${normalizedId}`, capsuleIdStr],
            availableKeys: Object.keys(batchUnlockInfo)
          });
          unlockInfoMap[nft.nftId] = {
            unlockCondition: 'manual',
            status: 'locked',
          };
        }
      });
      
      logger.debug('Final unlock info map', {
        totalMapped: Object.keys(unlockInfoMap).length,
        timeLockedCount: timeLockedFound,
        timeLockedNFTs: Object.entries(unlockInfoMap)
          .filter(([_, info]) => info.unlockCondition === 'time')
          .map(([nftId, info]) => ({ nftId, unlockAt: info.unlockAt }))
      });

      setCapsuleUnlockInfo(unlockInfoMap);
    } catch (error) {
      logger.error('Failed to load unlock info', {}, error instanceof Error ? error : undefined);
      const unlockInfoMap: Record<string, CapsuleUnlockInfo> = {};
      nfts.forEach(nft => {
        unlockInfoMap[nft.nftId] = {
          unlockCondition: 'manual',
          status: 'locked',
        };
      });
      setCapsuleUnlockInfo(unlockInfoMap);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadNFTs();
    } else {
      setNfts([]);
    }
  }, [isConnected, address, loadNFTs]);

  return {
    nfts,
    loading,
    capsuleUnlockInfo,
    reload: loadNFTs,
  };
}

