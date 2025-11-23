/**
 * Network Health Check Utility
 * Tests connectivity to external services (Sui fullnode, Walrus, etc.)
 */

import { SuiClient } from '@mysten/sui/client';
import { logger } from './logger';

interface HealthCheckResult {
  service: string;
  healthy: boolean;
  latency?: number;
  error?: string;
  url?: string;
}

/**
 * Test Sui fullnode connectivity
 */
export async function checkSuiFullnode(url: string): Promise<HealthCheckResult> {
  const startTime = Date.now();
  try {
    const client = new SuiClient({ url });
    // Simple health check - get chain identifier
    await client.getChainIdentifier();
    const latency = Date.now() - startTime;
    
    return {
      service: 'Sui Fullnode',
      healthy: true,
      latency,
      url,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      service: 'Sui Fullnode',
      healthy: false,
      error: errorMessage,
      url,
      latency: Date.now() - startTime,
    };
  }
}

/**
 * Test multiple Sui fullnode URLs and return the fastest healthy one
 */
export async function findBestFullnode(
  urls: string[] = [
    'https://fullnode.testnet.sui.io:443',
    'https://sui-testnet-endpoint.blockvision.org',
    'https://testnet.suiet.app',
  ]
): Promise<string | null> {
  logger.info('Testing Sui fullnode connectivity', { urls });
  
  const results = await Promise.allSettled(
    urls.map(url => checkSuiFullnode(url))
  );
  
  const healthy: Array<{ url: string; latency: number }> = [];
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value.healthy) {
      healthy.push({
        url: urls[i],
        latency: result.value.latency || 9999,
      });
    }
  }
  
  if (healthy.length === 0) {
    logger.error('No healthy Sui fullnodes found', { urls });
    return null;
  }
  
  // Sort by latency and return the fastest
  healthy.sort((a, b) => a.latency - b.latency);
  const best = healthy[0];
  
  logger.info('Best Sui fullnode selected', { 
    url: best.url, 
    latency: best.latency,
    alternatives: healthy.length - 1 
  });
  
  return best.url;
}

/**
 * Perform comprehensive health check
 */
export async function performHealthCheck(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  // Check primary fullnode
  const primaryUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
  const primaryCheck = await checkSuiFullnode(primaryUrl);
  results.push(primaryCheck);
  
  if (!primaryCheck.healthy) {
    logger.warn('Primary Sui fullnode is unhealthy, testing alternatives', { url: primaryUrl });
    const alternativeUrl = await findBestFullnode();
    if (alternativeUrl && alternativeUrl !== primaryUrl) {
      results.push({
        service: 'Sui Fullnode (Alternative)',
        healthy: true,
        url: alternativeUrl,
        latency: 0,
      });
    }
  }
  
  return results;
}

