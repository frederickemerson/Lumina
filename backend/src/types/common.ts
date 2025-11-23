/**
 * Common type definitions and utilities
 */

/**
 * Error with message property
 */
export interface ErrorWithMessage {
  message: string;
  constructor?: {
    name?: string;
  };
}

/**
 * Type guard to check if error has message
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ErrorWithMessage).message === 'string'
  );
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!isErrorWithMessage(error)) {
    return false;
  }
  
  const errorName = error.constructor?.name || '';
  const errorMessage = error.message || '';
  
  return (
    errorName.includes('Retryable') ||
    errorMessage.includes('epoch') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('network')
  );
}

