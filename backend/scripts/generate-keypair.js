/**
 * Generate a new Sui Ed25519 keypair
 * Usage: node scripts/generate-keypair.js
 */

const { Ed25519Keypair } = require('@mysten/sui/keypairs/ed25519');

const keypair = new Ed25519Keypair();
const address = keypair.toSuiAddress();
const secretKey = keypair.getSecretKey();

console.log('\n=== Generated Sui Keypair ===\n');
console.log('Address:', address);
console.log('Secret Key:', secretKey);
console.log('\n=== Add to .env ===\n');
console.log(`MULTI_PARTY_SERVICE_KEYPAIR=${secretKey}`);
console.log(`# Or NFT_SERVICE_KEYPAIR=${secretKey}`);
console.log(`# Or WALRUS_SERVICE_KEYPAIR=${secretKey}`);
console.log('\n=== Fund the address (testnet) ===\n');
console.log(`sui client faucet ${address}`);
console.log('\n=== Or transfer SUI ===\n');
console.log(`sui client transfer-sui --to ${address} --amount 1000000000 --gas-budget 10000000`);
console.log('\n');

