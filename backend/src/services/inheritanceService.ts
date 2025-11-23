/**
 * Inheritance Service
 * Handles inheritance operations: checking eligibility, claiming inheritance
 */

import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';
import { PolicyService } from './policyService';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

interface InheritanceConfig {
  network?: 'testnet' | 'devnet' | 'mainnet';
  capsulePackageId?: string;
  signer?: Ed25519Keypair;
}

interface InheritanceEligibility {
  capsuleId: string;
  eligible: boolean;
  reason?: string;
  inactiveSince?: Date;
  inactiveDays?: number;
  fallbackAddresses: string[];
  policyObjectId?: string;
}

class InheritanceService {
  private suiClient: SuiClient;
  private capsulePackageId: string;
  private signer: Ed25519Keypair | null = null;
  private policyService: PolicyService;

  constructor(config: InheritanceConfig = {}) {
    const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
    this.suiClient = new SuiClient({ url: fullnodeUrl });
    
    const network = config.network || (process.env.SUI_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    
    this.capsulePackageId = config.capsulePackageId || process.env.CAPSULE_PACKAGE_ID || '0x6d0be913760c1606a9c390990a3a07bed24235d728f0fc6cacf1dca792d9a5d0';

    // Initialize signer if provided
    if (config.signer) {
      this.signer = config.signer;
    } else if (process.env.INHERITANCE_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR) {
      try {
        const keyString = process.env.INHERITANCE_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR || '';
        if (keyString.startsWith('suiprivkey1')) {
          this.signer = Ed25519Keypair.fromSecretKey(keyString);
        } else {
          this.signer = Ed25519Keypair.fromSecretKey(fromB64(keyString));
        }
        logger.info('Inheritance service signer initialized', { address: this.signer.toSuiAddress() });
      } catch (error) {
        logger.error('Failed to initialize inheritance service signer', { error });
      }
    }

    // Initialize policy service
    this.policyService = new PolicyService({
      network,
      signer: this.signer || undefined,
    });

    logger.info('Inheritance service initialized', { 
      capsulePackageId: this.capsulePackageId,
      hasSigner: !!this.signer 
    });
  }

  /**
   * Check if a user is eligible to claim inheritance for any capsules
   * @param heirAddress - Address of potential heir
   * @returns List of capsules the user can claim
   */
  async checkEligibility(heirAddress: string): Promise<InheritanceEligibility[]> {
    try {
      const db = getDatabase();
      
      // Find all capsules where this address is a fallback address
      const [rows] = await db.execute(
        `SELECT 
          capsule_id, 
          fallback_addresses, 
          inactive_after_days, 
          auto_transfer, 
          last_ping 
        FROM capsule_inheritance 
        WHERE JSON_CONTAINS(fallback_addresses, ?)`,
        [JSON.stringify(heirAddress)]
      ) as [Array<{
        capsule_id: string;
        fallback_addresses: string;
        inactive_after_days: number;
        auto_transfer: number;
        last_ping: Date | null;
      }>, unknown];

      const eligible: InheritanceEligibility[] = [];

      for (const row of rows) {
        const fallbackAddresses = JSON.parse(row.fallback_addresses || '[]') as string[];
        const isHeir = fallbackAddresses.includes(heirAddress);
        
        if (!isHeir) continue;

        const autoTransfer = Boolean(row.auto_transfer);
        const inactiveAfterDays = row.inactive_after_days || 365;
        const lastPing = row.last_ping;
        
        let eligibleToClaim = false;
        let reason = '';
        let inactiveSince: Date | undefined;
        let inactiveDays: number | undefined;

        if (autoTransfer && lastPing) {
          // Check if inactive period has passed
          const now = new Date();
          const lastPingDate = new Date(lastPing);
          const daysSincePing = Math.floor((now.getTime() - lastPingDate.getTime()) / (1000 * 60 * 60 * 24));
          
          inactiveSince = lastPingDate;
          inactiveDays = daysSincePing;
          
          if (daysSincePing >= inactiveAfterDays) {
            eligibleToClaim = true;
            reason = `Owner inactive for ${daysSincePing} days (threshold: ${inactiveAfterDays} days)`;
          } else {
            reason = `Owner inactive for ${daysSincePing} days, need ${inactiveAfterDays - daysSincePing} more days`;
          }
        } else if (!autoTransfer) {
          // Manual claim - always eligible if configured
          eligibleToClaim = true;
          reason = 'Manual inheritance claim available';
        } else {
          reason = 'No ping data available';
        }

        eligible.push({
          capsuleId: row.capsule_id,
          eligible: eligibleToClaim,
          reason,
          inactiveSince,
          inactiveDays,
          fallbackAddresses,
        });
      }

      return eligible;
    } catch (error: unknown) {
      logger.error('Failed to check inheritance eligibility', { error, heirAddress });
      throw new Error(`Failed to check inheritance eligibility: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Claim inheritance for a capsule
   * @param capsuleId - Capsule ID
   * @param heirAddress - Address claiming inheritance
   * @param policyObjectId - On-chain policy object ID (optional)
   * @param signer - Optional signer (uses service signer if not provided)
   * @returns Transaction digest
   */
  async claimInheritance(
    capsuleId: string,
    heirAddress: string,
    policyObjectId?: string,
    signer?: Ed25519Keypair
  ): Promise<string> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for inheritance claim');
      }

      // Verify eligibility first
      const eligible = await this.checkEligibility(heirAddress);
      const capsuleEligible = eligible.find(e => e.capsuleId === capsuleId);
      
      if (!capsuleEligible || !capsuleEligible.eligible) {
        throw new Error(`Not eligible to claim inheritance for capsule ${capsuleId}: ${capsuleEligible?.reason || 'Not found'}`);
      }

      logger.info('Claiming inheritance', { capsuleId, heirAddress, policyObjectId });

      // If we have an on-chain policy object ID, use it to claim
      // Otherwise, we'll need to find the capsule object and policy
      if (policyObjectId) {
        // Get policy object
        const policy = await this.policyService.getInheritancePolicy(policyObjectId);
        if (!policy) {
          throw new Error(`Inheritance policy not found: ${policyObjectId}`);
        }

        // Verify heir matches
        if (policy.heir.toLowerCase() !== heirAddress.toLowerCase()) {
          throw new Error(`Heir address mismatch: expected ${policy.heir}, got ${heirAddress}`);
        }

        // Build transaction to claim inheritance
        const tx = new Transaction();
        tx.setSender(effectiveSigner.toSuiAddress());
        tx.setGasBudget(10000000n);

        // Get Clock object
        const clock = tx.object('0x6');
        
        // Get policy and capsule objects
        
        throw new Error('Claiming inheritance requires capsule object ID - not yet implemented');
      } else {
        // No on-chain policy - update database only
        // This is a fallback for capsules without on-chain policies
        const db = getDatabase();
        await db.execute(
          'UPDATE evidence_vaults SET user_address = ? WHERE vault_id = ?',
          [heirAddress, capsuleId]
        );
        
        logger.info('Inheritance claimed (database only - no on-chain policy)', {
          capsuleId,
          heirAddress,
        });
        
        return 'database-only-claim';
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to claim inheritance', { error, capsuleId, heirAddress });
      throw new Error(`Failed to claim inheritance: ${errorMessage}`);
    }
  }

  /**
   * Get inheritance settings for a capsule
   * @param capsuleId - Capsule ID
   * @returns Inheritance settings or null
   */
  async getInheritanceSettings(capsuleId: string): Promise<{
    fallbackAddresses: string[];
    inactiveAfterDays: number;
    lastPing: Date | null;
    autoTransfer: boolean;
  } | null> {
    try {
      const db = getDatabase();
      const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      
      const [rows] = await db.execute(
        'SELECT fallback_addresses, inactive_after_days, last_ping, auto_transfer FROM capsule_inheritance WHERE capsule_id = ?',
        [normalizedCapsuleId]
      ) as [Array<{
        fallback_addresses: string;
        inactive_after_days: number;
        last_ping: Date | null;
        auto_transfer: number;
      }>, unknown];

      if (!rows.length) {
        return null;
      }

      const row = rows[0];
      return {
        fallbackAddresses: JSON.parse(row.fallback_addresses || '[]'),
        inactiveAfterDays: row.inactive_after_days,
        lastPing: row.last_ping,
        autoTransfer: Boolean(row.auto_transfer),
      };
    } catch (error: unknown) {
      logger.error('Failed to get inheritance settings', { error, capsuleId });
      return null;
    }
  }
}

export { InheritanceService, InheritanceEligibility };

