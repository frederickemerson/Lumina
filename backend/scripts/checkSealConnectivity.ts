import 'dotenv/config';
import sealService from '../src/services/seal';
import { logger } from '../src/utils/logger';

async function main() {
  logger.info('Checking Seal Protocol connectivity...');
  const isConnected = await sealService.verifyConnectivity('script');
  if (isConnected) {
    console.log('✅ Seal connectivity verified');
  } else {
    console.error('❌ Seal connectivity check failed');
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Seal connectivity script failed', { error });
  process.exit(1);
});

