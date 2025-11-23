/**
 * Policy Service
 * Manages on-chain policy objects (TimeLockPolicy, MultiPartyPolicy, InheritancePolicy)
 */

import { logger } from '../utils/logger';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64, fromHEX } from '@mysten/sui/utils';

interface PolicyConfig {
  network?: 'testnet' | 'devnet' | 'mainnet';
  sealPackageId?: string;
  capsulePackageId?: string;
  signer?: Ed25519Keypair;
}

interface TimeLockPolicy {
  objectId: string;
  dataId: string;
  unlockAt: number;
}

interface InheritancePolicy {
  objectId: string;
  capsuleId: string;
  heir: string;
  triggerCondition: number;
  triggerValue: number;
}

class PolicyService {
  private suiClient: SuiClient;
  private sealPackageId: string;
  private capsulePackageId: string;
  private signer: Ed25519Keypair | null = null;

  constructor(config: PolicyConfig = {}) {
    const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
    this.suiClient = new SuiClient({ url: fullnodeUrl });
    
    const network = config.network || (process.env.SUI_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    
    this.sealPackageId = config.sealPackageId || process.env.SEAL_PACKAGE_ID || (
      network === 'mainnet' 
        ? '0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d'
        : '0x5c1dfc84f7d49e83090eaca96a651c2bbaa5a6e999d1c854bd2c7fda8c02bd7f'
    );
    
    this.capsulePackageId = config.capsulePackageId || process.env.CAPSULE_PACKAGE_ID || '0x6d0be913760c1606a9c390990a3a07bed24235d728f0fc6cacf1dca792d9a5d0';

    // Initialize signer if provided
    if (config.signer) {
      this.signer = config.signer;
    } else if (process.env.POLICY_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR) {
      try {
        const keyString = process.env.POLICY_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR || '';
        if (keyString.startsWith('suiprivkey1')) {
          this.signer = Ed25519Keypair.fromSecretKey(keyString);
        } else {
          this.signer = Ed25519Keypair.fromSecretKey(fromB64(keyString));
        }
        logger.info('Policy service signer initialized', { address: this.signer.toSuiAddress() });
      } catch (error) {
        logger.error('Failed to initialize policy service signer', { error });
      }
    }

    logger.info('Policy service initialized', { 
      sealPackageId: this.sealPackageId, 
      capsulePackageId: this.capsulePackageId,
      hasSigner: !!this.signer 
    });
  }

  /**
   * Create a time-lock policy on-chain
   * @param dataId - Encrypted data ID (hex string or bytes)
   * @param unlockAt - Timestamp in milliseconds when capsule unlocks
   * @param signer - Optional signer (uses service signer if not provided)
   * @returns Policy object ID
   */
  async createTimeLockPolicy(
    dataId: string,
    unlockAt: number,
    signer?: Ed25519Keypair
  ): Promise<string> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for policy creation');
      }

      logger.info('Creating time-lock policy on-chain', { dataId, unlockAt });

      // Convert dataId to bytes
      const dataIdBytes = dataId.startsWith('0x') 
        ? fromHEX(dataId.slice(2))
        : new TextEncoder().encode(dataId);

      // Build transaction
      const tx = new Transaction();
      tx.setSender(effectiveSigner.toSuiAddress());
      tx.setGasBudget(10000000n);

      // Call create_time_lock_policy Move function
      const [policy] = tx.moveCall({
        target: `${this.sealPackageId}::seal_policy::create_time_lock_policy`,
        arguments: [
          tx.pure.vector('u8', Array.from(dataIdBytes)),
          tx.pure.u64(BigInt(unlockAt)),
        ],
      });

      // Transfer policy to sender
      tx.transferObjects([policy], effectiveSigner.toSuiAddress());

      // Build, sign, and execute transaction
      const txBytes = await tx.build({ client: this.suiClient });
      const signature = await effectiveSigner.signTransaction(txBytes);
      
      const result = await this.suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: typeof signature === 'string' ? signature : signature.signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      // Check for execution failure
      if (result.effects?.status.status === 'failure') {
        const errorMsg = result.effects.status.error || 'Transaction executed but failed';
        logger.error('Time-lock policy creation transaction failed', { 
          dataId, 
          error: errorMsg,
          digest: result.digest 
        });
        throw new Error(`Time-lock policy creation failed: ${errorMsg}`);
      }

      // Extract policy object ID from object changes
      const objectChanges = result.objectChanges || [];
      const createdPolicy = objectChanges.find(
        (change: any) => 
          change.type === 'created' && 
          change.objectType?.includes('TimeLockPolicy')
      );

