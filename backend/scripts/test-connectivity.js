#!/usr/bin/env node
/**
 * Test connectivity to Sui fullnodes and Walrus services
 * Usage: node scripts/test-connectivity.js
 */

const { SuiClient } = require('@mysten/sui/client');

const FULLNODE_URLS = [
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet-endpoint.blockvision.org',
  'https://testnet.suiet.app',
];

async function testFullnode(url) {
  const startTime = Date.now();
  try {
    const client = new SuiClient({ url });
    await client.getChainIdentifier();
    const latency = Date.now() - startTime;
    return { url, healthy: true, latency, error: null };
  } catch (error) {
    const latency = Date.now() - startTime;
    return { 
      url, 
      healthy: false, 
      latency, 
      error: error.message || String(error) 
    };
  }
}

async function main() {
  console.log('\n🔍 Testing Sui Fullnode Connectivity...\n');
  
  const results = await Promise.all(
    FULLNODE_URLS.map(url => testFullnode(url))
  );
  
  const healthy = results.filter(r => r.healthy);
  const unhealthy = results.filter(r => !r.healthy);
  
  console.log('✅ Healthy Fullnodes:');
  if (healthy.length > 0) {
    healthy
      .sort((a, b) => a.latency - b.latency)
      .forEach(r => {
        console.log(`   ${r.url} (${r.latency}ms)`);
      });
  } else {
    console.log('   ❌ None found');
  }
  
  console.log('\n❌ Unhealthy Fullnodes:');
  if (unhealthy.length > 0) {
    unhealthy.forEach(r => {
      console.log(`   ${r.url} - ${r.error}`);
    });
  } else {
    console.log('   None');
  }
  
  if (healthy.length > 0) {
    const best = healthy.sort((a, b) => a.latency - b.latency)[0];
    console.log(`\n💡 Recommended: ${best.url} (${best.latency}ms)`);
    console.log(`\n   Add to .env:`);
    console.log(`   SUI_FULLNODE_URL=${best.url}\n`);
  } else {
    console.log('\n⚠️  No healthy fullnodes found. Check your network connection.\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

