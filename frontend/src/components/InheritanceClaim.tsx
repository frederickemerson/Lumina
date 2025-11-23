/**
 * Inheritance Claim Component
 * Displays capsules eligible for inheritance claim and allows claiming them
 */

import { useState, useEffect } from 'react';
import { colors, spacing, typography, borderRadius, buttonStyles } from '../styles/theme';
import { Gift, Clock, CheckCircle, XCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../services/api';
import { logger } from '../utils/logger';

interface InheritanceEligibility {
  capsuleId: string;
  eligible: boolean;
  reason?: string;
  inactiveSince?: string;
  inactiveDays?: number;
  fallbackAddresses: string[];
  policyObjectId?: string;
}

interface InheritanceClaimProps {
  userAddress: string;
  onClaimed?: (capsuleId: string) => void;
}

export function InheritanceClaim({ userAddress, onClaimed }: InheritanceClaimProps) {
  const [eligible, setEligible] = useState<InheritanceEligibility[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (userAddress) {
      loadEligibility();
    }
  }, [userAddress]);

  const loadEligibility = async () => {
    if (!userAddress) return;
    
    setLoading(true);
    try {
      const response = await apiClient.get<{ success: boolean; eligible: InheritanceEligibility[] }>(
        `/api/capsule/inheritance/eligible`,
        {
          headers: {
            'x-user-address': userAddress,
          },
          params: {
            userAddress,
          },
        }
      );
      
      if (response.data.success) {
        setEligible(response.data.eligible || []);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load eligibility';
      logger.error('Failed to load inheritance eligibility', {}, error instanceof Error ? error : undefined);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (capsuleId: string) => {
    if (!userAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    setClaiming(prev => ({ ...prev, [capsuleId]: true }));
    try {
      const response = await apiClient.post<{ success: boolean; txDigest?: string }>(
        `/api/capsule/${capsuleId}/inheritance/claim`,
        {
          userAddress,
        },
        {
          headers: {
            'x-user-address': userAddress,
          },
        }
      );

      if (response.data.success) {
        toast.success('Inheritance claimed successfully!');
        // Remove from eligible list
        setEligible(prev => prev.filter(e => e.capsuleId !== capsuleId));
        onClaimed?.(capsuleId);
      } else {
        toast.error('Failed to claim inheritance');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim inheritance';
      logger.error('Failed to claim inheritance', {}, error instanceof Error ? error : undefined);
      toast.error(errorMessage);
    } finally {
      setClaiming(prev => ({ ...prev, [capsuleId]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{
        ...buttonStyles,
        padding: spacing.lg,
        textAlign: 'center',
        color: colors.textSecondary,
        background: 'transparent',
        border: 'none',
      }}>
        <Loader size={20} style={{ margin: '0 auto', animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: spacing.sm, margin: 0 }}>Checking inheritance eligibility...</p>
      </div>
    );
  }

  if (eligible.length === 0) {
    return null; // Don't show anything if no eligible capsules
  }

  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: borderRadius.md,
      padding: spacing.lg,
      marginBottom: spacing.lg,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md,
      }}>
        <Gift size={20} style={{ color: colors.primary }} />
        <h3 style={{
          color: colors.text,
          fontSize: typography.fontSize.lg,
          fontWeight: typography.fontWeight.semibold,
          margin: 0,
        }}>
          Inheritance Available
        </h3>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
      }}>
        {eligible.map((item) => (
          <div
            key={item.capsuleId}
            style={{
              background: item.eligible ? `linear-gradient(135deg, ${colors.success}10, ${colors.success}05)` : colors.background,
              border: `1px solid ${item.eligible ? colors.success : colors.border}`,
              borderRadius: borderRadius.sm,
              padding: spacing.md,
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: spacing.md,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  marginBottom: spacing.xs,
                }}>
                  {item.eligible ? (
                    <CheckCircle size={16} style={{ color: colors.success }} />
                  ) : (
                    <XCircle size={16} style={{ color: colors.textSecondary }} />
                  )}
                  <span style={{
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.semibold,
                    color: item.eligible ? colors.success : colors.textSecondary,
                  }}>
                    {item.eligible ? 'Eligible to Claim' : 'Not Yet Eligible'}
                  </span>
                </div>
                
                <p style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.textSecondary,
                  margin: `${spacing.xs} 0`,
                }}>
                  {item.reason}
                </p>

                {item.inactiveDays !== undefined && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    marginTop: spacing.xs,
                  }}>
                    <Clock size={12} style={{ color: colors.textSecondary }} />
                    <span style={{
                      fontSize: typography.fontSize.xs,
                      color: colors.textSecondary,
                    }}>
                      Inactive for {item.inactiveDays} days
                    </span>
                  </div>
                )}

                <div style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.textMuted,
                  marginTop: spacing.xs,
                  fontFamily: 'monospace',
                }}>
                  Capsule: {item.capsuleId.substring(0, 16)}...
                </div>
              </div>

              {item.eligible && (
                <button
                  onClick={() => handleClaim(item.capsuleId)}
                  disabled={claiming[item.capsuleId]}
                  style={{
                    ...buttonStyles,
                    padding: `${spacing.sm} ${spacing.md}`,
                    fontSize: typography.fontSize.sm,
                    whiteSpace: 'nowrap',
                    opacity: claiming[item.capsuleId] ? 0.6 : 1,
                    cursor: claiming[item.capsuleId] ? 'not-allowed' : 'pointer',
                  }}
                >
                  {claiming[item.capsuleId] ? (
                    <>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite', marginRight: spacing.xs }} />
                      Claiming...
                    </>
                  ) : (
                    'Claim Inheritance'
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

