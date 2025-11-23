/**
 * Evidence and Whistleblower Platform Types
 */

export interface EvidenceMetadata {
  description?: string;
  tags?: string[];
  fileType?: string;
  fileSize?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface EvidenceUploadResult {
  vaultId: string;
  blobId: string;
  encryptedDataId: string;
  createdAt: string;
  encryptedSize?: number; // Size of encrypted data for validation
  encryptedHash?: string; // Hash of encrypted data for validation
}

export interface EvidenceData {
  vaultId: string;
  blobId: string;
  encryptedDataId: string;
  metadata: EvidenceMetadata;
  createdAt: string;
  encryptedBytes?: Uint8Array; // Only if decrypted
}

export interface VaultInfo {
  vaultId: string;
  userAddress: string;
  blobId: string;
  encryptedDataId: string;
  createdAt: string;
  hasDeadManSwitch: boolean;
  switchStatus?: 'active' | 'triggered' | 'disabled';
  releaseTriggered?: boolean;
}

