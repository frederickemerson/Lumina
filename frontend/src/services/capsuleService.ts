/**
 * Capsule Service for Frontend
 * Refactored from Evidence Service - handles capsule upload and retrieval
 */

import apiClient from './api';
import type { CapsuleUploadResult, CapsuleData, CapsuleInfo, CapsuleUnlockConfig } from '../types/capsule';
import { getApiErrorMessage } from './api';
import { logger } from '../utils/logger';

interface CapsuleUnlockResponse {
  success: boolean;
  decryptedData?: Uint8Array;
  fileType?: string;
  message?: string | null;
  voiceData?: Uint8Array;
  voiceMimeType?: string;
  aiPreview?: string;
  inheritance?: unknown;
  contributions?: Array<{
    contributionId: string;
    contributorAddress: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  policy?: Record<string, unknown> | null;
}

async function uploadVoiceRecording(voiceBlob: Blob, userAddress: string): Promise<string> {
  const formData = new FormData();
  const fileName = voiceBlob instanceof File ? voiceBlob.name : `voice-${Date.now()}.webm`;
  formData.append('file', voiceBlob, fileName);
  formData.append('userAddress', userAddress);

  const response = await apiClient.post<{ success: boolean; blobId: string }>('/api/capsule/upload-voice', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  if (!response.data.success || !response.data.blobId) {
    throw new Error('Failed to upload voice recording');
  }

  return response.data.blobId;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (!base64) return new Uint8Array();
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Upload capsule (memory vault) via backend
 */
export async function uploadCapsule(
  file: File,
  metadata: { description?: string; tags?: string[]; message?: string; soulbound?: boolean },
  unlockConfig: CapsuleUnlockConfig,
  userAddress: string,
  voiceBlob?: Blob,
  onUploadProgress?: (progress: number) => void
): Promise<CapsuleUploadResult> {
  try {
    logger.info('Uploading capsule', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      hasMessage: !!metadata.message,
      messageLength: metadata.message?.length || 0,
      hasVoiceBlob: !!voiceBlob,
      voiceBlobSize: voiceBlob?.size || 0,
    });

    let voiceBlobId: string | undefined;
    if (voiceBlob) {
      logger.debug('Uploading voice recording to Walrus', {
        voiceBlobSize: voiceBlob.size,
        voiceBlobType: voiceBlob.type,
      });
      try {
        voiceBlobId = await uploadVoiceRecording(voiceBlob, userAddress);
        logger.info('Voice recording uploaded successfully', { blobId: voiceBlobId });
      } catch (error) {
        logger.error('Failed to upload voice recording', {}, error instanceof Error ? error : undefined);
        // Continue without voice - don't fail the entire upload
        voiceBlobId = undefined;
      }
    } else {
      logger.debug('No voice blob provided - skipping voice upload');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userAddress', userAddress);
    if (metadata.description) formData.append('description', metadata.description);
    if (metadata.message) {
      formData.append('message', metadata.message);
      logger.debug('Added message to FormData', { messageLength: metadata.message.length });
    } else {
      logger.debug('No message to add to FormData');
    }
    if (metadata.tags?.length) formData.append('tags', JSON.stringify(metadata.tags));
    formData.append('soulbound', metadata.soulbound ? 'true' : 'false');
    
    // CRITICAL: Always include voiceBlobId if we have it
    if (voiceBlobId) {
      formData.append('voiceBlobId', voiceBlobId);
      logger.debug('Added voiceBlobId to FormData', { voiceBlobId });
    } else if (voiceBlob) {
      // This should not happen - if we have voiceBlob but no voiceBlobId, something went wrong
      logger.warn('Voice blob exists but voiceBlobId is missing - voice will not be included in capsule');
    } else {
      logger.debug('No voiceBlobId to add to FormData (no voice recording provided)');
    }

    // Log all FormData keys for debugging
    const formDataKeys: string[] = [];
    for (const key of formData.keys()) {
      formDataKeys.push(key);
    }
    logger.debug('FormData keys', { keys: formDataKeys });

    // Unlock configuration metadata (stored for provenance/policies)
    formData.append('unlockCondition', unlockConfig.condition);
    if (unlockConfig.condition === 'time' && unlockConfig.unlockDateTime) {
      const unlockAt = new Date(unlockConfig.unlockDateTime).getTime();
      if (!Number.isNaN(unlockAt)) {
        formData.append('unlockAt', unlockAt.toString());
      }
    }
    if (unlockConfig.secretPhrase) {
      formData.append('secretPhrase', unlockConfig.secretPhrase);
    }
    if (unlockConfig.sharedOwners?.length) {
      formData.append('sharedOwners', JSON.stringify(unlockConfig.sharedOwners));
    }
    if (typeof unlockConfig.quorumThreshold === 'number') {
      formData.append('quorumThreshold', unlockConfig.quorumThreshold.toString());
    }
    if (unlockConfig.inheritanceTargets && unlockConfig.inheritanceTargets.addresses.length) {
      formData.append('inheritance', JSON.stringify(unlockConfig.inheritanceTargets));
    }

    const response = await apiClient.post<CapsuleUploadResult>('/api/capsule/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (event) => {
        if (!onUploadProgress || !event.total) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        onUploadProgress(percent);
      },
    });

    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to upload capsule');
  }
}

/**
 * Get capsule metadata
 * READ-ONLY: No authentication required for metadata queries
 */
export async function getCapsule(capsuleId: string, userAddress?: string): Promise<CapsuleData> {
  try {
    const headers: Record<string, string> = {};
    if (userAddress) {
      headers['x-user-address'] = userAddress;
    }
    const response = await apiClient.get<CapsuleData>(`/api/capsule/${capsuleId}`, { headers });
    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to get capsule');
  }
}

/**
 * List user's capsules
 */
export async function listMyCapsules(userAddress: string): Promise<CapsuleInfo[]> {
  try {
    const response = await apiClient.get<{ success: boolean; capsules: CapsuleInfo[] }>('/api/capsule/my-capsules', {
      headers: {
        'x-user-address': userAddress,
      },
    });
    return response.data.capsules || [];
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to list capsules');
  }
}

/**
 * Unlock capsule
 */
export async function unlockCapsule(
  capsuleId: string,
  userAddress: string,
  userMessage?: string
): Promise<CapsuleUnlockResponse> {
  try {
    const response = await apiClient.post<{
      success: boolean;
      decryptedData?: string;
      fileType?: string;
      message?: string | null;
      voiceData?: string;
      voiceMimeType?: string;
      aiPreview?: string;
      inheritance?: unknown;
      contributions?: Array<{
        contributionId: string;
        contributorAddress: string;
        payload: Record<string, unknown>;
        createdAt: string;
      }>;
      policy?: Record<string, unknown> | null;
    }>(`/api/capsule/${capsuleId}/unlock`, {
      userAddress,
      userMessage,
    }, {
      headers: {
        'x-user-address': userAddress,
      },
    });

    return {
      success: response.data.success,
      decryptedData: response.data.decryptedData ? base64ToUint8Array(response.data.decryptedData) : undefined,
      fileType: response.data.fileType,
      message: response.data.message ?? null,
      voiceData: response.data.voiceData ? base64ToUint8Array(response.data.voiceData) : undefined,
      voiceMimeType: response.data.voiceMimeType,
      aiPreview: response.data.aiPreview,
      inheritance: response.data.inheritance,
      contributions: response.data.contributions || [],
      policy: response.data.policy ?? null,
    };
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to unlock capsule');
  }
}

/**
 * Check inheritance eligibility for a user
 */
export async function checkInheritanceEligibility(userAddress: string): Promise<Array<{
  capsuleId: string;
  eligible: boolean;
  reason?: string;
  inactiveSince?: string;
  inactiveDays?: number;
  fallbackAddresses: string[];
  policyObjectId?: string;
}>> {
  try {
    const response = await apiClient.get<{
      success: boolean;
      eligible: Array<{
        capsuleId: string;
        eligible: boolean;
        reason?: string;
        inactiveSince?: string;
        inactiveDays?: number;
        fallbackAddresses: string[];
        policyObjectId?: string;
      }>;
    }>('/api/capsule/inheritance/eligible', {
      headers: {
        'x-user-address': userAddress,
      },
      params: {
        userAddress,
      },
    });

    return response.data.eligible || [];
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to check inheritance eligibility');
  }
}

/**
 * Claim inheritance for a capsule
 */
export async function claimInheritance(
  capsuleId: string,
  userAddress: string
): Promise<{ success: boolean; txDigest?: string }> {
  try {
    const response = await apiClient.post<{
      success: boolean;
      txDigest?: string;
      message?: string;
    }>(`/api/capsule/${capsuleId}/inheritance/claim`, {
      userAddress,
    }, {
      headers: {
        'x-user-address': userAddress,
      },
    });

    return {
      success: response.data.success,
      txDigest: response.data.txDigest,
    };
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to claim inheritance');
  }
}

/**
 * Generate unlock code for public access
 * 
 * DEPRECATED: Public secret-phrase sharing has been removed for security reasons.
 * Capsules can only be unlocked by the owner's wallet.
 */
export async function generateUnlockCode(capsuleId: string, userAddress: string, expiresAt?: string): Promise<{
  success: boolean;
  secretPhrase?: string;
  expiresAt?: string;
  message?: string;
}> {
  try {
    const response = await apiClient.post(`/api/capsule/${capsuleId}/generate-unlock-code`, {
      userAddress,
      expiresAt,
    }, {
      headers: {
        'x-user-address': userAddress,
      },
    });
    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to generate unlock code');
  }
}

/**
 * Public unlock (no wallet required)
 * 
 * DEPRECATED: Public secret-phrase sharing has been removed for security reasons.
 */
export async function unlockCapsulePublic(capsuleId: string, secretPhrase: string) {
  try {
    const response = await apiClient.post('/api/capsule/public/unlock', {
      capsuleId,
      secretPhrase,
    });
    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to verify unlock code');
  }
}

/**
 * Public unlock decryption (actually decrypts the capsule)
 * 
 * DEPRECATED: Public secret-phrase sharing has been removed for security reasons.
 */
export async function unlockCapsulePublicDecrypt(
  capsuleId: string, 
  secretPhrase: string, 
  unlockAt?: number
) {
  try {
    const response = await apiClient.post('/api/capsule/public/unlock-decrypt', {
      capsuleId,
      secretPhrase,
      unlockAt,
    });
    return {
      ...response.data,
      decryptedData: response.data.decryptedData ? base64ToUint8Array(response.data.decryptedData) : undefined,
    };
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to decrypt capsule');
  }
}

/**
 * Get NFT for a capsule
 */
export async function getCapsuleNFT(capsuleId: string): Promise<{
  nftId: string;
  capsuleId: string;
  owner: string;
  glowIntensity: number;
  createdAt: number;
} | null> {
  try {
    const response = await apiClient.get<{
      success: boolean;
      nft?: {
        nftId: string;
        capsuleId: string;
        owner: string;
        glowIntensity: number;
        createdAt: number;
      };
    }>(`/api/capsule/${capsuleId}/nft`);
    
    return response.data.nft || null;
  } catch (error: unknown) {
    // NFT not found is not an error - return null
    if (getApiErrorMessage(error)?.includes('404') || getApiErrorMessage(error)?.includes('not found')) {
      return null;
    }
    throw new Error(getApiErrorMessage(error) || 'Failed to get NFT');
  }
}

/**
 * List user's NFTs
 */
export async function listMyNFTs(userAddress: string): Promise<Array<{
  nftId: string;
  capsuleId: string;
  glowIntensity: number;
  createdAt: number;
  mediaBlobId?: string;
}>> {
  try {
      const response = await apiClient.get<{
      success: boolean;
      nfts: Array<{
        nftId: string;
        capsuleId: string;
        glowIntensity: number;
        createdAt: number;
        mediaBlobId?: string;
      }>;
    }>('/api/capsule/my-nfts', {
      headers: {
        'x-user-address': userAddress,
      },
      params: {
        userAddress,
      },
    });
    
    return response.data.nfts || [];
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to list NFTs');
  }
}

export async function batchGetUnlockInfo(
  userAddress: string,
  capsuleIds: string[]
): Promise<Record<string, { unlockCondition: 'time' | 'manual'; unlockAt?: number; status: 'locked' | 'unlocked' }>> {
  try {
    const response = await apiClient.post<{
      success: boolean;
      unlockInfo: Record<string, { unlockCondition: 'time' | 'manual'; unlockAt?: number; status: 'locked' | 'unlocked' }>;
    }>('/api/capsule/batch-unlock-info', {
      capsuleIds,
    }, {
      headers: {
        'x-user-address': userAddress,
      },
    });
    
    const unlockInfo = response.data.unlockInfo || {};
    const timeLockedCount = Object.values(unlockInfo).filter((info: any) => info.unlockCondition === 'time').length;
    logger.debug('API Response received for batchGetUnlockInfo', {
      success: response.data.success,
      totalKeys: Object.keys(unlockInfo).length,
      timeLockedCount,
      sampleKeys: Object.keys(unlockInfo).slice(0, 5),
      timeLockedEntries: Object.entries(unlockInfo)
        .filter(([_, info]: [string, any]) => info.unlockCondition === 'time')
        .map(([id, info]: [string, any]) => ({ id, unlockAt: info.unlockAt }))
    });
    
    return unlockInfo;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to get unlock info');
  }
}

export async function setInheritanceSettings(
  capsuleId: string,
  ownerAddress: string,
  payload: {
    fallbackAddresses: string[];
    inactiveAfterDays?: number;
    autoTransfer?: boolean;
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await apiClient.post(`/api/capsule/${capsuleId}/inheritance`, {
      ownerAddress,
      fallbackAddresses: payload.fallbackAddresses,
      inactiveAfterDays: payload.inactiveAfterDays,
      autoTransfer: payload.autoTransfer,
    }, {
      headers: {
        'x-user-address': ownerAddress,
      },
    });
    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to update inheritance preferences');
  }
}

export async function getInheritanceSettings(capsuleId: string, userAddress: string) {
  try {
    const response = await apiClient.get(`/api/capsule/${capsuleId}/inheritance`, {
      headers: {
        'x-user-address': userAddress,
      },
    });
    return response.data.inheritance || null;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to load inheritance settings');
  }
}

export async function addCapsuleContribution(
  capsuleId: string,
  contributorAddress: string,
  message: string
) {
  try {
    const response = await apiClient.post(`/api/capsule/${capsuleId}/contributions`, {
      contributorAddress,
      message,
    }, {
      headers: {
        'x-user-address': contributorAddress,
      },
    });
    return response.data;
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to add contribution');
  }
}

export async function listCapsuleContributions(capsuleId: string, userAddress: string) {
  try {
    const response = await apiClient.get(`/api/capsule/${capsuleId}/contributions`, {
      headers: {
        'x-user-address': userAddress,
      },
    });
    return response.data.contributions || [];
  } catch (error: unknown) {
    throw new Error(getApiErrorMessage(error) || 'Failed to load contributions');
  }
}


