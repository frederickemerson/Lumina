/**
 * Capsule API Utilities
 * Shared helper functions for capsule endpoints
 */

import { getDatabase } from '../../db/database';

export const asciiCapsuleIdPattern = /^\d+(?:,\d+)+$/;

/**
 * Decode ASCII-encoded capsule ID (backward compatibility)
 */
export function decodeAsciiCapsuleId(value: string): string | null {
  try {
    const chars = value.split(',').map(part => {
      const num = Number(part.trim());
      if (!Number.isFinite(num) || num < 0 || num > 255) {
        throw new Error('invalid char code');
      }
      return String.fromCharCode(num);
    });
    const decoded = chars.join('');
    if (/^[a-fA-F0-9]{64}$/.test(decoded)) {
      return `0x${decoded}`;
    }
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Decode base64 URL-safe string to capsule ID
 */
export function decodeBase64CapsuleId(base64Id: string): string | null {
  try {
    let base64 = base64Id.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const buffer = Buffer.from(base64, 'base64');
    const hex = buffer.toString('hex');
    if (/^[a-fA-F0-9]{64}$/.test(hex)) {
      return `0x${hex}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve policy type from policy object
 */
export function resolvePolicyType(policy: Record<string, unknown> | undefined): string {
  if (!policy) {
    return 'none';
  }
  if (policy.sharedOwners && Array.isArray(policy.sharedOwners) && policy.sharedOwners.length) {
    return 'multi_party';
  }
  if (policy.inheritance) {
    return 'inheritance';
  }
  if (policy.unlockCondition === 'time' || policy.unlockAt) {
    return 'time_lock';
  }
  return 'manual';
}

/**
 * Fetch inheritance settings for a capsule
 */
export async function fetchInheritanceSettings(capsuleId: string) {
  const db = getDatabase();
  const [rows] = await db.execute(
    'SELECT fallback_addresses, inactive_after_days, last_ping, auto_transfer FROM capsule_inheritance WHERE capsule_id = ?',
    [capsuleId]
  ) as [Array<{ fallback_addresses: string; inactive_after_days: number; last_ping: Date | null; auto_transfer: number }>, unknown];

  if (!rows.length) {
    return null;
  }

  return {
    fallbackAddresses: rows[0].fallback_addresses ? JSON.parse(rows[0].fallback_addresses) : [],
    inactiveAfterDays: rows[0].inactive_after_days,
    lastPing: rows[0].last_ping,
    autoTransfer: Boolean(rows[0].auto_transfer),
  };
}

/**
 * Fetch contributions for a capsule
 */
export async function fetchContributions(capsuleId: string, limit = 20) {
  const db = getDatabase();
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 1000);
  const [rows] = await db.execute(
    `SELECT contribution_id, contributor_address, payload, created_at FROM capsule_contributions WHERE capsule_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [capsuleId]
  ) as [Array<{ contribution_id: string; contributor_address: string; payload: string; created_at: Date }>, unknown];

  return rows.map((row) => ({
    contributionId: row.contribution_id,
    contributorAddress: row.contributor_address,
    payload: (() => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return { message: row.payload };
      }
    })(),
    createdAt: row.created_at,
  }));
}

/**
 * Convert MIME type to content category
 */
export function mimeToContentCategory(mime?: string): 'image' | 'video' | 'audio' | 'text' | undefined {
  if (!mime) return undefined;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/') || mime === 'application/json') return 'text';
  return undefined;
}

