/**
 * Capsule API Endpoints
 * Handles LUMINA capsule creation, retrieval, unlock, and NFT minting
 * using Seal Protocol threshold encryption and Walrus storage.
 */

import 'dotenv/config';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth, walletAuth, optionalWalletAuth } from '../middleware/auth';
import { sanitizeAddress } from '../utils/sanitize';
import { getErrorMessage } from '../types/common';
import { logger } from '../utils/logger';
import EvidenceService from '../services/evidence';
import NFTService from '../services/nftService';
import sealService from '../services/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { generateHaiku } from '../services/aiHaiku';
import ZKOriginProofService from '../services/zkOriginProof';
import ProvenanceService from '../services/provenance';
import { getDatabase } from '../db/database';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { validateBody, validateParams, schemas } from '../middleware/validation';
import { auditLogMiddleware } from '../middleware/auditLog';
import { publicUnlockLimiter, uploadLimiter } from '../middleware/rateLimit';
import { cacheConfigs } from '../middleware/cache';
import WalrusService from '../services/walrus';
import { combineCapsulePayload, splitCapsulePayload } from '../utils/capsulePayload';
import { isValidImage, tryFixImageData, validateFileByMagicNumber } from '../utils/imageValidation';
import { PolicyService } from '../services/policyService';
import { InheritanceService } from '../services/inheritanceService';

const router = Router();

