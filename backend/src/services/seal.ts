/**
 * Seal Protocol Service
 * Handles encryption and decryption using Seal (Mysten Labs threshold encryption)
 * Supports time-based and wallet-based access control via seal_approve Move functions
 */

import { SealClient, SessionKey, DemType } from '@mysten/seal';
// KemType enum - using the value directly since it's not exported from main index
// From @mysten/seal/dist/cjs/encrypt.js: enum KemType { BonehFranklinBLS12381DemCCA = 0 }
const KemType = {
  BonehFranklinBLS12381DemCCA: 0,
} as const;
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { fromB64, fromHEX } from '@mysten/sui/utils';
import { logger } from '../utils/logger';
import { saveSealKeyMetadata, getSealKeyMetadata } from '../db/sealKeys';

interface SealEncryptionResult {
  encryptedBytes: Buffer;
  encryptedDataId: string;
  encryptedObject: Uint8Array; // BCS-encoded EncryptedObject
  symmetricKey: Uint8Array; // DEM key for backup/decryption
  packageId: string;
  id: string; // Identity used for encryption
  threshold: number;
}

interface SealDecryptionResult {
  decrypted: Buffer;
  encryptedDataId: string;
}

interface SealKeyServerConfig {
  objectId: string;
  weight: number;
  apiKeyName?: string;
  apiKey?: string;
}

class SealService {
  private sealClient: SealClient | null = null;
  private suiClient: SuiClient;
  private sessionKeypair: Ed25519Keypair | null = null;
  private packageId: string;
  private threshold: number;
  private serverConfigs: SealKeyServerConfig[];
  private initialized = false;
  private metadataMode: 'db' | 'memory';
  private inMemoryMetadata = new Map<string, string>();

