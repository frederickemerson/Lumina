/**
 * Wallet Signature Verification Middleware
 * Verifies Sui wallet signatures for authenticated requests
 */

import { Request, Response, NextFunction } from 'express';
import { parseSerializedSignature, PublicKey } from '@mysten/sui/cryptography';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Secp256k1PublicKey } from '@mysten/sui/keypairs/secp256k1';
import { Secp256r1PublicKey } from '@mysten/sui/keypairs/secp256r1';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { logger } from '../utils/logger';

export interface WalletAuthenticatedRequest extends Request {
  walletAddress?: string;
  walletAuthenticated?: boolean;
}

/**
 * In-memory store for nonces (prevent replay attacks)
 */
interface NonceEntry {
  timestamp: number;
  used: boolean;
}

const nonceStore: Map<string, NonceEntry> = new Map();
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_NONCE_AGE_MS = 10 * 60 * 1000; // 10 minutes max age

// Clean up expired nonces every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [nonce, entry] of nonceStore.entries()) {
    if (now - entry.timestamp > MAX_NONCE_AGE_MS) {
      nonceStore.delete(nonce);
    }
  }
}, 5 * 60 * 1000);

/**
 * Verify Sui wallet signature
 */
async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    // Verify the signature - this returns the public key if valid
    const messageBytes = new TextEncoder().encode(message);
    const publicKey = await verifyPersonalMessageSignature(
      messageBytes,
      signature,
      { address }
    );

    // Verify the address matches the public key
    const derivedAddress = publicKey.toSuiAddress();
    const normalizedAddress = address.toLowerCase();
    const normalizedDerived = derivedAddress.toLowerCase();

    if (normalizedAddress !== normalizedDerived) {
      logger.warn('Address mismatch', {
        provided: address,
        derived: derivedAddress,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Signature verification failed', { error, address });
    return false;
  }
}

/**
 * Verify nonce to prevent replay attacks
 */
function verifyNonce(nonce: string, timestamp: number): boolean {
  const now = Date.now();

  // Check nonce age
  if (now - timestamp > MAX_NONCE_AGE_MS) {
    logger.warn('Nonce too old', { nonce, age: now - timestamp });
    return false;
  }

  // Check if nonce was already used
  const entry = nonceStore.get(nonce);
  if (entry && entry.used) {
    logger.warn('Nonce already used', { nonce });
    return false;
  }

  // Check timestamp is not too far in the future (clock skew protection)
  if (timestamp > now + 60000) {
    logger.warn('Nonce timestamp in future', { nonce, timestamp, now });
    return false;
  }

  // Mark nonce as used
  nonceStore.set(nonce, { timestamp, used: true });

  return true;
}

/**
 * Wallet signature verification middleware
 * Requires x-user-address, x-wallet-signature, x-wallet-message, and x-wallet-nonce headers
 */
export function walletAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const userAddress = req.headers['x-user-address'] as string;
  const signature = req.headers['x-wallet-signature'] as string;
  const encodedMessage = req.headers['x-wallet-message'] as string;
  const nonce = req.headers['x-wallet-nonce'] as string;
  const timestamp = req.headers['x-wallet-timestamp'] as string;

  // Check if wallet auth is enabled (can be disabled for development)
  const walletAuthEnabled = process.env.WALLET_AUTH_ENABLED !== 'false';

  if (!walletAuthEnabled) {
    // In development, allow requests without wallet auth but log warning
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Wallet auth disabled, allowing request', {
        path: req.path,
        hasAddress: !!userAddress,
      });
      (req as WalletAuthenticatedRequest).walletAuthenticated = false;
      return next();
    }
  }

  // Validate required headers
  if (!userAddress || !signature || !encodedMessage || !nonce || !timestamp) {
    logger.warn('Missing wallet authentication headers', {
      path: req.path,
      hasAddress: !!userAddress,
      hasSignature: !!signature,
      hasMessage: !!encodedMessage,
      hasNonce: !!nonce,
      hasTimestamp: !!timestamp,
    });

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing wallet authentication',
      details: 'Please provide x-user-address, x-wallet-signature, x-wallet-message, x-wallet-nonce, and x-wallet-timestamp headers',
    });
    return;
  }

  // Decode base64 message (frontend encodes it to avoid newline issues in HTTP headers)
  let message: string;
  try {
    message = Buffer.from(encodedMessage, 'base64').toString('utf-8');
  } catch (error) {
    logger.warn('Failed to decode wallet message', { error, encodedMessage: encodedMessage?.substring(0, 50) });
    res.status(400).json({
      error: 'Invalid message format',
      details: 'x-wallet-message must be base64 encoded',
    });
    return;
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{64}$/.test(userAddress)) {
    res.status(400).json({
      error: 'Invalid address format',
      details: 'x-user-address must be a valid Sui address (0x followed by 64 hex characters)',
    });
    return;
  }

  // Parse and validate timestamp
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum)) {
    res.status(400).json({
      error: 'Invalid timestamp',
      details: 'x-wallet-timestamp must be a valid Unix timestamp in milliseconds',
    });
    return;
  }

  // Verify nonce
  if (!verifyNonce(nonce, timestampNum)) {
    res.status(401).json({
      error: 'Invalid or reused nonce',
      details: 'The provided nonce is invalid, expired, or has already been used',
    });
    return;
  }

  // Verify signature asynchronously
  verifySignature(userAddress, message, signature)
    .then((isValid) => {
      if (!isValid) {
        res.status(401).json({
          error: 'Invalid wallet signature',
          details: 'The wallet signature could not be verified',
        });
        return;
      }

      // Attach wallet info to request
      (req as WalletAuthenticatedRequest).walletAddress = userAddress;
      (req as WalletAuthenticatedRequest).walletAuthenticated = true;

      next();
    })
    .catch((error) => {
      logger.error('Error in wallet signature verification', { error, userAddress });
      res.status(500).json({
        error: 'Internal server error',
        details: 'Failed to verify wallet signature',
      });
    });
}

/**
 * Optional wallet authentication
 * Allows requests with or without wallet auth, but verifies if provided
 */
export function optionalWalletAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const userAddress = req.headers['x-user-address'] as string;
  const signature = req.headers['x-wallet-signature'] as string;
  const encodedMessage = req.headers['x-wallet-message'] as string;
  const nonce = req.headers['x-wallet-nonce'] as string;
  const timestamp = req.headers['x-wallet-timestamp'] as string;

  // If all auth headers are present, verify them
  if (userAddress && signature && encodedMessage && nonce && timestamp) {
    // Decode base64 message
    let message: string;
    try {
      message = Buffer.from(encodedMessage, 'base64').toString('utf-8');
    } catch (error) {
      (req as WalletAuthenticatedRequest).walletAuthenticated = false;
      return next();
    }

    const timestampNum = parseInt(timestamp, 10);
    if (!isNaN(timestampNum) && verifyNonce(nonce, timestampNum)) {
      verifySignature(userAddress, message, signature)
        .then((isValid) => {
          if (isValid) {
            (req as WalletAuthenticatedRequest).walletAddress = userAddress;
            (req as WalletAuthenticatedRequest).walletAuthenticated = true;
          } else {
            (req as WalletAuthenticatedRequest).walletAuthenticated = false;
          }
          next();
        })
        .catch(() => {
          (req as WalletAuthenticatedRequest).walletAuthenticated = false;
          next();
        });
      return;
    }
  }

  // No auth provided, continue without authentication
  (req as WalletAuthenticatedRequest).walletAuthenticated = false;
  next();
}

