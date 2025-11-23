import 'dotenv/config';

// Use in-memory metadata store so tests don't require MySQL
if (!process.env.LIT_METADATA_MODE) {
  process.env.LIT_METADATA_MODE = 'memory';
}

import litService from '../src/services/lit';

async function main() {
  const testAddress = (process.env.LIT_TEST_ADDRESS || '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF').toLowerCase();
  await litService.verifyConnectivity('lit-e2e');

  const payload = Buffer.from(`LUMINA Lit e2e payload :: ${new Date().toISOString()}`);
  const acc = litService.createAccessControlConditions(testAddress, Date.now() + 60_000);

  const encryption = await litService.encrypt(payload, acc);
  const decryption = await litService.decrypt(encryption.encryptedBytes, encryption.encryptedDataId);

  if (!payload.equals(decryption.decrypted)) {
    throw new Error('Decrypted payload mismatch');
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        encryptedDataId: encryption.encryptedDataId,
        encryptedSize: encryption.encryptedBytes.length,
        accessControlConditions: encryption.accessControlConditions,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('✅ Lit encrypt/decrypt e2e test passed');
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Lit encrypt/decrypt e2e test failed', error);
    process.exit(1);
  });

