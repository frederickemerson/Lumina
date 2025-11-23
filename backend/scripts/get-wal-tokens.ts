/**
 * Script to help get WAL tokens for Walrus storage
 * 
 * Walrus requires WAL tokens (not SUI) to pay for storage.
 * This script provides instructions and attempts to get WAL tokens.
 */

import 'dotenv/config';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';

const WAL_COIN_TYPE = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';

async function main() {
  console.log('\n=== Walrus WAL Token Helper ===\n');

  // Get signer address
  if (!process.env.WALRUS_SERVICE_KEYPAIR) {
    console.error('❌ WALRUS_SERVICE_KEYPAIR not set in .env');
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(process.env.WALRUS_SERVICE_KEYPAIR);
  const address = keypair.toSuiAddress();
  console.log(`Signer Address: ${address}\n`);

  const suiClient = new SuiClient({
    url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443',
  });

  // Check SUI balance
  const suiBalance = await suiClient.getBalance({
    owner: address,
  });
  console.log(`SUI Balance: ${suiBalance.totalBalance} MIST (${Number(suiBalance.totalBalance) / 1_000_000_000} SUI)`);

  // Check WAL balance
  try {
    const walBalance = await suiClient.getBalance({
      owner: address,
      coinType: WAL_COIN_TYPE,
    });
    console.log(`WAL Balance: ${walBalance.totalBalance} MIST (${Number(walBalance.totalBalance) / 1_000_000_000} WAL)`);
    
    if (Number(walBalance.totalBalance) === 0) {
      console.log('\n⚠️  WAL balance is 0. You need WAL tokens to upload to Walrus.\n');
      console.log('To get WAL tokens on testnet:');
      console.log('1. Visit the Walrus testnet interface');
      console.log('2. Or use the Sui CLI to swap SUI for WAL:');
      console.log(`   sui client call --package 0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a --module wal --function swap_sui_for_wal --args <amount_in_mist> --gas-budget 10000000`);
      console.log('\n3. Or request WAL tokens from the Walrus team on Discord');
      console.log('4. Minimum recommended: 0.1 WAL (100,000,000 MIST)\n');
      
      // Try to get some WAL if we have SUI
      if (Number(suiBalance.totalBalance) > 10_000_000_000) { // More than 0.01 SUI
        console.log('Attempting to swap 0.01 SUI for WAL...');
        try {
          const tx = new Transaction();
          // Note: This is a placeholder - actual swap function may vary
          // You may need to use a DEX or the official Walrus swap interface
          console.log('⚠️  Automatic swap not implemented. Please use the Walrus interface or DEX to swap SUI for WAL.');
        } catch (error) {
          console.error('Swap failed:', error);
        }
      } else {
        console.log('⚠️  Insufficient SUI balance. Please fund the address first:');
        console.log(`   sui client faucet ${address}`);
      }
    } else {
      console.log('✅ WAL balance sufficient for uploads');
    }
  } catch (error) {
    console.error('Error checking WAL balance:', error);
    console.log('\nThis might mean WAL tokens are not available yet.');
    console.log('Please check the Walrus documentation for testnet WAL token distribution.');
  }

  console.log('\n=== Instructions ===');
  console.log('1. Ensure your address has SUI for gas:');
  console.log(`   sui client faucet ${address}`);
  console.log('\n2. Get WAL tokens (one of these methods):');
  console.log('   - Visit Walrus testnet interface');
  console.log('   - Use a DEX to swap SUI for WAL');
  console.log('   - Request from Walrus team on Discord');
  console.log('\n3. Recommended minimum: 0.1 WAL (100,000,000 MIST)\n');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});

