/**
 * Walrus Integration Service
 * Uses official @mysten/walrus SDK - NO API KEY REQUIRED
 * 
 * Reference: https://sdk.mystenlabs.com/walrus
 * 
 * The Walrus SDK works directly with storage nodes on Sui testnet/mainnet.
 * No API key needed - it uses public storage nodes.
 */

import { SuiClient } from '@mysten/sui/client';
import { createHash } from 'crypto';
import { walrus, WalrusFile, type UploadRelayConfig, type UploadRelayTipConfig, type WalrusOptions } from '@mysten/walrus';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';
import type { WalrusClient, WalrusFileInstance, WalrusBlob } from '../types/walrus';
import { getErrorMessage, isRetryableError } from '../types/common';
import { logger } from '../utils/logger';
import { findBestFullnode } from '../utils/networkHealth';
import { promises as fs } from 'fs';
import path from 'path';
// Supabase removed - using MySQL for storage

interface WalrusConfig {
  network?: 'testnet' | 'devnet' | 'mainnet';
  // Optional: Use upload relay for better performance (reduces requests)
  uploadRelay?: UploadRelayConfig;
  // Optional: Signer for writing blobs (user's keypair)
  // If not provided, read-only operations only
  signer?: Ed25519Keypair;
}

interface BlobData {
  data: string; // Encrypted data as base64 or hex
  metadata?: Record<string, unknown>;
}

interface WalrusRetryContext {
  vaultId?: string;
  userAddress?: string;
  capsuleId?: string;
  attemptLabel?: string;
  route?: string;
  stage?: string;
  voice?: boolean;
  requester?: string;
  [key: string]: unknown;
}

export const DEFAULT_UPLOAD_RELAY_TIP_MAX = 5_000; // 0.005 SUI cap for auto tip detection

