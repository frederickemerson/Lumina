/**
 * Retry utility with exponential backoff
 * Handles retryable errors with configurable attempts and delays
 */

import { isRetryableError } from '../types/common';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number; // milliseconds
  maxDelay?: number; // milliseconds
  backoffMultiplier?: number;
  retryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryable: isRetryableError,
};

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const retryable = config.retryable || isRetryableError;
  
  let lastError: unknown;
  let delay = config.initialDelay;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      
      // Don't retry if error is not retryable
      if (!retryable(error)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        break;
      }
      
      // Wait before retrying (exponential backoff)
      await sleep(delay);
      
      // Increase delay for next retry (capped at maxDelay)
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
      
      // Log retry attempt (logger will be imported by services using retry)
    }
  }
  
  throw lastError;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

