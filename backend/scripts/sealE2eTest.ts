import 'dotenv/config';
import sealService from '../src/services/seal';
import { logger } from '../src/utils/logger';
import { getDatabase, initializeDatabase, closeDatabase } from '../src/db/database';
import { createHash } from 'crypto';

async function main() {
  logger.info('Starting Seal encrypt/decrypt e2e test...');

  // Ensure database is initialized if not in memory mode
  if (process.env.SEAL_METADATA_MODE !== 'memory') {
    await initializeDatabase();
  }

  const testPayload = Buffer.from(`LUMINA Seal e2e payload :: ${new Date().toISOString()}`);
  const seal = sealService;

  try {
    // 1. Verify Seal connectivity
    const isConnected = await seal.verifyConnectivity('seal-e2e');
    if (!isConnected) {
      throw new Error('Seal Protocol connectivity failed');
    }

    // 2. Get the session keypair address (the address that will decrypt)
    // We need to encrypt for the same address that will decrypt
    // The session keypair address is: 0x8fd02f7866b0556b8c7bf1ec325fbb6edc07ba3ad1fea277fe8ba09d1ec4f8f3
    // (derived from SEAL_SESSION_PRIVATE_KEY in .env)
    const sessionKeypairAddress = '0x8fd02f7866b0556b8c7bf1ec325fbb6edc07ba3ad1fea277fe8ba09d1ec4f8f3';
    
    logger.info('Using session keypair address for encryption', { address: sessionKeypairAddress });
    
    // 2. Encrypt data for the session keypair address (so it can decrypt)
    const encryptionResult = await seal.encrypt(testPayload, sessionKeypairAddress);
    logger.info('Data encrypted with Seal Protocol', {
      encryptedDataId: encryptionResult.encryptedDataId,
      originalSize: testPayload.length,
      encryptedSize: encryptionResult.encryptedBytes.length,
      packageId: encryptionResult.packageId,
      threshold: encryptionResult.threshold,
    });

    // 3. Decrypt data
    const decryptionResult = await seal.decrypt(
      encryptionResult.encryptedBytes,
      encryptionResult.encryptedDataId
    );
    logger.info('Data decrypted with Seal Protocol', {
      encryptedDataId: decryptionResult.encryptedDataId,
      decryptedSize: decryptionResult.decrypted.length,
    });

    // 4. Verify decrypted data integrity
    if (!testPayload.equals(decryptionResult.decrypted)) {
      throw new Error('Decrypted data does not match original payload');
    }

    console.log('✅ Seal encrypt/decrypt e2e test passed');
    console.log(JSON.stringify({
      encryptedDataId: encryptionResult.encryptedDataId,
      encryptedSize: encryptionResult.encryptedBytes.length,
      packageId: encryptionResult.packageId,
      threshold: encryptionResult.threshold,
    }, null, 2));

  } catch (error: unknown) {
    logger.error('Seal encrypt/decrypt e2e test failed', { error });
    console.error('❌ Seal encrypt/decrypt e2e test failed', error);
    process.exit(1);
  } finally {
    if (process.env.SEAL_METADATA_MODE !== 'memory') {
      await closeDatabase();
    }
  }
}

main();

