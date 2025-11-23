/**
 * Verify NFT Display Metadata
 * 
 * This script checks if an NFT has display metadata set correctly
 * and if the image URL is accessible.
 * 
 * Usage:
 *   ts-node --project tsconfig.json scripts/verify-nft-display.ts <nft_id>
 */

import 'dotenv/config';
import { SuiClient } from '@mysten/sui/client';

const SUI_FULLNODE_URL = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
const suiClient = new SuiClient({ url: SUI_FULLNODE_URL });

async function verifyNFTDisplay(nftId: string) {
  console.log(`🔍 Verifying NFT Display Metadata for: ${nftId}\n`);

  try {
    // Get NFT object
    console.log('1️⃣ Fetching NFT object...');
    const nftObject = await suiClient.getObject({
      id: nftId,
      options: {
        showType: true,
        showContent: true,
        showDisplay: true, // This is key - shows display metadata
        showOwner: true,
      },
    });

    if (!nftObject.data) {
      console.error('❌ NFT object not found');
      process.exit(1);
    }

    console.log(`✅ NFT found`);
    console.log(`   Type: ${nftObject.data.type}`);
    console.log(`   Owner: ${JSON.stringify(nftObject.data.owner)}\n`);

    // Check display metadata
    console.log('2️⃣ Checking display metadata...');
    if (nftObject.data.display) {
      console.log('✅ Display metadata found:');
      console.log(JSON.stringify(nftObject.data.display, null, 2));
      
      const display = nftObject.data.display;
      const imageUrl = display.image_url || display.url || display.imageUrl;
      
      if (imageUrl) {
        console.log(`\n3️⃣ Testing image URL accessibility...`);
        console.log(`   URL: ${imageUrl}`);
        
        try {
          const response = await fetch(imageUrl, {
            method: 'HEAD', // Just check if it exists
            headers: {
              'Accept': 'image/*',
            },
          });
          
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            console.log(`✅ Image URL is accessible`);
            console.log(`   Content-Type: ${contentType}`);
            console.log(`   Status: ${response.status}`);
          } else {
            console.warn(`⚠️  Image URL returned status: ${response.status}`);
          }
        } catch (fetchError) {
          console.error(`❌ Failed to fetch image URL:`, fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      } else {
        console.warn('⚠️  No image URL found in display metadata');
      }
    } else {
      console.warn('⚠️  No display metadata found');
      console.log('   This means the Display object was not created or linked to the NFT');
      console.log('   The NFT will show "No Media" in wallets\n');
    }

    // Check if there are any Display objects linked to this NFT
    console.log('\n4️⃣ Searching for Display objects...');
    try {
      // Query for Display objects that might reference this NFT
      // Note: This is a simplified check - actual Display objects might be stored differently
      const owner = 'owner' in nftObject.data && nftObject.data.owner 
        ? (typeof nftObject.data.owner === 'string' ? nftObject.data.owner : (nftObject.data.owner as any).AddressOwner)
        : null;
      
      if (owner) {
        const ownerObjects = await suiClient.getOwnedObjects({
          owner,
          filter: {
            StructType: '0x2::display::Display',
          },
          options: {
            showType: true,
            showContent: true,
            showDisplay: true,
          },
          limit: 50,
        });
        
        console.log(`   Found ${ownerObjects.data.length} Display object(s) owned by ${owner}`);
        
        if (ownerObjects.data.length > 0) {
          console.log('   Display objects:');
          ownerObjects.data.forEach((obj, idx) => {
            console.log(`   ${idx + 1}. ${obj.data?.objectId}`);
            if (obj.data?.display) {
              console.log(`      Display: ${JSON.stringify(obj.data.display)}`);
            }
          });
        }
      }
    } catch (searchError) {
      console.warn('   Could not search for Display objects:', searchError instanceof Error ? searchError.message : String(searchError));
    }

    // Summary
    console.log('\n📊 Summary:');
    if (nftObject.data.display && (nftObject.data.display.image_url || nftObject.data.display.url)) {
      console.log('✅ NFT has display metadata with image URL');
      console.log('   The NFT should display correctly in Sui wallets');
    } else {
      console.log('⚠️  NFT does not have display metadata');
      console.log('   The NFT will show "No Media" in wallets');
      console.log('   You may need to create a Display object or update the Move contract');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
    if (error instanceof Error) {
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Get NFT ID from command line
const nftId = process.argv[2];

if (!nftId) {
  console.error('❌ Please provide an NFT ID');
  console.error('Usage: ts-node scripts/verify-nft-display.ts <nft_id>');
  console.error('Example: ts-node scripts/verify-nft-display.ts 0x1234...');
  process.exit(1);
}

// Run verification
verifyNFTDisplay(nftId)
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });

