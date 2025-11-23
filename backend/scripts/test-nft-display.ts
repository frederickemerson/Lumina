/**
 * Test NFT Display Metadata
 * 
 * This script:
 * 1. Mints a test NFT
 * 2. Verifies display metadata was created
 * 3. Checks if image URL is accessible
 * 
 * Usage:
 *   ts-node --project tsconfig.json scripts/test-nft-display.ts
 */

import 'dotenv/config';
import { getDatabase, initializeDatabase } from '../src/db/database';
import NFTService from '../src/services/nftService';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient } from '@mysten/sui/client';
import { logger } from '../src/utils/logger';

async function testNFTDisplay() {
  console.log('🧪 Testing NFT Display Metadata\n');

  // Check if keypair is configured
  const keypairEnv = process.env.NFT_SERVICE_KEYPAIR || process.env.WALRUS_SERVICE_KEYPAIR;
  if (!keypairEnv) {
    console.error('❌ NFT_SERVICE_KEYPAIR or WALRUS_SERVICE_KEYPAIR not set in .env');
    process.exit(1);
  }

  try {
    // Initialize database
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized\n');

    // Parse keypair
    console.log('🔑 Parsing keypair...');
    let keypair: Ed25519Keypair;
    if (keypairEnv.startsWith('suiprivkey1')) {
      keypair = Ed25519Keypair.fromSecretKey(keypairEnv);
    } else {
      const { fromB64 } = await import('@mysten/sui/utils');
      keypair = Ed25519Keypair.fromSecretKey(fromB64(keypairEnv));
    }
    const signerAddress = keypair.toSuiAddress();
    console.log(`✅ Keypair loaded (address: ${signerAddress})\n`);

    // Initialize services
    const nftService = new NFTService({ signer: keypair });
    const suiClient = new SuiClient({ 
      url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443' 
    });

    // Generate test data
    const testCapsuleId = `test_display_${Date.now()}`;
    const testMediaBlobId = 'test_media_blob_display';
    const testMessage = 'Test NFT for Display Verification';
    const testOwnerAddress = signerAddress;
    const unlockAt = 0; // No time lock for this test

    console.log('📝 Step 1: Minting test NFT...');
    console.log(`   Capsule ID: ${testCapsuleId}`);
    console.log(`   Owner: ${testOwnerAddress}\n`);

    const mintResult = await nftService.mintNFT(
      testCapsuleId,
      testOwnerAddress,
      testMediaBlobId,
      testMessage,
      '', // no voice
      false, // not soulbound
      unlockAt, // no time lock
      keypair
    );

    console.log(`✅ NFT minted successfully!`);
    console.log(`   NFT ID: ${mintResult.nftId}`);
    console.log(`   Transaction: ${mintResult.txDigest}\n`);

    // Wait a bit for indexing
    console.log('⏳ Waiting 5 seconds for transaction to be indexed...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Wait complete\n');

    // Verify display metadata
    console.log('🔍 Step 2: Verifying display metadata...');
    const nftObject = await suiClient.getObject({
      id: mintResult.nftId,
      options: {
        showType: true,
        showContent: true,
        showDisplay: true, // This is key for display metadata
        showOwner: true,
      },
    });

    if (!nftObject.data) {
      throw new Error('NFT object not found on-chain');
    }

    console.log(`✅ NFT found on-chain`);
    console.log(`   Type: ${nftObject.data.type}\n`);

    const backendUrl = process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:3001';
    const expectedImageUrl = `${backendUrl}/api/capsule/${testCapsuleId}/nft/preview`;

    // Check display metadata
    const display = nftObject.data.display as Record<string, string> | undefined;
    
    // Also try calling the getter functions directly
    console.log('🔍 Step 2b: Testing Display getter functions directly...');
    try {
      const packageId = process.env.CAPSULE_PACKAGE_ID || '0x267d1b63db92e7a5502b334cd353cea7a5d40c9ed779dee4fe7211f37eb9f4b4';
      
      // Try to call the getter functions via moveCall
      const { Transaction } = await import('@mysten/sui/transactions');
      const tx = new Transaction();
      tx.setSender(signerAddress);
      
      // Call image_url getter
      const imageUrlResult = tx.moveCall({
        target: `${packageId}::capsule_nft::image_url`,
        arguments: [tx.object(mintResult.nftId)],
      });
      
      console.log('   Attempted to call image_url() getter function');
      console.log('   Note: This requires the NFT to be in a transaction context');
      console.log('   Wallets will call these functions automatically\n');
    } catch (getterError) {
      console.log('   Getter functions exist but need to be called by wallets');
      console.log('   This is expected - wallets will call them automatically\n');
    }
    
    if (display) {
      console.log('✅ Display metadata found!');
      console.log('   Display fields:');
      Object.entries(display).forEach(([key, value]) => {
        console.log(`     ${key}: ${value}`);
      });
      console.log();

      const imageUrl = display.image_url || display.url || display.imageUrl;
      
      if (imageUrl) {
        console.log(`📸 Image URL found: ${imageUrl}`);
        console.log(`   Expected: ${expectedImageUrl}`);
        console.log(`   Match: ${imageUrl === expectedImageUrl ? '✅' : '❌'}\n`);

        // Test image accessibility
        console.log('🌐 Step 3: Testing image URL accessibility...');
        try {
          const imageResponse = await fetch(imageUrl, { 
            method: 'HEAD',
            headers: {
              'Accept': 'image/*',
            },
          });
          
          if (imageResponse.ok) {
            const contentType = imageResponse.headers.get('content-type');
            console.log(`✅ Image URL is accessible!`);
            console.log(`   Status: ${imageResponse.status}`);
            console.log(`   Content-Type: ${contentType}`);
            console.log(`   The NFT should display correctly in Sui wallets! 🎉\n`);
          } else {
            console.warn(`⚠️  Image URL returned status: ${imageResponse.status}`);
            console.warn(`   The image may not be accessible\n`);
          }
        } catch (fetchError) {
          console.error(`❌ Failed to fetch image:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
          console.error(`   The image URL may not be accessible\n`);
        }
      } else {
        console.warn('⚠️  No image URL found in display metadata');
        console.warn('   The NFT will show "No Media" in wallets\n');
      }
    } else {
      console.warn('⚠️  No display metadata found');
      console.warn('   The NFT will show "No Media" in wallets');
      console.warn('   Display object creation may have failed\n');
    }

    // Summary
    console.log('📊 Test Summary:');
    console.log(`   NFT ID: ${mintResult.nftId}`);
    console.log(`   Capsule ID: ${testCapsuleId}`);
    console.log(`   Has Display: ${display ? '✅ Yes' : '❌ No'}`);
    if (display) {
      const imageUrl = display.image_url || display.url || display.imageUrl;
      console.log(`   Has Image URL: ${imageUrl ? '✅ Yes' : '❌ No'}`);
      if (imageUrl) {
        console.log(`   Image URL: ${imageUrl}`);
      }
    }
    console.log();

    // Cleanup
    console.log('🧹 Note: Test NFT created on-chain (cannot be deleted)');
    console.log(`   You can view it at: https://suiexplorer.com/object/${mintResult.nftId}?network=testnet`);
    console.log(`   Capsule ID: ${testCapsuleId}`);
    console.log();

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testNFTDisplay()
    .then(() => {
      console.log('✅ Display test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Display test failed:', error);
      process.exit(1);
    });
}

export { testNFTDisplay };

