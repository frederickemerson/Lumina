/**
 * Evidence API Endpoints
 * Handles anonymous evidence uploads and retrieval
 */

import 'dotenv/config';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth } from '../middleware/auth';
import { sanitizeAddress } from '../utils/sanitize';
import { getErrorMessage } from '../types/common';
import { logger } from '../utils/logger';
import EvidenceService from '../services/evidence';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromB64 } from '@mysten/sui/utils';

const router = Router();

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 * 1024, // 100GB max
  },
});

/**
 * Parse keypair from either Sui format (suiprivkey1...) or base64
 * The Sui SDK's fromSecretKey() handles both formats automatically
 */
function parseKeypair(keyString: string): Ed25519Keypair {
  // Check if it's a Sui-encoded key (starts with suiprivkey1)
  if (keyString.startsWith('suiprivkey1')) {
    // Sui SDK handles bech32-encoded keys directly
    return Ed25519Keypair.fromSecretKey(keyString);
  } else {
    // Assume it's base64-encoded
    return Ed25519Keypair.fromSecretKey(fromB64(keyString));
  }
}

// Initialize evidence service
let walrusSigner: Ed25519Keypair | undefined = undefined;
if (process.env.WALRUS_SERVICE_KEYPAIR) {
  try {
    walrusSigner = parseKeypair(process.env.WALRUS_SERVICE_KEYPAIR);
    logger.info('Walrus signer initialized', { address: walrusSigner.toSuiAddress() });
  } catch (error) {
    logger.error('Failed to parse WALRUS_SERVICE_KEYPAIR', { error });
  }
}

const evidenceService = new EvidenceService({
  network: (process.env.WALRUS_NETWORK as 'testnet' | 'devnet' | 'mainnet') || 'testnet',
  walrusSigner,
});

/**
 * Upload evidence file
 * POST /api/evidence/upload
 */
router.post('/upload', apiKeyAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string);
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    const metadata = {
      description: req.body.description || '',
      tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      fileType: req.file.mimetype || 'application/octet-stream',
      fileSize: req.file.size,
      timestamp: new Date().toISOString(),
    };

    const result = await evidenceService.uploadEvidence(
      req.file.buffer,
      metadata,
      userAddress,
      walrusSigner
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    res.status(500).json({
      error: 'Failed to upload evidence',
      details: errorMessage,
    });
  }
});

/**
 * List user's vaults
 * GET /api/evidence/my-vaults
 * IMPORTANT: This must come BEFORE /:vaultId route to avoid route conflicts
 */
router.get('/my-vaults', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const userAddress = sanitizeAddress(req.headers['x-user-address'] as string || req.query.userAddress as string);
    
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    logger.info('Retrieving user vaults', { userAddress });
    const vaults = await evidenceService.listMyVaults(userAddress);
    logger.info('User vaults retrieved', { userAddress, vaultCount: vaults.length });

    res.json({
      success: true,
      vaults,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to list vaults', { error, userAddress: req.headers['x-user-address'] });
    res.status(500).json({
      error: 'Failed to list vaults',
      details: errorMessage,
    });
  }
});

/**
 * Get evidence metadata
 * GET /api/evidence/:vaultId
 * IMPORTANT: This must come AFTER /my-vaults route to avoid route conflicts
 */
router.get('/:vaultId', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { vaultId } = req.params;
    const userAddress = sanitizeAddress(req.body.userAddress || req.headers['x-user-address'] as string || req.query.userAddress as string);
    
    if (!userAddress) {
      return res.status(400).json({ error: 'Missing userAddress' });
    }

    logger.info('Retrieving evidence', { vaultId, userAddress });
    const evidence = await evidenceService.getEvidence(vaultId, userAddress);
    logger.info('Evidence retrieved successfully', { vaultId, userAddress, fileSize: evidence.metadata.fileSize });

    res.json({
      success: true,
      ...evidence,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error('Failed to get evidence', { error, vaultId: req.params.vaultId, userAddress: req.headers['x-user-address'] });
    res.status(500).json({
      error: 'Failed to get evidence',
      details: errorMessage,
    });
  }
});

export default router;

