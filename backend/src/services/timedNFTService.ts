/**
 * Timed NFT Service
 * Handles daily checking and unlocking of timed NFTs
 */

import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { getNotificationService, type UnlockNotification } from './notificationService';

class TimedNFTService {
  private suiClient: SuiClient;
  private packageId: string;
  private signer: Ed25519Keypair | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor() {
    const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
    this.suiClient = new SuiClient({ url: fullnodeUrl });
    this.packageId = process.env.CAPSULE_NFT_PACKAGE_ID || process.env.CAPSULE_PACKAGE_ID || '0x267d1b63db92e7a5502b334cd353cea7a5d40c9ed779dee4fe7211f37eb9f4b4';

    // Initialize signer if available (try NFT_SERVICE_KEYPAIR first, then WALRUS_SERVICE_KEYPAIR as fallback)
    const keypairEnv = process.env.NFT_SERVICE_KEYPAIR || process.env.WALRUS_SERVICE_KEYPAIR;
    if (keypairEnv) {
      try {
        const keyString = keypairEnv;
        if (keyString.startsWith('suiprivkey1')) {
          this.signer = Ed25519Keypair.fromSecretKey(keyString);
        } else {
          this.signer = Ed25519Keypair.fromSecretKey(fromB64(keyString));
        }
        const keypairSource = process.env.NFT_SERVICE_KEYPAIR ? 'NFT_SERVICE_KEYPAIR' : 'WALRUS_SERVICE_KEYPAIR';
        logger.info('Timed NFT service signer initialized', { 
          address: this.signer.toSuiAddress(),
          source: keypairSource 
        });
      } catch (error) {
        logger.error('Failed to initialize timed NFT service signer', { error });
      }
    } else {
      logger.warn('No NFT_SERVICE_KEYPAIR or WALRUS_SERVICE_KEYPAIR configured, timed NFT unlocking will be limited');
    }
  }

