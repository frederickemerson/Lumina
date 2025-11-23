/**
 * Capsule Unlock Endpoints
 * Handles capsule unlocking and decryption
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { sanitizeAddress } from '../../utils/sanitize';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import EvidenceService from '../../services/evidence';
import sealService from '../../services/seal';
import { getDatabase } from '../../db/database';
import { auditLogMiddleware } from '../../middleware/auditLog';
import { z } from 'zod';
import { validateBody, validateParams, schemas } from '../../middleware/validation';
import WalrusService from '../../services/walrus';
import { createHash, randomBytes } from 'crypto';
import { splitCapsulePayload } from '../../utils/capsulePayload';
import { isValidImage, tryFixImageData } from '../../utils/imageValidation';
import { PolicyService } from '../../services/policyService';
import ProvenanceService from '../../services/provenance';
import NFTService from '../../services/nftService';
import ZKOriginProofService from '../../services/zkOriginProof';
import { generateHaiku } from '../../services/aiHaiku';
import { mimeToContentCategory, fetchInheritanceSettings, fetchContributions } from './utils';
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

const CAPSULE_PACKAGE_ID = process.env.CAPSULE_PACKAGE_ID || '0x267d1b63db92e7a5502b334cd353cea7a5d40c9ed779dee4fe7211f37eb9f4b4';
const nftService = new NFTService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  packageId: CAPSULE_PACKAGE_ID,
  signer: walrusSigner,
});
const policyService = new PolicyService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  signer: walrusSigner,
});
const zkOriginProofService = new ZKOriginProofService();
const provenanceService = new ProvenanceService();

export function createUnlockRouter(): Router {
  const router = Router();

  /**
   * Unlock capsule (server-side decryption)
   * POST /api/capsule/:capsuleId/unlock
   */
  router.post('/:capsuleId/unlock',
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

        const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

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
          }
        }

        const evidence = await evidenceService.getEvidence(normalizedCapsuleId, userAddress);
        
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
            }
          } catch (onChainError) {
            logger.warn('Failed to check on-chain time-lock policy (non-critical, using database check)', {
              error: onChainError,
              capsuleId: normalizedCapsuleId,
              policyId: policy.policy_id,
            });
          }
        }
        
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

        const retrievedHash = createHash('sha256').update(encryptedBytes).digest('hex');
        const storedHash = blobData.metadata?.encryptedHash as string | undefined;
        
        logger.info('Encrypted blob retrieved from Walrus', { 
          capsuleId: normalizedCapsuleId, 
          blobId: evidence.blobId, 
          encryptedSize: encryptedBytes.length,
          retrievedHash,
          storedHash: storedHash || 'not available',
          hashMatch: storedHash ? retrievedHash === storedHash : 'unknown',
        });
        
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

        const decryptedBytes = Buffer.isBuffer(decryptedBuffer) ? decryptedBuffer : Buffer.from(decryptedBuffer);
        const decryptedHash = createHash('sha256').update(decryptedBytes).digest('hex');
        
        logger.info('Capsule decrypted successfully', { 
          capsuleId: normalizedCapsuleId, 
          decryptedSize: decryptedBytes.length,
          decryptedHash,
          fileType: evidence.metadata.fileType,
        });

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
            logger.debug('Data not compressed or decompression failed, using original', { error: decompressError });
            decompressedData = Uint8Array.from(decryptedBytes);
          }
        } catch (snappyError) {
          logger.debug('Snappy not available, using original data', { error: snappyError });
          decompressedData = Uint8Array.from(decryptedBytes);
        }

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
        } catch (splitError) {
          const errorMsg = getErrorMessage(splitError);
          logger.info('Payload split attempt failed', { 
            capsuleId: normalizedCapsuleId,
            error: errorMsg,
            fileType: fileType,
            dataSize: decompressedData.length,
          });
          fileData = decompressedData;
          extractedMessage = null;
          voiceData = null;
          voiceMimeType = null;
        }

        const isImageType = fileType?.startsWith('image/');
        if (isImageType) {
          const imageValidation = isValidImage(fileData);
          if (!imageValidation.valid) {
            logger.warn('Decrypted data does not appear to be a valid image', {
              capsuleId: normalizedCapsuleId,
              dataSize: fileData.length,
              expectedFileType: fileType,
            });
            const fixedData = tryFixImageData(fileData, evidence.encryptedDataId);
            if (fixedData) {
              logger.info('Image data fixed successfully', { capsuleId: normalizedCapsuleId });
              fileData = fixedData;
            }
          }
        }
        
        const aiPreview = await generateHaiku({
          contentType: mimeToContentCategory(fileType),
          metadata: { hash: decryptedHash },
        });

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

        await provenanceService.recordAccess(normalizedCapsuleId, userAddress, 'unlocked', {
          userMessage: userMessage || null,
        });

        try {
          const db = getDatabase();
          await db.execute(
            'UPDATE capsule_inheritance SET last_ping = NOW() WHERE capsule_id = ?',
            [normalizedCapsuleId]
          );
        } catch (pingError) {
          logger.debug('Failed to update ping timestamp (non-critical)', {
            error: pingError,
            capsuleId: normalizedCapsuleId,
          });
        }

        try {
          const nft = await nftService.getNFTByCapsuleId(normalizedCapsuleId);
          if (nft) {
            const lineage = await provenanceService.getLineage(normalizedCapsuleId);
            const accessCount = lineage.filter(e => e.action === 'accessed' || e.action === 'unlocked').length;
            const newGlow = 255;
            await nftService.updateGlow(nft.nftId, newGlow, walrusSigner);
            logger.info('NFT glow updated after unlock', { capsuleId: normalizedCapsuleId, nftId: nft.nftId, glow: newGlow });
          }
        } catch (error) {
          logger.warn('Failed to update NFT glow after unlock', { error, capsuleId: normalizedCapsuleId });
        }

        let finalMessage: string | null = extractedMessage;
        
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
                } catch {
                  // Metadata parse failed, ignore
                }
              }
            }
          } catch (error) {
            logger.debug('Could not retrieve NFT message', { error, capsuleId: normalizedCapsuleId });
          }
        }

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
          policy: null,
          inheritance: inheritanceSettings,
          contributions,
          originProof: {
            verified: originProofVerified,
            message: originProofVerified 
              ? 'Created 2025. Real. Not AI.' 
              : 'Origin proof not available or invalid',
          },
        };

        if (voiceData) {
          response.voiceData = Buffer.from(voiceData).toString('base64');
          response.voiceMimeType = voiceMimeType || 'audio/webm';
        }
        
        logger.info('Unlock response prepared', {
          capsuleId: normalizedCapsuleId,
          hasDecryptedData: !!response.decryptedData,
          hasMessage: !!response.message,
          hasVoice: !!response.voiceData,
        });

        res.json(response);
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        logger.error('Failed to unlock capsule', { error, capsuleId: req.params.capsuleId, userAddress: req.headers['x-user-address'] });
        res.status(500).json({ error: 'Failed to unlock capsule', details: errorMessage });
      }
    }
  );

  /**
   * Generate unlock code for public access
   * POST /api/capsule/:capsuleId/generate-unlock-code
   */
  router.post('/:capsuleId/generate-unlock-code', 
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

        const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

        const db = getDatabase();
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

        const timestamp = Date.now().toString();
        const randomSalt = randomBytes(16).toString('hex');
        const secretPhrase = createHash('sha256')
          .update(normalizedCapsuleId + userAddress + timestamp + randomSalt)
          .digest('hex')
          .slice(0, 32);

        const unlockCodeHash = createHash('sha256')
          .update(secretPhrase)
          .digest('hex');

        const expiresAt = req.body.expiresAt 
          ? new Date(req.body.expiresAt).toISOString().replace('T', ' ').slice(0, 19)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

        await db.execute(
          'INSERT INTO capsule_unlock_codes (capsule_id, unlock_code_hash, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE unlock_code_hash = ?, expires_at = ?',
          [normalizedCapsuleId, unlockCodeHash, expiresAt, unlockCodeHash, expiresAt]
        );

        logger.info('Unlock code generated', { capsuleId: normalizedCapsuleId, userAddress });

        res.json({
          success: true,
          secretPhrase,
          expiresAt,
          message: 'Save this secret phrase securely. It will not be shown again.',
        });
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        logger.error('Failed to generate unlock code', { error, capsuleId: req.params.capsuleId });
        res.status(500).json({ error: 'Failed to generate unlock code', details: errorMessage });
      }
    }
  );

  return router;
}

