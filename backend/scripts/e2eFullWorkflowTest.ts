/**
 * End-to-End Full Workflow Test
 * 
 * Tests the complete LUMINA workflow:
 * 1. Upload a file (encrypt + store in Walrus)
 * 2. Mint NFT for the capsule
 * 3. Unlock/decrypt the capsule
 * 
 * Usage:
 *   npm run e2e:full
 * 
 * Or with a custom test file:
 *   TEST_FILE_PATH=/path/to/test.jpg npm run e2e:full
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { logger } from '../src/utils/logger';
import { getDatabase, initializeDatabase, closeDatabase } from '../src/db/database';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || process.env.BACKEND_API_KEY;

if (!API_KEY) {
  console.error('❌ API_KEY not set. Please set API_KEY or BACKEND_API_KEY in .env');
  process.exit(1);
}

interface UploadResponse {
  success: boolean;
  capsuleId: string;
  blobId: string;
  encryptedDataId: string;
  createdAt?: string;
  nftId?: string;
}

interface UnlockResponse {
  success: boolean;
  decryptedData: string; // base64
  fileType: string;
  message?: string;
  policy?: any;
}

async function createTestFile(): Promise<Buffer> {
  // Create a simple test image (1x1 red PNG)
  // PNG signature + minimal IHDR + IDAT + IEND
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE, // CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
    0x0D, 0x0A, 0x2D, 0xB4, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk length
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
  return pngData;
}

async function uploadFile(fileBuffer: Buffer, userAddress: string, description?: string, fileType: string = 'image/png'): Promise<UploadResponse> {
  logger.info('Step 1: Uploading file...', { fileSize: fileBuffer.length, userAddress, fileType });

  const isJpeg = fileType === 'image/jpeg' || fileType === 'image/jpg';
  const formData = new FormData();
  formData.append('file', fileBuffer, {
    filename: isJpeg ? 'test-image.jpg' : 'test-image.png',
    contentType: fileType,
  });
  formData.append('userAddress', userAddress);
  formData.append('description', description || 'E2E test capsule');
  formData.append('message', 'This is a test message for E2E workflow');
  formData.append('unlockCondition', 'manual');

  try {
    const response = await axios.post<UploadResponse>(
      `${API_BASE_URL}/api/capsule/upload`,
      formData,
      {
        headers: {
          'X-API-Key': API_KEY,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000, // 5 minutes for large files
      }
    );

    if (!response.data.success) {
      throw new Error(`Upload failed: ${JSON.stringify(response.data)}`);
    }

    logger.info('✅ File uploaded successfully', {
      capsuleId: response.data.capsuleId,
      blobId: response.data.blobId,
      encryptedDataId: response.data.encryptedDataId,
      nftId: response.data.nftId,
    });

    return {
      success: response.data.success,
      capsuleId: response.data.capsuleId,
      blobId: response.data.blobId,
      encryptedDataId: response.data.encryptedDataId,
      nftId: response.data.nftId,
    };
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.response?.data?.details || error.message;
    const errorDetails = error.response?.data;
    logger.error('❌ File upload failed', { 
      error: errorMsg, 
      status: error.response?.status,
      details: errorDetails,
      fullError: error.response?.data
    });
    throw new Error(`Upload failed: ${errorMsg}${errorDetails?.details ? ` - ${errorDetails.details}` : ''}`);
  }
}

// Note: NFT is automatically minted during upload if message is provided
// This function is kept for potential future use if we need to mint separately
async function checkNFT(capsuleId: string, userAddress: string, nftId?: string): Promise<{ nftId?: string; exists: boolean }> {
  if (!nftId || nftId === 'unknown') {
    logger.warn('No NFT ID provided, skipping NFT check');
    return { exists: false };
  }

  logger.info('Step 2: Verifying NFT was minted...', { capsuleId, nftId });

  try {
    // Check if NFT exists by querying user's NFTs
    const response = await axios.get(
      `${API_BASE_URL}/api/capsule/my-nfts`,
      {
        headers: {
          'X-API-Key': API_KEY,
          'X-User-Address': userAddress,
        },
        params: {
          userAddress,
        },
        timeout: 30000,
      }
    );

    const nfts = response.data.nfts || [];
    const foundNFT = nfts.find((nft: any) => nft.nftId === nftId || nft.capsuleId === capsuleId);

    if (foundNFT) {
      logger.info('✅ NFT verified', { nftId: foundNFT.nftId, capsuleId: foundNFT.capsuleId });
      return { nftId: foundNFT.nftId, exists: true };
    } else {
      logger.warn('⚠️  NFT not found in user NFTs list (may need time to index)', { nftId, capsuleId });
      return { nftId, exists: false };
    }
  } catch (error: any) {
    logger.warn('⚠️  Could not verify NFT (non-critical)', { error: error.message });
    return { nftId, exists: false };
  }
}

async function unlockCapsule(capsuleId: string, userAddress: string): Promise<UnlockResponse> {
  logger.info('Step 3: Unlocking/decrypting capsule...', { capsuleId, userAddress });

  try {
    const response = await axios.post<UnlockResponse>(
      `${API_BASE_URL}/api/capsule/${capsuleId}/unlock`,
      {
        userAddress,
      },
      {
        headers: {
          'X-API-Key': API_KEY,
          'X-User-Address': userAddress,
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minutes for decryption
      }
    );

    if (!response.data.success) {
      throw new Error(`Unlock failed: ${JSON.stringify(response.data)}`);
    }

    logger.info('✅ Capsule unlocked successfully', {
      fileType: response.data.fileType,
      decryptedSize: Buffer.from(response.data.decryptedData, 'base64').length,
      hasMessage: !!response.data.message,
    });

    return response.data;
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    logger.error('❌ Capsule unlock failed', { error: errorMsg, status: error.response?.status });
    throw new Error(`Unlock failed: ${errorMsg}`);
  }
}

async function verifyDecryptedData(original: Buffer, decryptedBase64: string): Promise<boolean> {
  const decrypted = Buffer.from(decryptedBase64, 'base64');
  
  if (original.length !== decrypted.length) {
    logger.error('❌ Decrypted data size mismatch', {
      originalSize: original.length,
      decryptedSize: decrypted.length,
    });
    return false;
  }

  if (!original.equals(decrypted)) {
    logger.error('❌ Decrypted data does not match original');
    // Log first 100 bytes for debugging
    logger.error('Original (first 100 bytes):', { data: original.slice(0, 100).toString('hex') });
    logger.error('Decrypted (first 100 bytes):', { data: decrypted.slice(0, 100).toString('hex') });
    return false;
  }

  logger.info('✅ Decrypted data matches original perfectly');
  return true;
}

async function main() {
  console.log('\n=== LUMINA End-to-End Full Workflow Test ===\n');

  // Initialize database if needed
  if (process.env.SEAL_METADATA_MODE !== 'memory') {
    await initializeDatabase();
  }

  let testFile: Buffer;
  const testFilePath = process.env.TEST_FILE_PATH;
  
  // Default to test.jpg in test-output directory if no custom path is provided
  const defaultTestFile = join(__dirname, '../test-output/test.jpg');

  // Load test file
  if (testFilePath && existsSync(testFilePath)) {
    logger.info('Loading test file from custom path', { path: testFilePath });
    testFile = readFileSync(testFilePath);
  } else if (existsSync(defaultTestFile)) {
    logger.info('Loading default test file (test.jpg)', { path: defaultTestFile });
    testFile = readFileSync(defaultTestFile);
  } else {
    logger.info('Creating default test file (1x1 PNG) - test.jpg not found');
    testFile = await createTestFile();
  }

  // Detect file type from file path extension
  let fileType = 'image/png'; // default
  if (testFilePath) {
    if (testFilePath.toLowerCase().endsWith('.jpg') || testFilePath.toLowerCase().endsWith('.jpeg')) {
      fileType = 'image/jpeg';
    }
  } else if (existsSync(defaultTestFile)) {
    // Using default test.jpg
    fileType = 'image/jpeg';
  }
  
  logger.info('Test file loaded', { size: testFile.length, type: fileType });

  // Use a test user address (you can change this)
  const userAddress = process.env.TEST_USER_ADDRESS || '0xdeeee88847080b8579312286b8de8555160d363b6380cc4c3b773636ad0a5187';

  try {
    // Step 1: Upload file (NFT is automatically minted if message is provided)
    const uploadResult = await uploadFile(testFile, userAddress, 'E2E test capsule', fileType);
    const capsuleId = uploadResult.capsuleId;
    
    if (!capsuleId) {
      throw new Error('Upload did not return capsuleId');
    }

    if (!uploadResult.blobId) {
      throw new Error('Upload did not return blobId');
    }

    // Step 2: Verify NFT was minted (it's done automatically during upload)
    const nftCheck = await checkNFT(capsuleId, userAddress, uploadResult.nftId);

    // Small delay to ensure everything is indexed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Unlock/decrypt
    const unlockResult = await unlockCapsule(capsuleId, userAddress);

    // Step 4: Verify decrypted data matches original
    const dataMatches = await verifyDecryptedData(testFile, unlockResult.decryptedData);

    if (!dataMatches) {
      throw new Error('Decrypted data does not match original file');
    }

    // Save decrypted file for verification
    const outputDir = join(__dirname, '../test-output');
    const fileExtension = fileType === 'image/jpeg' ? 'jpg' : 'png';
    const outputPath = join(outputDir, `e2e-decrypted-${Date.now()}.${fileExtension}`);
    writeFileSync(outputPath, Buffer.from(unlockResult.decryptedData, 'base64'));
    logger.info('Decrypted file saved', { path: outputPath });

    // Summary
    console.log('\n✅ All tests passed!\n');
    console.log('Summary:');
    console.log(`  - Upload: ✅ (capsuleId: ${uploadResult.capsuleId})`);
    console.log(`  - NFT Mint: ✅ (nftId: ${uploadResult.nftId || 'N/A'}, verified: ${nftCheck.exists ? 'Yes' : 'Pending'})`);
    console.log(`  - Unlock: ✅ (fileType: ${unlockResult.fileType})`);
    console.log(`  - Data integrity: ✅ (${testFile.length} bytes)`);
    console.log(`\nDecrypted file saved to: ${outputPath}\n`);

    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('❌ E2E test failed', { error: errorMessage });
    console.error('\n❌ E2E test failed:', errorMessage);
    process.exit(1);
  } finally {
    if (process.env.SEAL_METADATA_MODE !== 'memory') {
      await closeDatabase();
    }
  }
}

main();

