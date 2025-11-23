/**
 * LUMINA Hook
 * Provides capsule management functionality
 */

import { useState, useEffect, useCallback } from 'react';
import { useWalletKit } from '@mysten/wallet-kit';
import { useZkLogin } from '../wallet/zkLogin';
import * as capsuleService from '../services/capsuleService';
import type { CapsuleUploadResult, CapsuleData, CapsuleInfo, CapsuleUnlockConfig } from '../types/capsule';
import { getApiErrorMessage } from '../services/api';

export interface CapsuleDecryptionResult {
  decryptedData?: Uint8Array;
  mimeType?: string;
  message?: string | null;
  voice?: {
    data: Uint8Array;
    mimeType: string;
  } | null;
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

export function useLumina() {
  const walletKit = useWalletKit();
  const { currentWallet, isConnected, currentAccount } = walletKit;
  const zkLogin = useZkLogin();
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isConnected && currentAccount) {
      setAddress(currentAccount.address);
    } else if (zkLogin.isConnected && zkLogin.address) {
      setAddress(zkLogin.address);
    } else {
      setAddress(null);
    }
  }, [isConnected, currentAccount, zkLogin.isConnected, zkLogin.address]);

  // Capsule functions - server-based flow
  const uploadCapsule = useCallback(async (
    file: File,
    metadata: { description?: string; tags?: string[]; message?: string; soulbound?: boolean },
    unlockConfig: CapsuleUnlockConfig,
    voiceBlob?: Blob,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<CapsuleUploadResult> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      onProgress?.('Preparing upload...', 5);
      const result = await capsuleService.uploadCapsule(
        file,
        metadata,
        unlockConfig,
        address,
        voiceBlob,
        (progress) => {
          onProgress?.('Uploading to Walrus...', progress);
        }
      );
      onProgress?.('Finalizing on-chain state...', 95);
      return {
        success: true,
        capsuleId: result.capsuleId,
        blobId: result.blobId,
        encryptedDataId: result.encryptedDataId,
        createdAt: result.createdAt,
        nftId: result.nftId,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : getApiErrorMessage(err) || 'Failed to create capsule';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const getCapsule = useCallback(async (capsuleId: string): Promise<CapsuleData> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.getCapsule(capsuleId, address);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to get capsule';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const listMyCapsules = useCallback(async (): Promise<CapsuleInfo[]> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.listMyCapsules(address);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to list capsules';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const unlockCapsule = useCallback(async (capsuleId: string, userMessage?: string): Promise<CapsuleDecryptionResult> => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      const result = await capsuleService.unlockCapsule(capsuleId, address, userMessage);
      return {
        decryptedData: result.decryptedData,
        mimeType: result.fileType,
        message: result.message ?? null,
        voice: result.voiceData
          ? {
              data: result.voiceData,
              mimeType: result.voiceMimeType || 'audio/webm',
            }
          : null,
        aiPreview: result.aiPreview,
        inheritance: result.inheritance,
        contributions: result.contributions,
        policy: result.policy,
      };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : getApiErrorMessage(err) || 'Failed to unlock capsule';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const updateInheritance = useCallback(async (
    capsuleId: string,
    options: { fallbackAddresses: string[]; inactiveAfterDays?: number; autoTransfer?: boolean }
  ) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.setInheritanceSettings(capsuleId, address, options);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to update inheritance preferences';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchInheritance = useCallback(async (capsuleId: string) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setError(null);
    return capsuleService.getInheritanceSettings(capsuleId, address);
  }, [address]);

  const addContribution = useCallback(async (capsuleId: string, message: string) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.addCapsuleContribution(capsuleId, address, message);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to add contribution';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchContributions = useCallback(async (capsuleId: string) => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setError(null);
    return capsuleService.listCapsuleContributions(capsuleId, address);
  }, [address]);

  const getCapsuleNFT = useCallback(async (capsuleId: string) => {
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.getCapsuleNFT(capsuleId);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to get NFT';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const listMyNFTs = useCallback(async () => {
    if (!address) {
      throw new Error('Wallet not connected');
    }
    setLoading(true);
    setError(null);
    try {
      return await capsuleService.listMyNFTs(address);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err) || 'Failed to list NFTs';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [address]);

  return {
    // Wallet state
    address,
    isConnected: isConnected || zkLogin.isConnected,
    currentWallet,
    zkLogin,

    // State
    loading,
    error,

    // Capsule functions
    uploadCapsule,
    getCapsule,
    listMyCapsules,
    unlockCapsule,
    updateInheritance,
    fetchInheritance,
    addContribution,
    fetchContributions,

    // NFT functions
    getCapsuleNFT,
    listMyNFTs,
  };
}

