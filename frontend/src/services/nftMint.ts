/**
 * Browser-based NFT Minting Service
 * User signs and executes NFT minting directly from their wallet
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { WalletSigner } from './walletSigner';

const CAPSULE_NFT_PACKAGE_ID = import.meta.env.VITE_CAPSULE_NFT_PACKAGE_ID || import.meta.env.VITE_CAPSULE_PACKAGE_ID || '';
const SUI_FULLNODE_URL = import.meta.env.VITE_SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';

const suiClient = new SuiClient({ url: SUI_FULLNODE_URL });

export interface MintNFTOptions {
  capsuleId: string;
  mediaBlobId: string;
  message: string;
  voiceBlobId?: string;
  userAddress: string;
  signer: WalletSigner;
  unlockAt?: number; // Timestamp when NFT unlocks (0 = no time lock, unlocked immediately)
}

export interface MintNFTResult {
  nftId: string;
  txDigest: string;
  glowIntensity: number;
}

/**
 * Mint NFT for a capsule from user's wallet
 */
export async function mintCapsuleNFT(options: MintNFTOptions): Promise<MintNFTResult> {
  const { capsuleId, mediaBlobId, message, voiceBlobId = '', userAddress, signer, unlockAt = 0 } = options;

  if (!CAPSULE_NFT_PACKAGE_ID) {
    throw new Error('VITE_CAPSULE_NFT_PACKAGE_ID or VITE_CAPSULE_PACKAGE_ID is not configured');
  }

  // Convert strings to bytes for Move
  const capsuleIdBytes = new TextEncoder().encode(capsuleId);
  const mediaBlobIdBytes = new TextEncoder().encode(mediaBlobId);
  const messageBytes = new TextEncoder().encode(message);
  const voiceBlobIdBytes = voiceBlobId ? new TextEncoder().encode(voiceBlobId) : new Uint8Array(0);

  // Build transaction
  const tx = new Transaction();
  tx.setSender(userAddress);
  tx.setGasBudget(10000000n); // 0.01 SUI

  // Call mint_nft entry function
  tx.moveCall({
    target: `${CAPSULE_NFT_PACKAGE_ID}::capsule_nft::mint_nft`,
    arguments: [
      tx.pure.vector('u8', Array.from(capsuleIdBytes)),
      tx.pure.address(userAddress),
      tx.pure.vector('u8', Array.from(mediaBlobIdBytes)),
      tx.pure.vector('u8', Array.from(messageBytes)),
      tx.pure.vector('u8', Array.from(voiceBlobIdBytes)),
      tx.pure.u64(unlockAt), // Unlock timestamp (0 = no time lock)
    ],
  });

  // Sign and execute
  const result = await signer.signAndExecuteTransaction({
    transaction: tx,
    client: suiClient,
  });

  // Extract NFT ID from events
  let nftId = '';
  let glowIntensity = 200; // Default initial glow

  if (result.events) {
    for (const event of result.events) {
      if (event.type.includes('NFTMintedEvent')) {
        const parsed = event.parsedJson as any;
        if (parsed?.nft_id) {
          nftId = parsed.nft_id;
        }
        if (parsed?.glow_intensity !== undefined) {
          glowIntensity = parsed.glow_intensity;
        }
      }
    }
  }

  // If no event found, try to extract from effects
  if (!nftId && result.effects?.created) {
    const createdObjects = result.effects.created || [];
    if (createdObjects.length > 0) {
      nftId = createdObjects[0].reference.objectId;
    }
  }

  if (!nftId) {
    throw new Error('Failed to extract NFT ID from transaction result');
  }

  return {
    nftId,
    txDigest: result.digest,
    glowIntensity,
  };
}

