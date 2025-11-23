/**
 * Wallet Authentication Service
 * Handles signing requests with wallet signatures for API authentication
 */

import type { WalletAccount } from '@wallet-standard/core';

export interface SignedRequestHeaders extends Record<string, string> {
  'x-user-address': string;
  'x-wallet-signature': string;
  'x-wallet-message': string;
  'x-wallet-nonce': string;
  'x-wallet-timestamp': string;
}

/**
 * Generate a unique nonce for request signing
 */
function generateNonce(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create authentication message to sign
 * Includes method, path, nonce, and timestamp to prevent replay attacks
 */
function createAuthMessage(
  method: string,
  path: string,
  nonce: string,
  timestamp: number
): string {
  return `Lumina API Authentication\nMethod: ${method}\nPath: ${path}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
}

/**
 * Sign a request with wallet signature
 * @param account - Wallet account to sign with
 * @param signPersonalMessage - Function to sign personal messages
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path
 * @returns Signed request headers
 */
export async function signRequest(
  account: WalletAccount,
  signPersonalMessage: (input: { message: Uint8Array; account: WalletAccount }) => Promise<{
    bytes: string;
    signature: string;
  }>,
  method: string,
  path: string
): Promise<SignedRequestHeaders> {
  const address = account.address;
  const nonce = generateNonce();
  const timestamp = Date.now();
  const message = createAuthMessage(method, path, nonce, timestamp);

  // Sign the message
  const messageBytes = new TextEncoder().encode(message);
  const { signature } = await signPersonalMessage({
    message: messageBytes,
    account,
  });

  // Base64 encode the message to avoid newline issues in HTTP headers
  // Convert Uint8Array to binary string, then encode to base64
  const binaryString = String.fromCharCode(...messageBytes);
  const encodedMessage = btoa(binaryString);

  return {
    'x-user-address': address,
    'x-wallet-signature': signature,
    'x-wallet-message': encodedMessage,
    'x-wallet-nonce': nonce,
    'x-wallet-timestamp': timestamp.toString(),
  };
}

/**
 * Check if wallet signing is available
 */
export function canSignRequest(
  account: WalletAccount | null | undefined,
  signPersonalMessage: ((input: { message: Uint8Array; account: WalletAccount }) => Promise<{
    bytes: string;
    signature: string;
  }>) | null | undefined
): boolean {
  return !!(account && signPersonalMessage);
}

