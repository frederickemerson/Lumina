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
    this.packageId = config.packageId || process.env.CAPSULE_NFT_PACKAGE_ID || process.env.CAPSULE_PACKAGE_ID || '0x6d0be913760c1606a9c390990a3a07bed24235d728f0fc6cacf1dca792d9a5d0';

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
   * @param signer - Optional signer (uses service signer if not provided)
   */
  async mintNFT(
    capsuleId: string,
    ownerAddress: string,
    mediaBlobId: string,
    message: string,
    voiceBlobId: string = '',
    soulbound: boolean = false,
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
        soulbound
      });

      // Convert strings to bytes for Move
      const mediaBlobBytes = new TextEncoder().encode(mediaBlobId);
      const messageBytes = new TextEncoder().encode(message);
      const voiceBlobBytes = voiceBlobId ? new TextEncoder().encode(voiceBlobId) : new Uint8Array(0);

      // Build transaction to mint NFT
      const tx = new Transaction();
      
      // Set the sender (required for transaction building)
      tx.setSender(effectiveSigner.toSuiAddress());
      
      // Set gas budget explicitly (10 million MIST = 0.01 SUI)
      // This bypasses auto-estimation and ensures sufficient gas for NFT minting
      tx.setGasBudget(10000000n);
      
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
      
      // Call entry function (it handles transfer internally)
      tx.moveCall({
        target: `${this.packageId}::capsule_nft::mint_nft`,
        arguments: [
          tx.pure.vector('u8', Array.from(capsuleIdBytes)), // Capsule ID as vector<u8>
          tx.pure.address(ownerAddress), // Owner address
          tx.pure.vector('u8', Array.from(mediaBlobBytes)), // Media blob ID
          tx.pure.vector('u8', Array.from(messageBytes)), // Message
          tx.pure.vector('u8', Array.from(voiceBlobBytes)), // Voice blob ID (empty if none)
        ],
      });

      // Build, sign, and execute transaction
      // Gas budget is already set above, so build() will use it
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
      
      // Check if transaction failed
      const effectsStatus = result.effects?.status;
      if (effectsStatus && 'status' in effectsStatus && effectsStatus.status === 'failure') {
        const errorMessage = effectsStatus.error || 'Transaction failed with unknown error';
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

        logger.debug('Transaction executed', {
        txDigest: result.digest,
        eventsCount: result.events?.length || 0,
        objectChangesCount: result.objectChanges?.length || 0,
        effectsStatus: effectsStatus?.status || 'success',
      });
      
      // Try to extract NFT ID from objectChanges first (more reliable)
      let nftId: string | null = null;
      if (result.objectChanges) {
        logger.debug('Inspecting objectChanges for NFT ID', {
          objectChangesCount: result.objectChanges.length,
          objectChanges: JSON.stringify(result.objectChanges, null, 2),
        });
        
        for (const change of result.objectChanges) {
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
        logger.debug('Checking events for NFT ID', { eventsCount: result.events?.length || 0 });
        nftId = this.extractNFTIdFromEvents(result.events || []);
        if (nftId) {
          logger.debug('Found NFT ID from events', { nftId });
        }
      }
      
      // If still not found, wait a bit and query events from the network
      if (!nftId) {
        try {
          logger.debug('Querying network events for NFT', { ownerAddress, capsuleId, txDigest: result.digest });
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
        const errorMsg = `CRITICAL: Could not extract NFT ID from transaction. Transaction succeeded but NFT ID is missing. TxDigest: ${result.digest}, CapsuleId: ${capsuleId}, Owner: ${ownerAddress}`;
        logger.error(errorMsg, {
          capsuleId,
          txDigest: result.digest,
          ownerAddress,
          events: result.events?.length || 0,
          objectChanges: result.objectChanges?.length || 0,
          objectChangesDetails: JSON.stringify(result.objectChanges, null, 2),
          eventsDetails: JSON.stringify(result.events, null, 2),
        });
        throw new Error(errorMsg);
      }

      logger.debug('NFT minted successfully', {
        capsuleId,
        nftId,
        txDigest: result.digest,
      });

      return {
        nftId,
        capsuleId,
        glowIntensity: 200, // Initial glow (0.8 * 255)
        txDigest: result.digest,
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
                  logger.info('🔍 Attempting UTF-8 decode', {
                    hexLength: hexFromBytes.length,
                    decodedString,
                    decodedLength: decodedString.length,
                    isHex: /^[0-9a-fA-F]+$/.test(decodedString)
                  });
                  
                  // Check if decoded string is valid hex
                  if (/^[0-9a-fA-F]+$/.test(decodedString) && decodedString.length === 64) {
                    capsuleId = decodedString.toLowerCase();
                    logger.info('✅ SUCCESS: Decoded UTF-8 encoded hex string', { 
                      originalLength: hexFromBytes.length,
                      decodedLength: decodedString.length,
                      decoded: decodedString,
                      finalCapsuleId: capsuleId
                    });
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
                      logger.warn('⚠️ UTF-8 decode failed - using hex as-is', {
                        decodedString,
                        decodedLength: decodedString.length,
                        isHex: /^[0-9a-fA-F]+$/.test(decodedString),
                        willUseHex: hexFromBytes.substring(0, 32) + '...'
                      });
                      capsuleId = hexFromBytes;
                    }
                  }
                } catch (e) {
                  // Decoding failed, use hex as-is
                  logger.warn('⚠️ UTF-8 decode error', { error: e, hexLength: hexFromBytes.length });
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
              logger.warn('⚠️ Invalid capsule_id type', { type: typeof parsed.capsule_id, value: parsed.capsule_id });
              continue; // Skip if no valid capsule_id
            }
            
            logger.info('🎯 Final capsule ID for NFT', {
              nftId: parsed.nft_id,
              capsuleId,
              capsuleIdLength: capsuleId.length,
              owner: parsed.owner
            });
            // Get current glow intensity (use event value as fallback to avoid slow calls)
            let glowIntensity = parsed.glow_intensity || 0;
            try {
              glowIntensity = await this.getGlowIntensity(parsed.nft_id);
            } catch (glowError) {
              // Use event value if we can't fetch current glow
              logger.debug('Using event glow intensity', { nftId: parsed.nft_id });
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
              logger.debug('Could not fetch mediaBlobId from NFT object', { nftId: parsed.nft_id, error: blobError });
            }
            
            logger.info('✅ Adding NFT to list', { 
              nftId: parsed.nft_id, 
              capsuleId, 
              capsuleIdLength: capsuleId.length,
              owner: parsed.owner,
              glowIntensity,
              willBeIncluded: true
            });
            
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

