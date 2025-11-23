/**
 * LUMINA Capsule Viewer Component
 * Refactored from EvidenceViewer - displays user's capsules
 */

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useLumina } from '../hooks/useLumina';
import { Lock, Unlock, Calendar, Settings, ExternalLink, Box, Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { colors, spacing, typography, cardStyles, buttonStyles, borderRadius } from '../styles/theme';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CapsuleUnlock } from './CapsuleUnlock';
import { CapsuleOrb } from './CapsuleOrb';
import { ARViewer } from './ARViewer';
import { getCapsuleNFT } from '../services/capsuleService';
import type { CapsuleInfo } from '../types/capsule';

export function CapsuleViewer() {
  const { address, isConnected, listMyCapsules, unlockCapsule } = useLumina();
  const [capsules, setCapsules] = useState<CapsuleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [unlockingCapsuleId, setUnlockingCapsuleId] = useState<string | null>(null);
  const [arCapsuleId, setArCapsuleId] = useState<string | null>(null);
  const [nftData, setNftData] = useState<Record<string, {
    nftId: string;
    capsuleId: string;
    owner: string;
    glowIntensity: number;
    createdAt: number;
  }>>({});
  
  // Search/Filter/Sort/Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | 'time' | 'manual'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'condition'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (isConnected && address) {
      loadCapsules();
    } else {
      setCapsules([]);
    }
  }, [isConnected, address]);

  // Fetch NFT data for capsules
  useEffect(() => {
    if (capsules.length > 0) {
      const fetchNFTs = async () => {
        const nftPromises = capsules.map(async (capsule) => {
          try {
            const nft = await getCapsuleNFT(capsule.capsuleId);
            if (nft) {
              return { capsuleId: capsule.capsuleId, nft };
            }
            return null;
          } catch (error) {
            // NFT not found is not an error
            return null;
          }
        });

        const results = await Promise.all(nftPromises);
        const nftMap: Record<string, {
          nftId: string;
          capsuleId: string;
          owner: string;
          glowIntensity: number;
          createdAt: number;
        }> = {};

        results.forEach((result) => {
          if (result && result.nft) {
            nftMap[result.capsuleId] = result.nft;
          }
        });

        setNftData(nftMap);
      };

      fetchNFTs();
    }
  }, [capsules]);

  const loadCapsules = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const myCapsules = await listMyCapsules();
      setCapsules(myCapsules);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load capsules';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getUnlockConditionIcon = (condition?: string) => {
    switch (condition) {
      case 'time':
        return <Calendar size={16} />;
      case 'manual':
        return <Settings size={16} />;
      default:
        return <Lock size={16} />;
    }
  };

  const getUnlockConditionLabel = (condition?: string) => {
    switch (condition) {
      case 'time':
        return 'Time-based';
      case 'manual':
        return 'Manual';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Filter and sort capsules
  const filteredAndSortedCapsules = React.useMemo(() => {
    let filtered = [...capsules];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(capsule => 
        capsule.capsuleId.toLowerCase().includes(query) ||
        (capsule.unlockAt && new Date(capsule.unlockAt).toLocaleDateString().toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(capsule => capsule.status === statusFilter);
    }

    // Condition filter
    if (conditionFilter !== 'all') {
      filtered = filtered.filter(capsule => capsule.unlockCondition === conditionFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'condition':
          comparison = (a.unlockCondition || '').localeCompare(b.unlockCondition || '');
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [capsules, searchQuery, statusFilter, conditionFilter, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedCapsules.length / itemsPerPage);
  const paginatedCapsules = filteredAndSortedCapsules.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, conditionFilter, sortBy, sortOrder]);

  if (!isConnected) {
    return (
      <div style={{
        ...cardStyles.base,
        textAlign: 'center',
        padding: spacing.xl,
      }}>
        <Lock size={32} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Connect your wallet to view your memory vaults
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        ...cardStyles.base,
        textAlign: 'center',
        padding: spacing.xl,
      }}>
        <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
          Loading capsules...
        </p>
      </div>
    );
  }

  if (capsules.length === 0) {
    return (
      <div style={{
        ...cardStyles.base,
        textAlign: 'center',
        padding: spacing.xl,
      }}>
        <Lock size={32} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm, marginBottom: spacing.md }}>
          No capsules found
        </p>
        <p style={{ color: colors.textMuted, fontSize: typography.fontSize.xs }}>
          Create your first memory vault to get started
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: spacing.lg,
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: `0 ${spacing.md}`,
    }}>
      {/* Unlock Modal */}
      {unlockingCapsuleId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xl,
        }}>
          <div style={{
            ...cardStyles.base,
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}>
            <CapsuleUnlock
              capsuleId={unlockingCapsuleId}
              unlockCapsule={unlockCapsule}
              onClose={() => setUnlockingCapsuleId(null)}
            />
          </div>
        </div>
      )}

      {/* AR Viewer */}
      {arCapsuleId && (
        <ARViewer
          capsuleId={arCapsuleId}
          blobId={capsules.find(c => c.capsuleId === arCapsuleId)?.blobId || ''}
          onClose={() => setArCapsuleId(null)}
        />
      )}

      {/* Search and Filters */}
      <div style={{
        ...cardStyles.base,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute',
              left: spacing.sm,
              top: '50%',
              transform: 'translateY(-50%)',
              color: colors.textSecondary,
            }} />
            <Input
              type="text"
              placeholder="Search capsules by ID or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: spacing.xl + spacing.sm,
              }}
            />
          </div>

          {/* Filters and Sort */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }}>
            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              <Filter size={14} style={{ color: colors.textSecondary }} />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'locked' | 'unlocked')}>
                <SelectTrigger style={{ width: '140px', height: '32px', fontSize: typography.fontSize.xs }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                  <SelectItem value="unlocked">Unlocked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Condition Filter */}
            <Select value={conditionFilter} onValueChange={(value) => setConditionFilter(value as 'all' | 'time' | 'manual')}>
              <SelectTrigger style={{ width: '140px', height: '32px', fontSize: typography.fontSize.xs }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="time">Time-based</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginLeft: 'auto' }}>
              <ArrowUpDown size={14} style={{ color: colors.textSecondary }} />
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'date' | 'status' | 'condition')}>
                <SelectTrigger style={{ width: '140px', height: '32px', fontSize: typography.fontSize.xs }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Sort by Date</SelectItem>
                  <SelectItem value="status">Sort by Status</SelectItem>
                  <SelectItem value="condition">Sort by Condition</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </Button>
            </div>
          </div>

          {/* Results Count */}
          <div style={{
            fontSize: typography.fontSize.xs,
            color: colors.textSecondary,
          }}>
            Showing {paginatedCapsules.length} of {filteredAndSortedCapsules.length} capsules
          </div>
        </div>
      </div>

      {/* Capsules List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {paginatedCapsules.length === 0 ? (
          <div style={{
            ...cardStyles.base,
            textAlign: 'center',
            padding: spacing.xl,
          }}>
            <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.sm }}>
              No capsules match your filters
            </p>
          </div>
        ) : (
          paginatedCapsules.map((capsule) => (
          <div key={capsule.capsuleId} style={{ ...cardStyles.base, padding: spacing.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: spacing.md }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                  {capsule.status === 'unlocked' ? (
                    <Unlock size={20} style={{ color: colors.success }} />
                  ) : (
                    <Lock size={20} style={{ color: colors.primary }} />
                  )}
                  <h3 style={{ color: colors.text, fontSize: typography.fontSize.md, margin: 0 }}>
                    Capsule {capsule.capsuleId.slice(0, 8)}...
                  </h3>
                </div>
                <p style={{ color: colors.textSecondary, fontSize: typography.fontSize.xs, margin: 0 }}>
                  Created: {formatDate(capsule.createdAt)}
                </p>
              </div>
              <Badge variant={capsule.status === 'unlocked' ? 'default' : 'secondary'}>
                {capsule.status === 'unlocked' ? 'Unlocked' : 'Locked'}
              </Badge>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: `${spacing.xs} ${spacing.sm}`,
                background: colors.surface,
                borderRadius: borderRadius.sm,
                fontSize: typography.fontSize.xs,
                color: colors.textSecondary,
              }}>
                {getUnlockConditionIcon(capsule.unlockCondition)}
                <span>{getUnlockConditionLabel(capsule.unlockCondition)}</span>
              </div>
              {capsule.unlockAt && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: colors.surface,
                  borderRadius: borderRadius.sm,
                  fontSize: typography.fontSize.xs,
                  color: colors.textSecondary,
                }}>
                  <Calendar size={14} />
                  <span>Unlocks: {new Date(capsule.unlockAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: spacing.sm }}>
              {capsule.status === 'locked' && (
                <button
                  onClick={() => setUnlockingCapsuleId(capsule.capsuleId)}
                  style={{
                    ...buttonStyles,
                    flex: 1,
                    background: colors.primary,
                    color: colors.background,
                    border: `1px solid ${colors.primary}`,
                  }}
                >
                  <Unlock size={14} />
                  <span>Unlock</span>
                </button>
              )}
              <a
                href={`https://walruscan.com/testnet/blob/${capsule.blobId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...buttonStyles,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  background: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} />
                <span>WalrusScan</span>
              </a>
              <button
                onClick={() => setArCapsuleId(capsule.capsuleId)}
                style={{
                  ...buttonStyles,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  background: colors.surface,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                <Box size={14} />
                <span>View in AR</span>
              </button>
            </div>

                    {/* NFT Display */}
                    {nftData[capsule.capsuleId] && (
                      <div style={{ 
                        marginTop: spacing.md,
                        background: '#000',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        height: '200px',
                      }}>
                        <CapsuleOrb />
                      </div>
                    )}
          </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: spacing.sm,
          marginTop: spacing.md,
        }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              ...buttonStyles,
              padding: `${spacing.xs} ${spacing.sm}`,
              background: currentPage === 1 ? colors.surface : colors.primary,
              color: currentPage === 1 ? colors.textSecondary : colors.background,
              border: `1px solid ${currentPage === 1 ? colors.border : colors.primary}`,
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.5 : 1,
            }}
          >
            <ChevronLeft size={16} />
            <span>Previous</span>
          </button>

          <div style={{
            fontSize: typography.fontSize.sm,
            color: colors.text,
            padding: `0 ${spacing.md}`,
          }}>
            Page {currentPage} of {totalPages}
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            style={{
              ...buttonStyles,
              padding: `${spacing.xs} ${spacing.sm}`,
              background: currentPage === totalPages ? colors.surface : colors.primary,
              color: currentPage === totalPages ? colors.textSecondary : colors.background,
              border: `1px solid ${currentPage === totalPages ? colors.border : colors.primary}`,
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.5 : 1,
            }}
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

