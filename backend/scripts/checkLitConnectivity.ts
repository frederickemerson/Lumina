import 'dotenv/config';
import litService from '../src/services/lit';

async function main() {
  const success = await litService.verifyConnectivity('script');
  if (!success) {
    throw new Error('Lit connectivity check failed');
  }
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('✅ Lit connectivity verified');
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('❌ Lit connectivity failed', error);
    process.exit(1);
  });

