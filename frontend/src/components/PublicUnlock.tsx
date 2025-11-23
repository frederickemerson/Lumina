/**
 * Public Unlock Component (View-Only)
 * Shows capsule orb countdown - no decryption without wallet
 * Public secret-phrase sharing has been removed for security.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Lock, Wallet } from 'lucide-react';
import { colors, spacing, typography, cardStyles } from '../styles/theme';
import { Button } from './ui/button';
import { CapsuleOrb } from './CapsuleOrb';
import { useWalletKit } from '@mysten/wallet-kit';

export function PublicUnlock() {
  const { capsuleId: urlCapsuleId } = useParams<{ capsuleId: string }>();
  const navigate = useNavigate();
  const { isConnected } = useWalletKit();
  
  const [capsuleId] = useState(urlCapsuleId || '');


  const handleConnectWallet = async () => {
    if (isConnected) {
      // Navigate to main app to unlock
      navigate('/');
      toast.success('Navigate to your capsule to unlock');
          } else {
      // connect() from wallet-kit requires a wallet name
      // For now, just show a message - user can use the ConnectButton component
      toast('Please use the Connect Wallet button in the header to connect', { icon: 'ℹ️' });
    }
  };

  if (!capsuleId) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        background: '#000',
      }}>
        <div style={{
          ...cardStyles.base,
          maxWidth: '500px',
          width: '100%',
          padding: spacing.xl,
          textAlign: 'center',
        }}>
          <Lock size={48} style={{ margin: '0 auto 16px', opacity: 0.5, color: colors.textSecondary }} />
          <h1 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: 700,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
            LUMINA
          </h1>
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            marginBottom: spacing.xl,
          }}>
            No capsule ID provided
          </p>
            <Button
            onClick={() => navigate('/')}
              variant="default"
          >
            Go Home
            </Button>
        </div>
      </div>
    );
  }

  // Show view-only capsule orb
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        background: '#000',
      }}>
        <div style={{
          ...cardStyles.base,
          maxWidth: '800px',
          width: '100%',
          padding: spacing.xl,
        textAlign: 'center',
        }}>
          <h2 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: 600,
            color: colors.text,
            marginBottom: spacing.md,
          }}>
          Memory Capsule
          </h2>

        {/* 3D Orb Visualization */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          marginBottom: spacing.xl,
        }}>
          <CapsuleOrb />
            </div>

        {/* Connect Wallet to Unlock */}
            <div style={{
              padding: spacing.lg,
              background: colors.surface,
          borderRadius: spacing.md,
          border: `1px solid ${colors.border}`,
            }}>
          <Lock size={24} style={{ margin: '0 auto 16px', opacity: 0.7, color: colors.textSecondary }} />
          <p style={{
            fontSize: typography.fontSize.sm,
                color: colors.text,
                marginBottom: spacing.md,
          }}>
            Connect your wallet to unlock this capsule
          </p>
                  <p style={{
            fontSize: typography.fontSize.xs,
                    color: colors.textSecondary,
            marginBottom: spacing.lg,
                  }}>
            Public secret-phrase sharing has been removed for security. Only the owner's wallet can unlock.
          </p>
          <Button
            onClick={handleConnectWallet}
            variant="default"
            size="lg"
            style={{ width: '100%' }}
                  >
            <Wallet size={16} />
            <span>{isConnected ? 'Go to Capsule' : 'Connect Wallet'}</span>
          </Button>
          </div>
        </div>
      </div>
    );
}

