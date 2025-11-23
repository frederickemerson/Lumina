/**
 * Type definitions for Walrus SDK
 */

import { SuiClient } from '@mysten/sui/client';
import { WalrusFile } from '@mysten/walrus';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

/**
 * Extended SuiClient with Walrus methods
 */
export interface WalrusClient extends SuiClient {
  walrus: {
    writeFiles: (options: {
      files: WalrusFile[];
      epochs: number;
      deletable: boolean;
      signer: Ed25519Keypair;
    }) => Promise<Array<{ blobId: string }>>;
    readBlob: (options: { blobId: string }) => Promise<Uint8Array>;
    getBlob: (options: { blobId: string }) => Promise<WalrusBlob | null>;
    getFiles: (options: { ids: string[] }) => Promise<WalrusFile[]>;
    reset: () => void;
  };
}

/**
 * Walrus blob with metadata methods
 */
export interface WalrusBlob {
  getIdentifier?: () => Promise<string | null>;
  getTags?: () => Promise<Record<string, string> | null>;
  bytes?: () => Promise<Uint8Array>;
  files?: () => Promise<WalrusFile[]>;
  asFile?: () => WalrusFile;
}

/**
 * Walrus file interface (matches actual WalrusFile from SDK)
 */
export interface WalrusFileInstance {
  bytes: () => Promise<Uint8Array>;
  getIdentifier?: () => Promise<string | null>;
  getTags?: () => Promise<Record<string, string> | null>;
}

