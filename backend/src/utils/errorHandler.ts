/**
 * Centralized error handling utilities
 */

import { AppError, ServiceError, ValidationError, NetworkError, isAppError } from '../types/errors';
import { getErrorMessage } from '../types/common';

/**
 * Handle service errors with proper typing
 */
export function handleServiceError(error: unknown, serviceName: string): ServiceError {
  const errorMessage = getErrorMessage(error);
  const retryable = errorMessage.includes('timeout') || errorMessage.includes('network') || errorMessage.includes('epoch');
  
  return new ServiceError(errorMessage, serviceName, error, retryable);
}

/**
 * Handle network errors with retry logic
 */
export function handleNetworkError(error: unknown, operation: string): NetworkError {
  const errorMessage = getErrorMessage(error);
  const retryable = !errorMessage.includes('401') && !errorMessage.includes('403') && !errorMessage.includes('404');
  
  return new NetworkError(`${operation}: ${errorMessage}`, error, retryable);
}

/**
 * Create standardized error response
 */
export function createErrorResponse(error: unknown): {
  error: string;
  details?: string;
  message?: string;
  code?: string;
  retryable?: boolean;
  timestamp: string;
} {
  if (isAppError(error)) {
    return {
      error: error.message,
      details: typeof error.details === 'string' ? error.details : JSON.stringify(error.details),
      code: error.code,
      retryable: error.retryable,
      timestamp: new Date().toISOString(),
    };
  }
  
  const errorMessage = getErrorMessage(error);
  return {
    error: 'Internal server error',
    details: errorMessage,
    message: errorMessage,
    timestamp: new Date().toISOString(),
  };
}

