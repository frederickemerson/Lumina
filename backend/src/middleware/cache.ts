/**
 * Caching Middleware
 * Uses node-cache for in-memory caching
 */

import { Request, Response, NextFunction } from 'express';
import NodeCache from 'node-cache';
import { logger } from '../utils/logger';

// Create cache instance with default TTL
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default TTL
  checkperiod: 60, // Check for expired keys every minute
  useClones: false, // Don't clone values (faster)
});

/**
 * Cache middleware for GET requests
 * Caches responses based on URL and query parameters
 */
export function cacheMiddleware(ttlSeconds: number = 300) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    // Generate cache key from URL and query params
    const cacheKey = `${req.path}:${JSON.stringify(req.query)}`;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      logger.debug('Cache hit', { path: req.path, cacheKey });
      res.setHeader('X-Cache', 'HIT');
      res.json(cached);
      return;
    }

    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = function(body: unknown) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache.set(cacheKey, body, ttlSeconds);
        logger.debug('Cache set', { path: req.path, cacheKey, ttl: ttlSeconds });
        res.setHeader('X-Cache', 'MISS');
      }
      originalJson(body);
      return res;
    };

    next();
  };
}

/**
 * Clear cache for a specific pattern
 */
export function clearCache(pattern: string): void {
  const keys = cache.keys();
  const regex = new RegExp(pattern);
  let cleared = 0;
  
  keys.forEach(key => {
    if (regex.test(key)) {
      cache.del(key);
      cleared++;
    }
  });
  
  logger.info('Cache cleared', { pattern, cleared });
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  cache.flushAll();
  logger.info('All cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return cache.getStats();
}

// Pre-configured cache middleware for different endpoints
export const cacheConfigs = {
  capsuleMetadata: cacheMiddleware(5 * 60), // 5 minutes
  publicUnlockStatus: cacheMiddleware(60), // 1 minute
  userCapsuleList: cacheMiddleware(2 * 60), // 2 minutes
};