  constructor() {
    const network = (process.env.SUI_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
    
    this.suiClient = new SuiClient({ url: fullnodeUrl });
    
    // Package ID from environment or defaults
    this.packageId = process.env.SEAL_PACKAGE_ID || (
      network === 'mainnet' 
        ? '0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d'
        : '0x927a54e9ae803f82ebf480136a9bcff45101ccbe28b13f433c89f5181069d682'
    );

    // Parse key server configs from environment
    this.serverConfigs = this.parseKeyServerConfigs();
    this.threshold = parseInt(process.env.SEAL_THRESHOLD || '2', 10);
    this.metadataMode = process.env.SEAL_METADATA_MODE === 'memory' ? 'memory' : 'db';

    // Load session keypair for decryption
    if (process.env.SEAL_SESSION_PRIVATE_KEY) {
      try {
        const keyString = process.env.SEAL_SESSION_PRIVATE_KEY;
        if (keyString.startsWith('suiprivkey1')) {
          this.sessionKeypair = Ed25519Keypair.fromSecretKey(keyString);
        } else {
          this.sessionKeypair = Ed25519Keypair.fromSecretKey(fromB64(keyString));
        }
        logger.info('Seal session keypair loaded', { 
          address: this.sessionKeypair.toSuiAddress() 
        });
      } catch (error) {
        logger.error('Failed to load SEAL_SESSION_PRIVATE_KEY', { error });
      }
    }
  }

  private parseKeyServerConfigs(): SealKeyServerConfig[] {
    // Try parsing from SEAL_KEY_SERVERS JSON array
    if (process.env.SEAL_KEY_SERVERS) {
      try {
        const parsed = JSON.parse(process.env.SEAL_KEY_SERVERS);
        if (Array.isArray(parsed)) {
          return parsed.map((s: any) => ({
            objectId: s.objectId || s.object_id,
            weight: s.weight || 1,
            apiKeyName: s.apiKeyName || s.api_key_name,
            apiKey: s.apiKey || s.api_key,
          }));
        }
      } catch (error) {
        logger.warn('Failed to parse SEAL_KEY_SERVERS, using defaults', { error });
      }
    }

    // Default testnet key servers
    const network = (process.env.SUI_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    if (network === 'testnet') {
      return [
        { objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75', weight: 1 },
        { objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8', weight: 1 },
        { objectId: '0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2', weight: 1 },
      ];
    }

    // Mainnet defaults (update with actual mainnet IDs)
    return [
      { objectId: '0x...', weight: 1 },
    ];
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.sealClient) {
      return;
    }

    try {
      // Initialize Seal client directly
      this.sealClient = new SealClient({
        suiClient: this.suiClient as any, // Type assertion to handle version mismatch
        serverConfigs: this.serverConfigs.map(config => ({
          objectId: config.objectId,
          weight: config.weight,
          apiKeyName: config.apiKeyName,
          apiKey: config.apiKey,
        })),
        verifyKeyServers: process.env.SEAL_VERIFY_KEY_SERVERS !== 'false',
        timeout: parseInt(process.env.SEAL_TIMEOUT_MS || '10000', 10),
      });

      this.initialized = true;

      logger.info('Seal client initialized', {
        packageId: this.packageId,
        threshold: this.threshold,
        keyServerCount: this.serverConfigs.length,
        network: process.env.SUI_NETWORK || 'testnet',
      });
    } catch (error) {
      logger.error('Failed to initialize Seal client', { error });
      throw new Error(`Failed to initialize Seal client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Encrypt data using Seal Protocol
   * @param data - Data to encrypt
   * @param userAddress - Sui address of the user (used as identity)
   * @param dataId - Optional ID for the encrypted data (for metadata storage)
   * @returns Encrypted data and metadata
   */
  async encrypt(
    data: Buffer,
    userAddress: string,
    dataId?: string
  ): Promise<SealEncryptionResult> {
    await this.ensureInitialized();
    if (!this.sealClient) {
      throw new Error('Seal client not initialized');
    }

    const encryptedDataId = dataId || `seal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // Use user address as the identity (ID) for encryption
    // Convert address to hex bytes (remove 0x prefix if present)
    // Seal expects the ID as a hex string (without 0x prefix)
    const identityHex = userAddress.startsWith('0x') ? userAddress.slice(2) : userAddress;

    try {
      const encryptionResult = await this.sealClient.encrypt({
        kemType: 0 as any, // KemType.BonehFranklinBLS12381DemCCA = 0
        demType: DemType.AesGcm256,
        threshold: this.threshold,
        packageId: this.packageId,
        id: identityHex, // Seal expects hex string, not bytes
        data: new Uint8Array(data),
        aad: new Uint8Array(), // Additional authenticated data (empty for now)
      });

      // Store minimal metadata for decryption
      // We only need packageId, id, and threshold to reconstruct the decryption request
      const metadata = {
        packageId: this.packageId,
        id: identityHex, // Store as hex string (identity used for encryption)
        threshold: this.threshold,
        userAddress,
        // Optional: Store symmetric key hash for verification (not the full key)
        symmetricKeyHash: Buffer.from(encryptionResult.key).toString('hex').substring(0, 16), // First 16 chars for verification
      };

      await this.persistMetadata(encryptedDataId, metadata);

      logger.info('Data encrypted with Seal Protocol', {
        encryptedDataId,
        originalSize: data.length,
        encryptedSize: encryptionResult.encryptedObject.length,
        userAddress,
      });

      return {
        encryptedBytes: Buffer.from(encryptionResult.encryptedObject),
        encryptedDataId,
        encryptedObject: encryptionResult.encryptedObject,
        symmetricKey: encryptionResult.key,
        packageId: this.packageId,
        id: identityHex,
        threshold: this.threshold,
      };
    } catch (error) {
      logger.error('Seal Protocol encryption failed', { error, encryptedDataId, userAddress });
      throw new Error(`Seal Protocol encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt data using Seal Protocol
   * @param encryptedBytes - Encrypted data (BCS-encoded EncryptedObject)
   * @param encryptedDataId - ID to retrieve metadata
   * @returns Decrypted data
   */
  async decrypt(
    encryptedBytes: Buffer,
    encryptedDataId: string
  ): Promise<SealDecryptionResult> {
    await this.ensureInitialized();
    if (!this.sealClient || !this.sessionKeypair) {
      throw new Error('Seal client or session keypair not initialized');
    }

    try {
      // Load metadata
      const metadataString = await this.loadMetadata(encryptedDataId);
      if (!metadataString) {
        throw new Error(`No Seal encryption metadata found for ${encryptedDataId}`);
      }

      const metadata = JSON.parse(metadataString);
      const { packageId, id, threshold } = metadata;

      // Create session key for decryption
      // We'll use type assertion to work around this
      const sessionKey = await SessionKey.create({
        address: this.sessionKeypair.toSuiAddress(),
        packageId,
        ttlMin: 10, // 10 minute TTL
        signer: this.sessionKeypair as any, // Type assertion to handle version mismatch
        suiClient: this.suiClient as any, // Type assertion to handle version mismatch
      });

      // Sign personal message for session key
      const personalMessage = sessionKey.getPersonalMessage();
      const { signature } = await this.sessionKeypair.signPersonalMessage(personalMessage);
      await sessionKey.setPersonalMessageSignature(signature);

      // Build transaction for seal_approve
      const tx = new Transaction();
      // Convert hex string ID back to bytes for the Move function
      const identityBytes = fromHEX(id.startsWith('0x') ? id.slice(2) : id);
      
      // Call seal_approve entry function
      // The module name can be configured via SEAL_APPROVE_MODULE env var (default: seal_policy)
      // The requester address is derived from ctx.sender() in the Move function
      const sealModule = process.env.SEAL_APPROVE_MODULE || 'seal_policy';
      tx.moveCall({
        target: `${packageId}::${sealModule}::seal_approve`,
        arguments: [
          tx.pure.vector('u8', identityBytes),
        ],
      });

      const txBytes = await tx.build({ 
        client: this.suiClient, 
        onlyTransactionKind: true 
      });

      // Decrypt using Seal client
      const decryptedBytes = await this.sealClient.decrypt({
        data: new Uint8Array(encryptedBytes),
        sessionKey,
        txBytes,
        checkShareConsistency: false,
        checkLEEncoding: false,
      });

      logger.info('Data decrypted with Seal Protocol', {
        encryptedDataId,
        decryptedSize: decryptedBytes.length,
      });

      return {
        decrypted: Buffer.from(decryptedBytes),
        encryptedDataId,
      };
    } catch (error) {
      logger.error('Seal Protocol decryption failed', { error, encryptedDataId });
      throw new Error(`Seal Protocol decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify Seal connectivity
   */
  async verifyConnectivity(context: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.sealClient) {
        return false;
      }

      // Try to get key servers (this will verify connectivity)
      await this.sealClient.getKeyServers();
      
      logger.info('Seal connectivity verified', {
        packageId: this.packageId,
        context,
      });
      return true;
    } catch (error) {
      logger.error('Seal connectivity check failed', { context, error });
      return false;
    }
  }

  private async persistMetadata(encryptedDataId: string, metadata: Record<string, unknown>): Promise<void> {
    const serialized = JSON.stringify(metadata);
    if (this.metadataMode === 'memory') {
      this.inMemoryMetadata.set(encryptedDataId, serialized);
      return;
    }
    await saveSealKeyMetadata(encryptedDataId, serialized);
  }

  private async loadMetadata(encryptedDataId: string): Promise<string | null> {
    if (this.metadataMode === 'memory') {
      return this.inMemoryMetadata.get(encryptedDataId) ?? null;
    }
    return getSealKeyMetadata(encryptedDataId);
  }
}

let sealServiceInstance: SealService | null = null;

export function getSealService(): SealService {
  if (!sealServiceInstance) {
    sealServiceInstance = new SealService();
  }
  return sealServiceInstance;
}

export default getSealService();

