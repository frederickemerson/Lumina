/**
 * API response types
 */

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  details?: string;
  message?: string;
  timestamp?: string;
}

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: boolean;
  data?: T;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * API request configuration
 */
export interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

