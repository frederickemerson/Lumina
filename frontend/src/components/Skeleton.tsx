/**
 * Loading Skeleton Component
 * Shows placeholder content while data is loading
 */

import React from 'react';
import { spacing, borderRadius } from '../styles/theme';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ 
  width = '100%', 
  height = '20px', 
  borderRadius: br = borderRadius.sm,
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: br,
        ...style,
      }}
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
  showAvatar?: boolean;
  className?: string;
}

export function SkeletonCard({ lines = 3, showAvatar = false, className = '' }: SkeletonCardProps) {
  return (
    <div
      className={className}
      style={{
        padding: spacing.lg,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: borderRadius.md,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.md,
      }}
    >
      {showAvatar && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <Skeleton width={40} height={40} borderRadius="50%" />
          <Skeleton width="60%" height={16} />
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '80%' : '100%'}
          height={16}
        />
      ))}
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  showAvatar?: boolean;
}

export function SkeletonList({ count = 3, showAvatar = false }: SkeletonListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} showAvatar={showAvatar} />
      ))}
    </div>
  );
}

