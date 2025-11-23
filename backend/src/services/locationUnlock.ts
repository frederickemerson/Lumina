/**
 * Location-Based Unlock Service
 * Enforces GPS-based unlock conditions
 * 
 * NOTE: This feature will be fully implemented in a future release.
 * Currently, the service structure exists but frontend integration is pending.
 */

import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';
import { getErrorMessage } from '../types/common';

interface Location {
  latitude: number;
  longitude: number;
}

interface LocationUnlockConfig {
  capsuleId: string;
  requiredLocation: Location;
  radiusMeters: number; // Proximity radius in meters
}

class LocationUnlockService {
  /**
   * Calculate distance between two GPS coordinates (Haversine formula)
   */
  private calculateDistance(loc1: Location, loc2: Location): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(loc2.latitude - loc1.latitude);
    const dLon = this.toRadians(loc2.longitude - loc1.longitude);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(loc1.latitude)) * Math.cos(this.toRadians(loc2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Store location unlock configuration
   */
  async setLocationUnlock(config: LocationUnlockConfig): Promise<void> {
    try {
      const db = getDatabase();
      await db.execute(
        'INSERT INTO capsule_policies (capsule_id, policy_type, policy_id, policy_data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE policy_data = ?',
        [
          config.capsuleId,
          'location',
          `location_${config.capsuleId}`,
          JSON.stringify({
            requiredLocation: config.requiredLocation,
            radiusMeters: config.radiusMeters,
          }),
          JSON.stringify({
            requiredLocation: config.requiredLocation,
            radiusMeters: config.radiusMeters,
          }),
        ]
      );

      logger.info('Location unlock configured', { 
        capsuleId: config.capsuleId,
        location: config.requiredLocation,
        radius: config.radiusMeters,
      });
    } catch (error: unknown) {
      logger.error('Error setting location unlock', { error, config });
      throw new Error(`Failed to set location unlock: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if user location meets unlock requirements
   */
  async checkLocationUnlock(capsuleId: string, userLocation: Location): Promise<boolean> {
    try {
      const db = getDatabase();
      const [policyRows] = await db.execute(
        'SELECT policy_data FROM capsule_policies WHERE capsule_id = ? AND policy_type = ?',
        [capsuleId, 'location']
      ) as [any[], any];
      const policy = policyRows[0] as { policy_data: string } | undefined;

      if (!policy) {
        // No location requirement
        return true;
      }

      const config = JSON.parse(policy.policy_data) as {
        requiredLocation: Location;
        radiusMeters: number;
      };

      const distance = this.calculateDistance(userLocation, config.requiredLocation);
      const isWithinRadius = distance <= config.radiusMeters;

      logger.info('Location unlock check', {
        capsuleId,
        userLocation,
        requiredLocation: config.requiredLocation,
        distance,
        radius: config.radiusMeters,
        allowed: isWithinRadius,
      });

      return isWithinRadius;
    } catch (error: unknown) {
      logger.error('Error checking location unlock', { error, capsuleId });
      return false;
    }
  }
}

export default LocationUnlockService;