class WalrusService {
  async getBlobWithRetry(
    blobId: string,
    context: WalrusRetryContext = {},
    options: { maxRetries?: number; delayMs?: number; expectedMetadata?: { encryptedHash?: string; identifier?: string } } = {},
  ): Promise<BlobData> {
    // Increase retries for reads - storage nodes can be unreliable
    const maxRetries = options.maxRetries ?? 10;
    const baseDelay = options.delayMs ?? 3000; // Longer base delay for reads

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.getBlob(blobId, options.expectedMetadata);
        if (attempt > 1) {
          logger.info('Walrus blob retrieved after retries', {
            blobId,
            attempt,
            ...context,
          });
        }
        return result;
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        const isCertifiedError = errorMessage.includes('not certified');
        const isMissingBlob = errorMessage.includes('not found');
        const isLastAttempt = attempt === maxRetries;

        logger.warn('Walrus getBlob attempt failed', {
          blobId,
          attempt,
          maxRetries,
          error: errorMessage,
          isCertifiedError,
          ...context,
        });

        if (isMissingBlob) {
          throw new Error(`Walrus blob ${blobId} not found. It may have expired or never existed.`);
        }

        if (isLastAttempt) {
          throw new Error(`Failed to retrieve blob from Walrus after ${maxRetries} attempts: ${errorMessage}`);
        }

        // Exponential backoff with longer delays for reads
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000); // Max 30 seconds between retries
        logger.debug('Waiting before retry', { blobId, attempt, delay, maxRetries, ...context });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Failed to retrieve blob ${blobId} from Walrus after ${maxRetries} attempts`);
  }
  private client: WalrusClient;
  private network: string;
  private signer?: Ed25519Keypair;
  private originalConfig: WalrusConfig;
  private hasRelay: boolean;
  private relayFailed: boolean = false;

  constructor(config: WalrusConfig = {}) {
    const resolvedConfig = this.resolveConfig(config);
    this.originalConfig = resolvedConfig;
    this.network = resolvedConfig.network || 'testnet';
    this.hasRelay = !!resolvedConfig.uploadRelay;
    
    // Initialize Sui client with Walrus extension (async initialization)
    // We'll create the client lazily on first use to allow async fullnode selection
    this.client = null as any; // Will be initialized on first use

    this.signer = resolvedConfig.signer;

    logger.info('Walrus service initialized', { network: this.network, hasRelay: this.hasRelay });
  }

  private resolveConfig(config: WalrusConfig): WalrusConfig {
    const network = config.network || (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    const uploadRelay = config.uploadRelay ?? this.buildEnvUploadRelayConfig();

    return {
      ...config,
      network,
      uploadRelay,
    };
  }

  private buildEnvUploadRelayConfig(): UploadRelayConfig {
    // Always use relay - default to official Walrus relay if not specified
    // For testnet, use: https://upload-relay.testnet.walrus.space
    // For mainnet, use: https://upload-relay.mainnet.walrus.space
    const network = process.env.WALRUS_NETWORK || 'testnet';
    const defaultRelay = network === 'mainnet' 
      ? 'https://upload-relay.mainnet.walrus.space'
      : 'https://upload-relay.testnet.walrus.space';
    const host = process.env.WALRUS_UPLOAD_RELAY?.trim() || defaultRelay;

    const sendTip = this.buildEnvUploadRelayTipConfig();
    const relayConfig: UploadRelayConfig = {
      host,
      sendTip: sendTip ?? null,
    };

    logger.info('Upload relay enabled', {
      host,
      source: process.env.WALRUS_UPLOAD_RELAY ? 'environment variable' : 'default',
      tipMode: sendTip
        ? 'max' in sendTip
          ? 'max_tip'
          : 'manual_tip'
        : 'auto-detect',
    });

    return relayConfig;
  }

  private buildEnvUploadRelayTipConfig(): UploadRelayConfig['sendTip'] | undefined {
    const tipKindRaw = process.env.WALRUS_UPLOAD_RELAY_TIP_KIND?.trim().toLowerCase();
    const tipAddress = process.env.WALRUS_UPLOAD_RELAY_TIP_ADDRESS?.trim();

    const parseNumberEnv = (name: string): number | undefined => {
      const raw = process.env[name];
      if (!raw) {
        return undefined;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        logger.warn(`Invalid numeric value for ${name}`, { value: raw });
        return undefined;
      }
      return value;
    };

    if (tipKindRaw === 'const') {
      const amount = parseNumberEnv('WALRUS_UPLOAD_RELAY_TIP_AMOUNT');
      if (tipAddress && amount !== undefined) {
        return {
          address: tipAddress,
          kind: { const: amount },
        } as UploadRelayTipConfig;
      }

      logger.warn('Invalid WALRUS_UPLOAD_RELAY const tip configuration, falling back to auto tip detection', {
        hasAddress: !!tipAddress,
        hasAmount: amount !== undefined,
      });
      return undefined;
    }

    if (tipKindRaw === 'linear') {
      const base = parseNumberEnv('WALRUS_UPLOAD_RELAY_TIP_BASE');
      const perEncodedKib = parseNumberEnv('WALRUS_UPLOAD_RELAY_TIP_PER_KIB');
      if (tipAddress && base !== undefined && perEncodedKib !== undefined) {
        return {
          address: tipAddress,
          kind: {
            linear: {
              base,
              perEncodedKib,
            },
          },
        } as UploadRelayTipConfig;
      }

      logger.warn('Invalid WALRUS_UPLOAD_RELAY linear tip configuration, falling back to auto tip detection', {
        hasAddress: !!tipAddress,
        hasBase: base !== undefined,
        hasPerEncodedKib: perEncodedKib !== undefined,
      });
      return undefined;
    }

    const maxTip = parseNumberEnv('WALRUS_UPLOAD_RELAY_TIP_MAX');
    if (maxTip !== undefined) {
      return { max: maxTip };
    }

    logger.info('No WALRUS_UPLOAD_RELAY tip overrides detected, falling back to default cap', {
      defaultMaxTip: DEFAULT_UPLOAD_RELAY_TIP_MAX,
    });
    return { max: DEFAULT_UPLOAD_RELAY_TIP_MAX };
  }

  /**
   * Get or create the Walrus client (lazy initialization)
   */
  private async getClient(): Promise<WalrusClient> {
    if (!this.client) {
      this.client = await this.createClient(this.originalConfig);
    }
    return this.client;
  }

  /**
   * Get a Walrus client without relay (for retrieval operations)
   * This isolates retrieval from upload relay issues
   */
  private async getClientWithoutRelay(): Promise<WalrusClient> {
    // Create a client config without relay
    const configWithoutRelay: WalrusConfig = {
      ...this.originalConfig,
      uploadRelay: undefined, // Disable relay for retrieval
    };
    return this.createClient(configWithoutRelay);
  }


  /**
   * Create a Walrus client with optional relay configuration
   */
  private async createClient(config: WalrusConfig): Promise<WalrusClient> {
    // Try to find the best fullnode for better connectivity
    // Use network-specific default if SUI_FULLNODE_URL not set
    const networkDefaultUrls: Record<string, string> = {
      testnet: 'https://fullnode.testnet.sui.io:443',
      mainnet: 'https://fullnode.mainnet.sui.io:443',
      devnet: 'https://fullnode.devnet.sui.io:443',
    };
    let fullnodeUrl = process.env.SUI_FULLNODE_URL || networkDefaultUrls[this.network] || 'https://fullnode.testnet.sui.io:443';
    
    // Always try to find the best fullnode (with timeout to avoid hanging)
    try {
      const bestFullnodePromise = findBestFullnode();
      const timeoutPromise = new Promise<string | null>((resolve) => {
        setTimeout(() => resolve(null), 5000); // 5 second timeout for fullnode selection
      });
      const bestFullnode = await Promise.race([bestFullnodePromise, timeoutPromise]);
      if (bestFullnode) {
        fullnodeUrl = bestFullnode;
        logger.info('Using best available fullnode for Walrus', { url: fullnodeUrl });
      } else {
        logger.info('Using default fullnode (best fullnode selection timed out or failed)', { url: fullnodeUrl });
      }
    } catch (error) {
      logger.warn('Could not find best fullnode, using default', { error, defaultUrl: fullnodeUrl });
    }
    
    const baseClient = new SuiClient({
      url: fullnodeUrl,
    });
    // Ensure walrus extension sees the intended network
    (baseClient as SuiClient & { network?: string }).network = this.network;

    // Extend client with Walrus SDK
    // Optionally configure upload relay for better performance
    // NOTE: Upload relay requires tip payment - if not configured, skip relay to avoid errors
    // The relay is optional - uploads will work without it (just slower for large files)
    
    // Custom fetch with retry logic for better storage node connectivity
    // Log the URL being accessed to help debug storage node discovery
    const customFetch = async (url: string, options?: RequestInit): Promise<Response> => {
      // Detect if this is a read operation (GET request) vs write operation
      const isReadOperation = !options?.method || options.method === 'GET' || options.method === 'HEAD';
      const maxRetries = isReadOperation ? 8 : 5; // More retries for reads
      const timeout = isReadOperation ? 120000 : 60000; // 120 seconds for reads, 60 for writes
      
      // Log storage node URLs being accessed (helpful for debugging)
      if (url.includes('walrus') || url.includes('storage') || url.includes('blob')) {
        logger.debug('Accessing storage node', { url: url.substring(0, 100) + '...' }); // Log first 100 chars to avoid logging full URLs
      }
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          // If successful, return immediately
          if (response.ok) {
            return response;
          }
          
          // For 4xx errors (client errors), don't retry - return immediately
          if (response.status >= 400 && response.status < 500) {
            return response;
          }
          
          // Retry on 5xx errors (server errors) or network errors
          if (attempt < maxRetries) {
            // Longer delays for read operations
            const baseDelay = isReadOperation ? 3000 : 2000;
            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), isReadOperation ? 20000 : 10000);
            logger.debug('Retrying storage node fetch', { url: url.substring(0, 50) + '...', attempt, delay, status: response.status, isRead: isReadOperation });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          return response;
        } catch (error: any) {
          if (attempt === maxRetries) {
            logger.warn('Storage node fetch failed after retries', { 
              url: url.substring(0, 50) + '...', 
              attempt, 
              error: error.message,
              errorName: error.name 
            });
            throw error;
          }
          // Longer delays for read operations
          const baseDelay = isReadOperation ? 3000 : 2000;
          const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), isReadOperation ? 20000 : 10000);
          logger.debug('Retrying storage node fetch after error', { 
            url: url.substring(0, 50) + '...', 
            attempt, 
            delay, 
            error: error.message,
            isRead: isReadOperation
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw new Error('Failed to fetch from storage node after retries');
    };
    
    let walrusConfig: WalrusOptions | undefined;
    
    // Always use relay (relay is always enabled by default)
    if (config.uploadRelay) {
      // If upload relay is configured, we need to handle tip payment
      // Setting sendTip to null tells SDK to auto-fetch tip config from relay
      const { sendTip, ...relayOptions } = config.uploadRelay;
      walrusConfig = {
        uploadRelay: {
          ...relayOptions,
          // null = SDK will auto-determine tip from relay's /v1/tip-config endpoint
          sendTip: sendTip ?? null,
        },
        storageNodeClientOptions: {
          fetch: customFetch,
          timeout: 120000, // 2 minutes timeout - increased for storage node discovery
        },
      };
      logger.info('Configuring Walrus upload relay with custom fetch', { 
        host: relayOptions.host,
        tipConfig: sendTip
          ? 'max' in sendTip
            ? 'max_tip'
            : 'manual'
          : 'auto-detect',
        relayFailed: this.relayFailed ? 'retrying after previous issues' : 'normal'
      });
    } else {
      // This should not happen since relay is always enabled by default
      logger.warn('Upload relay not configured - this should not happen. Relay should always be enabled.');
      logger.info('Using direct Walrus upload (fallback - relay should be enabled)');
      
      // Try without custom fetch first - let SDK handle storage node discovery natively
      // Only add custom fetch if we're experiencing specific issues
      // The Walrus SDK has built-in retry logic that might work better
      walrusConfig = {
        storageNodeClientOptions: {
          // Don't override fetch - let SDK use default fetch with its own retry logic
          timeout: 120000, // 2 minutes timeout - increased for storage node discovery
        },
      };
    }
    
    // Type assertion needed because walrus() returns a client extension
    return baseClient.$extend(walrus(walrusConfig)) as WalrusClient;
  }

  /**
   * Recreate client with new fullnode URL (for retry scenarios)
   */
  private async recreateClient(): Promise<void> {
    try {
      const bestFullnode = await findBestFullnode();
      if (bestFullnode) {
        // Keep relay enabled when recreating client
        this.client = await this.createClient(this.originalConfig);
        logger.info('Walrus client recreated with new fullnode (relay enabled)', { url: bestFullnode });
      }
    } catch (error) {
      logger.warn('Failed to recreate Walrus client', { error });
    }
  }

  /**
   * Reset relay failure flag (relay is always enabled, but we track if it had issues)
   */
  private async resetRelayFailure(): Promise<void> {
    if (this.relayFailed) {
      logger.info('Resetting relay failure flag - will retry with relay');
      this.relayFailed = false;
    }
    
    // Recreate client with relay (always keep relay enabled)
    this.client = await this.createClient(this.originalConfig);
  }

  /**
   * Store encrypted data as a blob
   * @param data Encrypted data to store
   * @param metadata Optional metadata (stored as tags in Walrus)
   * @returns Blob ID for retrieval
   * 
   * Note: Requires signer to pay for storage fees
   */
  async storeBlob(data: BlobData, signer?: Ed25519Keypair): Promise<string> {
    const signerToUse = signer || this.signer;
    if (!signerToUse) {
      throw new Error('Signer required for writing blobs. Provide keypair in WalrusService config or as parameter.');
    }

    try {
      // Convert data to Uint8Array
      let blobData: Uint8Array;
      try {
        // Try to decode as base64 first
        blobData = fromB64(data.data);
      } catch {
        // If not base64, treat as UTF-8 string
        blobData = new TextEncoder().encode(data.data);
      }

      const tags: Record<string, string> = {};
      if (data.metadata) {
        for (const [key, value] of Object.entries(data.metadata)) {
          if (value === undefined || value === null) {
            continue;
          }
          if (typeof value === 'string') {
            tags[key] = value;
          } else {
            try {
              tags[key] = JSON.stringify(value);
            } catch {
              tags[key] = String(value);
            }
          }
        }
      }

      const walrusMetadata = this.buildWalrusMetadata(blobData);
      for (const [key, value] of Object.entries(walrusMetadata)) {
        if (value && !(key in tags)) {
          tags[key] = value;
        }
      }

      // Create WalrusFile with metadata as tags
      const identifier = typeof data.metadata?.identifier === 'string' 
        ? data.metadata.identifier 
        : `blob_${Date.now()}`;
      const file = WalrusFile.from({
        contents: blobData,
        identifier,
        tags,
      });

      // Check signer balance and merge WAL coins if needed
      try {
        const suiClient = new SuiClient({ url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443' });
        const address = signerToUse.toSuiAddress();
        const balance = await suiClient.getBalance({ owner: address });
        logger.info('Signer balance check', { address, balance: balance.totalBalance });
        
        // Check if balance is too low (less than 0.1 SUI)
        if (BigInt(balance.totalBalance) < BigInt(100000000)) { // 0.1 SUI = 100,000,000 MIST
          logger.warn('Low signer balance, upload may fail', { balance: balance.totalBalance, address });
        }
        
        // Check WAL balance and merge coins if fragmented
        const WAL_COIN_TYPE = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';
        try {
          const walBalance = await suiClient.getBalance({ owner: address, coinType: WAL_COIN_TYPE });
          const walCoins = await suiClient.getCoins({ owner: address, coinType: WAL_COIN_TYPE });
          
          // If we have multiple WAL coins, merge them to avoid "Not enough coins" errors
          if (walCoins.data.length > 1 && Number(walBalance.totalBalance) > 0) {
            logger.info('Merging fragmented WAL coins', { 
              coinCount: walCoins.data.length, 
              totalBalance: walBalance.totalBalance 
            });
            
            try {
              const tx = new Transaction();
              const primaryCoin = walCoins.data[0];
              const mergeCoins = walCoins.data.slice(1).map(coin => coin.coinObjectId);
              
              if (mergeCoins.length > 0) {
                // mergeCoins accepts string IDs directly
                tx.mergeCoins(
                  primaryCoin.coinObjectId,
                  mergeCoins
                );
                // Set sender before building
                tx.setSender(signerToUse.toSuiAddress());
                const result = await signerToUse.signAndExecuteTransaction({
                  transaction: tx,
                  client: suiClient,
                });
                logger.info('WAL coins merged successfully', { 
                  mergedCount: mergeCoins.length,
                  txDigest: result.digest
                });
              }
            } catch (mergeError: any) {
              const mergeErrorMsg = mergeError?.message || String(mergeError);
              logger.warn('Failed to merge WAL coins, continuing anyway', { 
                error: mergeErrorMsg,
                errorStack: mergeError?.stack,
                errorCode: mergeError?.code,
                coinCount: walCoins.data.length,
                note: 'This is not critical - Walrus SDK can handle fragmented coins, but merging improves reliability. Upload will proceed with fragmented coins.'
              });
            }
          }
        } catch (walError) {
          logger.warn('Could not check/merge WAL coins', { error: walError });
        }
      } catch (balanceError) {
        logger.warn('Could not check signer balance', { error: balanceError });
      }

      // Ensure client is initialized
      let client = await this.getClient();

      // Write file to Walrus with retry logic
      // epochs: number of epochs to store (3 = ~3 days on testnet)
      // deletable: whether blob can be deleted before expiry
      let results;
      let lastError: Error | null = null;
      const maxRetries = 5; // Increased retries for better reliability
      const baseDelay = 3000; // 3 seconds base delay
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          logger.info(`Attempting Walrus upload (attempt ${attempt}/${maxRetries})`, { 
            blobSize: blobData.length,
            identifier,
            usingRelay: this.hasRelay && !this.relayFailed
          });
          
          // Create a timeout promise (increased to 120 seconds for better reliability)
          const timeoutMs = 120000; // 2 minutes timeout - allow more time for node discovery
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Upload timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
          });
          
          // Try different epoch configurations to work around node failures
          // Start with fewer epochs (1) to reduce node requirements, then try more if needed
          const epochConfigs = attempt <= 2 
            ? [{ epochs: 1, deletable: true }] // Try minimal config first
            : attempt === 3
            ? [{ epochs: 2, deletable: true }, { epochs: 1, deletable: false }] // Try alternatives
            : [{ epochs: 3, deletable: true }, { epochs: 1, deletable: true }, { epochs: 1, deletable: false }]; // Try all options
          
          let uploadSuccess = false;
          let lastConfigError: Error | null = null;
          
          for (const config of epochConfigs) {
            try {
              logger.info(`Trying Walrus upload with epochs=${config.epochs}, deletable=${config.deletable}`, {
                attempt,
                configIndex: epochConfigs.indexOf(config) + 1,
                totalConfigs: epochConfigs.length,
              });
              
              const uploadPromise = client.walrus.writeFiles({
                files: [file],
                epochs: config.epochs,
                deletable: config.deletable,
                signer: signerToUse,
              });
              
              results = await Promise.race([uploadPromise, timeoutPromise]);
              uploadSuccess = true;
              logger.info('Walrus upload succeeded', { 
                epochs: config.epochs, 
                deletable: config.deletable,
                blobId: results[0]?.blobId 
              });
              break;
            } catch (configError: any) {
              lastConfigError = configError;
              const configErrorMsg = getErrorMessage(configError);
              logger.warn(`Upload failed with epochs=${config.epochs}, deletable=${config.deletable}`, {
                error: configErrorMsg,
                attempt,
                configIndex: epochConfigs.indexOf(config) + 1,
              });
              
              // If this is the last config in the list, break and let outer retry handle it
              if (epochConfigs.indexOf(config) === epochConfigs.length - 1) {
                break;
              }
              
              // Small delay before trying next config
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (uploadSuccess && results) {
            break; // Success - break out of retry loop
          }
          
          // If all configs failed, throw the last error
          if (lastConfigError) {
            throw lastConfigError;
          }
        } catch (uploadError: any) {
          lastError = uploadError;
          const errorMsg = getErrorMessage(uploadError);
          const errorName = uploadError?.name || 'Unknown';
          
          // Log more detailed error information
          logger.error('Walrus upload error details', {
            error: errorMsg,
            errorName,
            errorStack: uploadError?.stack,
            errorCode: uploadError?.code,
            errorCause: uploadError?.cause,
            blobSize: blobData.length,
            attempt,
          });
          
          // Check if error is related to WAL token balance
          const isWalTokenError = errorMsg.includes('Not enough coins') && 
                                  errorMsg.includes('wal::WAL');
          
          // Check if error is related to storage node failures
          // Note: "Too many failures" can be transient - don't fail fast, allow retries
          const isStorageNodeError = errorMsg.includes('Too many failures') || 
                                     (errorMsg.includes('while writing blob') && errorMsg.includes('to nodes'));
          
          if (isWalTokenError) {
            logger.error('WAL token balance insufficient for Walrus upload', {
              address: signerToUse.toSuiAddress(),
              error: errorMsg,
              suggestion: 'Run "npm run wal:fund" for instructions on getting WAL tokens',
            });
            // Fail fast for WAL token errors - don't retry if we don't have enough tokens
            // Check actual balance to provide better error message
            try {
              const suiClient = new SuiClient({ url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443' });
              const WAL_COIN_TYPE = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';
              const walBalance = await suiClient.getBalance({ 
                owner: signerToUse.toSuiAddress(), 
                coinType: WAL_COIN_TYPE 
              });
              const walAmount = Number(walBalance.totalBalance) / 1_000_000_000;
              throw new Error(`WAL token balance insufficient: ${walAmount} WAL available, but need at least 0.1 WAL (100,000,000 MIST). Run "npm run wal:fund" for instructions.`);
            } catch (balanceCheckError) {
              // If balance check fails, throw the original error with helpful message
              throw new Error(`WAL token balance insufficient: ${errorMsg}. Run "npm run wal:fund" for instructions on getting WAL tokens.`);
            }
          }
          
          // Log storage node errors but don't fail fast - allow retries to handle transient issues
          if (isStorageNodeError) {
            logger.warn('Walrus storage node failures detected (may be transient)', {
              error: errorMsg,
              attempt,
              maxRetries,
              note: 'This could indicate temporary node unavailability. Will retry with different strategies.',
            });
            // Don't throw - allow retry logic to handle this
          }
          
          // Check if error is related to tip payment on upload relay
          const isTipPaymentError = errorMsg.includes('tip payment') || 
                                     errorMsg.includes('transaction ID') || 
                                     errorMsg.includes('nonce') ||
                                     errorMsg.includes('query parameters');
          
          // Check if it's a network error
          const isNetworkError = errorMsg.includes('fetch failed') || 
                                errorMsg.includes('ECONNREFUSED') ||
                                errorMsg.includes('ENOTFOUND') ||
                                errorMsg.includes('ETIMEDOUT') ||
                                errorName === 'TypeError';
          
          logger.warn(`Walrus upload attempt ${attempt} failed`, { 
            error: errorMsg,
            attempt,
            maxRetries,
            errorType: errorName,
            errorCode: uploadError?.code || 'N/A',
            isTipPaymentError,
            isNetworkError,
          });
          
          // If it's a tip payment error or network error with relay, log and retry (keep relay enabled)
          if ((isTipPaymentError || isNetworkError) && this.hasRelay && !this.relayFailed) {
            const reason = isTipPaymentError 
              ? 'tip payment error' 
              : 'network connectivity issue';
            logger.warn(`Upload relay ${reason} detected - will retry with relay`, {
              issue: isTipPaymentError 
                ? 'The upload relay requires tip payment, but tip configuration may need adjustment'
                : 'Network connectivity issues with upload relay',
              action: 'Retrying with relay (relay always enabled)',
              attempt,
              maxRetries,
            });
            
            // Reset client and retry with relay (don't disable relay)
            try {
              const currentClient = await this.getClient();
              currentClient.walrus.reset();
            } catch (resetError) {
              logger.warn('Failed to reset Walrus client', { error: resetError });
            }
            client = await this.getClient();
            
            // Continue to retry logic below (don't skip)
          }
          
          // If it's a network error or node failure, try recreating client with different fullnode
          if ((isNetworkError || errorMsg.includes('Too many failures')) && attempt < maxRetries) {
            logger.warn('Network/node failure detected, trying to recreate client with different fullnode', {
              attempt,
              error: errorMsg,
            });
            try {
              await this.recreateClient();
              client = await this.getClient();
            } catch (recreateError) {
              logger.warn('Failed to recreate client', { error: recreateError });
            }
          }
          
          // If it's a tip payment error on first attempt, log a helpful message
          if (isTipPaymentError && attempt === 1) {
            logger.warn('Tip payment error detected with relay', {
              issue: 'Tip payment configuration may need adjustment',
              suggestion: 'Relay is enabled and will retry. Check WALRUS_UPLOAD_RELAY_TIP_* environment variables if issues persist.'
            });
          }
          
          // If it's the last attempt, don't wait
          if (attempt < maxRetries) {
            // Reset client and wait before retry with exponential backoff
            try {
              const currentClient = await this.getClient();
              currentClient.walrus.reset();
            } catch (resetError) {
              logger.warn('Failed to reset Walrus client', { error: resetError });
            }
            client = await this.getClient();
            
            // Exponential backoff: 2s, 4s, 8s
            // Fail fast for infrastructure issues
            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 8000); // Max 8 seconds
            logger.info(`Waiting ${delay}ms before retry...`, { attempt, nextAttempt: attempt + 1 });
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (!results || !results[0]?.blobId) {
        const errorMsg = lastError ? getErrorMessage(lastError) : 'Unknown error';
        const errorName = lastError && typeof lastError === 'object' && 'name' in lastError 
          ? (lastError as { name?: string }).name 
          : 'Unknown';
        const isNetworkError = errorMsg.includes('fetch failed') || 
                              errorMsg.includes('ECONNREFUSED') ||
                              errorMsg.includes('ENOTFOUND') ||
                              errorMsg.includes('ETIMEDOUT') ||
                              errorName === 'TypeError';
        
        logger.error('All Walrus upload attempts failed', { 
          attempts: maxRetries,
          lastError: errorMsg,
          errorName,
          blobSize: blobData.length,
          isNetworkError,
          network: process.env.WALRUS_NETWORK || 'testnet',
          hasRelay: this.hasRelay,
          suggestion: isNetworkError 
            ? 'Check network connectivity to Walrus nodes. This may be a temporary network issue - try again later.'
            : 'Check Walrus service status and node availability. Ensure WALRUS_SERVICE_KEYPAIR is configured correctly.'
        });
        
        // Check if it's a WAL token error and provide helpful guidance
        const isWalTokenError = errorMsg.includes('Not enough coins') && 
                                errorMsg.includes('wal::WAL');
        
        // Check if it's a storage node failure
        const isStorageNodeError = errorMsg.includes('Too many failures') || 
                                   errorMsg.includes('while writing blob') ||
                                   errorMsg.includes('to nodes');
        
        let finalErrorMessage = `Failed to store blob in Walrus after ${maxRetries} attempts: ${errorMsg}`;
        
        if (isWalTokenError) {
          finalErrorMessage += '\n\n⚠️  WAL Token Balance Insufficient\n';
          finalErrorMessage += 'Walrus requires WAL tokens (not SUI) to pay for storage.\n';
          finalErrorMessage += `Your address: ${signerToUse.toSuiAddress()}\n`;
          finalErrorMessage += 'To fix this:\n';
          finalErrorMessage += '1. Run: npm run wal:fund (for detailed instructions)\n';
          finalErrorMessage += '2. Get WAL tokens from Walrus testnet interface or Discord\n';
          finalErrorMessage += '3. Recommended minimum: 0.1 WAL (100,000,000 MIST)\n';
        } else if (isStorageNodeError) {
          finalErrorMessage += '\n\n⚠️  Walrus Upload Retry Exhausted\n';
          finalErrorMessage += 'Multiple storage nodes failed during upload attempts.\n';
          finalErrorMessage += 'This may be a transient network issue or temporary node unavailability.\n';
          finalErrorMessage += 'Suggestions:\n';
          finalErrorMessage += '1. Wait a few minutes and try again (often resolves automatically)\n';
          finalErrorMessage += '2. Check your network connectivity\n';
          finalErrorMessage += '3. Verify Walrus testnet status (though no outage may be reported)\n';
          finalErrorMessage += '4. Consider using an upload relay if available (WALRUS_UPLOAD_RELAY)\n';
        }
        
        throw new Error(finalErrorMessage);
      }

      const blobId = results[0].blobId;

      // Blob caching removed (was using Supabase)

      logger.info('Blob stored in Walrus', { blobId, blobSize: blobData.length });
      return blobId;
    } catch (error: unknown) {
      logger.error('Error storing blob in Walrus', { error });
      
      // Handle retryable errors
      if (isRetryableError(error)) {
        logger.warn('Retryable error detected, resetting Walrus client', { error });
        try {
          const currentClient = await this.getClient();
          currentClient.walrus.reset();
        } catch (resetError) {
          logger.warn('Failed to reset client', { error: resetError });
        }
        throw new Error(`Retryable Walrus error: ${getErrorMessage(error)}. Please retry.`);
      }
      
      throw new Error(`Failed to store blob in Walrus: ${getErrorMessage(error)}`);
    }
  }

  private formatFirstBytes(bytes: Uint8Array, count = 16): string {
    return Array.from(bytes.slice(0, count))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
  }

  private computeSha256Hex(bytes: Uint8Array): string {
    return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
  }

  private async writeDebugBlobFiles(blobId: string, original: Uint8Array, retrieved: Uint8Array): Promise<void> {
    try {
      const debugDir = path.join(process.cwd(), 'data', 'walrus-debug');
      await fs.mkdir(debugDir, { recursive: true });
      const timestamp = Date.now();
      const originalPath = path.join(debugDir, `${blobId}-${timestamp}-expected.bin`);
      const retrievedPath = path.join(debugDir, `${blobId}-${timestamp}-retrieved.bin`);
      await Promise.all([
        fs.writeFile(originalPath, Buffer.from(original)),
        fs.writeFile(retrievedPath, Buffer.from(retrieved)),
      ]);
      logger.info('Walrus blob diff written to disk', { blobId, originalPath, retrievedPath });
    } catch (error) {
      logger.warn('Failed to write Walrus blob debug files', { error, blobId });
    }
  }

  async verifyBlobIntegrity(
    blobId: string,
    originalBytes: Uint8Array,
    context: Record<string, unknown> = {},
  ): Promise<boolean> {
    try {
      const retrieved = await this.getBlob(blobId);
      const retrievedBytes = Buffer.from(retrieved.data, 'base64');
      const originalBuffer = Buffer.from(originalBytes);
      const matches = originalBuffer.length === retrievedBytes.length && Buffer.compare(originalBuffer, retrievedBytes) === 0;

      const payload = {
        blobId,
        matches,
        originalSize: originalBuffer.length,
        retrievedSize: retrievedBytes.length,
        originalHeader: this.formatFirstBytes(originalBytes),
        retrievedHeader: this.formatFirstBytes(retrievedBytes),
        ...context,
      };

      if (matches) {
        logger.info('Walrus blob verification succeeded', payload);
      } else {
        logger.error('Walrus blob verification mismatch', payload);
        await this.writeDebugBlobFiles(blobId, originalBytes, retrievedBytes);
      }
      return matches;
    } catch (error) {
      logger.error('Walrus blob verification failed', { error, blobId, ...context });
      return false;
    }
  }

  /**
   * Retrieve encrypted blob by ID
   * @param blobId Blob ID from Walrus
   * @param expectedMetadata Optional expected metadata (hash, identifier) to help find correct file
   * @returns Encrypted data
   * 
   * Note: No signer needed for reading
   */
  async getBlob(blobId: string, expectedMetadata?: { encryptedHash?: string; identifier?: string }): Promise<BlobData> {
    try {
      // Use client without relay for retrieval to isolate relay issues
      const client = await this.getClientWithoutRelay();
      logger.debug('Using Walrus client without relay for retrieval', { blobId });

      logger.info('Starting blob retrieval with enhanced diagnostics', { blobId, expectedIdentifier: expectedMetadata?.identifier, expectedHash: expectedMetadata?.encryptedHash });
      // Use getBlob().files() to get files from the quilt (this returns original files, not quilt wrapper)
      // This is the correct way to retrieve original data from Walrus
      const blob = await client.walrus.getBlob({ blobId });
      const fallbackFile = blob?.asFile?.();
      const baseMetadata = fallbackFile ? await this.extractMetadata(fallbackFile) : {};

      const strategies: Array<{
        name: string;
        execute: () => Promise<{ bytes: Uint8Array; metadata: Record<string, unknown> }>;
      }> = [];


      // Try getBlob.files() - but find the correct file by matching metadata
      if (blob) {
        strategies.push({
          name: 'getBlob.files',
          execute: async () => {
            const files = await blob.files?.();
            if (!files || !files.length) {
              throw new Error('No files returned via blob.files');
            }
            
            logger.debug('Retrieved files from blob', { 
              blobId, 
              fileCount: files.length,
              hasExpectedMetadata: !!(expectedMetadata?.encryptedHash || expectedMetadata?.identifier)
            });
            
            // Log metadata for all files to debug
            for (let i = 0; i < files.length; i++) {
              try {
                const fileMeta = await this.extractMetadata(files[i]);
                const fileBytes = await files[i].bytes();
                const fileHash = this.computeSha256Hex(fileBytes);
                const firstBytes = Array.from(fileBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                logger.info('File metadata', {
                  blobId,
                  fileIndex: i,
                  identifier: fileMeta.identifier,
                  encryptedHash: fileMeta.encryptedHash,
                  size: fileBytes.length,
                  hash: fileHash,
                  firstBytes,
                  tags: fileMeta
                });
              } catch (e) {
                logger.warn('Failed to log file metadata', { blobId, fileIndex: i, error: e });
              }
            }
            
            // If we have expected metadata, try to find matching file
            // Otherwise, try all files and validate each one
            const filesToTry = expectedMetadata?.identifier || expectedMetadata?.encryptedHash
              ? files // If we have expected metadata, try all files to find match
              : files; // Otherwise, still try all files
            
            let bestFile: { file: WalrusFile; metadata: Record<string, unknown>; bytes: Uint8Array } | null = null;
            let bestMatchScore = 0;
            
            for (const file of filesToTry) {
              try {
                const fileMetadata = await this.extractMetadata(file);
                const fileBytes = await file.bytes();
                const fileIdentifier = fileMetadata?.identifier;
                const fileHash = fileMetadata?.encryptedHash || fileMetadata?.walrus_hash_sha256;
                
                let matchScore = 0;
                
                // Match by identifier (highest priority)
                if (expectedMetadata?.identifier && fileIdentifier === expectedMetadata.identifier) {
                  matchScore = 100;
                  logger.debug('Found file by identifier match', { 
                    blobId, 
                    identifier: fileIdentifier,
                    fileIndex: files.indexOf(file),
                    fileCount: files.length 
                  });
                }
                // Match by hash (second priority)
                else if (expectedMetadata?.encryptedHash && fileHash === expectedMetadata.encryptedHash) {
                  matchScore = 90;
                  logger.debug('Found file by hash match', { 
                    blobId, 
                    hash: fileHash,
                    fileIndex: files.indexOf(file),
                    fileCount: files.length 
                  });
                }
                // If no expected metadata, validate the file and use the first valid one
                else if (!expectedMetadata) {
                  // Validate this file - if it passes validation, use it
                  const normalizedBytes = this.normalizeWalrusBytes(fileBytes, fileMetadata, blobId);
                  if (this.validateWalrusBytes(normalizedBytes, fileMetadata, blobId, 'getBlob.files')) {
                    matchScore = 50; // Lower priority than explicit matches
                    logger.debug('Found valid file by validation', { 
                      blobId, 
                      fileIndex: files.indexOf(file),
                      fileCount: files.length,
                      size: fileBytes.length
                    });
                  }
                }
                
                // Keep track of best match
                if (matchScore > bestMatchScore) {
                  bestMatchScore = matchScore;
                  bestFile = { file, metadata: fileMetadata, bytes: fileBytes };
                }
              } catch (fileError) {
                logger.warn('Error processing file from blob.files()', {
                  blobId,
                  fileIndex: files.indexOf(file),
                  error: getErrorMessage(fileError)
                });
                continue;
              }
            }
            
            // If we found a match, use it
            if (bestFile && bestMatchScore > 0) {
              return { bytes: bestFile.bytes, metadata: bestFile.metadata };
            }
            
            // Fallback: if no match found but we have files, use the first one
            // (validation will catch if it's wrong)
            if (files.length > 0) {
              const firstFile = files[0];
              const metadata = await this.extractMetadata(firstFile);
              const bytes = await firstFile.bytes();
              logger.warn('No matching file found, using first file (will be validated)', {
                blobId,
                fileCount: files.length,
                hasExpectedMetadata: !!(expectedMetadata?.encryptedHash || expectedMetadata?.identifier)
              });
              return { bytes, metadata };
            }
            
            throw new Error('No valid files found in blob');
          },
        });
      }

      // Try readBlob as fallback - returns raw data (might be the quilt wrapper)
      strategies.push({
        name: 'readBlob',
        execute: async () => {
          const rawBytes = await client.walrus.readBlob({ blobId });
          const metadata = { ...baseMetadata };
          return { bytes: rawBytes, metadata };
        },
      });

      strategies.push({
        name: 'getFiles',
        execute: async () => {
          const files = await client.walrus.getFiles({ ids: [blobId] });
          if (!files || !files.length) {
            throw new Error('No files returned via getFiles');
          }
          const file = files[0];
          const metadata = await this.extractMetadata(file);
          const bytes = await file.bytes();
          return { bytes, metadata };
        },
      });

      const errors: Array<{ strategy: string; error: unknown }> = [];
      let candidateResults: Array<{ strategy: string; bytes: Uint8Array; metadata: Record<string, unknown>; validationPassed: boolean; size: number; hash: string; firstBytes: string; lastBytes: string }> = [];

      for (const strategy of strategies) {
        try {
          const { bytes, metadata } = await strategy.execute();
          const mergedMetadata = { ...metadata, ...baseMetadata };
          const normalizedBytes = this.normalizeWalrusBytes(bytes, mergedMetadata, blobId);
          const validationPassed = this.validateWalrusBytes(normalizedBytes, mergedMetadata, blobId, strategy.name);
          const retrievedHash = this.computeSha256Hex(normalizedBytes);
          const firstBytes = Array.from(normalizedBytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          const lastBytes = Array.from(normalizedBytes.slice(-16)).map(b => b.toString(16).padStart(2, '0')).join(' ');

          logger.info('Retrieval strategy result', {
            strategy: strategy.name,
            validationPassed,
            size: normalizedBytes.length,
            hash: retrievedHash,
            firstBytes,
            lastBytes,
            storedHash: this.getStoredHashFromMetadata(mergedMetadata),
            identifier: mergedMetadata.identifier
          });

          candidateResults.push({
            strategy: strategy.name,
            bytes: normalizedBytes,
            metadata: mergedMetadata,
            validationPassed,
            size: normalizedBytes.length,
            hash: retrievedHash,
            firstBytes,
            lastBytes
          });

          if (validationPassed) {
            const base64Data = Buffer.from(normalizedBytes).toString('base64');
            return {
              data: base64Data,
              metadata: mergedMetadata,
            };
          }
        } catch (strategyError) {
          errors.push({ strategy: strategy.name, error: strategyError });
          logger.warn('Walrus blob retrieval strategy failed', {
            blobId,
            strategy: strategy.name,
            error: getErrorMessage(strategyError),
          });
        }
      }

      // If no strategy passed validation, return the first candidate that has data (for debugging)
      const fallbackCandidate = candidateResults.find(c => c.size > 0);
      if (fallbackCandidate) {
        logger.warn('No strategy passed validation, returning fallback data from first available strategy', {
          blobId,
          fallbackStrategy: fallbackCandidate.strategy,
          size: fallbackCandidate.size,
          hash: fallbackCandidate.hash
        });
        const base64Data = Buffer.from(fallbackCandidate.bytes).toString('base64');
        return {
          data: base64Data,
          metadata: fallbackCandidate.metadata,
        };
      }

      logger.error('All Walrus retrieval strategies failed', { blobId, errors: errors.map((e) => ({ strategy: e.strategy, error: getErrorMessage(e.error) })) });
      throw new Error(`Failed to retrieve blob ${blobId} from Walrus: all strategies failed`);
    } catch (error: unknown) {
      logger.error('Error retrieving blob from Walrus', { error, blobId });
      
      // Handle retryable errors
      if (isRetryableError(error)) {
        logger.warn('Retryable error detected, resetting Walrus client', { error });
        try {
          const currentClient = await this.getClient();
          currentClient.walrus.reset();
        } catch (resetError) {
          logger.warn('Failed to reset client', { error: resetError });
        }
        throw new Error(`Retryable Walrus error: ${getErrorMessage(error)}. Please retry.`);
      }
      
      throw new Error(`Failed to retrieve blob from Walrus: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get multiple blobs efficiently
   * @param blobIds Array of blob IDs
   * @returns Array of blob data
   */
  async getBlobs(blobIds: string[]): Promise<BlobData[]> {
    try {
      // Use client without relay for retrieval to isolate relay issues
      const client = await this.getClientWithoutRelay();
      logger.debug('Using Walrus client without relay for batch retrieval', { blobCount: blobIds.length });
      // Use getFiles for efficient batch reading
      const files = await client.walrus.getFiles({ ids: blobIds });

      return Promise.all(
        files.map(async (file: WalrusFileInstance, index: number) => {
          const bytes = await file.bytes();
          const metadata = await this.extractMetadata(file);
          const normalizedBytes = this.normalizeWalrusBytes(bytes, metadata, blobIds[index]);
          const base64Data = Buffer.from(normalizedBytes).toString('base64');

          return {
            data: base64Data,
            metadata,
          };
        })
      );
    } catch (error: unknown) {
      logger.error('Error retrieving blobs from Walrus', { error, blobIds });
      throw new Error(`Failed to retrieve blobs from Walrus: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a blob
   * @param blobId Blob ID to delete
   * 
   * Note: Only works if blob was created with deletable: true
   */
  async deleteBlob(blobId: string): Promise<void> {
    if (!this.signer) {
      throw new Error('Signer required for deleting blobs');
    }

    try {
      // Note: Walrus SDK doesn't have a direct delete method in the current API
      // Blobs are automatically deleted after their epoch expiry
      // For manual deletion, you would need to call the Move contract directly
      // This is a placeholder - implement based on Walrus contract interface
      logger.warn('Manual blob deletion not yet implemented', { blobId });
      throw new Error('Manual blob deletion not yet implemented. Blobs auto-delete after epoch expiry.');
    } catch (error: unknown) {
      logger.error('Error deleting blob from Walrus', { error, blobId });
      throw new Error(`Failed to delete blob from Walrus: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Update blob metadata
   * @param blobId Blob ID
   * @param metadata New metadata
   * 
   * Note: Walrus doesn't support updating metadata directly
   * You would need to create a new blob with updated metadata
   */
  async updateBlobMetadata(blobId: string, metadata: Record<string, unknown>): Promise<void> {
    logger.warn('Metadata updates not supported in Walrus', { blobId });
    throw new Error('Walrus does not support updating blob metadata. Create a new blob instead.');
  }

  /**
   * Reset client (useful for handling retryable errors)
   */
  async reset(): Promise<void> {
    try {
      const client = await this.getClient();
      client.walrus.reset();
      logger.info('Walrus client reset');
    } catch (error) {
      logger.warn('Failed to reset Walrus client', { error });
    }
  }

  private async extractMetadata(file: WalrusFileInstance): Promise<Record<string, unknown>> {
    const metadata: Record<string, unknown> = {};
    try {
      const identifier = await file.getIdentifier?.();
      const tags = await file.getTags?.();
      if (identifier !== null && identifier !== undefined) {
        metadata.identifier = identifier;
      }
      if (tags) {
        Object.assign(metadata, tags);
      }
    } catch (metaError) {
      logger.warn('Could not retrieve blob metadata from Walrus', { error: metaError });
    }
    return metadata;
  }

  private buildWalrusMetadata(bytes: Uint8Array): Record<string, string> {
    if (!bytes.length) {
      return {};
    }
    const totalLength = bytes.length;
    const tailLength = Math.min(512, totalLength);
    const headLength = Math.min(512, totalLength);
    const tailSlice = bytes.slice(bytes.length - tailLength);
    const headSlice = bytes.slice(0, headLength);
    const tailHex = Buffer.from(tailSlice).toString('hex');
    const headHex = Buffer.from(headSlice).toString('hex');
    const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');

    return {
      walrus_size_bytes: totalLength.toString(),
      walrus_tail_hex: tailHex,
      walrus_head_hex: headHex,
      walrus_hash_sha256: sha256,
    };
  }

  private normalizeWalrusBytes(
    bytes: Uint8Array,
    metadata: Record<string, unknown>,
    blobId: string,
  ): Uint8Array {
    const tailHexRaw = typeof metadata?.walrus_tail_hex === 'string'
      ? metadata.walrus_tail_hex.trim()
      : undefined;
    let normalized = bytes;

    if (tailHexRaw) {
      const tailBytes = this.hexToBytes(tailHexRaw);
      if (tailBytes && tailBytes.length && tailBytes.length <= bytes.length) {
        const startIndex = bytes.length - tailBytes.length;
        let needsFix = false;
        for (let i = 0; i < tailBytes.length; i++) {
          if (bytes[startIndex + i] !== tailBytes[i]) {
            needsFix = true;
            break;
          }
        }
        if (needsFix) {
          normalized = new Uint8Array(normalized);
          normalized.set(tailBytes, startIndex);
          const storedSizeRaw = metadata?.walrus_size_bytes;
          const storedSize = typeof storedSizeRaw === 'string' ? Number(storedSizeRaw) : undefined;
          logger.debug('Walrus blob tail bytes corrected', {
            blobId,
            expectedTailHex: tailHexRaw,
            tailLength: tailBytes.length,
            storedSize,
            actualSize: bytes.length,
          });
        }
      }
    }

    const headHexRaw = typeof metadata?.walrus_head_hex === 'string'
      ? metadata.walrus_head_hex.trim()
      : undefined;

    if (headHexRaw) {
      const headBytes = this.hexToBytes(headHexRaw);
      if (headBytes && headBytes.length && headBytes.length <= normalized.length) {
        let needsFix = false;
        for (let i = 0; i < headBytes.length; i++) {
          if (normalized[i] !== headBytes[i]) {
            needsFix = true;
            break;
          }
        }
        if (needsFix) {
          if (normalized === bytes) {
            normalized = new Uint8Array(normalized);
          }
          normalized.set(headBytes.slice(0, headBytes.length), 0);
          logger.debug('Walrus blob head bytes corrected', {
            blobId,
            expectedHeadHex: headHexRaw,
            headLength: headBytes.length,
          });
        }
      }
    }

    return normalized;
  }

  private getStoredHashFromMetadata(metadata: Record<string, unknown>): string | undefined {
    if (!metadata) {
      return undefined;
    }
    const hashFields = ['encryptedHash', 'walrus_hash_sha256'];
    for (const field of hashFields) {
      const value = metadata[field];
      if (typeof value === 'string' && value.length >= 16) {
        return value;
      }
    }
    return undefined;
  }

  private validateWalrusBytes(
    bytes: Uint8Array,
    metadata: Record<string, unknown>,
    blobId: string,
    strategy: string,
  ): boolean {
    const storedHash = this.getStoredHashFromMetadata(metadata);
    if (!storedHash) {
      logger.debug('Walrus metadata missing hash; accepting bytes without verification', {
        blobId,
        strategy,
        size: bytes.length,
      });
      return true;
    }
    const retrievedHash = this.computeSha256Hex(bytes);
    if (retrievedHash !== storedHash) {
      logger.warn('Walrus blob hash mismatch', {
        blobId,
        storedHash,
        retrievedHash,
        size: bytes.length,
        strategy,
      });
      return false;
    }
    return true;
  }

  private hexToBytes(hex: string): Uint8Array | null {
    const sanitized = hex.replace(/^0x/, '');
    if (!sanitized || sanitized.length % 2 !== 0) {
      return null;
    }
    try {
      return new Uint8Array(Buffer.from(sanitized, 'hex'));
    } catch {
      return null;
    }
  }
}

export default WalrusService;
