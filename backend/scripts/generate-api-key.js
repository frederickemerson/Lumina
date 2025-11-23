/**
 * Generate a secure random API key
 * Usage: node scripts/generate-api-key.js
 */

const crypto = require('crypto');

// Generate a random 32-byte (256-bit) key and convert to base64
const apiKey = crypto.randomBytes(32).toString('base64');

console.log('\n=== Generated API Key ===\n');
console.log(apiKey);
console.log('\n=== Add to .env file ===\n');
console.log(`API_KEY=${apiKey}\n`);

// Also generate a hex version (alternative format)
const apiKeyHex = crypto.randomBytes(32).toString('hex');
console.log('=== Alternative (Hex format) ===\n');
console.log(apiKeyHex);
console.log('\n=== Add to .env file (hex) ===\n');
console.log(`API_KEY=${apiKeyHex}\n`);

