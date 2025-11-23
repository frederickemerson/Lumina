/**
 * Capsule Upload Endpoints
 * Handles capsule creation and upload
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth } from '../../middleware/auth';
import { sanitizeAddress } from '../../utils/sanitize';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import EvidenceService from '../../services/evidence';
import NFTService from '../../services/nftService';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { getDatabase } from '../../db/database';
import { auditLogMiddleware } from '../../middleware/auditLog';
import { uploadLimiter } from '../../middleware/rateLimit';
import WalrusService from '../../services/walrus';
import { combineCapsulePayload } from '../../utils/capsulePayload';
import { validateFileByMagicNumber } from '../../utils/imageValidation';
import { PolicyService } from '../../services/policyService';
import ProvenanceService from '../../services/provenance';
import { resolvePolicyType } from './utils';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB max
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types - Lumina supports preserving any memory
    // Magic number validation will catch malformed files later
    cb(null, true);
  },
});

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
    logger.debug('Walrus signer initialized', { address: walrusSigner.toSuiAddress() });
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
const policyService = new PolicyService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  signer: walrusSigner,
});
const provenanceService = new ProvenanceService();

export function createUploadRouter(): Router {
  const router = Router();

  /**
   * Upload capsule (memory vault)
   * POST /api/capsule/upload
   */
  router.post('/upload',
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

        logger.debug('Upload request received', {
          fileSize: fileBuffer.length,
          fileType: req.file.mimetype,
          hasMessage: !!message,
          messageLength: message?.length || 0,
          hasVoiceBlobId: !!voiceBlobId,
          hasDescription: !!description,
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

        let dataToEncrypt: Buffer = fileBuffer;
        let voiceData: Buffer | null = null;
        
        if (message || voiceBlobId) {
          if (voiceBlobId) {
            try {
              const walrusService = new WalrusService({
                network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
              });
              const voiceBlob = await walrusService.getBlob(voiceBlobId);
              if (voiceBlob.data) {
                voiceData = Buffer.from(voiceBlob.data, 'base64');
              }
            } catch (voiceError) {
              logger.warn('Failed to retrieve voice data from Walrus', { error: voiceError, voiceBlobId });
            }
          }

          const payload = combineCapsulePayload({
            image: {
              data: Uint8Array.from(fileBuffer),
              mimeType: req.file.mimetype,
              fileName: req.file.originalname,
            },
            message: message || undefined,
            voice: voiceData ? {
              data: Uint8Array.from(voiceData),
              mimeType: 'audio/webm',
            } : undefined,
            metadata: {
              description,
              tags,
            },
          });

          dataToEncrypt = payload;
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
          dataToEncrypt,
          metadata,
          userAddress,
          walrusSigner,
          undefined,
          policy,
        );

        let onChainPolicyId: string | null = null;
        try {
          const db = getDatabase();
          const policyType = resolvePolicyType(policy);
          
          if (policyType === 'time_lock' && policy.unlockAt) {
            try {
              onChainPolicyId = await policyService.createTimeLockPolicy(
                uploadResult.encryptedDataId,
                policy.unlockAt,
                walrusSigner
              );
            } catch (onChainError) {
              logger.warn('Failed to create on-chain time-lock policy (non-critical)', { error: onChainError });
            }
          }
          
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
          logger.warn('Failed to persist capsule policy metadata', { error: policyError, capsuleId: uploadResult.vaultId });
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
            // NFT minting failed - non-critical
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
    }
  );

  /**
   * Upload voice recording for NFT (separate endpoint)
   * POST /api/capsule/upload-voice
   */
  router.post('/upload-voice',
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
        const isValidAudio = fileValidation.valid && (
          fileValidation.detectedMimeType?.startsWith('audio/') ||
          (fileValidation.detectedMimeType === 'video/webm' && req.file.mimetype === 'audio/webm')
        );

        if (!isValidAudio) {
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

        const walrusService = new WalrusService({
          network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
        });

        const blobId = await walrusService.storeBlob({
          data: req.file.buffer.toString('base64'),
          metadata: {
            userAddress,
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
            isVoice: true,
          },
        }, walrusSigner);

        res.json({
          success: true,
          blobId,
        });
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        logger.error('Failed to upload voice recording', { error });
        res.status(500).json({
          success: false,
          error: 'Failed to upload voice recording',
          details: errorMessage,
        });
      }
    }
  );

  return router;
}