const asciiCapsuleIdPattern = /^\d+(?:,\d+)+$/;
function decodeAsciiCapsuleId(value: string): string | null {
  try {
    const chars = value.split(',').map(part => {
      const num = Number(part.trim());
      if (!Number.isFinite(num) || num < 0 || num > 255) {
        throw new Error('invalid char code');
      }
      return String.fromCharCode(num);
    });
    const decoded = chars.join('');
    if (/^[a-fA-F0-9]{64}$/.test(decoded)) {
      return `0x${decoded}`;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Decode base64 URL-safe string to capsule ID
 * @param base64Id - Base64 URL-safe encoded string
 * @returns Hex string with 0x prefix, or null if invalid
 */
function decodeBase64CapsuleId(base64Id: string): string | null {
  try {
    // Restore URL-safe characters: - to +, _ to /
    let base64 = base64Id.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64 to buffer
    const buffer = Buffer.from(base64, 'base64');
    
    // Convert buffer to hex string
    const hex = buffer.toString('hex');
    
    // Validate it's a 64-character hex string (32 bytes)
    if (/^[a-fA-F0-9]{64}$/.test(hex)) {
      return `0x${hex}`;
    }
    
    return null;
  } catch {
    return null;
  }
}

function resolvePolicyType(policy: Record<string, unknown> | undefined): string {
  if (!policy) {
    return 'none';
  }
  if (policy.sharedOwners && Array.isArray(policy.sharedOwners) && policy.sharedOwners.length) {
    return 'multi_party';
  }
  if (policy.inheritance) {
    return 'inheritance';
  }
  if (policy.unlockCondition === 'time' || policy.unlockAt) {
    return 'time_lock';
  }
  return 'manual';
}

async function fetchInheritanceSettings(capsuleId: string) {
  const db = getDatabase();
  const [rows] = await db.execute(
    'SELECT fallback_addresses, inactive_after_days, last_ping, auto_transfer FROM capsule_inheritance WHERE capsule_id = ?',
    [capsuleId]
  ) as [Array<{ fallback_addresses: string; inactive_after_days: number; last_ping: Date | null; auto_transfer: number }>, unknown];

  if (!rows.length) {
    return null;
  }

  return {
    fallbackAddresses: rows[0].fallback_addresses ? JSON.parse(rows[0].fallback_addresses) : [],
    inactiveAfterDays: rows[0].inactive_after_days,
    lastPing: rows[0].last_ping,
    autoTransfer: Boolean(rows[0].auto_transfer),
  };
}

async function fetchContributions(capsuleId: string, limit = 20) {
  const db = getDatabase();
  // MySQL2 doesn't support parameterized LIMIT, so we need to interpolate it
  // Ensure limit is a safe integer (max 1000 to prevent abuse)
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 1000);
  const [rows] = await db.execute(
    `SELECT contribution_id, contributor_address, payload, created_at FROM capsule_contributions WHERE capsule_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [capsuleId]
  ) as [Array<{ contribution_id: string; contributor_address: string; payload: string; created_at: Date }>, unknown];

  return rows.map((row) => ({
    contributionId: row.contribution_id,
    contributorAddress: row.contributor_address,
    payload: (() => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return { message: row.payload };
      }
    })(),
    createdAt: row.created_at,
  }));
}

function mimeToContentCategory(mime?: string): 'image' | 'video' | 'audio' | 'text' | undefined {
  if (!mime) return undefined;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return undefined;
}

router.param('capsuleId', (req, _res, next, value: string) => {
  if (typeof value === 'string') {
    // Try base64 decoding first (new format)
    const base64Decoded = decodeBase64CapsuleId(value);
    if (base64Decoded) {
      req.params.capsuleId = base64Decoded;
      return next();
    }
    
    // Fall back to ASCII codes (backward compatibility)
    if (asciiCapsuleIdPattern.test(value)) {
      const decoded = decodeAsciiCapsuleId(value);
      if (decoded) {
        req.params.capsuleId = decoded;
      }
    }
  }
  next();
});

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max (reduced from 100GB for security)
  },
  fileFilter: (req, file, cb) => {
    // Validate file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/webm',
      'application/pdf', 'text/plain', 'application/json',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: images, videos, audio, PDF, text, JSON'));
    }
  },
});

/**
 * Parse keypair from either Sui format (suiprivkey1...) or base64
 */
function parseKeypair(keyString: string): Ed25519Keypair {
  if (keyString.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(keyString);
  } else {
    return Ed25519Keypair.fromSecretKey(fromB64(keyString));
  }
}

// Initialize services
let walrusSigner: Ed25519Keypair | undefined = undefined;
if (process.env.WALRUS_SERVICE_KEYPAIR) {
  try {
    walrusSigner = parseKeypair(process.env.WALRUS_SERVICE_KEYPAIR);
    logger.debug('Walrus signer initialized', { address: walrusSigner.toSuiAddress() });
  } catch (error) {
    logger.error('Failed to parse WALRUS_SERVICE_KEYPAIR', { error });
  }
}

const evidenceService = new EvidenceService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  walrusSigner,
});

const suiClient = new SuiClient({
  url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443',
});

const CAPSULE_PACKAGE_ID = process.env.CAPSULE_PACKAGE_ID || '0x6d0be913760c1606a9c390990a3a07bed24235d728f0fc6cacf1dca792d9a5d0';
const nftService = new NFTService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  packageId: CAPSULE_PACKAGE_ID,
  signer: walrusSigner,
});
const policyService = new PolicyService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  signer: walrusSigner,
});
const inheritanceService = new InheritanceService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  signer: walrusSigner,
});
const zkOriginProofService = new ZKOriginProofService({
  nautilusTeeUrl: process.env.NAUTILUS_TEE_URL,
});
const provenanceService = new ProvenanceService();
/**
 * Upload capsule (memory vault)
 * POST /api/capsule/upload
 * Handles server-side encryption, Walrus upload, Seal wrapping, and NFT minting.
 */
router.post('/upload',
  walletAuth,
  apiKeyAuth,
  uploadLimiter,
  auditLogMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const rawUserAddress = req.body.userAddress || req.headers['x-user-address'];
      if (!rawUserAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }

      const userAddress = sanitizeAddress(rawUserAddress);
      const fileBuffer = req.file.buffer;
      
      // Validate file by magic number
      const fileValidation = validateFileByMagicNumber(fileBuffer, req.file.mimetype);
      if (!fileValidation.valid) {
        logger.warn('File validation failed', {
          declaredMimeType: req.file.mimetype,
          error: fileValidation.error,
          fileName: req.file.originalname,
        });
        return res.status(400).json({
          error: 'Invalid file',
          details: fileValidation.error || 'File signature does not match declared type',
        });
      }
      
      const description = req.body.description as string | undefined;
      const message = (req.body.message as string | undefined)?.trim();
      const voiceBlobId = req.body.voiceBlobId as string | undefined;
      const soulbound = req.body.soulbound === 'true';

      // Log what we received
      logger.debug('Upload request received', {
        fileSize: fileBuffer.length,
        fileType: req.file.mimetype,
        hasMessage: !!message,
        messageLength: message?.length || 0,
        messagePreview: message ? `${message.substring(0, 50)}...` : null,
        hasVoiceBlobId: !!voiceBlobId,
        voiceBlobId: voiceBlobId || null,
        hasDescription: !!description,
        allBodyKeys: Object.keys(req.body),
      });

      let tags: string[] | undefined;
      if (req.body.tags) {
        try {
          const parsed = JSON.parse(req.body.tags as string);
          if (Array.isArray(parsed)) {
            tags = parsed.map((tag) => String(tag)).slice(0, 20);
          }
        } catch (error) {
          logger.warn('Failed to parse tags', { error });
        }
      }

      // If message or voice is provided, combine them with the file into a single payload
      let dataToEncrypt: Buffer = fileBuffer;
      let voiceData: Buffer | null = null;
      
        logger.debug('Checking if payload combination is needed', {
        hasMessage: !!message,
        messageValue: message || null,
        hasVoiceBlobId: !!voiceBlobId,
        voiceBlobIdValue: voiceBlobId || null,
        willCombine: !!(message || voiceBlobId),
      });
      
      if (message || voiceBlobId) {
        logger.debug('Combining file with message and/or voice into payload', {
          hasMessage: !!message,
          messageLength: message?.length || 0,
          hasVoiceBlobId: !!voiceBlobId,
          fileType: req.file.mimetype,
        });

        // Fetch voice data from Walrus if voiceBlobId is provided
        if (voiceBlobId) {
          try {
            const walrusService = new WalrusService({
              network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
            });
            const voiceBlob = await walrusService.getBlob(voiceBlobId);
            if (voiceBlob.data) {
              voiceData = Buffer.from(voiceBlob.data, 'base64');
              logger.debug('Voice data retrieved from Walrus', {
                voiceBlobId,
                voiceSize: voiceData.length,
              });
            }
          } catch (voiceError) {
            logger.warn('Failed to retrieve voice data from Walrus', {
              error: voiceError,
              voiceBlobId,
            });
          }
        }

        // Combine into payload
        const payload = combineCapsulePayload({
          image: {
            data: Uint8Array.from(fileBuffer),
            mimeType: req.file.mimetype,
            fileName: req.file.originalname,
          },
          message: message || undefined,
          voice: voiceData ? {
            data: Uint8Array.from(voiceData),
            mimeType: 'audio/webm', // Default, could be extracted from voice metadata
          } : undefined,
          metadata: {
            description,
            tags,
          },
        });

        dataToEncrypt = payload;
        logger.debug('Payload combined successfully', {
          combinedSize: payload.length,
          originalFileSize: fileBuffer.length,
          hasMessage: !!message,
          messageIncluded: !!message,
          hasVoice: !!voiceData,
          voiceIncluded: !!voiceData,
          voiceSize: voiceData?.length || 0,
        });
      } else {
        logger.debug('No message or voice provided, using raw file data', {
          fileSize: fileBuffer.length,
          fileType: req.file.mimetype,
        });
      }

      const metadata = {
        fileType: req.file.mimetype,
        description,
        tags,
      };

      let sharedOwners: string[] | undefined;
      if (req.body.sharedOwners) {
        try {
          const parsedOwners = JSON.parse(req.body.sharedOwners as string);
          if (Array.isArray(parsedOwners)) {
            sharedOwners = parsedOwners.map((owner) => sanitizeAddress(String(owner)));
          }
        } catch (error) {
          logger.warn('Failed to parse sharedOwners payload', { error });
        }
      }

      let inheritanceTargets: unknown;
      if (req.body.inheritance) {
        try {
          inheritanceTargets = JSON.parse(req.body.inheritance as string);
        } catch (error) {
          logger.warn('Failed to parse inheritance payload', { error });
        }
      }

      const policy = {
        unlockCondition: req.body.unlockCondition || 'manual',
        unlockAt: req.body.unlockAt ? Number(req.body.unlockAt) : undefined,
        sharedOwners,
        quorumThreshold: req.body.quorumThreshold ? Number(req.body.quorumThreshold) : undefined,
        inheritance: inheritanceTargets,
        soulbound,
      };

      const uploadResult = await evidenceService.uploadEvidence(
        dataToEncrypt, // Use combined payload if message/voice exists, otherwise original file
        metadata,
        userAddress,
        walrusSigner,
        undefined,
        policy,
      );

      // Store policy in database and create on-chain policy if time-locked
      let onChainPolicyId: string | null = null;
      try {
        const db = getDatabase();
        const policyType = resolvePolicyType(policy);
        
        // If time-locked, create on-chain TimeLockPolicy
        if (policyType === 'time_lock' && policy.unlockAt) {
          try {
            onChainPolicyId = await policyService.createTimeLockPolicy(
              uploadResult.encryptedDataId,
              policy.unlockAt,
              walrusSigner
            );
            logger.debug('On-chain time-lock policy created', {
              capsuleId: uploadResult.vaultId,
              encryptedDataId: uploadResult.encryptedDataId,
              unlockAt: policy.unlockAt,
              policyObjectId: onChainPolicyId,
            });
          } catch (onChainError) {
            logger.warn('Failed to create on-chain time-lock policy (non-critical)', {
              error: onChainError,
              capsuleId: uploadResult.vaultId,
              encryptedDataId: uploadResult.encryptedDataId,
            });
            // Continue without on-chain policy - backend will still check database
          }
        }
        
        // Store policy in database (use on-chain policy ID if available)
        // Normalize capsule ID: remove 0x prefix for database storage
        const normalizedCapsuleId = uploadResult.vaultId.startsWith('0x') ? uploadResult.vaultId.slice(2) : uploadResult.vaultId;
        await db.execute(
          'INSERT INTO capsule_policies (capsule_id, policy_type, policy_id, policy_data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE policy_type = VALUES(policy_type), policy_id = VALUES(policy_id), policy_data = VALUES(policy_data)',
          [
            normalizedCapsuleId,
            policyType,
            onChainPolicyId || `seal_policy_${normalizedCapsuleId}`,
            JSON.stringify(policy),
          ]
        );
      } catch (policyError) {
        logger.warn('Failed to persist capsule policy metadata', { 
          error: policyError, 
          capsuleId: uploadResult.vaultId 
        });
      }

      await provenanceService.recordAccess(uploadResult.vaultId, userAddress, 'created', {
        fileType: req.file.mimetype,
        tags,
      });

      let nftId: string | undefined;
      if (message) {
        try {
          const minted = await nftService.mintNFT(
            uploadResult.vaultId,
            userAddress,
            uploadResult.blobId,
            message,
            voiceBlobId || '',
            soulbound,
            walrusSigner,
          );
          nftId = minted.nftId;
        } catch (nftError) {
          logger.warn('NFT minting failed', { error: nftError, capsuleId: uploadResult.vaultId });
        }
      }

      res.json({
        success: true,
        capsuleId: uploadResult.vaultId,
        blobId: uploadResult.blobId,
        encryptedDataId: uploadResult.encryptedDataId,
        createdAt: uploadResult.createdAt,
        nftId: nftId || 'unknown',
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to upload capsule', {
        error,
        userAddress: req.body.userAddress || req.headers['x-user-address'],
      });
      res.status(500).json({
        success: false,
        error: 'Failed to upload capsule',
        details: errorMessage,
      });
    }
  });

/**
 * List user's capsules
 * GET /api/capsule/my-capsules
 */
router.get('/my-capsules', walletAuth, apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
    if (!rawUserAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }
    const userAddress = sanitizeAddress(rawUserAddress);
    const vaults = await evidenceService.listMyVaults(userAddress);
    const db = getDatabase();

    const capsules = await Promise.all(vaults.map(async (vault) => {
      // Get policy data for each capsule
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
router.get('/my-nfts', walletAuth, apiKeyAuth, async (req: Request, res: Response) => {
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
    logger.error('Failed to list NFTs', { error, userAddress: req.headers['x-user-address'] });
    res.status(500).json({ error: 'Failed to list NFTs', details: errorMessage });
  }
});

/**
 * Batch get capsule unlock info
 * POST /api/capsule/batch-unlock-info
 */
router.post('/batch-unlock-info', walletAuth, apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
    if (!rawUserAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }
    const userAddress = sanitizeAddress(rawUserAddress);
    const { capsuleIds } = req.body;
    
    if (!Array.isArray(capsuleIds) || capsuleIds.length === 0) {
      return res.status(400).json({ error: 'Invalid capsuleIds array' });
    }

    const db = getDatabase();
    const unlockInfoMap: Record<string, { unlockCondition: 'time' | 'manual'; unlockAt?: number; status: 'locked' | 'unlocked' }> = {};

    // Batch query all policies at once
    // Normalize all IDs (remove 0x prefix) since database stores without prefix
    const placeholders = capsuleIds.map(() => '?').join(',');
    const normalizedIds = capsuleIds.map(id => {
      // Remove 0x prefix if present
      const normalized = id.startsWith('0x') ? id.slice(2) : id;
      // Also handle case where ID might already be normalized
      return normalized.toLowerCase();
    });
    
    // Create mapping from normalized (lowercase) to original normalized IDs for response
    // Frontend sends normalized IDs (no 0x), so we return them as-is
    const idMapping: Record<string, string> = {};
    capsuleIds.forEach((originalId, index) => {
      // Map lowercase normalized to the original normalized (preserve case from input)
      const originalNormalized = originalId.startsWith('0x') ? originalId.slice(2) : originalId;
      idMapping[normalizedIds[index]] = originalNormalized;
    });
    
    logger.info('🔑 ID mapping created', {
      inputIds: capsuleIds.slice(0, 3),
      normalizedIds: normalizedIds.slice(0, 3),
      mappingSample: Object.entries(idMapping).slice(0, 3)
    });
    
    logger.info('🔍 Batch unlock info query', { 
      capsuleIdsCount: capsuleIds.length, 
      normalizedIdsCount: normalizedIds.length,
      sampleIds: capsuleIds.slice(0, 5),
      sampleNormalized: normalizedIds.slice(0, 5),
      allNormalizedIds: normalizedIds
    });

    // Also try querying without LOWER() in case IDs are already lowercase
    // And try both with and without case sensitivity
    let [policyRows] = await db.execute(
      `SELECT capsule_id, policy_type, policy_data FROM capsule_policies WHERE LOWER(capsule_id) IN (${placeholders})`,
      normalizedIds
    ) as [Array<{ capsule_id: string; policy_type: string; policy_data: string }>, any];
    
    // If no results, try direct match (case-sensitive) as fallback
    if (policyRows.length === 0 && normalizedIds.length > 0) {
      logger.warn('⚠️ No policies found with LOWER(), trying case-sensitive match');
      // Try with original normalized IDs (not lowercased)
      const originalNormalized = capsuleIds.map(id => id.startsWith('0x') ? id.slice(2) : id);
      const placeholders2 = originalNormalized.map(() => '?').join(',');
      [policyRows] = await db.execute(
        `SELECT capsule_id, policy_type, policy_data FROM capsule_policies WHERE capsule_id IN (${placeholders2})`,
        originalNormalized
      ) as [Array<{ capsule_id: string; policy_type: string; policy_data: string }>, any];
      
      logger.info('🔄 Case-sensitive query results', { found: policyRows.length });
    }

    // Debug: Check what's actually in the database
    if (policyRows.length === 0 && normalizedIds.length > 0) {
      const [allPolicies] = await db.execute(
        'SELECT capsule_id, policy_type FROM capsule_policies LIMIT 20'
      ) as [Array<{ capsule_id: string; policy_type: string }>, any];
      
      // Try to find matches by checking if database IDs are substrings of queried IDs
      // (in case queried IDs are UTF-8 encoded versions)
      const potentialMatches: Array<{ queriedId: string; dbId: string; policy_type: string }> = [];
      for (const queriedId of normalizedIds.slice(0, 5)) {
        for (const dbPolicy of allPolicies) {
          // Check if database ID appears in queried ID (UTF-8 encoded)
          if (queriedId.includes(dbPolicy.capsule_id) || dbPolicy.capsule_id.includes(queriedId)) {
            potentialMatches.push({
              queriedId,
              dbId: dbPolicy.capsule_id,
              policy_type: dbPolicy.policy_type
            });
          }
        }
      }
      
      logger.warn('⚠️ NO POLICIES FOUND! Debug info:', {
        queriedIds: normalizedIds.slice(0, 5),
        queriedCount: normalizedIds.length,
        sampleQueriedId: normalizedIds[0],
        sampleQueriedIdLength: normalizedIds[0]?.length,
        databasePolicies: allPolicies.slice(0, 10).map(p => ({
          capsule_id: p.capsule_id,
          capsule_id_length: p.capsule_id.length,
          policy_type: p.policy_type
        })),
        totalPoliciesInDB: allPolicies.length,
        potentialMatches: potentialMatches.length > 0 ? potentialMatches : 'NONE'
      });
      
      // If we found potential matches, try querying with those database IDs
      if (potentialMatches.length > 0) {
        logger.info('🔍 Found potential matches, trying alternative query...');
        const matchedDbIds = [...new Set(potentialMatches.map(m => m.dbId))];
        const placeholders2 = matchedDbIds.map(() => '?').join(',');
        const [matchedPolicies] = await db.execute(
          `SELECT capsule_id, policy_type, policy_data FROM capsule_policies WHERE capsule_id IN (${placeholders2})`,
          matchedDbIds
        ) as [Array<{ capsule_id: string; policy_type: string; policy_data: string }>, any];
        
        // Map matched policies back to queried IDs
        for (const match of potentialMatches) {
          const policy = matchedPolicies.find(p => p.capsule_id === match.dbId);
          if (policy) {
            const originalId = capsuleIds.find(id => {
              const normalized = id.startsWith('0x') ? id.slice(2) : id;
              return normalized.toLowerCase() === match.queriedId.toLowerCase();
            });
            if (originalId && !unlockInfoMap[originalId]) {
              const policyData = policy.policy_data ? JSON.parse(policy.policy_data) : null;
              const unlockAt = policyData?.unlockAt || policyData?.unlock_at;
              unlockInfoMap[originalId] = {
                unlockCondition: policy.policy_type === 'time_lock' ? 'time' : 'manual',
                unlockAt,
                status: 'locked',
              };
              logger.info('✅ Found policy via substring match', {
                queriedId: match.queriedId,
                dbId: match.dbId,
                policy_type: policy.policy_type
              });
            }
          }
        }
      }
    }
    
    logger.info('📦 Batch unlock info results', { 
      foundPolicies: policyRows.length,
      queriedCount: normalizedIds.length,
      policies: policyRows.map(p => ({ 
        capsule_id: p.capsule_id, 
        policy_type: p.policy_type,
        policy_data_preview: p.policy_data?.substring(0, 100)
      }))
    });

    // Process results - map back to original normalized IDs (what frontend sent)
    for (const policy of policyRows) {
      const dbCapsuleId = policy.capsule_id.toLowerCase();
      const responseId = idMapping[dbCapsuleId] || dbCapsuleId;
      const unlockCondition = policy.policy_type === 'time_lock' ? 'time' : 'manual';
      let unlockAt: number | undefined;
      
      if (policy.policy_data) {
        try {
          const policyData = JSON.parse(policy.policy_data);
          unlockAt = policyData.unlockAt || policyData.unlock_at;
          logger.info('✅ Parsed policy data', { 
            dbCapsuleId,
            responseId,
            unlockCondition, 
            unlockAt,
            hasUnlockAt: !!unlockAt,
            unlockAtDate: unlockAt ? new Date(unlockAt).toISOString() : null
          });
        } catch (parseError) {
          logger.warn('❌ Failed to parse policy data', { error: parseError, capsuleId: dbCapsuleId });
        }
      }
      
      unlockInfoMap[responseId] = {
        unlockCondition,
        unlockAt,
        status: 'locked',
      };
      
      logger.info('📝 Added to unlockInfoMap', {
        responseId,
        unlockCondition,
        hasUnlockAt: !!unlockAt
      });
    }

    // Set defaults for capsules without policies (use original normalized IDs)
    for (const originalId of capsuleIds) {
      const originalNormalized = originalId.startsWith('0x') ? originalId.slice(2) : originalId;
      if (!unlockInfoMap[originalNormalized] && !unlockInfoMap[originalId]) {
        logger.warn('⚠️ No policy found for capsule', { 
          originalId, 
          originalNormalized,
          checkedInMap: Object.keys(unlockInfoMap)
        });
        unlockInfoMap[originalNormalized] = {
          unlockCondition: 'manual',
          status: 'locked',
        };
      }
    }

    logger.info('📤 Sending unlock info response', {
      responseKeys: Object.keys(unlockInfoMap).slice(0, 5),
      totalKeys: Object.keys(unlockInfoMap).length,
      timeLockedCount: Object.values(unlockInfoMap).filter(i => i.unlockCondition === 'time').length
    });

    res.json({
      success: true,
      unlockInfo: unlockInfoMap,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to batch get unlock info', { error, userAddress: req.headers['x-user-address'] });
    res.status(500).json({ error: 'Failed to get unlock info', details: errorMessage });
  }
});

/**
 * Get NFT for a capsule
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
    logger.error('Failed to get NFT', { error, capsuleId: req.params.capsuleId });
    res.status(500).json({ error: 'Failed to get NFT', details: errorMessage });
  }
});

/**
 * Get capsule metadata
 * GET /api/capsule/:capsuleId
 * READ-ONLY: No authentication required for metadata queries
 */
router.get('/:capsuleId', cacheConfigs.capsuleMetadata, async (req: Request, res: Response) => {
  try {
    const { capsuleId } = req.params;
    // Try to get userAddress from various sources, but don't sanitize if it's undefined
    const rawUserAddress = req.body.userAddress || req.headers['x-user-address'] as string || req.query.userAddress as string;
    let userAddress: string | undefined;
    
    // Only sanitize if we have a value
    if (rawUserAddress) {
      try {
        userAddress = sanitizeAddress(rawUserAddress);
      } catch (sanitizeError) {
        logger.warn('Failed to sanitize userAddress', { error: sanitizeError, rawUserAddress });
        // Continue without userAddress, will try to get from DB
      }
    }
    
    logger.debug('Retrieving capsule', { capsuleId, userAddress: userAddress || 'not provided' });
    
    // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
    const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
    
    // If userAddress is not provided, try to get it from the database
    let effectiveUserAddress = userAddress;
    if (!effectiveUserAddress) {
      const db = getDatabase();
      const [vaultRows] = await db.execute(
        'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
        [normalizedCapsuleId]
      ) as [any[], any];
      if (vaultRows.length > 0) {
        effectiveUserAddress = vaultRows[0].user_address;
        logger.debug('Retrieved userAddress from database', { capsuleId, effectiveUserAddress });
      }
    }
    
    if (!effectiveUserAddress) {
      return res.status(400).json({ error: 'Missing userAddress and could not retrieve from database' });
    }

    const evidence = await evidenceService.getEvidence(normalizedCapsuleId, effectiveUserAddress);
    logger.debug('Capsule retrieved successfully', { capsuleId, userAddress: effectiveUserAddress, fileSize: evidence.metadata.fileSize });

    // Get NFT ID if available
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
      logger.warn('Could not retrieve NFT ID', { error: nftError, capsuleId: normalizedCapsuleId });
    }

    // Get policy data to include unlockAt and unlockCondition
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
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { error: String(error) };
    logger.error('Failed to get capsule', { 
      error: errorDetails, 
      capsuleId: req.params.capsuleId,
      errorMessage 
    });
    res.status(500).json({ error: 'Failed to get capsule', details: errorMessage });
  }
});

/**
 * Unlock capsule (server-side decryption)
 * POST /api/capsule/:capsuleId/unlock
 */
router.post('/:capsuleId/unlock',
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({
    capsuleId: schemas.capsuleId,
  })),
  validateBody(z.object({
    userAddress: schemas.userAddress,
    userMessage: z.string().max(5000).optional(),
  })),
  async (req: Request, res: Response) => {
  try {
    const { capsuleId } = req.params;
    const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    logger.info('Unlocking capsule', { capsuleId, userAddress });

    // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
    const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

    // Check time-lock policy before proceeding
    const db = getDatabase();
    const [policyRows] = await db.execute(
      'SELECT policy_type, policy_id, policy_data FROM capsule_policies WHERE capsule_id = ?',
      [normalizedCapsuleId]
    ) as [any[], any];
    const policy = policyRows[0] as {
      policy_type: 'time_lock' | 'multi_party' | 'none';
      policy_id: string | null;
      policy_data: string | null;
    } | undefined;

    if (policy && policy.policy_type === 'time_lock' && policy.policy_data) {
      const policyData = JSON.parse(policy.policy_data);
      const unlockAt = policyData?.unlockAt || policyData?.unlock_at;
      if (unlockAt) {
        const now = Date.now();
        if (now < unlockAt) {
          logger.warn('Time-lock policy check failed - capsule not ready', {
            capsuleId: normalizedCapsuleId,
            unlockAt,
            currentTime: now,
            timeRemaining: unlockAt - now,
          });
          return res.status(403).json({
            success: false,
            error: 'Capsule is not ready to unlock yet',
            unlockAt,
            currentTime: now,
            timeRemaining: unlockAt - now,
            message: `Capsule will unlock on ${new Date(unlockAt).toISOString()}`,
          });
        }
        logger.debug('Time-lock policy check passed (database)', {
          capsuleId: normalizedCapsuleId,
          unlockAt,
          now,
        });
      }
    }

    // Get evidence metadata (encrypted blob) - needed for encryptedDataId
    const evidence = await evidenceService.getEvidence(normalizedCapsuleId, userAddress);
    
    // Check on-chain time-lock policy if available
    if (policy && policy.policy_type === 'time_lock' && policy.policy_id && policy.policy_id.startsWith('0x')) {
      try {
        const onChainPolicy = await policyService.checkOnChainTimeLock(
          evidence.encryptedDataId,
          policy.policy_id
        );
        
        if (onChainPolicy) {
          const isUnlocked = await policyService.verifyTimeLockCondition(onChainPolicy);
          if (!isUnlocked) {
            logger.warn('On-chain time-lock policy check failed - capsule not ready', {
              capsuleId: normalizedCapsuleId,
              policyObjectId: policy.policy_id,
              unlockAt: onChainPolicy.unlockAt,
              currentTime: Date.now(),
            });
            return res.status(403).json({
              success: false,
              error: 'Capsule is not ready to unlock yet (on-chain policy check failed)',
              unlockAt: onChainPolicy.unlockAt,
              currentTime: Date.now(),
              message: `Capsule will unlock on ${new Date(onChainPolicy.unlockAt).toISOString()}`,
            });
          }
          logger.debug('On-chain time-lock policy check passed', {
            capsuleId: normalizedCapsuleId,
            policyObjectId: policy.policy_id,
            unlockAt: onChainPolicy.unlockAt,
          });
        } else {
          logger.debug('On-chain time-lock policy not found, using database check only', {
            capsuleId: normalizedCapsuleId,
            policyId: policy.policy_id,
            encryptedDataId: evidence.encryptedDataId,
          });
        }
      } catch (onChainError) {
        logger.warn('Failed to check on-chain time-lock policy (non-critical, using database check)', {
          error: onChainError,
          capsuleId: normalizedCapsuleId,
          policyId: policy.policy_id,
        });
        // Continue with database check only - don't block unlock if on-chain check fails
      }
    }
    
    // Get encrypted blob from Walrus
    const walrusService = new WalrusService({
      network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
    });
    
    const blobData = await walrusService.getBlobWithRetry(evidence.blobId, {
      capsuleId: normalizedCapsuleId,
      userAddress,
      route: 'unlock',
    }, {
      expectedMetadata: {
        identifier: evidence.encryptedDataId,
      }
    });
    
    // Validate base64 data before decoding
    const base64Data = blobData.data;
    let encryptedBytes: Buffer;
    try {
      encryptedBytes = Buffer.from(base64Data, 'base64');
    } catch (base64Error) {
      logger.error('Failed to decode base64 data from Walrus', {
        capsuleId: normalizedCapsuleId,
        blobId: evidence.blobId,
        base64Length: base64Data.length,
        error: base64Error
      });
      throw new Error('Invalid base64 data retrieved from Walrus');
    }

    // Compute hash of retrieved encrypted data
    const retrievedHash = createHash('sha256').update(encryptedBytes).digest('hex');
    
    // Get stored hash from metadata if available
    const storedHash = blobData.metadata?.encryptedHash as string | undefined;
    
    logger.info('Encrypted blob retrieved from Walrus', { 
      capsuleId: normalizedCapsuleId, 
      blobId: evidence.blobId, 
      encryptedSize: encryptedBytes.length,
      retrievedHash,
      storedHash: storedHash || 'not available',
      hashMatch: storedHash ? retrievedHash === storedHash : 'unknown',
      firstBytes: Array.from(encryptedBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '),
      lastBytes: Array.from(encryptedBytes.slice(-16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    
    // Validate hash if stored hash is available
    if (storedHash && retrievedHash !== storedHash) {
      logger.error('Data corruption detected! Retrieved hash does not match stored hash', {
        capsuleId: normalizedCapsuleId,
        blobId: evidence.blobId,
        storedHash,
        retrievedHash,
        encryptedSize: encryptedBytes.length
      });
      throw new Error('Data corruption detected: retrieved encrypted data does not match stored hash');
    }

    // Decrypt using Seal Protocol
    logger.debug('Attempting Seal Protocol decryption', {
      capsuleId: normalizedCapsuleId,
      encryptedDataId: evidence.encryptedDataId,
      encryptedSize: encryptedBytes.length,
      encryptedHash: retrievedHash
    });
    
    const { decrypted: decryptedBuffer } = await sealService.decrypt(
      encryptedBytes,
      evidence.encryptedDataId
    );

    // Access control is handled by Seal Protocol via seal_approve Move function - if decryption succeeds, access is granted
    // Additional policy checks can be done here if needed

    const decryptedBytes = Buffer.isBuffer(decryptedBuffer) ? decryptedBuffer : Buffer.from(decryptedBuffer);

    const decryptedHash = createHash('sha256').update(decryptedBytes).digest('hex');
    logger.info('Capsule decrypted successfully', { 
      capsuleId: normalizedCapsuleId, 
      decryptedSize: decryptedBytes.length,
      decryptedHash,
      fileType: evidence.metadata.fileType,
      encryptedDataId: evidence.encryptedDataId,
      encryptedSize: encryptedBytes.length,
      expectedSize: evidence.metadata.fileSize,
      sizeRatio: evidence.metadata.fileSize ? (decryptedBytes.length / evidence.metadata.fileSize).toFixed(2) + 'x' : 'unknown',
      firstBytes: Array.from(decryptedBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    
    // Validate decrypted data size (should be close to original if not compressed, or smaller if compressed)
    if (evidence.metadata.fileSize) {
      const sizeDiff = Math.abs(decryptedBytes.length - evidence.metadata.fileSize);
      const sizeRatio = decryptedBytes.length / evidence.metadata.fileSize;
      
      // If size is way off (more than 2x difference), something is wrong
      if (sizeRatio > 2 || sizeRatio < 0.1) {
        logger.warn('Decrypted data size is suspiciously different from expected', {
          capsuleId: normalizedCapsuleId,
          decryptedSize: decryptedBytes.length,
          expectedSize: evidence.metadata.fileSize,
          sizeRatio: sizeRatio.toFixed(2),
          sizeDiff
        });
      }
    }

    // Decompress if needed (snappy compression)
    let decompressedData = Uint8Array.from(decryptedBytes);
    try {
      const snappy = await import('snappy');
      try {
        const decompressed = await snappy.uncompress(Buffer.from(decryptedBytes));
        decompressedData = Buffer.isBuffer(decompressed) ? Uint8Array.from(decompressed) : Uint8Array.from(Buffer.from(decompressed));
        logger.info('Data decompressed', { 
          originalSize: decryptedBytes.length,
          decompressedSize: decompressedData.length,
        });
      } catch (decompressError) {
        // Not compressed, use original data
        logger.debug('Data not compressed or decompression failed, using original', { error: decompressError });
        decompressedData = Uint8Array.from(decryptedBytes);
      }
    } catch (snappyError) {
      // Snappy not available, use original data
      logger.debug('Snappy not available, using original data', { error: snappyError });
      decompressedData = Uint8Array.from(decryptedBytes);
    }

    // Check if this is a combined payload (file + message + voice)
    let fileData: Uint8Array;
    let extractedMessage: string | null = null;
    let voiceData: Uint8Array | null = null;
    let voiceMimeType: string | null = null;
    let fileType = evidence.metadata.fileType;

    try {
      const payload = splitCapsulePayload(decompressedData);
      logger.info('Detected combined payload, splitting into components', { capsuleId: normalizedCapsuleId });
      fileData = payload.image.data;
      extractedMessage = payload.message || null;
      voiceData = payload.voice?.data || null;
      voiceMimeType = payload.voice?.mimeType || null;
      fileType = payload.image.mimeType || evidence.metadata.fileType;
      
      logger.info('Combined payload split successfully', {
        capsuleId: normalizedCapsuleId,
        fileSize: fileData.length,
        fileType: fileType,
        hasMessage: !!extractedMessage,
        messageLength: extractedMessage?.length || 0,
        hasVoice: !!voiceData,
        voiceSize: voiceData?.length || 0,
        voiceMimeType: voiceMimeType || 'not set',
      });
    } catch (splitError) {
      // Check if it's a JSON parse error (might be combined payload with invalid JSON)
      // or if it's not a combined payload at all
      const errorMsg = getErrorMessage(splitError);
      const isJsonError = errorMsg.includes('JSON') || errorMsg.includes('parse');
      
      logger.info('Payload split attempt failed', { 
        capsuleId: normalizedCapsuleId,
        error: errorMsg,
        isJsonError,
        fileType: fileType,
        dataSize: decompressedData.length,
        firstBytes: Array.from(decompressedData.slice(0, 100)).map(b => {
          const char = String.fromCharCode(b);
          return char.match(/[\x20-\x7E]/) ? char : '.';
        }).join(''),
        firstBytesHex: Array.from(decompressedData.slice(0, 50)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      });
      
      // If it's a JSON error, the data might still be a combined payload but malformed
      // For now, treat as raw file data
      fileData = decompressedData;
      extractedMessage = null;
      voiceData = null;
      voiceMimeType = null;
    }

    // Only validate as image if it's actually an image type
    const isImageType = fileType?.startsWith('image/');
    if (isImageType) {
      const imageValidation = isValidImage(fileData);
      if (!imageValidation.valid) {
        logger.warn('Decrypted data does not appear to be a valid image', {
          capsuleId: normalizedCapsuleId,
          dataSize: fileData.length,
          expectedSize: evidence.metadata.fileSize || 'unknown',
          expectedFileType: fileType,
        });
        
        // Try to fix the image data
        const fixedData = tryFixImageData(fileData, evidence.encryptedDataId);
        if (fixedData) {
          logger.info('Image data fixed successfully', { capsuleId: normalizedCapsuleId });
          fileData = fixedData;
        } else {
          logger.warn('Could not fix image data, but continuing anyway', {
            capsuleId: normalizedCapsuleId,
          });
        }
      } else {
        logger.info('Image data validated successfully', {
          capsuleId: normalizedCapsuleId,
          format: imageValidation.format,
          size: fileData.length,
        });
      }
    } else {
      logger.info('File data ready (not an image, skipping image validation)', {
        capsuleId: normalizedCapsuleId,
        fileType: fileType,
        fileSize: fileData.length,
      });
    }
    
    const aiPreview = await generateHaiku({
      contentType: mimeToContentCategory(fileType),
      metadata: { hash: decryptedHash },
    });

    // Optional user message
    const userMessage = req.body.userMessage || null;
    if (userMessage) {
      const db = getDatabase();
      const messageId = `msg_${Date.now()}_${randomBytes(8).toString('hex')}`;
      await db.execute(
        'INSERT INTO capsule_messages (message_id, capsule_id, message, author_address) VALUES (?, ?, ?, ?)',
        [messageId, normalizedCapsuleId, userMessage, userAddress]
      );
      logger.info('User message saved', { capsuleId: normalizedCapsuleId, messageId });
    }

    // Verify ZK Origin Proof on unlock (if available in database)
    let originProofVerified = false;
    try {
      const db = getDatabase();
      const [proofRows] = await db.execute(
        'SELECT proof, public_signals FROM capsule_origin_proofs WHERE capsule_id = ?',
        [normalizedCapsuleId]
      ) as [any[], any];
      const originProofRow = proofRows[0] as { proof: string; public_signals: string } | undefined;
      
      if (originProofRow?.proof && originProofRow?.public_signals) {
        try {
          const proof = JSON.parse(originProofRow.proof);
          const publicSignals = JSON.parse(originProofRow.public_signals);
          originProofVerified = await zkOriginProofService.verifyOriginProof({ proof, publicSignals, verified: false } as any);
          logger.info('ZK Origin Proof verified on unlock', { capsuleId: normalizedCapsuleId, verified: originProofVerified });
        } catch (error) {
          logger.warn('Failed to verify ZK Origin Proof on unlock', { error, capsuleId: normalizedCapsuleId });
        }
      }
    } catch (error) {
      logger.warn('Failed to retrieve ZK Origin Proof from database', { error, capsuleId: normalizedCapsuleId });
    }

            // Record unlock in provenance
            await provenanceService.recordAccess(normalizedCapsuleId, userAddress, 'unlocked', {
              userMessage: userMessage || null,
            });

            // Update ping timestamp for inheritance tracking
            try {
              const db = getDatabase();
              await db.execute(
                'UPDATE capsule_inheritance SET last_ping = NOW() WHERE capsule_id = ?',
                [normalizedCapsuleId]
              );
            } catch (pingError) {
              // Non-critical - inheritance might not be configured
              logger.debug('Failed to update ping timestamp (non-critical)', {
                error: pingError,
                capsuleId: normalizedCapsuleId,
              });
            }

    // Update NFT glow intensity after unlock
    try {
      const nft = await nftService.getNFTByCapsuleId(normalizedCapsuleId);
      if (nft) {
        // Get access count from provenance
        const lineage = await provenanceService.getLineage(normalizedCapsuleId);
        const accessCount = lineage.filter(e => e.action === 'accessed' || e.action === 'unlocked').length;

        // Calculate new glow (unlocked = max glow)
        const newGlow = 255; // Max glow for unlocked capsules
        await nftService.updateGlow(nft.nftId, newGlow, walrusSigner);
        logger.info('NFT glow updated after unlock', { capsuleId: normalizedCapsuleId, nftId: nft.nftId, glow: newGlow });
      }
    } catch (error) {
      logger.warn('Failed to update NFT glow after unlock', { error, capsuleId: normalizedCapsuleId });
    }

    // Use extracted message from payload, or fall back to NFT metadata
    let finalMessage: string | null = extractedMessage;
    
    logger.info('Message extraction result', {
      capsuleId: normalizedCapsuleId,
      extractedMessage: extractedMessage ? `${extractedMessage.substring(0, 50)}...` : null,
      extractedMessageLength: extractedMessage?.length || 0,
      willTryNFTFallback: !finalMessage,
    });
    
    if (!finalMessage) {
      try {
        const nft = await nftService.getNFTByCapsuleId(normalizedCapsuleId);
        if (nft) {
          const db = getDatabase();
          const [nftRows] = await db.execute(
            'SELECT metadata FROM capsule_nfts WHERE capsule_id = ?',
            [normalizedCapsuleId]
          ) as [any[], any];
          if (nftRows.length > 0 && nftRows[0].metadata) {
            try {
              const metadata = JSON.parse(nftRows[0].metadata);
              finalMessage = metadata.message || null;
              logger.info('Retrieved message from NFT metadata', {
                capsuleId: normalizedCapsuleId,
                messageLength: finalMessage?.length || 0,
              });
            } catch {
              // Metadata parse failed, ignore
            }
          }
        }
      } catch (error) {
        logger.debug('Could not retrieve NFT message', { error, capsuleId: normalizedCapsuleId });
      }
    }

    // Prepare response
    const [inheritanceSettings, contributions] = await Promise.all([
      fetchInheritanceSettings(normalizedCapsuleId),
      fetchContributions(normalizedCapsuleId),
    ]);

    const response: any = {
      success: true,
      decryptedData: Buffer.from(fileData).toString('base64'),
      fileType: fileType,
      message: finalMessage,
      aiPreview,
      policy: null, // Policy is enforced by Seal Protocol via seal_approve Move function
      inheritance: inheritanceSettings,
      contributions,
      originProof: {
        verified: originProofVerified,
        message: originProofVerified 
          ? 'Created 2025. Real. Not AI.' 
          : 'Origin proof not available or invalid',
      },
    };

    // Include voice data if available
    if (voiceData) {
      response.voiceData = Buffer.from(voiceData).toString('base64');
      response.voiceMimeType = voiceMimeType || 'audio/webm'; // Use extracted mimeType from payload
      logger.info('Including voice data in response', {
        capsuleId: normalizedCapsuleId,
        voiceSize: voiceData.length,
        voiceMimeType: response.voiceMimeType,
      });
    }
    
    // Log final response contents for debugging
    logger.info('Unlock response prepared', {
      capsuleId: normalizedCapsuleId,
      hasDecryptedData: !!response.decryptedData,
      decryptedDataSize: response.decryptedData?.length || 0,
      hasMessage: !!response.message,
      messageLength: response.message?.length || 0,
      messagePreview: response.message ? `${response.message.substring(0, 100)}...` : null,
      hasVoice: !!response.voiceData,
      voiceSize: response.voiceData?.length || 0,
      voiceMimeType: response.voiceMimeType || null,
    });

    res.json(response);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to unlock capsule', { error, capsuleId: req.params.capsuleId, userAddress: req.headers['x-user-address'] });
    res.status(500).json({ error: 'Failed to unlock capsule', details: errorMessage });
  }
});

/**
 * Generate unlock code for public access
 * POST /api/capsule/:capsuleId/generate-unlock-code
 */
router.post('/:capsuleId/generate-unlock-code', 
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({
    capsuleId: schemas.capsuleId,
  })),
  async (req: Request, res: Response) => {
  try {
    const { capsuleId } = req.params;
    const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
    const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

    // Verify user owns the capsule
    const db = getDatabase(); // Reuse db from outer scope if available
    const [vaultRows] = await db.execute(
      'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
      [normalizedCapsuleId]
    ) as [any[], any];
    const vault = vaultRows[0] as { user_address: string } | undefined;

    if (!vault) {
      return res.status(404).json({ error: 'Capsule not found' });
    }

    if (vault.user_address !== userAddress) {
      return res.status(403).json({ error: 'Not authorized to generate unlock code for this capsule' });
    }

    // Generate secret phrase: SHA256(capsuleId + userAddress + timestamp + randomSalt)
    const timestamp = Date.now().toString();
    const randomSalt = randomBytes(16).toString('hex');
    const secretPhrase = createHash('sha256')
      .update(normalizedCapsuleId + userAddress + timestamp + randomSalt)
      .digest('hex')
      .slice(0, 32); // Use first 32 chars for readability

    // Hash the secret phrase for storage
    const unlockCodeHash = createHash('sha256')
      .update(secretPhrase)
      .digest('hex');

    // Store in database (expires in 1 year by default, or custom expiry)
    const expiresAt = req.body.expiresAt 
      ? new Date(req.body.expiresAt).toISOString().replace('T', ' ').slice(0, 19)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19); // 1 year default

    const unlockDb = getDatabase();
    await unlockDb.execute(
      'INSERT INTO capsule_unlock_codes (capsule_id, unlock_code_hash, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE unlock_code_hash = ?, expires_at = ?',
      [normalizedCapsuleId, unlockCodeHash, expiresAt, unlockCodeHash, expiresAt]
    );

    logger.info('Unlock code generated', { capsuleId: normalizedCapsuleId, userAddress });

    res.json({
      success: true,
      secretPhrase, // Return plain text secret phrase (only shown once)
      expiresAt,
      message: 'Save this secret phrase securely. It will not be shown again.',
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to generate unlock code', { error, capsuleId: req.params.capsuleId });
    res.status(500).json({ error: 'Failed to generate unlock code', details: errorMessage });
  }
});

/**
 * Public unlock endpoint (no authentication required)
 * POST /api/capsule/public/unlock
 */
router.post('/public/unlock', 
  publicUnlockLimiter,
  auditLogMiddleware,
  validateBody(z.object({
    capsuleId: schemas.capsuleId,
    secretPhrase: schemas.secretPhrase,
  })),
  async (req: Request, res: Response) => {
  try {
    const { capsuleId, secretPhrase } = req.body;

    if (!capsuleId || !secretPhrase) {
      return res.status(400).json({ error: 'Missing capsuleId or secretPhrase' });
    }

    // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
    const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

    // Hash the provided secret phrase
    const providedHash = createHash('sha256')
      .update(secretPhrase)
      .digest('hex');

    // Verify secret phrase matches stored hash
    const db = getDatabase();
    const [codeRows] = await db.execute(
      'SELECT * FROM capsule_unlock_codes WHERE capsule_id = ? AND unlock_code_hash = ?',
      [normalizedCapsuleId, providedHash]
    ) as [any[], any];
    const unlockCode = codeRows[0] as {
      capsule_id: string;
      unlock_code_hash: string;
      expires_at: string | null;
    } | undefined;

    if (!unlockCode) {
      logger.warn('Invalid unlock code attempt', { capsuleId: normalizedCapsuleId, ip: req.ip });
      return res.status(401).json({ error: 'Invalid secret phrase' });
    }

    // Check if code has expired
    if (unlockCode.expires_at && new Date(unlockCode.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unlock code has expired' });
    }

    // Get capsule metadata
    const [vaultRows] = await db.execute(
      'SELECT vault_id, blob_id, created_at, file_type, file_size, description FROM evidence_vaults WHERE vault_id = ?',
      [normalizedCapsuleId]
    ) as [any[], any];
    const vault = vaultRows[0] as {
      vault_id: string;
      blob_id: string;
      created_at: string;
      file_type: string;
      file_size: number;
      description: string | null;
    } | undefined;

    if (!vault) {
      return res.status(404).json({ error: 'Capsule not found' });
    }

    // Get unlock time from on-chain data (if available) or estimate from created_at
    // For now, we'll need to check the Move contract or use a default
    const unlockAt = req.body.unlockAt || null; // Should be passed from frontend or fetched from chain

    logger.info('Public unlock code verified', { capsuleId: normalizedCapsuleId, ip: req.ip });

    res.json({
      success: true,
      capsuleId: vault.vault_id,
      blobId: vault.blob_id,
      createdAt: vault.created_at,
      unlockAt,
      fileType: vault.file_type,
      fileSize: vault.file_size,
      description: vault.description,
      message: 'Secret phrase verified. Capsule metadata retrieved.',
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to verify public unlock', { error, capsuleId: req.body.capsuleId });
    res.status(500).json({ error: 'Failed to verify unlock code', details: errorMessage });
  }
});

/**
 * Public unlock decryption endpoint (no authentication required)
 * POST /api/capsule/public/unlock-decrypt
 */
router.post('/public/unlock-decrypt', 
  publicUnlockLimiter,
  auditLogMiddleware,
  validateBody(z.object({
    capsuleId: schemas.capsuleId,
    secretPhrase: schemas.secretPhrase,
    unlockAt: z.number().optional(), // Optional: unlock timestamp from on-chain
  })),
  async (req: Request, res: Response) => {
  try {
    const { capsuleId, secretPhrase, unlockAt } = req.body;

    if (!capsuleId || !secretPhrase) {
      return res.status(400).json({ error: 'Missing capsuleId or secretPhrase' });
    }

    // Normalize capsuleId - remove 0x prefix for database query (database stores without prefix)
    const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

    // Hash the provided secret phrase
    const providedHash = createHash('sha256')
      .update(secretPhrase)
      .digest('hex');

    // Verify secret phrase matches stored hash
    const db = getDatabase();
    const [codeRows] = await db.execute(
      'SELECT * FROM capsule_unlock_codes WHERE capsule_id = ? AND unlock_code_hash = ?',
      [normalizedCapsuleId, providedHash]
    ) as [any[], any];
    const unlockCode = codeRows[0] as {
      capsule_id: string;
      unlock_code_hash: string;
      expires_at: string | null;
    } | undefined;

    if (!unlockCode) {
      logger.warn('Invalid unlock code attempt for decryption', { capsuleId: normalizedCapsuleId, ip: req.ip });
      return res.status(401).json({ error: 'Invalid secret phrase' });
    }

    // Check if code has expired
    if (unlockCode.expires_at && new Date(unlockCode.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Unlock code has expired' });
    }

    // Get capsule metadata including user address and encrypted data ID
    const [vaultRows] = await db.execute(
      'SELECT vault_id, blob_id, encrypted_data_id, user_address, created_at, file_type, file_size, description FROM evidence_vaults WHERE vault_id = ?',
      [normalizedCapsuleId]
    ) as [any[], any];
    const vault = vaultRows[0] as {
      vault_id: string;
      blob_id: string;
      encrypted_data_id: string;
      user_address: string;
      created_at: string;
      file_type: string;
      file_size: number;
      description: string | null;
    } | undefined;

    if (!vault) {
      return res.status(404).json({ error: 'Capsule not found' });
    }

    // Check stored policy metadata if it exists
    const [policyRows] = await db.execute(
      'SELECT policy_type, policy_id, policy_data FROM capsule_policies WHERE capsule_id = ?',
      [normalizedCapsuleId]
    ) as [any[], any];
    const policy = policyRows[0] as {
      policy_type: 'time_lock' | 'multi_party' | 'none';
      policy_id: string | null;
      policy_data: string | null;
    } | undefined;

    if (policy && policy.policy_type !== 'none' && policy.policy_id) {
      const policyData = policy.policy_data ? JSON.parse(policy.policy_data) : null;

      if (policy.policy_type === 'time_lock') {
        const unlockAt = policyData?.unlockAt || policyData?.unlock_at;
        if (unlockAt) {
        // Check if time-lock condition is met
        const now = Date.now();
          if (now < unlockAt) {
          return res.status(403).json({
            error: 'Capsule is not ready to unlock yet',
              unlockAt,
            currentTime: now,
              message: `Capsule will unlock on ${new Date(unlockAt).toISOString()}`,
          });
        }
          logger.info('Time-lock policy check passed', { capsuleId: normalizedCapsuleId, unlockAt, now });
        }
      } else if (policy.policy_type === 'multi_party' && policyData) {
        // For multi-party, we'd need to check on-chain if threshold is met
        // For now, we'll allow if secret phrase is valid (in production, check on-chain policy state)
        logger.info('Multi-party policy check - verifying on-chain state would be required', { 
          capsuleId: normalizedCapsuleId, 
          policyId: policy.policy_id,
          threshold: policyData.threshold,
        });
        // For now, allow if secret phrase is valid
      }
    } else if (unlockAt && unlockAt > Date.now()) {
      // Fallback: check unlockAt parameter if no policy
      return res.status(403).json({ 
        error: 'Capsule is not ready to unlock yet',
        unlockAt,
        currentTime: Date.now(),
      });
    }

    logger.info('Public unlock decryption starting', { capsuleId: normalizedCapsuleId, userAddress: vault.user_address, ip: req.ip, policyType: policy?.policy_type });

    // Get encrypted blob from Walrus
    const walrusService = new WalrusService({
      network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
    });
    
    const blobData = await walrusService.getBlobWithRetry(vault.blob_id, {
      capsuleId: normalizedCapsuleId,
      userAddress: vault.user_address,
      route: 'public-unlock',
    }, {
      expectedMetadata: {
        identifier: vault.encrypted_data_id,
      }
    });
    const encryptedBytes = Buffer.from(blobData.data, 'base64');

    logger.info('Encrypted blob retrieved from Walrus', { 
      capsuleId: normalizedCapsuleId, 
      blobId: vault.blob_id, 
      encryptedSize: encryptedBytes.length 
    });

    // Decrypt using Seal Protocol with owner's address
    const { decrypted: decryptedBuffer } = await sealService.decrypt(
      encryptedBytes,
      vault.encrypted_data_id
    );
    // Access control is handled by Seal Protocol via seal_approve Move function - if decryption succeeds, access is granted
    const decryptedBytes = Buffer.isBuffer(decryptedBuffer) ? decryptedBuffer : Buffer.from(decryptedBuffer);

    logger.info('Capsule decrypted successfully', { 
      capsuleId: normalizedCapsuleId, 
      decryptedSize: decryptedBytes.length,
      fileType: vault.file_type,
    });

    // Decompress if needed (snappy compression)
    let finalData = Uint8Array.from(decryptedBytes);
    try {
      // Try to detect if data is compressed (snappy has magic bytes)
      // For now, we'll try decompression and catch errors
      const snappy = await import('snappy');
      try {
        const decompressed = await snappy.uncompress(Buffer.from(decryptedBytes));
        finalData = Buffer.isBuffer(decompressed) ? Uint8Array.from(decompressed) : Uint8Array.from(Buffer.from(decompressed));
        logger.info('Data decompressed', { 
          originalSize: decryptedBytes.length,
          decompressedSize: finalData.length,
        });
      } catch (decompressError) {
        // Not compressed, use original data
        logger.debug('Data not compressed or decompression failed, using original', { error: decompressError });
        finalData = Uint8Array.from(decryptedBytes);
      }
    } catch (snappyError) {
      // Snappy not available, use original data
      logger.debug('Snappy not available, using original data', { error: snappyError });
      finalData = Uint8Array.from(decryptedBytes);
    }

    const aiPreview = await generateHaiku({
      contentType: mimeToContentCategory(vault.file_type),
      metadata: { hash: createHash('sha256').update(decryptedBytes).digest('hex') },
    });

    const [inheritanceSettings, contributions] = await Promise.all([
      fetchInheritanceSettings(normalizedCapsuleId),
      fetchContributions(normalizedCapsuleId),
    ]);

    res.json({
      success: true,
      decryptedData: Buffer.from(finalData).toString('base64'),
      fileType: vault.file_type,
      fileSize: vault.file_size,
      description: vault.description,
      message: 'Capsule decrypted successfully',
      aiPreview,
      inheritance: inheritanceSettings,
      contributions,
      policy: null, // Policy is enforced by Seal Protocol via seal_approve Move function
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to decrypt capsule', { 
      error, 
      capsuleId: req.body.capsuleId,
      ip: req.ip,
    });
    res.status(500).json({ 
      error: 'Failed to decrypt capsule', 
      details: errorMessage,
    });
  }
});

/**
 * Configure inheritance settings for a capsule
 */
router.post('/:capsuleId/inheritance',
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  validateBody(z.object({
    ownerAddress: schemas.userAddress,
    fallbackAddresses: z.array(schemas.userAddress).min(1),
    inactiveAfterDays: z.number().min(7).max(3650).optional(),
    autoTransfer: z.boolean().optional(),
  })),
  async (req: Request, res: Response) => {
    try {
      const { capsuleId } = req.params;
      const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      const ownerAddress = sanitizeAddress(req.body.ownerAddress);
      const db = getDatabase();

      const [vaultRows] = await db.execute(
        'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
        [normalizedCapsuleId]
      ) as [Array<{ user_address: string }>, unknown];

      if (!vaultRows.length || vaultRows[0].user_address !== ownerAddress) {
        return res.status(403).json({ error: 'Only the capsule owner can configure inheritance' });
      }

      const fallbackAddresses = req.body.fallbackAddresses.map((address: string) => sanitizeAddress(address));
      const inactiveAfterDays = req.body.inactiveAfterDays ?? 365;
      const autoTransfer = req.body.autoTransfer ?? false;

      // Try to create on-chain inheritance policy
      // For now, we'll attempt it but make it optional
      let onChainPolicyId: string | null = null;
      try {
        // Try to find capsule object via NFT
        // If NFT exists, we might be able to get capsule object from it
        // For now, we'll skip on-chain policy creation if capsule object doesn't exist
        
        // Calculate trigger value: if autoTransfer is true, use time-based (inactiveAfterDays from now)
        // Otherwise, use manual (trigger_condition = 2)
        const triggerCondition = autoTransfer ? 1 : 2; // 1 = time-based, 2 = manual
        const triggerValue = autoTransfer 
          ? Date.now() + (inactiveAfterDays * 24 * 60 * 60 * 1000) // Timestamp when inheritance can be claimed
          : 0; // Manual - always available
        
        // For the first heir (we'll create separate policies for each heir in the future)
        const firstHeir = fallbackAddresses[0];
        
        // Capsules aren't created on-chain currently, storing in database only
        logger.info('Inheritance policy configuration (on-chain creation skipped - capsule object not available)', {
          capsuleId: normalizedCapsuleId,
          heir: firstHeir,
          triggerCondition,
          triggerValue,
        });
        
        // onChainPolicyId = await policyService.setInheritancePolicyWithCapsule(
        //   capsuleObjectId,
        //   firstHeir,
        //   triggerCondition,
        //   triggerValue,
        //   walrusSigner
        // );
      } catch (onChainError) {
        logger.warn('Failed to create on-chain inheritance policy (non-critical, using database only)', {
          error: onChainError,
          capsuleId: normalizedCapsuleId,
        });
      }

      // Store inheritance settings in database
      await db.execute(
        'INSERT INTO capsule_inheritance (capsule_id, fallback_addresses, inactive_after_days, auto_transfer, last_ping) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE fallback_addresses = VALUES(fallback_addresses), inactive_after_days = VALUES(inactive_after_days), auto_transfer = VALUES(auto_transfer), last_ping = VALUES(last_ping)',
        [
          normalizedCapsuleId,
          JSON.stringify(fallbackAddresses),
          inactiveAfterDays,
          autoTransfer ? 1 : 0,
        ]
      );

      res.json({
        success: true,
        message: 'Inheritance preferences updated',
        onChainPolicyId: onChainPolicyId || undefined,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to update inheritance preferences', { error, capsuleId: req.params.capsuleId });
      res.status(500).json({ error: 'Failed to update inheritance preferences', details: errorMessage });
    }
  }
);

/**
 * Ping capsule (update last activity timestamp for inheritance tracking)
 * POST /api/capsule/:capsuleId/ping
 */
router.post('/:capsuleId/ping',
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  validateBody(z.object({
    userAddress: schemas.userAddress,
  })),
  async (req: Request, res: Response) => {
    try {
      const { capsuleId } = req.params;
      const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }

      const db = getDatabase();
      
      // Verify user owns the capsule
      const [vaultRows] = await db.execute(
        'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
        [normalizedCapsuleId]
      ) as [Array<{ user_address: string }>, unknown];

      if (!vaultRows.length || vaultRows[0].user_address !== userAddress) {
        return res.status(403).json({ error: 'Only the capsule owner can ping' });
      }

      // Update last_ping timestamp
      await db.execute(
        'UPDATE capsule_inheritance SET last_ping = NOW() WHERE capsule_id = ?',
        [normalizedCapsuleId]
      );

      logger.info('Capsule ping updated', { capsuleId: normalizedCapsuleId, userAddress });

      res.json({
        success: true,
        message: 'Ping updated',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to update ping', { error, capsuleId: req.params.capsuleId });
      res.status(500).json({ error: 'Failed to update ping', details: errorMessage });
    }
  }
);

/**
 * Retrieve inheritance settings
 */
router.get('/:capsuleId/inheritance',
  walletAuth,
  apiKeyAuth,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  async (req: Request, res: Response) => {
    try {
      const normalizedCapsuleId = req.params.capsuleId.startsWith('0x') ? req.params.capsuleId.slice(2) : req.params.capsuleId;
      const db = getDatabase();
      const [rows] = await db.execute(
        'SELECT fallback_addresses, inactive_after_days, last_ping, auto_transfer FROM capsule_inheritance WHERE capsule_id = ?',
        [normalizedCapsuleId]
      ) as [Array<{ fallback_addresses: string; inactive_after_days: number; last_ping: Date | null; auto_transfer: number }>, unknown];

      if (!rows.length) {
        return res.json({ success: true, inheritance: null });
      }

      const record = rows[0];
      res.json({
        success: true,
        inheritance: {
          fallbackAddresses: JSON.parse(record.fallback_addresses || '[]'),
          inactiveAfterDays: record.inactive_after_days,
          lastPing: record.last_ping,
          autoTransfer: Boolean(record.auto_transfer),
        },
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to load inheritance settings', { error, capsuleId: req.params.capsuleId });
      res.status(500).json({ error: 'Failed to load inheritance settings', details: errorMessage });
    }
  }
);

/**
 * Check inheritance eligibility for a user
 * GET /api/capsule/inheritance/eligible
 */
router.get('/inheritance/eligible',
  walletAuth,
  apiKeyAuth,
  async (req: Request, res: Response) => {
    try {
      const userAddress = sanitizeAddress(req.headers['x-user-address'] as string || req.query.userAddress as string);
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }

      const eligible = await inheritanceService.checkEligibility(userAddress);

      res.json({
        success: true,
        eligible: eligible.map(e => ({
          capsuleId: e.capsuleId,
          eligible: e.eligible,
          reason: e.reason,
          inactiveSince: e.inactiveSince?.toISOString(),
          inactiveDays: e.inactiveDays,
          fallbackAddresses: e.fallbackAddresses,
          policyObjectId: e.policyObjectId,
        })),
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to check inheritance eligibility', { error, userAddress: req.headers['x-user-address'] });
      res.status(500).json({ error: 'Failed to check inheritance eligibility', details: errorMessage });
    }
  }
);

/**
 * Claim inheritance for a capsule
 * POST /api/capsule/:capsuleId/inheritance/claim
 */
router.post('/:capsuleId/inheritance/claim',
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  validateBody(z.object({
    userAddress: schemas.userAddress,
  })),
  async (req: Request, res: Response) => {
    try {
      const { capsuleId } = req.params;
      const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }

      // Get policy object ID from database if available
      const db = getDatabase();
      const [policyRows] = await db.execute(
        'SELECT policy_id FROM capsule_policies WHERE capsule_id = ? AND policy_type = ?',
        [normalizedCapsuleId, 'inheritance']
      ) as [Array<{ policy_id: string }>, unknown];
      
      const policyObjectId = policyRows[0]?.policy_id || undefined;

      const txDigest = await inheritanceService.claimInheritance(
        normalizedCapsuleId,
        userAddress,
        policyObjectId,
        walrusSigner
      );

      logger.info('Inheritance claimed', {
        capsuleId: normalizedCapsuleId,
        heirAddress: userAddress,
        txDigest,
      });

      res.json({
        success: true,
        message: 'Inheritance claimed successfully',
        txDigest,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to claim inheritance', { error, capsuleId: req.params.capsuleId, userAddress: req.headers['x-user-address'] });
      res.status(500).json({ error: 'Failed to claim inheritance', details: errorMessage });
    }
  }
);

/**
 * Add collaborative contribution
 */
router.post('/:capsuleId/contributions',
  walletAuth,
  apiKeyAuth,
  auditLogMiddleware,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  validateBody(z.object({
    contributorAddress: schemas.userAddress,
    message: z.string().min(1).max(2000),
  })),
  async (req: Request, res: Response) => {
    try {
      const normalizedCapsuleId = req.params.capsuleId.startsWith('0x') ? req.params.capsuleId.slice(2) : req.params.capsuleId;
      const db = getDatabase();
      const payload = {
        message: req.body.message,
        timestamp: Date.now(),
      };
      const contributionId = `contrib_${Date.now()}_${randomBytes(6).toString('hex')}`;
      await db.execute(
        'INSERT INTO capsule_contributions (contribution_id, capsule_id, contributor_address, payload) VALUES (?, ?, ?, ?)',
        [
          contributionId,
          normalizedCapsuleId,
          sanitizeAddress(req.body.contributorAddress),
          JSON.stringify(payload),
        ]
      );

      res.json({
        success: true,
        contributionId,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to add capsule contribution', { error, capsuleId: req.params.capsuleId });
      res.status(500).json({ error: 'Failed to add capsule contribution', details: errorMessage });
    }
  }
);

/**
 * List collaborative contributions
 */
router.get('/:capsuleId/contributions',
  walletAuth,
  apiKeyAuth,
  validateParams(z.object({ capsuleId: schemas.capsuleId })),
  async (req: Request, res: Response) => {
    try {
      const normalizedCapsuleId = req.params.capsuleId.startsWith('0x') ? req.params.capsuleId.slice(2) : req.params.capsuleId;
      const db = getDatabase();
      const [rows] = await db.execute(
        'SELECT contribution_id, contributor_address, payload, created_at FROM capsule_contributions WHERE capsule_id = ? ORDER BY created_at DESC LIMIT 100',
        [normalizedCapsuleId]
      ) as [Array<{ contribution_id: string; contributor_address: string; payload: string; created_at: Date }>, unknown];

      const contributions = rows.map(row => ({
        contributionId: row.contribution_id,
        contributorAddress: row.contributor_address,
        payload: (() => {
          try {
            return JSON.parse(row.payload);
          } catch {
            return { message: row.payload };
          }
        })(),
        createdAt: row.created_at,
      }));

      res.json({
        success: true,
        contributions,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to list capsule contributions', { error, capsuleId: req.params.capsuleId });
      res.status(500).json({ error: 'Failed to list capsule contributions', details: errorMessage });
    }
  }
);

/**
 * Upload voice recording for NFT (separate endpoint)
 * POST /api/capsule/upload-voice
 */
router.post('/upload-voice',
  walletAuth,
  apiKeyAuth,
  uploadLimiter,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No voice file provided' });
      }

      const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }

      // Validate file by magic number
      const fileValidation = validateFileByMagicNumber(req.file.buffer, req.file.mimetype);
      if (!fileValidation.valid || !fileValidation.detectedMimeType?.startsWith('audio/')) {
        logger.warn('Invalid audio file', {
          declaredMimeType: req.file.mimetype,
          detectedMimeType: fileValidation.detectedMimeType,
          error: fileValidation.error,
        });
        return res.status(400).json({
          error: 'Invalid audio file',
          details: 'File must be a valid audio format (MP3, WAV, WebM)',
        });
      }

      logger.info('Uploading voice recording', { userAddress, fileSize: req.file.size });

      // Upload to Walrus (unencrypted, just for NFT storage)
      const walrusService = new WalrusService({
        network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
        signer: walrusSigner,
      });

      const blobId = await walrusService.storeBlob(
        {
          data: req.file.buffer.toString('base64'),
          metadata: {
            type: 'voice',
            userAddress,
            timestamp: new Date().toISOString(),
          },
        },
        walrusSigner
      );

      logger.info('Voice recording uploaded', { blobId, userAddress });

      res.json({
        success: true,
        blobId,
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Failed to upload voice recording', { error, userAddress: req.headers['x-user-address'] });
      res.status(500).json({ error: 'Failed to upload voice recording', details: errorMessage });
    }
  }
);

/**
 * Share NFT with another wallet address
 * POST /api/nft/share
 * 
 * DEPRECATED: NFT operations now happen directly from user wallets.
 */
/*
router.post('/nft/share', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    const nftId = req.body.nftId as string;
    const recipientAddress = sanitizeAddress(req.body.recipientAddress as string);
    
    if (!nftId) {
      return res.status(400).json({ error: 'Missing nftId' });
    }
    if (!recipientAddress) {
      return res.status(400).json({ error: 'Missing recipientAddress' });
    }

    if (recipientAddress === userAddress) {
      return res.status(400).json({ error: 'Cannot share NFT with yourself' });
    }

    // Transfer NFT on-chain
    if (!walrusSigner) {
      return res.status(503).json({ error: 'Signer not available for NFT transfer' });
    }

    const tx = new Transaction();
    tx.setSender(walrusSigner.toSuiAddress());

    const packageId = process.env.MOVE_PACKAGE_ID || '0x0';
    
    tx.moveCall({
      target: `${packageId}::capsule_nft::transfer_to_address`,
      arguments: [
        tx.pure.id(nftId),
        tx.pure.address(recipientAddress),
      ],
    });

    const txBytes = await tx.build({ client: suiClient });
    const signature = await walrusSigner.signTransaction(txBytes);
    
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: typeof signature === 'string' ? signature : signature.signature,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    // Store share record in database
    const shareId = createHash('sha256')
      .update(`${nftId}-${recipientAddress}-${Date.now()}`)
      .digest('hex');
    
    const db = getDatabase();
    await db.execute(
      'INSERT INTO nft_shares (share_id, nft_id, from_address, to_address, shared_at, unlocked) VALUES (?, ?, ?, ?, ?, 0)',
      [shareId, nftId, userAddress, recipientAddress, new Date().toISOString().replace('T', ' ').slice(0, 19)]
    );

    logger.info('NFT shared', { nftId, from: userAddress, to: recipientAddress, txDigest: result.digest });

    res.json({
      success: true,
      shareId,
      txDigest: result.digest,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to share NFT', { error, nftId: req.body.nftId });
    res.status(500).json({ error: 'Failed to share NFT', details: errorMessage });
  }
});
*/

export default router;
