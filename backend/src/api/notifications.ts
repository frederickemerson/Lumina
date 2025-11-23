/**
 * Notifications API
 * Endpoints for managing user notification preferences
 */

import { Router, Request, Response } from 'express';
import { getNotificationService } from '../services/notificationService';
import { logger } from '../utils/logger';
import { walletAuth } from '../middleware/walletAuth';
import { apiKeyAuth } from '../middleware/auth';
import { auditLogMiddleware } from '../middleware/auditLog';
import { sanitizeAddress } from '../utils/sanitize';

const router = Router();

/**
 * Get user notification preferences
 * GET /api/notifications/preferences
 */
router.get('/preferences', walletAuth, apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const rawUserAddress = req.headers['x-user-address'] as string || req.query.userAddress as string;
    if (!rawUserAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }
    const userAddress = sanitizeAddress(rawUserAddress);

    const notificationService = getNotificationService();
    const preferences = await notificationService.getUserPreferences(userAddress);

    if (!preferences) {
      // Return default preferences if none set
      return res.json({
        success: true,
        preferences: {
          enabled: true,
          notifyOnUnlock: true,
          notifyOnUnlockSoon: false,
          unlockSoonThreshold: 24,
        },
      });
    }

    res.json({
      success: true,
      preferences,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to get notification preferences', { error, userAddress: req.headers['x-user-address'] });
    res.status(500).json({ error: 'Failed to get notification preferences', details: errorMessage });
  }
});

/**
 * Update user notification preferences
 * POST /api/notifications/preferences
 */
router.post('/preferences', walletAuth, apiKeyAuth, auditLogMiddleware, async (req: Request, res: Response) => {
  try {
    const rawUserAddress = req.headers['x-user-address'] as string || req.body.userAddress;
    if (!rawUserAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }
    const userAddress = sanitizeAddress(rawUserAddress);

    const {
      email,
      webhook,
      enabled = true,
      notifyOnUnlock = true,
      notifyOnUnlockSoon = false,
      unlockSoonThreshold = 24,
    } = req.body;

    // Validate email format if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate webhook URL if provided
    if (webhook) {
      try {
        new URL(webhook);
      } catch {
        return res.status(400).json({ error: 'Invalid webhook URL' });
      }
    }

    // Validate threshold
    const threshold = parseInt(unlockSoonThreshold, 10);
    if (isNaN(threshold) || threshold < 1 || threshold > 168) {
      return res.status(400).json({ error: 'Unlock soon threshold must be between 1 and 168 hours' });
    }

    const notificationService = getNotificationService();
    await notificationService.setUserPreferences(userAddress, {
      email: email || undefined,
      webhook: webhook || undefined,
      enabled: Boolean(enabled),
      notifyOnUnlock: Boolean(notifyOnUnlock),
      notifyOnUnlockSoon: Boolean(notifyOnUnlockSoon),
      unlockSoonThreshold: threshold,
    });

    logger.info('Notification preferences updated', { userAddress });

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update notification preferences', { error, userAddress: req.headers['x-user-address'] });
    res.status(500).json({ error: 'Failed to update notification preferences', details: errorMessage });
  }
});

export default router;

