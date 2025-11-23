/**
 * Notification Service
 * Handles notifications for NFT unlock events and other user events
 */

import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';

export interface NotificationPreferences {
  email?: string;
  webhook?: string;
  enabled: boolean;
  notifyOnUnlock: boolean;
  notifyOnUnlockSoon?: boolean; // Notify 24 hours before unlock
  unlockSoonThreshold?: number; // Hours before unlock to notify (default 24)
}

export interface UnlockNotification {
  nftId: string;
  capsuleId: string;
  ownerAddress: string;
  unlockedAt: number;
  unlockAt: number;
  message?: string;
}

class NotificationService {
  /**
   * Send notification when NFT unlocks
   */
  async notifyNFTUnlocked(notification: UnlockNotification): Promise<void> {
    try {
      const db = getDatabase();
      
      // Get user notification preferences
      const [prefRows] = await db.execute(
        `SELECT email, webhook, notify_on_unlock, notify_on_unlock_soon, unlock_soon_threshold
         FROM user_notifications
         WHERE user_address = ? AND enabled = 1`,
        [notification.ownerAddress]
      ) as [any[], any];

      const preferences = prefRows[0] as NotificationPreferences | undefined;

      if (!preferences || !preferences.notifyOnUnlock) {
        logger.debug('User has notifications disabled or no preferences', {
          ownerAddress: notification.ownerAddress,
        });
        return;
      }

      // Send email notification if configured
      if (preferences.email) {
        await this.sendEmailNotification(notification, preferences.email);
      }

      // Send webhook notification if configured
      if (preferences.webhook) {
        await this.sendWebhookNotification(notification, preferences.webhook);
      }

      // Store notification in database
      await this.storeNotification(notification);

      logger.info('NFT unlock notification sent', {
        nftId: notification.nftId,
        ownerAddress: notification.ownerAddress,
        hasEmail: !!preferences.email,
        hasWebhook: !!preferences.webhook,
      });
    } catch (error) {
      logger.error('Failed to send NFT unlock notification', {
        error,
        notification,
      });
      // Don't throw - notifications are non-critical
    }
  }

  /**
   * Check for NFTs that will unlock soon and send advance notifications
   */
  async checkAndNotifyUpcomingUnlocks(): Promise<{ checked: number; notified: number }> {
    const db = getDatabase();
    const now = Date.now();
    const defaultThreshold = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    try {
      // Get all users with unlock soon notifications enabled
      const [userRows] = await db.execute(
        `SELECT DISTINCT user_address, unlock_soon_threshold
         FROM user_notifications
         WHERE enabled = 1 AND notify_on_unlock_soon = 1`
      ) as [any[], any];

      let checked = 0;
      let notified = 0;

      for (const userRow of userRows) {
        const userAddress = userRow.user_address;
        const threshold = (userRow.unlock_soon_threshold || 24) * 60 * 60 * 1000;
        const notifyBefore = now + threshold;

        // Find NFTs that will unlock within the threshold
        const [nftRows] = await db.execute(
          `SELECT nft_id, capsule_id, unlock_at, metadata
           FROM capsule_nfts
           WHERE owner_address = ?
           AND is_locked = 1
           AND unlock_at > ?
           AND unlock_at <= ?
           AND unlock_at NOT IN (
             SELECT nft_id FROM notification_sent
             WHERE notification_type = 'unlock_soon'
             AND user_address = ?
           )`,
          [userAddress, now, notifyBefore, userAddress]
        ) as [any[], any];

        checked += nftRows.length;

        for (const nftRow of nftRows) {
          try {
            const metadata = nftRow.metadata ? JSON.parse(nftRow.metadata) : {};
            const notification: UnlockNotification = {
              nftId: nftRow.nft_id,
              capsuleId: nftRow.capsule_id,
              ownerAddress: userAddress,
              unlockedAt: 0, // Not unlocked yet
              unlockAt: nftRow.unlock_at,
              message: metadata.message,
            };

            await this.notifyUnlockSoon(notification, userAddress);
            notified++;
          } catch (error) {
            logger.error('Failed to send unlock soon notification', {
              error,
              nftId: nftRow.nft_id,
              userAddress,
            });
          }
        }
      }

      logger.info('Upcoming unlock notifications checked', {
        checked,
        notified,
      });

      return { checked, notified };
    } catch (error) {
      logger.error('Failed to check upcoming unlocks', { error });
      return { checked: 0, notified: 0 };
    }
  }

