/**
 * Test NFT Minting Script
 * Tests NFT minting and verifies NFT ID extraction
 */

import 'dotenv/config';
import NFTService from '../src/services/nftService';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { logger } from '../src/utils/logger';

function parseKeypair(keyString: string): Ed25519Keypair {
  if (keyString.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(keyString);
  } else {
    return Ed25519Keypair.fromSecretKey(fromB64(keyString));
  }
}

async function testNFTMinting() {
  try {
    logger.info('Starting NFT minting test...');
    
    // Get signer
    const signerKey = process.env.WALRUS_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR;
    if (!signerKey) {
      throw new Error('WALRUS_SERVICE_KEYPAIR or NFT_SERVICE_KEYPAIR not set');
    }
    
    const signer = parseKeypair(signerKey);
    const ownerAddress = signer.toSuiAddress();
    logger.info('Signer initialized', { address: ownerAddress });
    
    // Initialize NFT service
    const packageId = process.env.CAPSULE_PACKAGE_ID || '0x267d1b63db92e7a5502b334cd353cea7a5d40c9ed779dee4fe7211f37eb9f4b4';
    const network = (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet';
    
    const nftService = new NFTService({
      network,
      packageId,
      signer,
    });
    
    logger.info('NFT service initialized', { packageId, network });
    
    // Generate a test capsule ID (64 bytes hex)
    const capsuleId = Buffer.from('test_capsule_' + Date.now()).toString('hex').padStart(64, '0');
    const mediaBlobId = 'test_blob_' + Date.now();
    const message = 'Test NFT message';
    const soulbound = false;
    
    logger.info('Minting test NFT...', {
      capsuleId,
      ownerAddress,
      mediaBlobId,
      messageLength: message.length,
      soulbound,
    });
    
    // Mint NFT
    const result = await nftService.mintNFT(
      capsuleId,
      ownerAddress,
      mediaBlobId,
      message,
      '', // voiceBlobId (empty string if none)
      soulbound,
      signer // Optional signer
    );
    
    logger.info('✅ NFT minted successfully!', {
      nftId: result.nftId,
      capsuleId: result.capsuleId,
      txDigest: result.txDigest,
      glowIntensity: result.glowIntensity,
    });
    
    // Verify NFT ID is not "unknown"
    if (!result.nftId || result.nftId === 'unknown') {
      throw new Error('NFT ID is missing or unknown!');
    }
    
    logger.info('✅ NFT ID extraction verified', { nftId: result.nftId });
    
    // Try to get NFT details by capsule ID
    try {
      const nftDetails = await nftService.getNFTByCapsuleId(capsuleId);
      if (nftDetails) {
        logger.info('✅ NFT details retrieved', {
          nftId: nftDetails.nftId,
          capsuleId: nftDetails.capsuleId,
          owner: nftDetails.owner,
          glowIntensity: nftDetails.glowIntensity,
        });
      } else {
        logger.warn('NFT details not found (may need to wait for indexing)');
      }
    } catch (error) {
      logger.warn('Could not retrieve NFT details (may need to wait for indexing)', { error });
    }
    
    logger.info('✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Test failed', { error });
    process.exit(1);
  }
}

testNFTMinting();

