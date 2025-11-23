/**
 * Centralized API Client
 * All API calls go through this service with standardized error handling
 */

import axios, { AxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorResponse } from '../types/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Create axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 0, // No timeout
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies for CSRF token
});

// Wallet auth disabled - no signing required

// CSRF token cache
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

/**
 * Invalidate CSRF token cache (call after successful state-changing request)
 */
function invalidateCsrfToken(): void {
  csrfToken = null;
  csrfTokenPromise = null;
}

/**
 * Set wallet signer function (disabled - no wallet auth required)
 */
export function setWalletSigner(
  _signer: ((method: string, path: string) => Promise<Record<string, string> | null>) | null
) {
  // Wallet auth disabled - no-op
}

/**
 * Fetch CSRF token from server
 */
async function fetchCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  if (csrfTokenPromise) {
    return csrfTokenPromise;
  }

  csrfTokenPromise = apiClient
    .get<{ success: boolean; token: string }>('/api/csrf-token')
    .then((response) => {
      if (response.data.success && response.data.token) {
        csrfToken = response.data.token;
        return csrfToken;
      }
      throw new Error('Failed to get CSRF token');
    })
    .catch((error) => {
      csrfTokenPromise = null;
      throw error;
    });

  return csrfTokenPromise;
}

/**
 * Request interceptor - add API key and wallet signature if available
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Add API key if available
    const apiKey = import.meta.env.VITE_API_KEY;
    if (apiKey) {
      config.headers['X-API-Key'] = apiKey;
    }

    // Add CSRF token for state-changing requests
    const protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (protectedMethods.includes(config.method?.toUpperCase() || '') && !config.url?.includes('/public/')) {
      try {
        const token = await fetchCsrfToken();
        config.headers['X-CSRF-Token'] = token;
      } catch (error) {
        // If CSRF token fetch fails, continue (backend will reject if required)
        console.warn('Failed to fetch CSRF token', error);
      }
    }


    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handle errors consistently
 */
apiClient.interceptors.response.use(
  (response) => {
    // Invalidate CSRF token after successful state-changing requests
    // This ensures we get a fresh token for the next request
    const method = response.config.method?.toUpperCase();
    if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      invalidateCsrfToken();
    }
    return response;
  },
  (error: AxiosError<ApiErrorResponse>) => {
    // If CSRF token error, invalidate cache and allow retry
    if (error.response?.status === 403) {
      const errorData = error.response?.data;
      if (errorData?.message?.includes('CSRF')) {
        invalidateCsrfToken();
      }
    }
    
    // Extract error message from response
    const errorData = error.response?.data;
    const errorMessage = errorData?.error || errorData?.message || error.message || 'Unknown error';
    const errorDetails = errorData?.details;
    
    // Create enhanced error with details
    const enhancedError = new Error(errorMessage);
    (enhancedError as Error & { details?: unknown; statusCode?: number; retryable?: boolean }).details = errorDetails;
    (enhancedError as Error & { statusCode?: number }).statusCode = error.response?.status;
    (enhancedError as Error & { retryable?: boolean }).retryable = Boolean((errorData as { retryable?: boolean })?.retryable);
    
    return Promise.reject(enhancedError);
  }
);

/**
 * Extract error message from unknown error
 */
export function getApiErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'retryable' in error) {
    return Boolean((error as { retryable?: boolean }).retryable);
  }
  if (error instanceof Error && 'statusCode' in error) {
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    // Retry on 5xx errors and 429 (rate limit)
    return statusCode !== undefined && (statusCode >= 500 || statusCode === 429);
  }
  return false;
}

export default apiClient;

