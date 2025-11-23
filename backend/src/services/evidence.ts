/**
 * Evidence Upload Service
 * Handles anonymous evidence uploads with encryption and Walrus storage
 * 
 * Uses:
 * - Lit-style AES-GCM encryption service with wrapped keys
 * - Walrus SDK for immutable blob storage
 * - snappy for compression
 */

import { createHash } from 'crypto';
import WalrusService from './walrus';
import { getDatabase } from '../db/database';
import { getErrorMessage } from '../types/common';
import { logger } from '../utils/logger';
import { retryWithBackoff } from '../utils/retry';
import { createCircuitBreaker, CircuitBreaker } from '../utils/circuitBreaker';
import type { EvidenceMetadata, EvidenceUploadResult, EvidenceData } from '../types/evidence';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import sealService from './seal';

/**
 * Compute SHA256 hash of data for integrity checking
 */
function computeHash(data: Buffer | Uint8Array): string {
  const hash = createHash('sha256');
  if (data instanceof Buffer) {
    hash.update(data);
  } else {
    hash.update(Buffer.from(data));
  }
  return hash.digest('hex');
}

// Import snappy for compression (optional dependency)
type SnappyModule = typeof import('snappy');
let snappy: SnappyModule | null = null;

// Initialize snappy at module load time
(async () => {
  try {
    snappy = await import('snappy');
  } catch (error) {
    logger.warn('snappy compression not available, files will not be compressed', { error });
  }
})();

interface EvidenceServiceConfig {
  network?: 'testnet' | 'devnet' | 'mainnet';
  walrusSigner?: Ed25519Keypair;
}

class EvidenceService {
  private walrusService: WalrusService;
  private circuitBreaker: CircuitBreaker;
  private db = getDatabase();

