#!/usr/bin/env ts-node
/**
 * Check Walrus storage node status and estimate recovery time
 * Usage: npm run wal:status
 */

import 'dotenv/config';
import { SuiClient } from '@mysten/sui/client';
import { walrus } from '@mysten/walrus';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { WalrusFile } from '@mysten/walrus';

const TEST_BLOB_SIZE = 100; // Small test blob (100 bytes)
const MAX_CHECK_ATTEMPTS = 3;
const TIMEOUT_MS = 30000; // 30 seconds per attempt

async function testWalrusUpload(): Promise<{ success: boolean; error?: string; latency?: number }> {
  const network = (process.env.WALRUS_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const fullnodeUrl = process.env.SUI_FULLNODE_URL || 
    (network === 'testnet' ? 'https://fullnode.testnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443');
  
  // Load signer from env
  const signerKey = process.env.WALRUS_SERVICE_KEYPAIR;
  if (!signerKey) {
    return { success: false, error: 'WALRUS_SERVICE_KEYPAIR not configured' };
  }

  try {
    // Parse keypair from either Sui format (suiprivkey1...) or base64
    let signer: Ed25519Keypair;
    if (signerKey.startsWith('suiprivkey1')) {
      // Sui SDK handles bech32-encoded keys directly
      signer = Ed25519Keypair.fromSecretKey(signerKey);
    } else {
      // Assume it's base64-encoded
      signer = Ed25519Keypair.fromSecretKey(fromB64(signerKey));
    }
    const client = new SuiClient({ url: fullnodeUrl, network }).$extend(walrus());

    // Create a small test blob
    const testData = new Uint8Array(TEST_BLOB_SIZE);
    crypto.getRandomValues(testData);
    
    const testFile = WalrusFile.from({
      contents: testData,
      identifier: `status_check_${Date.now()}`,
      tags: { test: 'true', purpose: 'status_check' },
    });

    const startTime = Date.now();
    
    // Try to upload with timeout
    const uploadPromise = client.walrus.writeFiles({
      files: [testFile],
      epochs: 1, // Minimal epochs for test
      deletable: true,
      signer,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Upload timeout')), TIMEOUT_MS);
    });

    await Promise.race([uploadPromise, timeoutPromise]);
    
    const latency = Date.now() - startTime;
    return { success: true, latency };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    return { success: false, error: errorMsg };
  }
}

async function checkFullnodeStatus(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const network = (process.env.WALRUS_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  const fullnodeUrl = process.env.SUI_FULLNODE_URL || 
    (network === 'testnet' ? 'https://fullnode.testnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443');
  
  try {
    const client = new SuiClient({ url: fullnodeUrl });
    const startTime = Date.now();
    await client.getLatestSuiSystemState();
    const latency = Date.now() - startTime;
    return { healthy: true, latency };
  } catch (error: any) {
    return { healthy: false, error: error?.message || String(error) };
  }
}

async function main() {
  console.log('\n🔍 Checking Walrus Storage Node Status...\n');
  
  const network = (process.env.WALRUS_NETWORK || 'testnet') as 'testnet' | 'mainnet';
  console.log(`Network: ${network.toUpperCase()}`);
  console.log(`Fullnode: ${process.env.SUI_FULLNODE_URL || (network === 'testnet' ? 'https://fullnode.testnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443')}\n`);

  // Check fullnode first
  console.log('1️⃣  Checking Sui Fullnode...');
  const fullnodeStatus = await checkFullnodeStatus();
  if (fullnodeStatus.healthy) {
    console.log(`   ✅ Fullnode is healthy (${fullnodeStatus.latency}ms latency)`);
  } else {
    console.log(`   ❌ Fullnode is down: ${fullnodeStatus.error}`);
    console.log('\n⚠️  Fullnode is down - Walrus cannot function without a healthy fullnode.');
    process.exit(1);
  }

  // Test Walrus upload
  console.log('\n2️⃣  Testing Walrus Storage Node Upload...');
  let uploadSuccess = false;
  let lastError: string | undefined;
  
  for (let attempt = 1; attempt <= MAX_CHECK_ATTEMPTS; attempt++) {
    console.log(`   Attempt ${attempt}/${MAX_CHECK_ATTEMPTS}...`);
    const result = await testWalrusUpload();
    
    if (result.success) {
      console.log(`   ✅ Upload successful! (${result.latency}ms latency)`);
      uploadSuccess = true;
      break;
    } else {
      lastError = result.error;
      console.log(`   ❌ Upload failed: ${result.error}`);
      if (attempt < MAX_CHECK_ATTEMPTS) {
        const delay = 2000 * attempt; // 2s, 4s delays
        console.log(`   ⏳ Waiting ${delay / 1000}s before retry...\n`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  if (uploadSuccess) {
    console.log('✅ STATUS: Walrus storage nodes are OPERATIONAL');
    console.log('   You can proceed with uploads and E2E tests.');
  } else {
    console.log('❌ STATUS: Walrus storage nodes are DOWN or UNREACHABLE');
    console.log(`   Last error: ${lastError}`);
    console.log('\n📊 Recovery Time Estimates:');
    console.log('   • Typical recovery: 15 minutes - 2 hours');
    console.log('   • Extended outage: 2 - 6 hours (rare)');
    console.log('   • Critical outage: 6+ hours (very rare)');
    console.log('\n💡 Recommendations:');
    console.log('   • Check Sui Discord: https://discord.gg/sui');
    console.log('   • Check Walrus news: https://www.walrus.xyz/news');
    console.log('   • Retry in 15-30 minutes');
    console.log('   • The E2E test will automatically retry when nodes recover');
  }
  console.log('='.repeat(60) + '\n');
  
  process.exit(uploadSuccess ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Status check failed:', error);
  process.exit(1);
});

