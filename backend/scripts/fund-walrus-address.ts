/**
 * Script to fund the Walrus service address with SUI and help get WAL tokens
 * 
 * This script:
 * 1. Checks the current balance
 * 2. Provides instructions to fund with SUI
 * 3. Provides instructions to get WAL tokens
 */

import 'dotenv/config';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';

const WAL_COIN_TYPE = '0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a::wal::WAL';

async function main() {
  console.log('\n=== Walrus Address Funding Helper ===\n');

  if (!process.env.WALRUS_SERVICE_KEYPAIR) {
    console.error('❌ WALRUS_SERVICE_KEYPAIR not set in .env');
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(process.env.WALRUS_SERVICE_KEYPAIR);
  const address = keypair.toSuiAddress();
  console.log(`Walrus Service Address: ${address}\n`);

  const suiClient = new SuiClient({
    url: process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443',
  });

  // Check balances
  const suiBalance = await suiClient.getBalance({ owner: address });
  const suiAmount = Number(suiBalance.totalBalance) / 1_000_000_000;
  console.log(`SUI Balance: ${suiAmount} SUI`);

  let walAmount = 0;
  try {
    const walBalance = await suiClient.getBalance({
      owner: address,
      coinType: WAL_COIN_TYPE,
    });
    walAmount = Number(walBalance.totalBalance) / 1_000_000_000;
    console.log(`WAL Balance: ${walAmount} WAL\n`);
  } catch (error) {
    console.log(`WAL Balance: 0 WAL (no WAL tokens found)\n`);
  }

  // Provide instructions
  if (suiAmount < 0.1) {
    console.log('⚠️  INSUFFICIENT SUI BALANCE\n');
    console.log('To fund this address with SUI:');
    console.log('1. Use Sui CLI (if you have another funded address):');
    console.log(`   sui client switch --address <your-funded-address>`);
    console.log(`   sui client transfer-sui --to ${address} --amount 1000000000`);
    console.log('\n2. Or use the testnet faucet:');
    console.log('   - Visit: https://discord.com/channels/916379725201563759/971488439931392130');
    console.log('   - Go to #testnet-faucet channel');
    console.log(`   - Request: !faucet ${address}`);
    console.log('\n3. Or use the web faucet:');
    console.log('   - Visit: https://docs.sui.io/guides/developer/getting-started/get-coins');
    console.log(`   - Enter address: ${address}\n`);
  } else {
    console.log('✅ SUI balance sufficient\n');
  }

  if (walAmount < 0.1) {
    console.log('⚠️  INSUFFICIENT WAL TOKEN BALANCE\n');
    console.log('Walrus requires WAL tokens (not SUI) to pay for storage.\n');
    console.log('To get WAL tokens on testnet:');
    console.log('\n1. Visit Walrus Testnet Interface:');
    console.log('   - Check: https://walrus.sui.io (or testnet equivalent)');
    console.log('   - Look for a faucet or swap interface\n');
    
    console.log('2. Swap SUI for WAL using Sui CLI:');
    console.log('   First, ensure you have SUI in the address, then:');
    console.log(`   sui client call \\`);
    console.log(`     --package 0x8270feb7375eee355e64fdb69c50abb6b5f9393a722883c1cf45f8e26048810a \\`);
    console.log(`     --module wal \\`);
    console.log(`     --function swap_sui_for_wal \\`);
    console.log(`     --args 100000000 \\`);
    console.log(`     --gas-budget 10000000 \\`);
    console.log(`     --sender ${address}\n`);
    
    console.log('3. Request WAL tokens from Walrus team:');
    console.log('   - Visit Sui Discord: https://discord.gg/sui');
    console.log('   - Look for Walrus channel or ask in #testnet-faucet');
    console.log(`   - Request WAL tokens for: ${address}\n`);
    
    console.log('4. Recommended minimum: 0.1 WAL (100,000,000 MIST)\n');
  } else {
    console.log('✅ WAL balance sufficient for uploads\n');
  }

  console.log('=== Quick Summary ===');
  console.log(`Address: ${address}`);
  console.log(`SUI: ${suiAmount} (need: 0.1+)`);
  console.log(`WAL: ${walAmount} (need: 0.1+)`);
  console.log('\nOnce both balances are sufficient, file uploads should work.\n');
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});