  /**
   * Start the daily cron job
   * Runs at midnight every day (00:00 UTC)
   */
  start(): void {
    if (this.cronJob) {
      logger.warn('Timed NFT cron job already running');
      return;
    }

    // Run daily at midnight UTC (0 0 * * *)
    // For testing, you can use '*/5 * * * *' to run every 5 minutes
    const cronSchedule = process.env.TIMED_NFT_CRON_SCHEDULE || '0 0 * * *';
    
    this.cronJob = cron.schedule(cronSchedule, async () => {
      if (this.isRunning) {
        logger.warn('Previous timed NFT check still running, skipping this run');
        return;
      }
      
      this.isRunning = true;
      logger.info('Starting daily timed NFT unlock check', { schedule: cronSchedule });
      
      try {
        await this.checkAndUnlockNFTs();
      } catch (error) {
        logger.error('Error during timed NFT unlock check', { error });
      } finally {
        this.isRunning = false;
      }
    });

    logger.info('Timed NFT service started', { 
      schedule: cronSchedule,
      hasSigner: !!this.signer 
    });
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Timed NFT service stopped');
    }
  }

  /**
   * Check and unlock NFTs that have reached their unlock time
   */
  async checkAndUnlockNFTs(): Promise<{ checked: number; unlocked: number; errors: number }> {
    const db = getDatabase();
    const now = Date.now();
    
    try {
      // Query all locked NFTs where unlock_at <= now
      const [rows] = await db.execute(`
        SELECT nft_id, object_id, unlock_at, capsule_id, owner_address
        FROM capsule_nfts
        WHERE is_locked = 1 
        AND unlock_at > 0 
        AND unlock_at <= ?
        ORDER BY unlock_at ASC
      `, [now]) as [any[], any];

      const nftsToUnlock = rows as Array<{
        nft_id: string;
        object_id: string;
        unlock_at: number;
        capsule_id: string;
        owner_address: string;
      }>;

      logger.info('Found NFTs to unlock', { count: nftsToUnlock.length });

      let unlocked = 0;
      let errors = 0;

      const notificationService = getNotificationService();

      for (const nft of nftsToUnlock) {
        try {
          await this.unlockNFT(nft.object_id, nft.nft_id);
          unlocked++;
          
          // Update database
          await db.execute(
            'UPDATE capsule_nfts SET is_locked = 0 WHERE nft_id = ?',
            [nft.nft_id]
          );
          
          // Get NFT metadata for notification
          const [metadataRows] = await db.execute(
            'SELECT metadata FROM capsule_nfts WHERE nft_id = ?',
            [nft.nft_id]
          ) as [any[], any];
          
          const metadata = metadataRows[0]?.metadata 
            ? JSON.parse(metadataRows[0].metadata) 
            : {};

          // Send unlock notification
          const notification: UnlockNotification = {
            nftId: nft.nft_id,
            capsuleId: nft.capsule_id,
            ownerAddress: nft.owner_address,
            unlockedAt: now,
            unlockAt: nft.unlock_at,
            message: metadata.message,
          };

          await notificationService.notifyNFTUnlocked(notification).catch((notifError) => {
            logger.warn('Failed to send unlock notification (non-critical)', {
              error: notifError,
              nftId: nft.nft_id,
            });
          });
          
          logger.info('NFT unlocked successfully', {
            nftId: nft.nft_id,
            capsuleId: nft.capsule_id,
            unlockAt: new Date(nft.unlock_at).toISOString(),
          });
        } catch (error) {
          errors++;
          logger.error('Failed to unlock NFT', {
            error,
            nftId: nft.nft_id,
            objectId: nft.object_id,
            capsuleId: nft.capsule_id,
          });
        }
      }

      logger.info('Timed NFT unlock check completed', {
        checked: nftsToUnlock.length,
        unlocked,
        errors,
      });

      return {
        checked: nftsToUnlock.length,
        unlocked,
        errors,
      };
    } catch (error) {
      logger.error('Failed to check and unlock NFTs', { error });
      throw error;
    }
  }

  /**
   * Unlock a single NFT on-chain
   */
  private async unlockNFT(objectId: string, nftId: string): Promise<void> {
    if (!this.signer) {
      throw new Error('No signer available for NFT unlocking');
    }

    const tx = new Transaction();
    tx.setSender(this.signer.toSuiAddress());
    tx.setGasBudget(10000000n); // 0.01 SUI

    // Get NFT object and Clock object
    const nft = tx.object(objectId);
    const clock = tx.object('0x6'); // Sui Clock object ID

    // Call unlock_nft function
    tx.moveCall({
      target: `${this.packageId}::capsule_nft::unlock_nft`,
      arguments: [nft, clock],
    });

    const txBytes = await tx.build({ client: this.suiClient });
    const signature = await this.signer.signTransaction(txBytes);
    
    const result = await this.suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: typeof signature === 'string' ? signature : signature.signature,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    // Check for execution failure
    if (result.effects?.status.status === 'failure') {
      const errorMsg = result.effects.status.error || 'Transaction executed but failed';
      throw new Error(`NFT unlock failed: ${errorMsg}`);
    }

    logger.debug('NFT unlocked on-chain', { nftId, txDigest: result.digest });
  }

  /**
   * Manually trigger unlock check (for testing or manual runs)
   */
  async manualCheck(): Promise<{ checked: number; unlocked: number; errors: number }> {
    logger.info('Manual timed NFT unlock check triggered');
    return this.checkAndUnlockNFTs();
  }

  /**
   * Start checking for upcoming unlocks (for advance notifications)
   * Runs every 6 hours to check for NFTs unlocking soon
   */
  startUpcomingUnlockChecks(): void {
    const notificationService = getNotificationService();
    
    // Run every 6 hours
    const cronSchedule = process.env.UPCOMING_UNLOCK_CRON_SCHEDULE || '0 */6 * * *';
    
    cron.schedule(cronSchedule, async () => {
      logger.info('Checking for upcoming NFT unlocks');
      try {
        await notificationService.checkAndNotifyUpcomingUnlocks();
      } catch (error) {
        logger.error('Error checking upcoming unlocks', { error });
      }
    });

    logger.info('Upcoming unlock checks started', { schedule: cronSchedule });
  }
}

// Export singleton instance
let serviceInstance: TimedNFTService | null = null;

export function getTimedNFTService(): TimedNFTService {
  if (!serviceInstance) {
    serviceInstance = new TimedNFTService();
  }
  return serviceInstance;
}

export default getTimedNFTService;

