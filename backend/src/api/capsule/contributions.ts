/**
 * Contributions Endpoints
 * Handles collaborative contributions to capsules
 */

import { Router, Request, Response } from 'express';
import { walletAuth, apiKeyAuth } from '../../middleware/auth';
import { sanitizeAddress } from '../../utils/sanitize';
import { getErrorMessage } from '../../types/common';
import { logger } from '../../utils/logger';
import { getDatabase } from '../../db/database';
import { auditLogMiddleware } from '../../middleware/auditLog';
import { z } from 'zod';
import { validateBody, validateParams, schemas } from '../../middleware/validation';
import { randomBytes } from 'crypto';
import { fetchContributions } from './utils';

export function createContributionsRouter(): Router {
  const router = Router();

  /**
   * Add collaborative contribution
   * POST /api/capsule/:capsuleId/contributions
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
   * GET /api/capsule/:capsuleId/contributions
   */
  router.get('/:capsuleId/contributions',
    walletAuth,
    apiKeyAuth,
    validateParams(z.object({ capsuleId: schemas.capsuleId })),
    async (req: Request, res: Response) => {
      try {
        const normalizedCapsuleId = req.params.capsuleId.startsWith('0x') ? req.params.capsuleId.slice(2) : req.params.capsuleId;
        const contributions = await fetchContributions(normalizedCapsuleId);

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

  return router;
}

