/**
 * Inheritance Endpoints
 * Handles inheritance configuration, eligibility checks, and claims
 */

import { Router, Request, Response } from 'express';
import { apiKeyAuth } from '../../middleware/auth';
import { sanitizeAddress } from '../../utils/sanitize';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../db/database';
import { auditLogMiddleware } from '../../middleware/auditLog';
import { z } from 'zod';
import { validateBody, validateParams, schemas } from '../../middleware/validation';
import { InheritanceService } from '../../services/inheritanceService';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { fetchInheritanceSettings } from './utils';

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

const inheritanceService = new InheritanceService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  signer: walrusSigner,
});

export function createInheritanceRouter(): Router {
  const router = Router();

  /**
   * Configure inheritance settings for a capsule
   * POST /api/capsule/:capsuleId/inheritance
   */
  router.post('/:capsuleId/inheritance',
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

        let onChainPolicyId: string | null = null;
        try {
          const triggerCondition = autoTransfer ? 1 : 2;
          const triggerValue = autoTransfer 
            ? Date.now() + (inactiveAfterDays * 24 * 60 * 60 * 1000)
            : 0;
          
          const firstHeir = fallbackAddresses[0];
          
          logger.info('Inheritance policy configuration (on-chain creation skipped - capsule object not available)', {
            capsuleId: normalizedCapsuleId,
            heir: firstHeir,
            triggerCondition,
            triggerValue,
          });
        } catch (onChainError) {
          logger.warn('Failed to create on-chain inheritance policy (non-critical, using database only)', {
            error: onChainError,
            capsuleId: normalizedCapsuleId,
          });
        }

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
        
        const [vaultRows] = await db.execute(
          'SELECT user_address FROM evidence_vaults WHERE vault_id = ?',
          [normalizedCapsuleId]
        ) as [Array<{ user_address: string }>, unknown];

        if (!vaultRows.length || vaultRows[0].user_address !== userAddress) {
          return res.status(403).json({ error: 'Only the capsule owner can ping' });
        }

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
   * GET /api/capsule/:capsuleId/inheritance
   */
  router.get('/:capsuleId/inheritance',
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

  return router;
}

