/**
 * LUMINA Capsule Types
 * Refactored from Evidence types
 */

export interface CapsuleMetadata {
  description?: string;
  tags?: string[];
  fileType?: string;
  fileSize?: number;
  timestamp?: string;
}

export interface CapsuleUploadResult {
  success: boolean;
  capsuleId: string;
  blobId: string;
  encryptedDataId: string;
  createdAt: string;
  capsuleObjectId?: string; // Sui object ID
  nftId?: string; // Optional NFT ID if minted
}

export interface CapsuleData {
  capsuleId: string;
  blobId: string;
  encryptedDataId: string;
  metadata: CapsuleMetadata;
  createdAt: string;
  encryptedBytes?: Uint8Array;
  unlockAt?: number;
  unlockCondition?: 'time' | 'manual';
  status?: 'locked' | 'unlocked';
}

export interface CapsuleInfo {
  capsuleId: string;
  blobId: string;
  createdAt: string;
  unlockAt?: number;
  unlockCondition?: 'time' | 'manual';
  status: 'locked' | 'unlocked';
}

export type UnlockCondition = 'time' | 'manual' | 'secret_phrase';

export interface CapsuleUnlockConfig {
  condition: UnlockCondition;
  unlockDateTime?: string; // ISO datetime string (YYYY-MM-DDTHH:mm) for time-based
  secretPhrase?: string; // Secret phrase for secret_phrase unlock
  // Multi-party options
  sharedOwners?: string[]; // Array of owner addresses
  quorumThreshold?: number; // Number of owners required to unlock (for multi-party)
  inheritanceTargets?: {
    addresses: string[];
    inactiveAfterDays?: number;
    autoTransfer?: boolean;
  };
}

