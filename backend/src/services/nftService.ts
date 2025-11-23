/**
 * NFT Service
 * Mints and manages Capsule NFTs with dynamic glow intensity
 */

import { logger } from '../utils/logger';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

interface NFTConfig {
  network?: 'testnet' | 'devnet' | 'mainnet';
  packageId?: string;
  signer?: Ed25519Keypair;
}

interface MintNFTResult {
  nftId: string;
  capsuleId: string;
  glowIntensity: number;
  txDigest: string;
}

class NFTService {
  private suiClient: SuiClient;
  private packageId: string;
  private signer: Ed25519Keypair | null = null;

  constructor(config: NFTConfig = {}) {
    const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
    this.suiClient = new SuiClient({ url: fullnodeUrl });
    this.packageId = config.packageId || process.env.CAPSULE_NFT_PACKAGE_ID || process.env.CAPSULE_PACKAGE_ID || '0x267d1b63db92e7a5502b334cd353cea7a5d40c9ed779dee4fe7211f37eb9f4b4';

    // Initialize signer if provided
    if (config.signer) {
      this.signer = config.signer;
    } else if (process.env.NFT_SERVICE_KEYPAIR) {
      try {
        const keyString = process.env.NFT_SERVICE_KEYPAIR;
        if (keyString.startsWith('suiprivkey1')) {
          this.signer = Ed25519Keypair.fromSecretKey(keyString);
        } else {
          this.signer = Ed25519Keypair.fromSecretKey(fromB64(keyString));
        }
        logger.debug('NFT service signer initialized', { address: this.signer.toSuiAddress() });
      } catch (error) {
        logger.error('Failed to initialize NFT service signer', { error });
      }
    }

    logger.debug('NFT service initialized', { packageId: this.packageId, hasSigner: !!this.signer });
  }

