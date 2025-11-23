import { ConnectButton } from '@mysten/wallet-kit';
import { useWalletKit } from '@mysten/wallet-kit';

export function WalletButton() {
  const { currentWallet, isConnected } = useWalletKit();

  if (isConnected && currentWallet) {
    const address = currentWallet.accounts[0]?.address || '';
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        position: 'relative',
        zIndex: 1000, // Ensure dropdown appears above other elements
      }}>
        <span style={{ 
          fontSize: '12px', 
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace', 
          color: '#aaa',
          padding: '6px 12px',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '6px',
          background: 'rgba(0,0,0,0.4)',
          fontWeight: 400,
          letterSpacing: '0.02em',
        }}>
          {shortAddress}
        </span>
        <div style={{ 
          background: '#0a0a0a', 
          border: '1px solid #1a1a1a',
          borderRadius: '4px',
          position: 'relative',
          zIndex: 1000, // Ensure dropdown appears above other elements
          // Remove overflow: hidden to allow dropdown to show
        }}>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'relative',
      zIndex: 1000, // Ensure dropdown appears above other elements
    }}>
      <style>{`
        .wallet-kit-connect-button {
          background: linear-gradient(135deg, #ff6b9d 0%, #c44569 100%) !important;
          border: none !important;
          color: #fff !important;
          padding: 10px 20px !important;
          border-radius: 8px !important;
          font-weight: 500 !important;
          font-size: 14px !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
          box-shadow: 0 4px 15px rgba(255, 107, 157, 0.3) !important;
        }
        .wallet-kit-connect-button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 6px 20px rgba(255, 107, 157, 0.4) !important;
        }
        .wallet-kit-connect-button:active {
          transform: translateY(0) !important;
        }
      `}</style>
      <ConnectButton connectText="Connect" />
    </div>
  );
}
