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
 * DISABLED - No wallet authentication required
 */
export function walletAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Wallet auth completely disabled - just pass through
  (req as WalletAuthenticatedRequest).walletAuthenticated = false;
  next();

}

/**
 * Optional wallet authentication
 * DISABLED - No wallet authentication required
 */
export function optionalWalletAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Wallet auth completely disabled - just pass through
  (req as WalletAuthenticatedRequest).walletAuthenticated = false;
  next();
}