  /**
   * Mint NFT for a capsule
   * @param capsuleId - Capsule ID
   * @param ownerAddress - Owner address
   * @param mediaBlobId - Picture/video blob ID (required)
   * @param message - User message (required)
   * @param voiceBlobId - Voice recording blob ID (optional, empty string if none)
   * @param soulbound - Whether NFT is soulbound (not used in current implementation)
   * @param unlockAt - Timestamp when NFT unlocks (0 = no time lock, unlocked immediately)
   * @param signer - Optional signer (uses service signer if not provided)
   */
  async mintNFT(
    capsuleId: string,
    ownerAddress: string,
    mediaBlobId: string,
    message: string,
    voiceBlobId: string = '',
    soulbound: boolean = false,
    unlockAt: number = 0,
    signer?: Ed25519Keypair
  ): Promise<MintNFTResult> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for NFT minting');
      }

      logger.debug('Minting capsule NFT', { 
        capsuleId, 
        ownerAddress, 
        mediaBlobId, 
        messageLength: message.length,
        hasVoice: !!voiceBlobId,
        soulbound,
        unlockAt: unlockAt > 0 ? new Date(unlockAt).toISOString() : 'immediate',
      });

      // Convert strings to bytes for Move
      const mediaBlobBytes = new TextEncoder().encode(mediaBlobId);
      const messageBytes = new TextEncoder().encode(message);
      const voiceBlobBytes = voiceBlobId ? new TextEncoder().encode(voiceBlobId) : new Uint8Array(0);

      // Convert capsuleId string to bytes for Move
      // If it's a hex string (with or without 0x), convert to actual hex bytes
      // Otherwise, encode as UTF-8
      let capsuleIdBytes: Uint8Array;
      const cleanCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      // Check if it's a valid hex string (even length, hex characters only)
      if (/^[0-9a-fA-F]+$/.test(cleanCapsuleId) && cleanCapsuleId.length % 2 === 0) {
        // Convert hex string to bytes
        capsuleIdBytes = Buffer.from(cleanCapsuleId, 'hex');
      } else {
        // Encode as UTF-8 if not hex
        capsuleIdBytes = new TextEncoder().encode(capsuleId);
      }
      
      logger.debug('Minting NFT with capsule ID', { 
        capsuleId,
        capsuleIdBytesLength: capsuleIdBytes.length,
        capsuleIdBytesHex: Buffer.from(capsuleIdBytes).toString('hex')
      });

      // Build, sign, and execute transaction with retry logic for version mismatches
      const maxRetries = 3;
      let lastError: unknown;
      let result: Awaited<ReturnType<typeof this.suiClient.executeTransactionBlock>> | null = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Build transaction to mint NFT (rebuild on retry to get fresh object versions)
          let tx = new Transaction();
          
          // Set the sender (required for transaction building)
          tx.setSender(effectiveSigner.toSuiAddress());
          
          // Set gas budget explicitly (10 million MIST = 0.01 SUI)
          // This bypasses auto-estimation and ensures sufficient gas for NFT minting
          tx.setGasBudget(10000000n);
          
          // Call entry function (it handles transfer internally)
          tx.moveCall({
            target: `${this.packageId}::capsule_nft::mint_nft`,
            arguments: [
              tx.pure.vector('u8', Array.from(capsuleIdBytes)), // Capsule ID as vector<u8>
              tx.pure.address(ownerAddress), // Owner address
              tx.pure.vector('u8', Array.from(mediaBlobBytes)), // Media blob ID
              tx.pure.vector('u8', Array.from(messageBytes)), // Message
              tx.pure.vector('u8', Array.from(voiceBlobBytes)), // Voice blob ID (empty if none)
              tx.pure.u64(unlockAt), // Unlock timestamp (0 = no time lock)
            ],
          });
          
          if (attempt > 1) {
            logger.debug('Rebuilding transaction for retry', { attempt, capsuleId });
          }
          
          logger.debug('Building transaction', { attempt, capsuleId, packageId: this.packageId });
          let txBytes: Uint8Array;
          try {
            txBytes = await tx.build({ client: this.suiClient });
          } catch (buildError: unknown) {
            logger.error('Transaction build failed', {
              attempt,
              error: buildError instanceof Error ? buildError.message : String(buildError),
              capsuleId,
            });
            throw buildError;
          }
          
          logger.debug('Signing transaction', { attempt, capsuleId });
          let signature: string | { signature: string };
          try {
            signature = await effectiveSigner.signTransaction(txBytes);
          } catch (signError: unknown) {
            logger.error('Transaction signing failed', {
              attempt,
              error: signError instanceof Error ? signError.message : String(signError),
              capsuleId,
            });
            throw signError;
          }
          
          logger.debug('Executing NFT mint transaction', { attempt, capsuleId, packageId: this.packageId });
          
          try {
            const txResult = await this.suiClient.executeTransactionBlock({
              transactionBlock: txBytes,
              signature: typeof signature === 'string' ? signature : signature.signature,
              options: {
                showEffects: true,
                showEvents: true,
              showObjectChanges: true,
            },
          });
          
          // Assign to outer result variable
          result = txResult;
          
          } catch (executeError: unknown) {
            logger.error('executeTransactionBlock threw an error', {
              attempt,
              error: executeError instanceof Error ? executeError.message : String(executeError),
              errorType: executeError instanceof Error ? executeError.constructor.name : typeof executeError,
              errorStack: executeError instanceof Error ? executeError.stack : undefined,
              capsuleId,
            });
            throw executeError; // Re-throw to be caught by outer catch
          }
          
          // Check if transaction failed
          const effectsStatus = result.effects?.status;
          if (effectsStatus && 'status' in effectsStatus && effectsStatus.status === 'failure') {
            const errorMessage = effectsStatus.error || 'Transaction failed with unknown error';
            const errorStr = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
            
            // Check if this is a version mismatch error (retryable)
            const isVersionMismatch = errorStr.includes('not available for consumption') && 
                                     (errorStr.includes('Version') || errorStr.includes('current version'));
            
            if (isVersionMismatch && attempt < maxRetries) {
              logger.warn('Version mismatch detected, retrying transaction', {
                attempt,
                maxRetries,
                capsuleId,
                error: errorMessage,
              });
              // Wait a bit before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 500 * attempt));
              lastError = errorMessage;
              continue; // Retry
            }
            
            // Check if this is a contract version mismatch error (needs redeployment)
            if (errorStr.includes('not available for consumption') || errorStr.includes('Version') || errorStr.includes('current version')) {
              logger.error('NFT mint failed - Contract version mismatch. Contract needs redeployment.', {
                txDigest: result.digest,
                error: errorMessage,
                capsuleId,
                ownerAddress,
                packageId: this.packageId,
                hint: 'The Move contract on-chain does not match the code. Please redeploy the contract with the new unlock_at parameter.',
              });
              throw new Error(`Contract version mismatch: The Move contract needs to be redeployed with the new unlock_at parameter. Please run the deployment script to update the contract on-chain. Original error: ${errorMessage}`);
            }
            
            // Non-retryable error
            const errorDetails = effectsStatus.error ? JSON.stringify(effectsStatus.error, null, 2) : 'No error details available';
            logger.error('NFT mint transaction failed', {
              txDigest: result.digest,
              error: errorMessage,
              errorDetails,
              capsuleId,
              ownerAddress,
              packageId: this.packageId,
            });
            throw new Error(`NFT mint transaction failed: ${errorMessage}. Details: ${errorDetails}`);
          }
          
          // Success - result is already set from executeTransactionBlock
          logger.info('✅ Transaction succeeded', { attempt, capsuleId, txDigest: result.digest });
          break; // Break out of retry loop - result is already set
          
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStr = errorMessage;
          lastError = error; // Store the actual error object
          
          logger.warn('Transaction attempt failed', {
            attempt,
            maxRetries,
            capsuleId,
            error: errorMessage,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          });
          
          // Check if this is a version mismatch error (retryable)
          const isVersionMismatch = errorStr.includes('not available for consumption') && 
                                   (errorStr.includes('Version') || errorStr.includes('current version'));
          
          if (isVersionMismatch && attempt < maxRetries) {
            logger.warn('Version mismatch detected in catch, retrying transaction', {
              attempt,
              maxRetries,
              capsuleId,
              error: errorMessage,
            });
            // Wait a bit before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
            continue; // Retry
          }
          
          // If it's the last attempt or not retryable, throw
          if (attempt === maxRetries || !isVersionMismatch) {
            throw error;
          }
        }
      }
      
      // If we get here, result should be set from the successful attempt
      if (!result) {
        let errorMsg = 'Unknown error';
        if (lastError instanceof Error) {
          errorMsg = lastError.message || lastError.toString();
        } else if (lastError) {
          errorMsg = String(lastError);
        }
        logger.error('NFT mint failed after all retries', {
          attempts: maxRetries,
          capsuleId,
          lastError: errorMsg,
          lastErrorType: lastError ? (lastError instanceof Error ? lastError.constructor.name : typeof lastError) : 'undefined',
        });
        throw new Error(`NFT mint failed after ${maxRetries} attempts: ${errorMsg}`);
      }
      
      // TypeScript now knows result is not null - use type assertion
      const finalResult = result as Awaited<ReturnType<typeof this.suiClient.executeTransactionBlock>>;
      const effectsStatus = finalResult.effects?.status;

        logger.debug('Transaction executed', {
        txDigest: finalResult.digest,
        eventsCount: finalResult.events?.length || 0,
        objectChangesCount: finalResult.objectChanges?.length || 0,
        effectsStatus: effectsStatus?.status || 'success',
      });
      
      // Try to extract NFT ID from objectChanges first (more reliable)
      let nftId: string | null = null;
      if (finalResult.objectChanges) {
        logger.debug('Inspecting objectChanges for NFT ID', {
          objectChangesCount: finalResult.objectChanges.length,
          objectChanges: JSON.stringify(finalResult.objectChanges, null, 2),
        });
        
        for (const change of finalResult.objectChanges) {
          // Check if it's a created object
          if (change.type === 'created') {
            // Check objectType field
            if ('objectType' in change && typeof change.objectType === 'string') {
              if (change.objectType.includes('CapsuleNFT') || change.objectType.includes('capsule_nft')) {
                nftId = change.objectId;
                logger.debug('Found NFT ID from created object', { nftId, objectType: change.objectType });
                break;
              }
            }
          }
          // Check for transferred objects (NFT was transferred to owner)
          if (change.type === 'transferred' && 'objectType' in change && typeof change.objectType === 'string') {
            if (change.objectType.includes('CapsuleNFT') || change.objectType.includes('capsule_nft')) {
              nftId = change.objectId;
              logger.debug('Found NFT ID from transferred object', { nftId, objectType: change.objectType });
              break;
            }
          }
        }
      }
      
      // Fallback to events if not found in objectChanges
      if (!nftId) {
        logger.debug('Checking events for NFT ID', { eventsCount: finalResult.events?.length || 0 });
        nftId = this.extractNFTIdFromEvents(finalResult.events || []);
        if (nftId) {
          logger.debug('Found NFT ID from events', { nftId });
        }
      }
      
      // If still not found, wait a bit and query events from the network
      if (!nftId) {
        try {
          logger.debug('Querying network events for NFT', { ownerAddress, capsuleId, txDigest: finalResult.digest });
          // Wait a bit for event indexing
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
          
          // Query events to get NFT ID from event
          const events = await this.suiClient.queryEvents({
            query: {
              MoveEventType: `${this.packageId}::capsule_nft::NFTMintedEvent`,
            },
            limit: 20,
            order: 'descending',
          });
          
          logger.debug('Queried events from network', { eventsCount: events.data.length });
          
          for (const event of events.data) {
            if (event.parsedJson && typeof event.parsedJson === 'object') {
              const parsed = event.parsedJson as { capsule_id?: string | number[]; nft_id?: string; owner?: string };
              // Check if this event matches our capsule and owner
              const eventCapsuleId = parsed.capsule_id;
              if (eventCapsuleId) {
                // capsule_id is vector<u8> which might be array or base64 string
                let eventCapsuleIdStr: string;
                if (Array.isArray(eventCapsuleId)) {
                  eventCapsuleIdStr = Buffer.from(eventCapsuleId).toString('hex');
                } else if (typeof eventCapsuleId === 'string') {
                  // Try to decode as base64 first, then use as-is
                  try {
                    eventCapsuleIdStr = Buffer.from(eventCapsuleId, 'base64').toString('hex');
                  } catch {
                    eventCapsuleIdStr = eventCapsuleId;
                  }
                } else {
                  continue;
                }
                
                // Compare with our capsuleId (which is a hex string)
                if (eventCapsuleIdStr === capsuleId || eventCapsuleIdStr.toLowerCase() === capsuleId.toLowerCase()) {
                  if (parsed.nft_id && parsed.owner === ownerAddress) {
                    nftId = parsed.nft_id;
                    logger.debug('Found NFT ID from network event query', { nftId, capsuleId, ownerAddress, eventCapsuleIdStr });
                    break;
                  }
                }
              }
            }
          }
        } catch (queryError) {
          logger.warn('Failed to query network events for NFT ID', { error: queryError, capsuleId, ownerAddress });
        }
      }
      
      // LAST RESORT: If we still don't have the NFT ID, query owner's objects
      if (!nftId) {
        try {
          logger.debug('Last resort: Querying owner objects directly', { ownerAddress, capsuleId });
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for indexing
          
          const ownerObjects = await this.suiClient.getOwnedObjects({
            owner: ownerAddress,
            filter: {
              StructType: `${this.packageId}::capsule_nft::CapsuleNFT`,
            },
            options: {
              showType: true,
              showContent: true,
            },
            limit: 20,
          });
          
          logger.debug('Queried owner objects', { objectsCount: ownerObjects.data.length });
          
          // Find the NFT that matches our capsule_id
          for (const obj of ownerObjects.data) {
            if (obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content) {
              const fields = obj.data.content.fields as Record<string, unknown>;
              const objCapsuleId = fields.capsule_id;
              if (objCapsuleId) {
                // capsule_id is vector<u8>, might be array
                let objCapsuleIdStr: string;
                if (Array.isArray(objCapsuleId)) {
                  objCapsuleIdStr = Buffer.from(objCapsuleId as number[]).toString('hex');
                } else if (typeof objCapsuleId === 'string') {
                  objCapsuleIdStr = objCapsuleId;
                } else {
                  continue;
                }
                
                if (objCapsuleIdStr === capsuleId || objCapsuleIdStr.toLowerCase() === capsuleId.toLowerCase()) {
                  nftId = obj.data.objectId;
                  logger.debug('Found NFT ID from owner objects query', { nftId, capsuleId, objCapsuleIdStr });
                  break;
                }
              }
            }
          }
        } catch (finalError) {
          logger.error('Failed to query owner objects', { error: finalError, ownerAddress, capsuleId });
        }
      }
      
      // If STILL no NFT ID, this is a critical error - throw instead of returning unknown
      if (!nftId) {
        const errorMsg = `CRITICAL: Could not extract NFT ID from transaction. Transaction succeeded but NFT ID is missing. TxDigest: ${finalResult.digest}, CapsuleId: ${capsuleId}, Owner: ${ownerAddress}`;
        logger.error(errorMsg, {
          capsuleId,
          txDigest: finalResult.digest,
          ownerAddress,
          events: finalResult.events?.length || 0,
          objectChanges: finalResult.objectChanges?.length || 0,
          objectChangesDetails: JSON.stringify(finalResult.objectChanges, null, 2),
          eventsDetails: JSON.stringify(finalResult.events, null, 2),
        });
        throw new Error(errorMsg);
      }

      logger.debug('NFT minted successfully', {
        capsuleId,
        nftId,
        txDigest: finalResult.digest,
        unlockAt: unlockAt > 0 ? new Date(unlockAt).toISOString() : 'immediate',
      });

      // Create Display object for wallet display (with image URL)
      // Note: Sui wallets look for display metadata with image_url field
      // For custom NFTs, we need to wait for the NFT to be indexed, then create Display
      try {
        const backendUrl = process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:3001';
        const imageUrl = `${backendUrl}/api/capsule/${capsuleId}/nft/preview`;
        
        // Wait for NFT to be indexed before creating Display
        logger.debug('Waiting for NFT to be indexed before creating Display...', { nftId });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        // Verify NFT exists before creating Display
        try {
          await this.suiClient.getObject({
            id: nftId,
            options: { showType: true },
          });
        } catch (checkError) {
          logger.warn('NFT not yet available for Display creation, skipping', {
            nftId,
            error: checkError instanceof Error ? checkError.message : String(checkError),
          });
          // Skip Display creation if NFT not available
          return {
            nftId,
            capsuleId,
            glowIntensity: 200,
            txDigest: finalResult.digest,
          };
        }
        
        // Display metadata is handled by the Move contract's getter functions
        // The contract implements: name(), description(), image_url(), and link()
        // Sui wallets will automatically call these functions to get display metadata
        logger.info('✅ NFT minted with Display getter functions', {
          nftId,
          imageUrl,
          note: 'Wallets will call the Move contract getter functions (name, description, image_url, link) automatically',
        });
        
      } catch (displayError) {
        // Display creation is optional - log but don't fail
        logger.warn('Display creation skipped (non-critical)', { 
          error: displayError instanceof Error ? displayError.message : String(displayError),
          nftId 
        });
      }

      // Store NFT metadata in database including unlock info
      try {
        const db = (await import('../db/database')).getDatabase();
        const isLocked = unlockAt > 0 && unlockAt > Date.now();
        await db.execute(
          `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             object_id = VALUES(object_id),
             unlock_at = VALUES(unlock_at),
             is_locked = VALUES(is_locked),
             metadata = VALUES(metadata)`,
          [
            nftId,
            capsuleId,
            nftId, // object_id is same as nft_id for now
            ownerAddress,
            unlockAt,
            isLocked ? 1 : 0,
            JSON.stringify({ message, mediaBlobId, voiceBlobId: voiceBlobId || null }),
          ]
        );
        logger.debug('NFT metadata stored in database', { nftId, capsuleId, isLocked });
      } catch (dbError) {
        logger.warn('Failed to store NFT metadata in database', { error: dbError, nftId, capsuleId });
        // Don't fail the mint if DB write fails
      }

      return {
        nftId,
        capsuleId,
        glowIntensity: 200, // Initial glow (0.8 * 255)
        txDigest: finalResult.digest,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to mint NFT', { 
        error: errorMessage,
        errorStack,
        capsuleId, 
        ownerAddress,
        mediaBlobId,
        messageLength: message.length,
        hasVoice: !!voiceBlobId,
      });
      throw error;
    }
  }

  /**
   * Update glow intensity on heartbeat
   */
  async updateGlow(
    nftId: string,
    newIntensity: number,
    signer?: Ed25519Keypair
  ): Promise<{ success: boolean; txDigest: string }> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for glow update');
      }

      // Clamp intensity to 0-255
      const clampedIntensity = Math.max(0, Math.min(255, Math.round(newIntensity)));

      logger.debug('Updating NFT glow intensity', { nftId, newIntensity: clampedIntensity });

      const tx = new Transaction();
      
      // Set gas budget explicitly (10 million MIST = 0.01 SUI)
      tx.setGasBudget(10000000n);
      
      tx.moveCall({
        target: `${this.packageId}::capsule_nft::update_glow`,
        arguments: [
          tx.object(nftId), // NFT object
          tx.pure.u8(clampedIntensity), // New glow intensity
        ],
      });

      const txBytes = await tx.build({ client: this.suiClient });
      const signature = await effectiveSigner.signTransaction(txBytes);
      
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
        logger.error('Glow update transaction failed on-chain', { 
          nftId, 
          error: errorMsg,
          digest: result.digest 
        });
        throw new Error(`Glow update failed: ${errorMsg}`);
      }

      logger.debug('Glow updated successfully', { nftId, newIntensity: clampedIntensity, txDigest: result.digest });

      return {
        success: true,
        txDigest: result.digest,
      };
    } catch (error: any) {
      // Extract meaningful error message
      const errorMessage = error?.message || String(error);
      
      // Check if it's an ownership error (common since user owns the NFT)
      const isOwnershipError = errorMessage.includes('Immutable') || 
                               errorMessage.includes('locks') || 
                               errorMessage.includes('Owner');

      logger.warn('Failed to update glow (non-critical)', { 
        nftId, 
        error: errorMessage,
        isOwnershipError
      });
      
      // Don't throw - this is a cosmetic update and shouldn't fail the workflow
      return { success: false, txDigest: '' };
    }
  }

  /**
   * Get NFT glow intensity from on-chain data
   */
  async getGlowIntensity(nftId: string): Promise<number> {
    try {
      const object = await this.suiClient.getObject({
        id: nftId,
        options: {
          showContent: true,
        },
      });

      if (object.data?.content && 'fields' in object.data.content) {
        const fields = object.data.content.fields as Record<string, unknown>;
        const glowIntensity = fields.glow_intensity;
        if (typeof glowIntensity === 'number') {
          return glowIntensity;
        }
      }

      return 200; // Default glow
    } catch (error) {
      logger.error('Failed to get glow intensity', { error, nftId });
      return 200; // Default glow on error
    }
  }

  /**
   * Calculate glow intensity based on capsule state
   */
  calculateGlowIntensity(capsule: {
    unlockAt?: number | null;
    status: 'locked' | 'unlocked';
    createdAt: string;
  }, accessCount: number = 0): number {
    // If unlocked, max glow
    if (capsule.status === 'unlocked') {
      return 255;
    }

    let glow = 100; // Base glow

    // Calculate glow based on time until unlock
    if (capsule.unlockAt && capsule.unlockAt > Date.now()) {
      const timeUntilUnlock = capsule.unlockAt - Date.now();
      const daysUntil = timeUntilUnlock / (24 * 60 * 60 * 1000);

      // Closer to unlock = brighter
      if (daysUntil < 30) {
        glow = 255;
      } else if (daysUntil < 365) {
        // Linear interpolation: 30 days = 255, 365 days = 100
        const progress = (365 - daysUntil) / 335; // 0 to 1
        glow = Math.round(100 + (progress * 155));
      } else {
        glow = 100;
      }
    }

    // Boost glow based on access count (capped at +50)
    const accessBoost = Math.min(50, accessCount * 5);
    glow = Math.min(255, glow + accessBoost);

    return glow;
  }

  /**
   * Sync glow from capsule state (on-chain)
   */
  async syncGlowFromCapsule(
    nftId: string,
    capsuleId: string,
    accessCount: number,
    signer?: Ed25519Keypair
  ): Promise<void> {
    try {
      const effectiveSigner = signer || this.signer;
      if (!effectiveSigner) {
        throw new Error('No signer available for glow sync');
      }

      logger.debug('Syncing glow from capsule', { nftId, capsuleId, accessCount });

      const tx = new Transaction();

      // Get NFT and capsule objects
      const nft = tx.object(nftId);
      const capsule = tx.object(capsuleId);

      // Get clock object
      const clock = tx.object('0x6'); // Sui clock object ID

      // Call sync_glow_from_capsule
      tx.moveCall({
        target: `${this.packageId}::capsule_nft::sync_glow_from_capsule`,
        arguments: [
          nft,
          capsule,
          clock,
          tx.pure.u64(accessCount),
        ],
      });

      const txBytes = await tx.build({ client: this.suiClient });
      const signature = await effectiveSigner.signTransaction(txBytes);
      
      await this.suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature.signature,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      logger.debug('Glow synced from capsule', { nftId, capsuleId });
    } catch (error) {
      logger.error('Failed to sync glow from capsule', { error, nftId, capsuleId });
      throw error;
    }
  }

  /**
   * Get NFT by capsule ID (query on-chain)
   */
  async getNFTByCapsuleId(capsuleId: string): Promise<{
    nftId: string;
    capsuleId: string;
    owner: string;
    glowIntensity: number;
    createdAt: number;
  } | null> {
    try {
      // Normalize capsuleId (remove 0x prefix if present)
      const normalizedCapsuleId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
      
      // Query for NFTMintedEvent with matching capsule_id
      const events = await this.suiClient.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::capsule_nft::NFTMintedEvent`,
        },
        limit: 100,
      });

      for (const event of events.data) {
        if (event.parsedJson && typeof event.parsedJson === 'object') {
          const parsed = event.parsedJson as { capsule_id?: string; nft_id?: string; owner?: string; glow_intensity?: number };
          
          // Compare capsule IDs (need to handle both string and bytes formats)
          let eventCapsuleId = parsed.capsule_id;
          if (eventCapsuleId && typeof eventCapsuleId === 'string') {
            // Remove 0x prefix if present
            eventCapsuleId = eventCapsuleId.startsWith('0x') ? eventCapsuleId.slice(2) : eventCapsuleId;
          }
          
          // Also try to get from NFT object directly if event doesn't match
          if (parsed.nft_id) {
            try {
              const nftObject = await this.suiClient.getObject({
                id: parsed.nft_id,
                options: {
                  showContent: true,
                  showOwner: true,
                },
              });
              
              if (nftObject.data?.content && 'fields' in nftObject.data.content) {
                const fields = nftObject.data.content.fields as Record<string, unknown>;
                // Get capsule_id from NFT object (stored as vector<u8>)
                if (fields.capsule_id && Array.isArray(fields.capsule_id)) {
                  const capsuleIdBytes = fields.capsule_id as number[];
                  const nftCapsuleId = new TextDecoder().decode(new Uint8Array(capsuleIdBytes));
                  
                  if (nftCapsuleId === normalizedCapsuleId || nftCapsuleId === capsuleId) {
                    const nftId = parsed.nft_id;
                    const glowIntensity = await this.getGlowIntensity(nftId);
                    const owner = (nftObject.data.owner && typeof nftObject.data.owner === 'object' && 'AddressOwner' in nftObject.data.owner)
                      ? (nftObject.data.owner as { AddressOwner: string }).AddressOwner
                      : parsed.owner || '';
                    
                    return {
                      nftId,
                      capsuleId: normalizedCapsuleId,
                      owner,
                      glowIntensity,
                      createdAt: typeof event.timestampMs === 'number' ? event.timestampMs : Date.now(),
                    };
                  }
                }
              }
            } catch (objError) {
              // If we can't get the object, fall back to event matching
              logger.debug('Could not get NFT object, using event data', { error: objError });
            }
          }
          
          // Fallback: match by string comparison if available
          if (eventCapsuleId === normalizedCapsuleId && parsed.nft_id) {
            const nftId = parsed.nft_id;
            const glowIntensity = await this.getGlowIntensity(nftId);
            
            return {
              nftId,
              capsuleId: normalizedCapsuleId,
              owner: parsed.owner || '',
              glowIntensity,
              createdAt: typeof event.timestampMs === 'number' ? event.timestampMs : Date.now(),
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to get NFT by capsule ID', { error, capsuleId });
      return null;
    }
  }

  /**
   * List NFTs owned by a user
   */
  async listUserNFTs(userAddress: string): Promise<Array<{
    nftId: string;
    capsuleId: string;
    glowIntensity: number;
    createdAt: number;
    mediaBlobId?: string;
  }>> {
    try {
      // Query for NFTMintedEvent where owner matches
      const events = await this.suiClient.queryEvents({
        query: {
          MoveEventType: `${this.packageId}::capsule_nft::NFTMintedEvent`,
        },
        limit: 100,
      });

      const nfts: Array<{
        nftId: string;
        capsuleId: string;
        glowIntensity: number;
        createdAt: number;
        mediaBlobId?: string;
      }> = [];

      for (const event of events.data) {
        if (event.parsedJson && typeof event.parsedJson === 'object') {
          const parsed = event.parsedJson as { capsule_id?: string | number[]; nft_id?: string; owner?: string; glow_intensity?: number };
          if (parsed.owner === userAddress && parsed.nft_id) {
            // Convert capsule_id from bytes to hex string if needed
            // Database stores IDs without 0x prefix, so normalize to match
            let capsuleId: string;
            if (Array.isArray(parsed.capsule_id)) {
              // Convert byte array to hex string
              const hexFromBytes = Buffer.from(parsed.capsule_id).toString('hex');
              
              // Check if this is UTF-8 encoded hex string (double length)
              // If length is 128 chars (64*2), it's likely UTF-8 encoded hex
              // Try to decode it back to the original hex string
              if (hexFromBytes.length === 128) {
                try {
                  // Decode UTF-8 bytes back to string (which should be the hex string)
                  const decodedString = Buffer.from(parsed.capsule_id).toString('utf8');
                  // Debug log removed
                  
                  // Check if decoded string is valid hex
                  if (/^[0-9a-fA-F]+$/.test(decodedString) && decodedString.length === 64) {
                    capsuleId = decodedString.toLowerCase();
                    // Debug log removed
                  } else {
                    // Try alternative: maybe it's hex bytes that represent UTF-8
                    // Try converting hex pairs to bytes, then decode
                    try {
                      const bytesFromHex = Buffer.from(hexFromBytes, 'hex');
                      const altDecoded = bytesFromHex.toString('utf8');
                      if (/^[0-9a-fA-F]+$/.test(altDecoded) && altDecoded.length === 64) {
                        capsuleId = altDecoded.toLowerCase();
                        logger.info('✅ SUCCESS: Decoded via hex->bytes->utf8', { decoded: altDecoded });
                      } else {
                        throw new Error('Alt decode also failed');
                      }
                    } catch (altError) {
                      // Not UTF-8 encoded hex, use as-is but log warning
                      // Debug log removed
                      capsuleId = hexFromBytes;
                    }
                  }
                } catch (e) {
                  // Decoding failed, use hex as-is
                    // Debug log removed
                  capsuleId = hexFromBytes;
                }
              } else if (hexFromBytes.length === 64) {
                // Already correct length (64 chars = 32 bytes = normal hex)
                capsuleId = hexFromBytes;
                logger.debug('✅ Normal hex length capsule ID', { length: hexFromBytes.length });
              } else {
                // Unexpected length, log it
                logger.warn('⚠️ Unexpected capsule ID length', { 
                  length: hexFromBytes.length,
                  hex: hexFromBytes.substring(0, 32) + '...'
                });
                capsuleId = hexFromBytes;
              }
            } else if (typeof parsed.capsule_id === 'string') {
              // Remove 0x prefix if present to match database format
              capsuleId = parsed.capsule_id.startsWith('0x') ? parsed.capsule_id.slice(2) : parsed.capsule_id;
            } else {
                // Debug log removed
              continue; // Skip if no valid capsule_id
            }
            
            // NFT log removed
            // Get current glow intensity (use event value as fallback to avoid slow calls)
            let glowIntensity = parsed.glow_intensity || 0;
            try {
              glowIntensity = await this.getGlowIntensity(parsed.nft_id);
            } catch (glowError) {
              // Use event value if we can't fetch current glow
                    // Debug log removed
            }
            
            // Try to get mediaBlobId from the NFT object on-chain
            let mediaBlobId: string | undefined;
            try {
              const nftObject = await this.suiClient.getObject({
                id: parsed.nft_id,
                options: {
                  showContent: true,
                },
              });
              
              if (nftObject.data?.content && 'fields' in nftObject.data.content) {
                const fields = nftObject.data.content.fields as Record<string, unknown>;
                // media_blob_id is stored as vector<u8> in Move, need to decode it
                if (fields.media_blob_id && Array.isArray(fields.media_blob_id)) {
                  const blobBytes = fields.media_blob_id as number[];
                  mediaBlobId = new TextDecoder().decode(new Uint8Array(blobBytes));
                }
              }
            } catch (blobError) {
              // If we can't get the blob ID, continue without it
              // Debug log removed
            }
            
            // NFT log removed
            
            nfts.push({
              nftId: parsed.nft_id,
              capsuleId: capsuleId,
              glowIntensity,
              createdAt: typeof event.timestampMs === 'number' ? event.timestampMs : Date.now(),
              mediaBlobId,
            });
          }
        }
      }

      logger.debug('Listed user NFTs', { 
        userAddress, 
        nftCount: nfts.length,
        capsuleIds: nfts.map(n => n.capsuleId).slice(0, 5)
      });
      return nfts;
    } catch (error) {
      logger.error('Failed to list user NFTs', { error, userAddress });
      return [];
    }
  }

  /**
   * Extract NFT ID from transaction events
   */
  private extractNFTIdFromEvents(events: Array<{ type: string; parsedJson?: unknown }>): string | null {
    for (const event of events) {
      // Check for NFTMintedEvent in various formats
      const eventType = event.type || '';
      if ((eventType.includes('NFTMintedEvent') || eventType.includes('nft_minted') || eventType.includes('capsule_nft::NFTMintedEvent')) && event.parsedJson) {
        const parsed = event.parsedJson as { 
          nft_id?: string; 
          nftId?: string; 
          id?: string;
          [key: string]: unknown; // Allow any string key
        };
        logger.debug('Found NFTMintedEvent', { eventType, parsed });
        // Try different field names
        if (parsed.nft_id && typeof parsed.nft_id === 'string') return parsed.nft_id;
        if (parsed.nftId && typeof parsed.nftId === 'string') return parsed.nftId;
        if (parsed.id && typeof parsed.id === 'string') return parsed.id;
        // Try accessing as object with string key
        const nftIdValue = (parsed as Record<string, unknown>)['nft_id'];
        if (nftIdValue && typeof nftIdValue === 'string') return nftIdValue;
      }
    }
    
    return null;
  }
}

export default NFTService;

