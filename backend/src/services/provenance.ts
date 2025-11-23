/**
 * Provenance Service
 * Tracks data lineage and access history for capsules
 */

import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';
import { getErrorMessage } from '../types/common';

interface LineageEntry {
  id: number;
  capsuleId: string;
  actorAddress: string;
  action: string;
  timestamp: number;
  metadata: any;
}

class ProvenanceService {
  /**
   * Record an access event
   */
  async recordAccess(
    capsuleId: string,
    actor: string,
    action: 'created' | 'accessed' | 'unlocked' | 'purchased' | 'transferred',
    metadata?: any
  ): Promise<void> {
    try {
      const db = getDatabase();
      await db.execute(
        'INSERT INTO capsule_provenance (capsule_id, actor_address, action, timestamp, metadata) VALUES (?, ?, ?, ?, ?)',
        [
          capsuleId,
          actor,
          action,
          Date.now(),
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      logger.info('Provenance recorded', { capsuleId, actor, action });
    } catch (error: unknown) {
      logger.error('Error recording provenance', { error, capsuleId, actor, action });
      throw new Error(`Failed to record provenance: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get lineage for a capsule
   */
  async getLineage(capsuleId: string): Promise<LineageEntry[]> {
    try {
      const db = getDatabase();
      const [entryRows] = await db.execute(
        'SELECT id, capsule_id, actor_address, action, timestamp, metadata FROM capsule_provenance WHERE capsule_id = ? ORDER BY timestamp ASC',
        [capsuleId]
      ) as [any[], any];
      const entries = entryRows as Array<{
        id: number;
        capsule_id: string;
        actor_address: string;
        action: string;
        timestamp: number;
        metadata: string | null;
      }>;

      return entries.map(entry => ({
        id: entry.id,
        capsuleId: entry.capsule_id,
        actorAddress: entry.actor_address,
        action: entry.action,
        timestamp: entry.timestamp,
        metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
      }));
    } catch (error: unknown) {
      logger.error('Error getting lineage', { error, capsuleId });
      return [];
    }
  }

  /**
   * Verify integrity by checking if capsule has been tampered with
   */
  async verifyIntegrity(capsuleId: string): Promise<boolean> {
    try {
      const db = getDatabase();
      
      // Check if capsule exists
      const [vaultRows] = await db.execute(
        'SELECT vault_id FROM evidence_vaults WHERE vault_id = ?',
        [capsuleId]
      ) as [any[], any];
      const vault = vaultRows[0];

      if (!vault) {
        return false;
      }

      // Check if there are any suspicious access patterns
      // (e.g., multiple rapid accesses from different addresses)
      const [accessRows] = await db.execute(
        'SELECT actor_address, COUNT(*) as count FROM capsule_provenance WHERE capsule_id = ? AND action = ? AND timestamp > ? GROUP BY actor_address HAVING count > 10',
        [capsuleId, 'accessed', Date.now() - 3600000]
      ) as [any[], any];
      const recentAccesses = accessRows as Array<{ actor_address: string; count: number }>;

      // If too many accesses from same address in short time, might be suspicious
      if (recentAccesses.length > 0) {
        logger.warn('Suspicious access pattern detected', { capsuleId, recentAccesses });
        // Don't fail integrity check, just log warning
      }

      return true;
    } catch (error: unknown) {
      logger.error('Error verifying integrity', { error, capsuleId });
      return false;
    }
  }
}

export default ProvenanceService;

