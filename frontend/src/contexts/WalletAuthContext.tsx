/**
 * Wallet Authentication Context
 * Provides wallet signing capability to API client
 */

import { createContext, useContext, useCallback, useEffect } from 'react';
import { useWalletKit } from '@mysten/wallet-kit';
import { signRequest, canSignRequest } from '../services/walletAuth';
import { setWalletSigner } from '../services/api';

interface WalletAuthContextValue {
  signRequestHeaders: (method: string, path: string) => Promise<Record<string, string> | null>;
  canSign: boolean;
}

const WalletAuthContext = createContext<WalletAuthContextValue | null>(null);

export function WalletAuthProvider({ children }: { children: React.ReactNode }) {
  const { currentWallet, currentAccount, isConnected } = useWalletKit();

  const signRequestHeaders = useCallback(
    async (method: string, path: string): Promise<Record<string, string> | null> => {
      if (!isConnected || !currentAccount || !currentWallet) {
        return null;
      }

      // Get signPersonalMessage from wallet
      const walletFeatures = currentWallet.features;
      const personalMessageFeature = walletFeatures?.['sui:signPersonalMessage'];
      
      if (!personalMessageFeature) {
        return null;
      }

      try {
        const headers = await signRequest(
          currentAccount,
          personalMessageFeature.signPersonalMessage,
          method,
          path
        );
        return headers;
      } catch (error) {
        console.error('Failed to sign request in WalletAuthContext', {
          error,
          method,
          path,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        return null;
      }
    },
    [isConnected, currentAccount, currentWallet]
  );

  const canSign = canSignRequest(
    currentAccount || undefined,
    currentWallet?.features?.['sui:signPersonalMessage']?.signPersonalMessage || undefined
  );

  // Update API client with signer
  useEffect(() => {
    if (canSign) {
      setWalletSigner(signRequestHeaders);
    } else {
      setWalletSigner(null);
    }
    
    return () => {
      setWalletSigner(null);
    };
  }, [canSign, signRequestHeaders]);

  return (
    <WalletAuthContext.Provider value={{ signRequestHeaders, canSign }}>
      {children}
    </WalletAuthContext.Provider>
  );
}

export function useWalletAuth() {
  const context = useContext(WalletAuthContext);
  if (!context) {
    throw new Error('useWalletAuth must be used within WalletAuthProvider');
  }
  return context;
}