      if (!createdPolicy || !('objectId' in createdPolicy)) {
        logger.error('Failed to find created policy object', { 
          dataId, 
          objectChanges: JSON.stringify(objectChanges, null, 2) 
        });
        throw new Error('Failed to extract policy object ID from transaction');
      }

      const policyObjectId = createdPolicy.objectId as string;
      logger.info('Time-lock policy created successfully', { 
        dataId, 
        unlockAt, 
        policyObjectId,
        txDigest: result.digest 
      });

      return policyObjectId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create time-lock policy', { error, dataId, unlockAt });
      throw new Error(`Failed to create time-lock policy: ${errorMessage}`);
    }
  }

  /**
   * Query and verify time-lock policy on-chain
   * @param dataId - Encrypted data ID
   * @param policyObjectId - Policy object ID (optional, will search if not provided)
   * @returns Policy data if found and valid, null otherwise
   */
  async checkOnChainTimeLock(
    dataId: string,
    policyObjectId?: string
  ): Promise<TimeLockPolicy | null> {
    try {
      // If policy object ID is provided, query directly
      if (policyObjectId) {
        const object = await this.suiClient.getObject({
          id: policyObjectId,
          options: {
            showContent: true,
            showType: true,
          },
        });

        if (object.data && 'content' in object.data && object.data.content && 'fields' in object.data.content) {
          const fields = object.data.content.fields as any;
          const policyDataId = fields.data_id || fields.data_id_bytes;
          
          // Convert policy data_id to string for comparison
          let policyDataIdStr = '';
          if (Array.isArray(policyDataId)) {
            policyDataIdStr = Buffer.from(policyDataId).toString('hex');
          } else if (typeof policyDataId === 'string') {
            policyDataIdStr = policyDataId;
          }

          // Normalize dataId for comparison
          const normalizedDataId = dataId.startsWith('0x') ? dataId.slice(2) : dataId;
          const normalizedPolicyId = policyDataIdStr.startsWith('0x') ? policyDataIdStr.slice(2) : policyDataIdStr;

          if (normalizedPolicyId.toLowerCase() === normalizedDataId.toLowerCase()) {
            const unlockAt = Number(fields.unlock_at || fields.unlockAt || 0);
            return {
              objectId: policyObjectId,
              dataId: policyDataIdStr,
              unlockAt,
            };
          }
        }
      }

      // If not found or no object ID provided, try to find by querying events
      logger.debug('Policy object ID not provided or not found, searching by data_id', { dataId });
      
      // For now, return null if we can't find it
      // In production, you might want to query events or use a registry pattern
      return null;
    } catch (error: unknown) {
      logger.warn('Failed to check on-chain time-lock policy', { error, dataId, policyObjectId });
      return null;
    }
  }

  /**
   * Verify if time-lock condition is met
   * @param policy - Time-lock policy
   * @returns true if unlock time has passed, false otherwise
   */
  async verifyTimeLockCondition(policy: TimeLockPolicy): Promise<boolean> {
    const now = Date.now();
    const isUnlocked = now >= policy.unlockAt;
    
    logger.debug('Time-lock condition check', {
      policyObjectId: policy.objectId,
      unlockAt: policy.unlockAt,
      now,
      isUnlocked,
      timeRemaining: isUnlocked ? 0 : policy.unlockAt - now,
    });

    return isUnlocked;
  }

  /**
   * Create inheritance policy on-chain
   * @param capsuleId - Capsule ID (hex string)
   * @param heir - Heir address
   * @param triggerCondition - 0 = death, 1 = time, 2 = manual
   * @param triggerValue - Timestamp or other value based on condition
   * @param signer - Optional signer (uses service signer if not provided)
   * @returns Policy object ID
   */
  async setInheritancePolicy(
    capsuleId: string,
    heir: string,
    triggerCondition: number,
    triggerValue: number,
    signer?: Ed25519Keypair
  ): Promise<string> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for inheritance policy creation');
      }

      logger.info('Creating inheritance policy on-chain', { 
        capsuleId, 
        heir, 
        triggerCondition, 
        triggerValue 
      });

      // Convert capsuleId to bytes
      const capsuleIdBytes = capsuleId.startsWith('0x') 
        ? fromHEX(capsuleId.slice(2))
        : new TextEncoder().encode(capsuleId);

      // Get capsule object - we need it to call set_inheritance
      // First, try to find the capsule object
      // For now, we'll need the capsule object ID passed in or queried separately
      // This is a limitation - we need the capsule object to call set_inheritance
      
      // Build transaction
      const tx = new Transaction();
      tx.setSender(effectiveSigner.toSuiAddress());
      tx.setGasBudget(10000000n);

      // Get Clock object
      const clock = tx.object('0x6');

      // This function requires the capsule object as a parameter
      // We'll need to query for it or have it passed in
      // For now, this is a placeholder - the actual implementation will need
      // to find the capsule object first
      
      // This is a simplified version - in production, you'd need to:
      // 1. Query for the capsule object by capsuleId
      // 2. Use that object in the transaction
      
      // For now, we'll create a helper that requires the capsule object ID
      throw new Error('setInheritancePolicy requires capsule object ID - use setInheritancePolicyWithCapsule instead');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create inheritance policy', { error, capsuleId, heir });
      throw new Error(`Failed to create inheritance policy: ${errorMessage}`);
    }
  }

  /**
   * Create inheritance policy on-chain (with capsule object)
   * @param capsuleObjectId - Capsule object ID on-chain
   * @param heir - Heir address
   * @param triggerCondition - 0 = death, 1 = time, 2 = manual
   * @param triggerValue - Timestamp or other value based on condition
   * @param signer - Optional signer (uses service signer if not provided)
   * @returns Policy object ID
   */
  async setInheritancePolicyWithCapsule(
    capsuleObjectId: string,
    heir: string,
    triggerCondition: number,
    triggerValue: number,
    signer?: Ed25519Keypair
  ): Promise<string> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for inheritance policy creation');
      }

      logger.info('Creating inheritance policy on-chain', { 
        capsuleObjectId, 
        heir, 
        triggerCondition, 
        triggerValue 
      });

      // Build transaction
      const tx = new Transaction();
      tx.setSender(effectiveSigner.toSuiAddress());
      tx.setGasBudget(10000000n);

      // Get capsule object
      const capsule = tx.object(capsuleObjectId);

      // Call set_inheritance Move function
      const [policy] = tx.moveCall({
        target: `${this.capsulePackageId}::capsule::set_inheritance`,
        arguments: [
          capsule,
          tx.pure.address(heir),
          tx.pure.u8(triggerCondition),
          tx.pure.u64(BigInt(triggerValue)),
        ],
      });

      // Transfer policy to sender
      tx.transferObjects([policy], effectiveSigner.toSuiAddress());

      // Build, sign, and execute transaction
      const txBytes = await tx.build({ client: this.suiClient });
      const signature = await effectiveSigner.signTransaction(txBytes);
      
      const result = await this.suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: typeof signature === 'string' ? signature : signature.signature,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });

      // Check for execution failure
      if (result.effects?.status.status === 'failure') {
        const errorMsg = result.effects.status.error || 'Transaction executed but failed';
        logger.error('Inheritance policy creation transaction failed', { 
          capsuleObjectId, 
          error: errorMsg,
          digest: result.digest 
        });
        throw new Error(`Inheritance policy creation failed: ${errorMsg}`);
      }

      // Extract policy object ID from object changes
      const objectChanges = result.objectChanges || [];
      const createdPolicy = objectChanges.find(
        (change: any) => 
          change.type === 'created' && 
          change.objectType?.includes('InheritancePolicy')
      );

      if (!createdPolicy || !('objectId' in createdPolicy)) {
        logger.error('Failed to find created inheritance policy object', { 
          capsuleObjectId, 
          objectChanges: JSON.stringify(objectChanges, null, 2) 
        });
        throw new Error('Failed to extract inheritance policy object ID from transaction');
      }

      const policyObjectId = createdPolicy.objectId as string;
      logger.info('Inheritance policy created successfully', { 
        capsuleObjectId, 
        heir,
        triggerCondition,
        triggerValue,
        policyObjectId,
        txDigest: result.digest 
      });

      return policyObjectId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create inheritance policy', { error, capsuleObjectId, heir });
      throw new Error(`Failed to create inheritance policy: ${errorMessage}`);
    }
  }

  /**
   * Query inheritance policy on-chain
   * @param policyObjectId - Policy object ID
   * @returns Policy data if found, null otherwise
   */
  async getInheritancePolicy(policyObjectId: string): Promise<InheritancePolicy | null> {
    try {
      const object = await this.suiClient.getObject({
        id: policyObjectId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (object.data && 'content' in object.data && object.data.content && 'fields' in object.data.content) {
        const fields = object.data.content.fields as any;
        return {
          objectId: policyObjectId,
          capsuleId: fields.capsule_id || '',
          heir: fields.heir || '',
          triggerCondition: Number(fields.trigger_condition || 0),
          triggerValue: Number(fields.trigger_value || 0),
        };
      }

      return null;
    } catch (error: unknown) {
      logger.warn('Failed to get inheritance policy', { error, policyObjectId });
      return null;
    }
  }
}

export { PolicyService, TimeLockPolicy, InheritancePolicy };

