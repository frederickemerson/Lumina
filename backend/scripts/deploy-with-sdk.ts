/**
 * SDK-based Deployment for Seal Access Policy
 * This avoids the file lock issue by not using the CLI
 * 
 * Usage: 
 *   1. Extract keypair: powershell -File ../scripts/decode-sui-key.ps1 <suiprivkey1>
 *   2. Set env: $env:SUI_KEYPAIR_BASE64="<base64_key>"
 *   3. Run: npx ts-node scripts/deploy-with-sdk.ts
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import * as fs from 'fs';
import * as path from 'path';

async function deploySealPolicy() {
  console.log('🚀 Deploying Seal Access Policy using Sui SDK...\n');

  // Initialize client (doesn't require config file)
  const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
  });

  // Get signer from environment variable (base64 encoded)
  const keypairBase64 = process.env.SUI_KEYPAIR_BASE64;
  if (!keypairBase64) {
    console.error('❌ Error: SUI_KEYPAIR_BASE64 environment variable not set');
    console.log('\nTo get your keypair:');
    console.log('1. Run: powershell -File ../scripts/decode-sui-key.ps1 <suiprivkey1>');
    console.log('2. Set: $env:SUI_KEYPAIR_BASE64="<base64_key>"');
    process.exit(1);
  }

  let keypair: Ed25519Keypair;
  try {
    const keyBytes = fromB64(keypairBase64);
    // Handle 33-byte keys (might have version byte) - take first 32 bytes
    const secretKey = keyBytes.length === 33 ? keyBytes.slice(0, 32) : keyBytes;
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('❌ Error: Invalid keypair format');
    console.error(error);
    process.exit(1);
  }

  const address = keypair.toSuiAddress();
  console.log(`✅ Using address: ${address}\n`);

  // Check gas balance
  try {
    const coins = await client.getCoins({ owner: address, coinType: '0x2::sui::SUI' });
    const totalBalance = coins.data.reduce((sum: bigint, coin: any) => sum + BigInt(coin.balance), 0n);
    console.log(`💰 Gas balance: ${totalBalance.toString()} MIST (${Number(totalBalance) / 1e9} SUI)\n`);
    
    if (totalBalance < 100000000n) {
      console.warn('⚠️  Warning: Low gas balance. You may need more SUI for deployment.');
    }
  } catch (error) {
    console.warn('⚠️  Could not check gas balance:', error);
  }

  // Read compiled package
  const buildPath = path.join(__dirname, '../../move/build/obscura');
  if (!fs.existsSync(buildPath)) {
    console.error(`❌ Error: Build directory not found: ${buildPath}`);
    console.log('Please run: cd move && sui move build');
    process.exit(1);
  }

  // Read package metadata (optional - BuildInfo.yaml exists)
  const packageJsonPath = path.join(buildPath, 'package.json');
  const buildInfoPath = path.join(buildPath, 'BuildInfo.yaml');
  
  if (fs.existsSync(buildInfoPath)) {
    console.log(`📦 Package: obscura (from BuildInfo.yaml)\n`);
  } else if (fs.existsSync(packageJsonPath)) {
    const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    console.log(`📦 Package: ${packageData.name} v${packageData.version}\n`);
  } else {
    console.log(`📦 Package: obscura\n`);
  }

  // Read compiled modules
  const modulesDir = path.join(buildPath, 'bytecode_modules');
  const allModuleFiles = fs.readdirSync(modulesDir)
    .filter(f => f.endsWith('.mv') && !f.includes('dependencies'))
    .map(f => path.join(modulesDir, f));

  if (allModuleFiles.length === 0) {
    console.error('❌ Error: No compiled module files found');
    console.log('Please run: cd move && sui move build');
    process.exit(1);
  }

  // Filter out test-only modules (e.g., *_test.mv) that cannot be published
  const allowedModules = new Set(['seal_policy.mv']);
  const moduleFiles = allModuleFiles.filter(modulePath => {
    const baseName = path.basename(modulePath).toLowerCase();
    const isAllowed = allowedModules.has(baseName);
    const isTestModule = baseName.includes('test');
    if (!isAllowed) {
      console.log(`   • Skipping non-policy module: ${path.basename(modulePath)}`);
    } else if (isTestModule) {
      console.log(`   • Skipping test module: ${path.basename(modulePath)}`);
    }
    return isAllowed && !isTestModule;
  });

  if (moduleFiles.length === 0) {
    console.error('❌ Error: All compiled modules were filtered out (only test modules found)');
    console.log('Ensure your deployable modules live in move/sources and rerun: cd move && sui move build');
    process.exit(1);
  }

  const modules: Uint8Array[] = [];
  console.log(`📄 Publishing ${moduleFiles.length} module(s):`);
  for (const moduleFile of moduleFiles) {
    const moduleBytes = fs.readFileSync(moduleFile);
    modules.push(moduleBytes);
    console.log(`   - ${path.basename(moduleFile)} (${moduleBytes.length} bytes)`);
  }
  console.log();

  // Read dependencies
  const dependenciesDir = path.join(modulesDir, 'dependencies');
  const dependencyIds: string[] = [
    '0x1', // MoveStdlib
    '0x2', // Sui Framework
  ];
  
  console.log('📚 Using published Sui framework dependencies (0x1, 0x2)\n');

  // Create publish transaction
  console.log('🔨 Creating publish transaction...');
  const tx = new Transaction();
  
  // Set sender (required for building transaction)
  tx.setSender(address);
  
  // Publish the package - convert Uint8Array to Array<number> for compatibility
  const modulesAsArrays = modules.map(m => Array.from(m));
  const publishResult = tx.publish({ modules: modulesAsArrays, dependencies: dependencyIds }) as any;
  const [upgradeCap] = publishResult || [];
  if (upgradeCap) {
    tx.transferObjects([upgradeCap as TransactionObjectArgument], tx.pure.address(address));
  }

  // Set gas budget
  tx.setGasBudget(100000000n);

  // Build transaction
  console.log('📝 Building transaction...');
  const result = await tx.build({ client });
  
  console.log('✍️  Signing transaction...');
  // Sign the transaction block
  const signature = await keypair.signTransaction(result);
  
  // Execute transaction
  console.log('📤 Executing transaction...\n');
  const executeResult = await client.executeTransactionBlock({
    transactionBlock: result,
    signature: signature.signature,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
    },
  });

  if (executeResult.effects?.status?.status === 'success') {
    console.log('✅ Deployment successful!\n');
    
    // Extract package ID from object changes
    const publishedChange = executeResult.objectChanges?.find(
      (change: any) => change.type === 'published'
    ) as any;
    const packageId = publishedChange?.packageId;

    if (packageId) {
      console.log('📋 Deployment Information:');
      console.log(`   Package ID: ${packageId}`);
      console.log(`   Transaction: ${executeResult.digest}`);
      console.log(`   Network: testnet`);
      console.log(`   Explorer: https://suiexplorer.com/object/${packageId}?network=testnet\n`);
      
      console.log('💾 Update backend/.env:');
      console.log(`   SEAL_PACKAGE_ID=${packageId}\n`);
      
      // Try to update .env file automatically
      const envPath = path.join(__dirname, '../.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (envContent.includes('SEAL_PACKAGE_ID=')) {
          envContent = envContent.replace(
            /SEAL_PACKAGE_ID=.*/,
            `SEAL_PACKAGE_ID=${packageId}`
          );
        } else {
          envContent += `\nSEAL_PACKAGE_ID=${packageId}\n`;
        }
        fs.writeFileSync(envPath, envContent);
        console.log('✅ Updated backend/.env automatically!');
      } else {
        console.log('⚠️  backend/.env not found, please update manually');
      }
    } else {
      console.log('⚠️  Could not extract package ID automatically');
      console.log('Please check the transaction output above');
    }
  } else {
    console.error('❌ Deployment failed!');
    console.error('Status:', executeResult.effects?.status);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  deploySealPolicy().catch((error) => {
    console.error('❌ Deployment error:', error);
    process.exit(1);
  });
}

export { deploySealPolicy };