  /**
   * Send email notification (placeholder - integrate with email service)
   */
  private async sendEmailNotification(
    notification: UnlockNotification,
    email: string
  ): Promise<void> {
    // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
    logger.info('Email notification (placeholder)', {
      email,
      nftId: notification.nftId,
      subject: 'Your NFT has unlocked!',
      message: `Your NFT ${notification.nftId} has unlocked. You can now access your memory capsule.`,
    });

    // Example email content:
    // Subject: Your LUMINA NFT has unlocked!
    // Body: Your memory capsule NFT has unlocked. Visit [link] to access your memories.
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    notification: UnlockNotification,
    webhookUrl: string
  ): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      
      await axios.post(webhookUrl, {
        event: 'nft_unlocked',
        timestamp: Date.now(),
        data: {
          nftId: notification.nftId,
          capsuleId: notification.capsuleId,
          ownerAddress: notification.ownerAddress,
          unlockedAt: notification.unlockedAt,
          unlockAt: notification.unlockAt,
          message: notification.message,
        },
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      logger.debug('Webhook notification sent', {
        webhookUrl,
        nftId: notification.nftId,
      });
    } catch (error) {
      logger.error('Failed to send webhook notification', {
        error,
        webhookUrl,
        nftId: notification.nftId,
      });
      // Don't throw - webhook failures are non-critical
    }
  }

  /**
   * Notify user that NFT will unlock soon
   */
  private async notifyUnlockSoon(
    notification: UnlockNotification,
    userAddress: string
  ): Promise<void> {
    const db = getDatabase();

    try {
      // Get user preferences
      const [prefRows] = await db.execute(
        `SELECT email, webhook, unlock_soon_threshold
         FROM user_notifications
         WHERE user_address = ? AND enabled = 1 AND notify_on_unlock_soon = 1`,
        [userAddress]
      ) as [any[], any];

      const preferences = prefRows[0];
      if (!preferences) return;

      const hoursUntil = Math.round((notification.unlockAt - Date.now()) / (60 * 60 * 1000));

      // Send email if configured
      if (preferences.email) {
        logger.info('Unlock soon email notification (placeholder)', {
          email: preferences.email,
          nftId: notification.nftId,
          hoursUntil,
        });
      }

      // Send webhook if configured
      if (preferences.webhook) {
        const axios = (await import('axios')).default;
        await axios.post(preferences.webhook, {
          event: 'nft_unlock_soon',
          timestamp: Date.now(),
          data: {
            nftId: notification.nftId,
            capsuleId: notification.capsuleId,
            ownerAddress: userAddress,
            unlockAt: notification.unlockAt,
            hoursUntil,
            message: notification.message,
          },
        }, {
          timeout: 5000,
        });
      }

      // Mark as notified
      await db.execute(
        `INSERT INTO notification_sent (notification_id, user_address, nft_id, notification_type, sent_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `unlock_soon_${notification.nftId}_${Date.now()}`,
          userAddress,
          notification.nftId,
          'unlock_soon',
          new Date(),
        ]
      );
    } catch (error) {
      logger.error('Failed to send unlock soon notification', {
        error,
        notification,
        userAddress,
      });
    }
  }

  /**
   * Store notification in database
   */
  private async storeNotification(notification: UnlockNotification): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.execute(
        `INSERT INTO notification_sent (notification_id, user_address, nft_id, notification_type, sent_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          `unlock_${notification.nftId}_${Date.now()}`,
          notification.ownerAddress,
          notification.nftId,
          'nft_unlocked',
          new Date(),
        ]
      );
    } catch (error) {
      logger.warn('Failed to store notification', { error, notification });
      // Non-critical
    }
  }

  /**
   * Set user notification preferences
   */
  async setUserPreferences(
    userAddress: string,
    preferences: NotificationPreferences
  ): Promise<void> {
    const db = getDatabase();

    await db.execute(
      `INSERT INTO user_notifications 
       (user_address, email, webhook, enabled, notify_on_unlock, notify_on_unlock_soon, unlock_soon_threshold, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         email = VALUES(email),
         webhook = VALUES(webhook),
         enabled = VALUES(enabled),
         notify_on_unlock = VALUES(notify_on_unlock),
         notify_on_unlock_soon = VALUES(notify_on_unlock_soon),
         unlock_soon_threshold = VALUES(unlock_soon_threshold),
         updated_at = NOW()`,
      [
        userAddress,
        preferences.email || null,
        preferences.webhook || null,
        preferences.enabled ? 1 : 0,
        preferences.notifyOnUnlock ? 1 : 0,
        preferences.notifyOnUnlockSoon ? 1 : 0,
        preferences.unlockSoonThreshold || 24,
      ]
    );

    logger.info('User notification preferences updated', {
      userAddress,
      hasEmail: !!preferences.email,
      hasWebhook: !!preferences.webhook,
    });
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userAddress: string): Promise<NotificationPreferences | null> {
    const db = getDatabase();

    const [rows] = await db.execute(
      `SELECT email, webhook, enabled, notify_on_unlock, notify_on_unlock_soon, unlock_soon_threshold
       FROM user_notifications
       WHERE user_address = ?`,
      [userAddress]
    ) as [any[], any];

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      email: row.email || undefined,
      webhook: row.webhook || undefined,
      enabled: row.enabled === 1,
      notifyOnUnlock: row.notify_on_unlock === 1,
      notifyOnUnlockSoon: row.notify_on_unlock_soon === 1,
      unlockSoonThreshold: row.unlock_soon_threshold || 24,
    };
  }
}

// Export singleton instance
let serviceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!serviceInstance) {
    serviceInstance = new NotificationService();
  }
  return serviceInstance;
}

export default getNotificationService;

