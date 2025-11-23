/**
 * Deploy Frontend as Walrus Site
 * 
 * This script builds the frontend and deploys it as a Walrus Site
 * with "lumina" as the domain name.
 * 
 * Reference: https://docs.wal.app/walrus-sites/intro.html
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { walrus } from '@mysten/walrus';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';

const SUI_NETWORK = process.env.SUI_NETWORK || 'testnet';
const SUI_FULLNODE_URL = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
const WALRUS_SERVICE_KEYPAIR = process.env.WALRUS_SERVICE_KEYPAIR || process.env.NFT_SERVICE_KEYPAIR;

interface SiteConfig {
  name: string; // SuiNS name (e.g., "lumina")
  domain: string; // Full domain (e.g., "lumina.wal.app")
  sourceDir: string; // Frontend build directory
}

async function buildFrontend(): Promise<string> {
  console.log('📦 Building frontend...');
  const frontendDir = path.join(process.cwd(), 'frontend');
  
  try {
    execSync('npm run build', { 
      cwd: frontendDir,
      stdio: 'inherit'
    });
    console.log('✅ Frontend built successfully\n');
    return path.join(frontendDir, 'dist');
  } catch (error) {
    console.error('❌ Failed to build frontend:', error);
    throw error;
  }
}

async function uploadSiteFiles(
  sourceDir: string,
  suiClient: SuiClient,
  signer: Ed25519Keypair
): Promise<Map<string, string>> {
  console.log('📤 Uploading site files to Walrus...');
  
  const fileMap = new Map<string, string>(); // Map of relative path -> blob ID
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(sourceDir, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively process subdirectories
      const subFiles = await uploadSiteFiles(fullPath, suiClient, signer);
      subFiles.forEach((blobId, relPath) => {
        const fullRelPath = path.join(entry.name, relPath);
        fileMap.set(fullRelPath, blobId);
      });
    } else if (entry.isFile()) {
      // Upload file to Walrus
      const fileContent = await fs.readFile(fullPath);
      const relativePath = path.relative(sourceDir, fullPath);
      
      console.log(`   Uploading: ${relativePath}`);
      
      try {
        const walrusClient = walrus({
          network: SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet',
          suiClient,
        });
        
        // Create a Walrus file with proper metadata
        const walrusFile = await walrusClient.upload({
          data: fileContent,
          signer,
          metadata: {
            path: relativePath,
            contentType: getContentType(relativePath),
          },
        });
        
        fileMap.set(relativePath, walrusFile.id);
        console.log(`   ✅ Uploaded: ${relativePath} -> ${walrusFile.id}`);
      } catch (error) {
        console.error(`   ❌ Failed to upload ${relativePath}:`, error);
        throw error;
      }
    }
  }
  
  return fileMap;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

async function createSiteObject(
  config: SiteConfig,
  fileMap: Map<string, string>,
  suiClient: SuiClient,
  signer: Ed25519Keypair
): Promise<string> {
  console.log('🏗️  Creating Walrus Site object...');
  
  // Note: Creating a Walrus Site object requires the Walrus Sites Move contract
  // The site-builder CLI tool handles this automatically. This script uploads
  // the files, but you'll need to use site-builder to create the Site object.
  
  // Create a manifest file that can be used by site-builder
  const manifest = {
    name: config.name,
    domain: config.domain,
    files: Array.from(fileMap.entries()).map(([path, blobId]) => ({
      path,
      blobId,
    })),
    timestamp: Date.now(),
  };
  
  const manifestPath = path.join(process.cwd(), 'walrus-site-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   ✅ Created manifest: ${manifestPath}`);
  
  console.log('\n⚠️  Next steps:');
  console.log('   1. Install the site-builder CLI tool (Rust-based)');
  console.log('   2. Run: site-builder deploy --config walrus-site-config.yaml frontend/dist');
  console.log('   3. Register the SuiNS name "lumina"');
  console.log('   4. Link the SuiNS name to your Site object');
  
  // Return a placeholder - in production, this would be the Site object ID
  return '0x0';
}

async function deployWalrusSite() {
  console.log('🚀 Deploying Lumina as Walrus Site\n');
  
  // Check for signer
  if (!WALRUS_SERVICE_KEYPAIR) {
    console.error('❌ WALRUS_SERVICE_KEYPAIR or NFT_SERVICE_KEYPAIR not set');
    console.error('   Please set it in your .env file');
    process.exit(1);
  }
  
  // Parse keypair
  let signer: Ed25519Keypair;
  try {
    if (WALRUS_SERVICE_KEYPAIR.startsWith('suiprivkey1')) {
      signer = Ed25519Keypair.fromSecretKey(WALRUS_SERVICE_KEYPAIR);
    } else {
      signer = Ed25519Keypair.fromSecretKey(fromB64(WALRUS_SERVICE_KEYPAIR));
    }
    console.log(`✅ Signer loaded: ${signer.toSuiAddress()}\n`);
  } catch (error) {
    console.error('❌ Failed to parse keypair:', error);
    process.exit(1);
  }
  
  // Initialize Sui client
  const suiClient = new SuiClient({ url: SUI_FULLNODE_URL });
  
  // Build frontend
  const distDir = await buildFrontend();
  
  // Upload files
  const fileMap = await uploadSiteFiles(distDir, suiClient, signer);
  console.log(`\n✅ Uploaded ${fileMap.size} files to Walrus\n`);
  
  // Create site configuration
  const siteConfig: SiteConfig = {
    name: 'lumina',
    domain: 'lumina.wal.app',
    sourceDir: distDir,
  };
  
  // Create site object (or manifest for site-builder)
  const siteObjectId = await createSiteObject(siteConfig, fileMap, suiClient, signer);
  
  console.log('\n📋 Deployment Summary:');
  console.log(`   Site Name: ${siteConfig.name}`);
  console.log(`   Domain: ${siteConfig.domain}`);
  console.log(`   Site Object ID: ${siteObjectId}`);
  console.log(`   Files Uploaded: ${fileMap.size}`);
  console.log('\n📝 Files uploaded to Walrus:');
  fileMap.forEach((blobId, filePath) => {
    console.log(`   ${filePath} -> ${blobId}`);
  });
  console.log('\n⚠️  To complete the deployment:');
  console.log('   1. Install site-builder: cargo install walrus-site-builder');
  console.log('   2. Run: site-builder deploy --config walrus-site-config.yaml frontend/dist');
  console.log('   3. Register SuiNS name "lumina" at https://suins.io');
  console.log('   4. Link SuiNS name to your Site object');
  console.log('\n   For more details, see: https://docs.wal.app/walrus-sites/intro.html');
}

if (require.main === module) {
  deployWalrusSite()
    .then(() => {
      console.log('\n✅ Deployment script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Deployment failed:', error);
      process.exit(1);
    });
}

export { deployWalrusSite };

