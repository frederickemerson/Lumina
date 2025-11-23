/**
 * zkLogin Integration
 * Handles Sui zkLogin authentication with Google, Apple, and Twitter OAuth
 * 
 * Reference: Sui Wallet Kit documentation
 * https://docs.sui.io/guides/developer/apps/zklogin
 */

import { useWalletKit } from '@mysten/wallet-kit';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';

// Initialize Sui client
const fullnodeUrl = import.meta.env.VITE_SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
const suiClient = new SuiClient({
  url: fullnodeUrl,
});

/**
 * Hook for zkLogin functionality
 */
interface WalletKit {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  currentWallet?: {
    accounts: Array<{ address: string }>;
  };
}

export function useZkLogin() {
  const walletKit = useWalletKit() as unknown as WalletKit;

  const connectWallet = async () => {
    try {
      if (!walletKit) {
        throw new Error('Wallet kit provider not available');
      }
      await walletKit.connect();
    } catch (error) {
      // Error will be handled by caller
      throw error;
    }
  };

  const disconnectWallet = async () => {
    try {
      if (!walletKit) {
        throw new Error('Wallet kit provider not available');
      }
      await walletKit.disconnect();
    } catch (error) {
      // Error will be handled by caller
      throw error;
    }
  };

  const getAddress = (): string | null => {
    return walletKit?.currentWallet?.accounts[0]?.address || null;
  };

  return {
    isConnected: walletKit?.isConnected ?? false,
    address: getAddress(),
    connect: connectWallet,
    disconnect: disconnectWallet,
    wallet: walletKit?.currentWallet,
  };
}

/**
 * Execute a Move transaction
 */
interface TransactionSigner {
  signAndExecuteTransactionBlock: (options: {
    transactionBlock: TransactionBlock;
    options?: {
      showEffects?: boolean;
      showEvents?: boolean;
    };
  }) => Promise<{ digest: string }>;
}

export async function executeTransaction(
  transactionBlock: TransactionBlock,
  signer: TransactionSigner
): Promise<string> {
  try {
    const result = await signer.signAndExecuteTransactionBlock({
      transactionBlock,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    return result.digest;
  } catch (error) {
    // Error will be handled by caller
    throw error;
  }
}

export { suiClient };

