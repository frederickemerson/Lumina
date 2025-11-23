/**
 * Hook for loading NFT images
 */

import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import type { NFT } from './useNFTs';

export function useNFTImages(nfts: NFT[], address: string | null) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!address || nfts.length === 0) {
      setImageUrls({});
      setImageErrors({});
      return;
    }

    const loadNFTImages = async () => {
      const newImageUrls: Record<string, string> = {};
      
      for (const nft of nfts) {
        if (nft.mediaBlobId) {
          try {
            const capsuleIdStr = typeof nft.capsuleId === 'string' ? nft.capsuleId : String(nft.capsuleId || nft.nftId || '');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/capsule/${capsuleIdStr}/nft/preview`, {
              headers: {
                'X-API-Key': import.meta.env.VITE_API_KEY || '',
                'x-user-address': address || '',
              },
            });
            
            if (response.ok) {
              const previewData = await response.json();
              if (previewData.preview && previewData.fileType?.startsWith('image/')) {
                newImageUrls[nft.nftId] = previewData.preview;
              } else {
                setImageErrors(prev => ({ ...prev, [nft.nftId]: true }));
              }
            } else {
              setImageErrors(prev => ({ ...prev, [nft.nftId]: true }));
            }
          } catch (error) {
            setImageErrors(prev => ({ ...prev, [nft.nftId]: true }));
            logger.debug('Could not load NFT image', { nftId: nft.nftId, error });
          }
        }
      }
      
      if (Object.keys(newImageUrls).length > 0) {
        setImageUrls(prev => ({ ...prev, ...newImageUrls }));
      }
    };

    loadNFTImages();
  }, [nfts, address]);

  return { imageUrls, imageErrors };
}