  constructor(config: EvidenceServiceConfig = {}) {
    const network = config.network || (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    
    this.walrusService = new WalrusService({
      network,
      signer: config.walrusSigner,
      // Relay is always enabled by default in WalrusService
    });

    this.circuitBreaker = createCircuitBreaker('Evidence', {
      failureThreshold: 5,
      resetTimeout: 30000,
    });

    logger.info('Evidence service initialized', { network });
  }

  /**
   * Upload evidence file with encryption and compression
   */
  async uploadEvidence(
    fileBuffer: Buffer,
    metadata: EvidenceMetadata,
    userAddress: string,
    signer?: Ed25519Keypair,
    userVaultId?: string,
    policy: Record<string, unknown> = {}
  ): Promise<EvidenceUploadResult> {
    return this.circuitBreaker.execute(async () => {
      return retryWithBackoff(async () => {
        try {
          // Step 0: Compute original file hash
          const originalHash = computeHash(fileBuffer);
          logger.info('File upload started', { 
            originalSize: fileBuffer.length,
            originalHash,
            fileType: metadata.fileType 
          });

          // Step 1: Compress file (if snappy available)
          let processedData = fileBuffer;
          let compressedHash: string | undefined;
          if (snappy) {
            try {
              processedData = Buffer.from(await snappy.compress(fileBuffer));
              compressedHash = computeHash(processedData);
              logger.info('File compressed', { 
                originalSize: fileBuffer.length, 
                compressedSize: processedData.length,
                originalHash,
                compressedHash,
                compressionRatio: ((1 - processedData.length / fileBuffer.length) * 100).toFixed(2) + '%'
              });
            } catch (compressError) {
              logger.warn('Compression failed, using original file', { error: compressError });
              processedData = fileBuffer;
            }
          } else {
            compressedHash = originalHash; // No compression, same hash
          }

          // Step 2: Encrypt with Seal Protocol
          const dataToEncrypt = processedData instanceof Buffer ? processedData : Buffer.from(processedData);
          
          const preEncryptHash = computeHash(dataToEncrypt);
          logger.debug('Pre-encryption validation', {
            dataSize: dataToEncrypt.byteLength,
            preEncryptHash,
            matchesCompressed: preEncryptHash === compressedHash
          });

          // Encrypt with Seal (user address is used as the identity)
          const encryption = await sealService.encrypt(
            Buffer.from(dataToEncrypt),
            userAddress
          );

          const encryptedHash = computeHash(encryption.encryptedBytes);
          logger.info('Evidence encrypted with Seal Protocol', { 
            encryptedDataId: encryption.encryptedDataId, 
            encryptedSize: encryption.encryptedBytes.length,
            preEncryptHash,
            encryptedHash,
            encryptedFirstBytes: Array.from(encryption.encryptedBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')
          });

          // Step 3: Prepare for Walrus upload (base64 encoding)
          const base64Data = Buffer.from(encryption.encryptedBytes).toString('base64');
          const base64Decoded = Buffer.from(base64Data, 'base64');
          const base64DecodedHash = computeHash(base64Decoded);
          
          // Verify base64 round-trip integrity
          if (base64DecodedHash !== encryptedHash) {
            logger.error('Base64 encoding corruption detected!', {
              encryptedHash,
              base64DecodedHash,
              encryptedSize: encryption.encryptedBytes.length,
              base64DecodedSize: base64Decoded.length
            });
            throw new Error('Data corruption detected during base64 encoding');
          }
          
          logger.debug('Base64 encoding validated', {
            base64Size: base64Data.length,
            decodedSize: base64Decoded.length,
            hashMatch: base64DecodedHash === encryptedHash
          });

          // Step 4: Upload encrypted blob to Walrus
          // Use signer from parameter if provided, otherwise use instance signer
          const blobId = await this.walrusService.storeBlob({
            data: base64Data,
            metadata: {
              identifier: encryption.encryptedDataId,
              type: 'encrypted_evidence',
              userAddress,
              originalHash, // Store hash in metadata for validation
              encryptedHash,
              ...metadata,
            },
          }, signer);

      this.walrusService.verifyBlobIntegrity(blobId, encryption.encryptedBytes, {
        stage: 'evidence_upload',
        dataId: encryption.encryptedDataId,
        userAddress,
      }).catch(error => {
        logger.warn('Walrus blob verification failed after evidence upload', { error, blobId, dataId: encryption.encryptedDataId, userAddress });
      });

          logger.info('Evidence uploaded to Walrus', { blobId, dataId: encryption.encryptedDataId });

          // Step 4: Ensure user vault exists in vaults table (one vault per user)
          let actualUserVaultId = userVaultId;
          if (!actualUserVaultId) {
            // Check if vault exists for this user
            const [existingVaults] = await this.db.execute(
              'SELECT vault_id FROM vaults WHERE user_address = ?',
              [userAddress]
            ) as [any[], any];
            
            if (existingVaults.length > 0) {
              actualUserVaultId = existingVaults[0].vault_id;
              logger.info('Using existing user vault', { userAddress, vaultId: actualUserVaultId });
            } else {
              // Create a new vault for this user
              actualUserVaultId = createHash('sha256')
                .update(userAddress + 'user_vault')
                .digest('hex');
              
              await this.db.execute(
                'INSERT INTO vaults (vault_id, user_address, unlock_type, created_at) VALUES (?, ?, ?, ?)',
                [
                  actualUserVaultId,
                  userAddress,
                  'manual', // Default unlock type for capsules
                  new Date().toISOString().replace('T', ' ').slice(0, 19)
                ]
              );
              logger.info('Created new user vault', { userAddress, vaultId: actualUserVaultId });
            }
          }

          // Step 5: Generate capsule/memory vault ID (unique per upload)
          const vaultId = createHash('sha256')
            .update(userAddress + blobId + Date.now().toString())
            .digest('hex');

          // Step 6: Store metadata in database
          const metadataHash = createHash('sha256')
            .update(JSON.stringify(metadata))
            .digest('hex');

          await this.db.execute(
            'INSERT INTO evidence_vaults (vault_id, user_vault_id, user_address, blob_id, encrypted_data_id, metadata_hash, file_size, file_type, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              vaultId,
              actualUserVaultId, // Use the user's vault ID (ensured to exist above)
              userAddress,
              blobId,
              encryption.encryptedDataId,
              metadataHash,
              fileBuffer.length,
              metadata.fileType || 'unknown',
              metadata.description || null,
              new Date().toISOString().replace('T', ' ').slice(0, 19) // Convert to MySQL datetime format: YYYY-MM-DD HH:MM:SS
            ]
          );

          logger.info('Evidence vault created', { vaultId, blobId, dataId: encryption.encryptedDataId });

          return {
            vaultId,
            blobId,
            encryptedDataId: encryption.encryptedDataId,
            createdAt: new Date().toISOString(),
            encryptedSize: encryption.encryptedBytes.length,
            encryptedHash,
          };
        } catch (error: unknown) {
          const errorMessage = getErrorMessage(error);
          const errorDetails = error instanceof Error 
            ? { message: error.message, stack: error.stack, name: error.name }
            : { error: String(error) };
          logger.error('Error uploading evidence', { 
            error: errorDetails, 
            userAddress,
            errorMessage 
          });
          throw new Error(`Failed to upload evidence: ${errorMessage}`);
        }
      });
    });
  }

  /**
   * Get evidence metadata (encrypted data remains encrypted)
   */
  async getEvidence(vaultId: string, userAddress: string): Promise<EvidenceData> {
    try {
      logger.info('Getting evidence from database', { vaultId, userAddress });
      const [vaultRows] = await this.db.execute(
        'SELECT * FROM evidence_vaults WHERE vault_id = ? AND user_address = ?',
        [vaultId, userAddress]
      ) as [any[], any];

      const vault = vaultRows[0] as {
        vault_id: string;
        user_address: string;
        blob_id: string;
        encrypted_data_id: string;
        metadata_hash: string;
        file_size: number;
        file_type: string;
        description: string | null;
        created_at: string;
        release_triggered_at: string | null;
      } | undefined;

      if (!vault) {
        logger.warn('Vault not found or access denied', { vaultId, userAddress });
        throw new Error('Vault not found or access denied');
      }

      logger.info('Vault found, retrieving blob from Walrus', { vaultId, blobId: vault.blob_id, fileSize: vault.file_size });
      const blobData = await this.walrusService.getBlobWithRetry(vault.blob_id, {
        vaultId: vault.vault_id,
        userAddress,
      }, {
        expectedMetadata: {
          identifier: vault.encrypted_data_id,
          encryptedHash: vault.metadata_hash, // metadata_hash should be the encrypted hash
        }
      });
      logger.info('Blob retrieved from Walrus', { vaultId, blobId: vault.blob_id, blobSize: blobData.data.length });

      return {
        vaultId: vault.vault_id,
        blobId: vault.blob_id,
        encryptedDataId: vault.encrypted_data_id,
        metadata: {
          fileType: vault.file_type,
          fileSize: vault.file_size,
          description: vault.description || undefined,
        },
        createdAt: vault.created_at,
        encryptedBytes: Buffer.from(blobData.data, 'base64'),
      };
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : { error: String(error) };
      logger.error('Error getting evidence', { 
        error: errorDetails, 
        vaultId, 
        userAddress,
        errorMessage 
      });
      throw new Error(`Failed to get evidence: ${errorMessage}`);
    }
  }

  /**
   * List user's vaults
   */
  async listMyVaults(userAddress: string): Promise<Array<{
    vaultId: string;
    blobId: string;
    createdAt: string;
    hasDeadManSwitch: boolean;
    releaseTriggered: boolean;
  }>> {
    try {
      logger.info('Listing user vaults from database', { userAddress });
      const [vaultRows] = await this.db.execute(
        'SELECT v.vault_id, v.blob_id, v.created_at, v.release_triggered_at, CASE WHEN s.switch_id IS NOT NULL THEN 1 ELSE 0 END as has_switch FROM evidence_vaults v LEFT JOIN dead_man_switches s ON v.vault_id = s.vault_id WHERE v.user_address = ? ORDER BY v.created_at DESC',
        [userAddress]
      ) as [any[], any];
      const vaults = vaultRows as Array<{
        vault_id: string;
        blob_id: string;
        created_at: string;
        release_triggered_at: string | null;
        has_switch: number;
      }>;

      const result = vaults.map(v => ({
        vaultId: v.vault_id,
        blobId: v.blob_id,
        createdAt: v.created_at,
        hasDeadManSwitch: v.has_switch === 1,
        releaseTriggered: v.release_triggered_at !== null,
      }));
      logger.info('User vaults listed successfully', { userAddress, vaultCount: result.length });
      return result;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error('Error listing vaults', { error, userAddress });
      throw new Error(`Failed to list vaults: ${errorMessage}`);
    }
  }
}

export default EvidenceService;

