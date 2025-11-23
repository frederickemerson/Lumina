/**
 * Public Unlock Endpoints
 * Handles public unlock with secret phrases (no authentication required)
 */

import { Router, Request, Response } from 'express';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import sealService from '../../services/seal';
import { getDatabase } from '../../db/database';
import { auditLogMiddleware } from '../../middleware/auditLog';
import { publicUnlockLimiter } from '../../middleware/rateLimit';
import { z } from 'zod';
import { validateBody, schemas } from '../../middleware/validation';
import WalrusService from '../../services/walrus';
import { createHash } from 'crypto';
import { generateHaiku } from '../../services/aiHaiku';
import { mimeToContentCategory, fetchInheritanceSettings, fetchContributions } from './utils';

export function createPublicRouter(): Router {
  const router = Router();

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

        const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

        const providedHash = createHash('sha256')
          .update(secretPhrase)
          .digest('hex');

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

        if (unlockCode.expires_at && new Date(unlockCode.expires_at) < new Date()) {
          return res.status(401).json({ error: 'Unlock code has expired' });
        }

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

        const unlockAt = req.body.unlockAt || null;

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
    }
  );

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
      unlockAt: z.number().optional(),
    })),
    async (req: Request, res: Response) => {
      try {
        const { capsuleId, secretPhrase, unlockAt } = req.body;

        if (!capsuleId || !secretPhrase) {
          return res.status(400).json({ error: 'Missing capsuleId or secretPhrase' });
        }

        const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;

        const providedHash = createHash('sha256')
          .update(secretPhrase)
          .digest('hex');

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

        if (unlockCode.expires_at && new Date(unlockCode.expires_at) < new Date()) {
          return res.status(401).json({ error: 'Unlock code has expired' });
        }

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
            logger.info('Multi-party policy check - verifying on-chain state would be required', { 
              capsuleId: normalizedCapsuleId, 
              policyId: policy.policy_id,
              threshold: policyData.threshold,
            });
          }
        } else if (unlockAt && unlockAt > Date.now()) {
          return res.status(403).json({ 
            error: 'Capsule is not ready to unlock yet',
            unlockAt,
            currentTime: Date.now(),
          });
        }

        logger.info('Public unlock decryption starting', { capsuleId: normalizedCapsuleId, userAddress: vault.user_address, ip: req.ip, policyType: policy?.policy_type });

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

        const { decrypted: decryptedBuffer } = await sealService.decrypt(
          encryptedBytes,
          vault.encrypted_data_id
        );
        const decryptedBytes = Buffer.isBuffer(decryptedBuffer) ? decryptedBuffer : Buffer.from(decryptedBuffer);

        logger.info('Capsule decrypted successfully', { 
          capsuleId: normalizedCapsuleId, 
          decryptedSize: decryptedBytes.length,
          fileType: vault.file_type,
        });

        let finalData = Uint8Array.from(decryptedBytes);
        try {
          const snappy = await import('snappy');
          try {
            const decompressed = await snappy.uncompress(Buffer.from(decryptedBytes));
            finalData = Buffer.isBuffer(decompressed) ? Uint8Array.from(decompressed) : Uint8Array.from(Buffer.from(decompressed));
            logger.info('Data decompressed', { 
              originalSize: decryptedBytes.length,
              decompressedSize: finalData.length,
            });
          } catch (decompressError) {
            logger.debug('Data not compressed or decompression failed, using original', { error: decompressError });
            finalData = Uint8Array.from(decryptedBytes);
          }
        } catch (snappyError) {
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
          policy: null,
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
    }
  );

  return router;
}

