/**
 * Capsule Retrieval Endpoints
 * Handles getting capsule metadata, listing capsules, and NFT queries
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { sanitizeAddress } from '../../utils/sanitize';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import EvidenceService from '../../services/evidence';
import NFTService from '../../services/nftService';
import { getDatabase } from '../../db/database';
import { cacheConfigs } from '../../middleware/cache';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

function parseKeypair(keyString: string): Ed25519Keypair {
  if (keyString.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(keyString);
  } else {
    return Ed25519Keypair.fromSecretKey(fromB64(keyString));
  }
}

let walrusSigner: Ed25519Keypair | undefined = undefined;
if (process.env.WALRUS_SERVICE_KEYPAIR) {
  try {
    walrusSigner = parseKeypair(process.env.WALRUS_SERVICE_KEYPAIR);
  } catch (error) {
    logger.error('Failed to parse WALRUS_SERVICE_KEYPAIR', { error });
  }
}

const evidenceService = new EvidenceService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  walrusSigner,
});

const CAPSULE_PACKAGE_ID = process.env.CAPSULE_PACKAGE_ID || '0x6d0be913760c1606a9c390990a3a07bed24235d728f0fc6cacf1dca792d9a5d0';
const nftService = new NFTService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  packageId: CAPSULE_PACKAGE_ID,
  signer: walrusSigner,
});

export function createRetrieveRouter(): Router {
  const router = Router();

  /**
   * List user's capsules
   * GET /api/capsule/my-capsules
   */
  router.get('/my-capsules', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
      if (!rawUserAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      const userAddress = sanitizeAddress(rawUserAddress);
      const vaults = await evidenceService.listMyVaults(userAddress);
      const db = getDatabase();

      const capsules = await Promise.all(vaults.map(async (vault) => {
        let unlockAt: number | undefined;
        let unlockCondition: 'time' | 'manual' = 'manual';
        
        try {
          const normalizedCapsuleId = vault.vaultId.startsWith('0x') ? vault.vaultId.slice(2) : vault.vaultId;
          const [policyRows] = await db.execute(
            'SELECT policy_type, policy_data FROM capsule_policies WHERE capsule_id = ?',
            [normalizedCapsuleId]
          ) as [Array<{ policy_type: string; policy_data: string }>, any];
          
          if (policyRows.length > 0) {
            const policy = policyRows[0];
            unlockCondition = policy.policy_type === 'time_lock' ? 'time' : 'manual';
            if (policy.policy_data) {
              try {
                const policyData = JSON.parse(policy.policy_data);
                unlockAt = policyData.unlockAt || policyData.unlock_at;
              } catch (parseError) {
                logger.warn('Failed to parse policy data', { error: parseError, capsuleId: vault.vaultId });
              }
            }
          }
        } catch (policyError) {
          logger.warn('Could not retrieve policy data', { error: policyError, capsuleId: vault.vaultId });
        }

        return {
          capsuleId: vault.vaultId,
          blobId: vault.blobId,
          createdAt: vault.createdAt,
          unlockAt: unlockAt || null,
          unlockCondition,
          status: vault.releaseTriggered ? 'unlocked' : 'locked',
        };
      }));

      res.json({
        success: true,
        capsules,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list capsules', { error, userAddress: req.headers['x-user-address'] });
      res.status(500).json({ error: 'Failed to list capsules', details: errorMessage });
    }
  });

  /**
   * List user's NFTs
   * GET /api/capsule/my-nfts
   */
  router.get('/my-nfts', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
      if (!rawUserAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      const userAddress = sanitizeAddress(rawUserAddress);
      const nfts = await nftService.listUserNFTs(userAddress);
      res.json({
        success: true,
        nfts,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list NFTs', { error });
      res.status(500).json({ error: 'Failed to list NFTs', details: errorMessage });
    }
  });

  /**
   * Batch get capsule unlock info
   * POST /api/capsule/batch-unlock-info
   */
  router.post('/batch-unlock-info', apiKeyAuth, async (req: Request, res: Response) => {
    try {
      const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
      if (!rawUserAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      const userAddress = sanitizeAddress(rawUserAddress);
      const { capsuleIds } = req.body;
      
      if (!Array.isArray(capsuleIds) || capsuleIds.length === 0) {
        return res.status(400).json({ error: 'capsuleIds must be a non-empty array' });
      }

      const db = getDatabase();
      const normalizedIds = capsuleIds.map(id => {
        const normalized = id.startsWith('0x') ? id.slice(2) : id;
        return normalized.toLowerCase();
      });

      const placeholders = normalizedIds.map(() => '?').join(',');
      const [rows] = await db.execute(
        `SELECT capsule_id, policy_type, policy_data FROM capsule_policies WHERE LOWER(capsule_id) IN (${placeholders})`,
        normalizedIds
      ) as [Array<{ capsule_id: string; policy_type: string; policy_data: string }>, unknown];

      const unlockInfo: Record<string, { unlockCondition: 'time' | 'manual'; unlockAt?: number; status: 'locked' | 'unlocked' }> = {};
      
      for (const row of rows) {
        const originalId = normalizedIds.find(nid => nid === row.capsule_id.toLowerCase());
        if (!originalId) continue;

        const policyType = row.policy_type;
        const policyData = row.policy_data ? JSON.parse(row.policy_data) : null;
        
        const unlockCondition = policyType === 'time_lock' ? 'time' : 'manual';
        const unlockAt = policyData?.unlockAt || policyData?.unlock_at;
        
        let status: 'locked' | 'unlocked' = 'locked';
        if (unlockCondition === 'manual') {
          status = 'unlocked';
        } else if (unlockAt) {
          status = Date.now() >= unlockAt ? 'unlocked' : 'locked';
        }

        unlockInfo[originalId] = {
          unlockCondition,
          unlockAt,
          status,
        };
      }

      for (const id of normalizedIds) {
        if (!unlockInfo[id]) {
          unlockInfo[id] = {
            unlockCondition: 'manual',
            status: 'locked',
          };
        }
      }

      res.json({
        success: true,
        unlockInfo,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get batch unlock info', { error });
      res.status(500).json({ error: 'Failed to get batch unlock info', details: errorMessage });
    }
  });

  /**
   * Get NFT by capsule ID
   * GET /api/capsule/:capsuleId/nft
   */
  router.get('/:capsuleId/nft', async (req: Request, res: Response) => {
    try {
      const { capsuleId } = req.params;
      const nft = await nftService.getNFTByCapsuleId(capsuleId);
      if (!nft) {
        return res.status(404).json({ error: 'NFT not found' });
      }
      res.json({
        success: true,
        nft,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get NFT', { error });
      res.status(500).json({ error: 'Failed to get NFT', details: errorMessage });
    }
  });

  /**
   * Get capsule metadata
   * GET /api/capsule/:capsuleId
   */
  router.get('/:capsuleId', cacheConfigs.capsuleMetadata, async (req: Request, res: Response) => {
    try {
      const { capsuleId } = req.params;
      const rawUserAddress = req.body.userAddress || req.headers['x-user-address'] as string || req.query.userAddress as string;
      let userAddress: string | undefined;
      
      if (rawUserAddress) {
        try {
          userAddress = sanitizeAddress(rawUserAddress);
        } catch (sanitizeError) {
          logger.warn('Failed to sanitize userAddress', { error: sanitizeError, rawUserAddress });
        }
      }
      
      // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
      // The router.param should have already decoded it, but handle both cases
      let normalizedCapsuleId = capsuleId;
      if (capsuleId.startsWith('0x')) {
        normalizedCapsuleId = capsuleId.slice(2);
      }
      
      let effectiveUserAddress = userAddress;
      if (!effectiveUserAddress) {
        const db = getDatabase();
        const [vaultRows] = await db.execute(
          'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
          [normalizedCapsuleId]
        ) as [any[], any];
        if (vaultRows.length > 0) {
          effectiveUserAddress = vaultRows[0].user_address;
        }
      }
      
      // Log for debugging
      logger.debug('Retrieving capsule', { 
        originalCapsuleId: capsuleId, 
        normalizedCapsuleId,
        userAddress: effectiveUserAddress || 'not provided'
      });
      
      // userAddress is optional - if not provided, getEvidence will just use vaultId
      const evidence = await evidenceService.getEvidence(normalizedCapsuleId, effectiveUserAddress);

      const db = getDatabase();
      let nftId: string | null = null;
      try {
        const [nftRows] = await db.execute(
          'SELECT nft_id FROM capsule_nfts WHERE capsule_id = ?',
          [normalizedCapsuleId]
        ) as [any[], any];
        if (nftRows.length > 0) {
          nftId = nftRows[0].nft_id;
        }
      } catch (nftError) {
        // NFT retrieval failed - non-critical
      }

      let unlockAt: number | undefined;
      let unlockCondition: 'time' | 'manual' = 'manual';
      try {
        const [policyRows] = await db.execute(
          'SELECT policy_type, policy_data FROM capsule_policies WHERE capsule_id = ?',
          [normalizedCapsuleId]
        ) as [Array<{ policy_type: string; policy_data: string }>, any];
        if (policyRows.length > 0) {
          const policy = policyRows[0];
          unlockCondition = policy.policy_type === 'time_lock' ? 'time' : 'manual';
          if (policy.policy_data) {
            try {
              const policyData = JSON.parse(policy.policy_data);
              unlockAt = policyData.unlockAt || policyData.unlock_at;
            } catch (parseError) {
              logger.warn('Failed to parse policy data', { error: parseError, capsuleId: normalizedCapsuleId });
            }
          }
        }
      } catch (policyError) {
        logger.warn('Could not retrieve policy data', { error: policyError, capsuleId: normalizedCapsuleId });
      }

      res.json({
        success: true,
        capsule: {
          capsuleId: evidence.vaultId,
          memoryId: evidence.vaultId,
          vaultId: evidence.vaultId,
          blobId: evidence.blobId,
          encryptedDataId: evidence.encryptedDataId,
          fileSize: evidence.metadata.fileSize,
          fileType: evidence.metadata.fileType,
          description: evidence.metadata.description,
          createdAt: evidence.createdAt,
          nftId: nftId || undefined,
          unlockAt,
          unlockCondition,
          status: 'locked' as const,
        },
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to get capsule', { 
        error, 
        capsuleId: req.params.capsuleId,
        errorMessage 
      });
      res.status(500).json({ error: 'Failed to get capsule', details: errorMessage });
    }
  });

  return router;
}

