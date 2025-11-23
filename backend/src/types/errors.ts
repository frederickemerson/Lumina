/**
 * Structured error types for Lumina backend
 * Provides type-safe error handling throughout the application
 */

/**
 * Error codes enum
 */
export enum ErrorCode {
  // Service errors (500-599)
  SERVICE_ERROR = 'SERVICE_ERROR',
  WALRUS_ERROR = 'WALRUS_ERROR',
  SEAL_ERROR = 'SEAL_ERROR',
  ZK_ERROR = 'ZK_ERROR',
  
  // Validation errors (400-499)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  
  // Network errors (500-599)
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  
  // Authentication errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  
  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',
  EVIDENCE_NOT_FOUND = 'EVIDENCE_NOT_FOUND',
  SWITCH_NOT_FOUND = 'SWITCH_NOT_FOUND',
  
  // Whistleblower platform errors
  CHECK_IN_FAILED = 'CHECK_IN_FAILED',
  RELEASE_FAILED = 'RELEASE_FAILED',
  
  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: unknown,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.retryable = retryable;
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Service error - errors from external services
 */
export class ServiceError extends AppError {
  constructor(
    message: string,
    service: string,
    details?: unknown,
    retryable: boolean = false
  ) {
    const code = getServiceErrorCode(service);
    super(
      `${service} error: ${message}`,
      code,
      503, // Service Unavailable
      details,
      retryable
    );
  }
}

/**
 * Validation error - invalid input
 */
export class ValidationError extends AppError {
  constructor(message: string, field?: string, details?: unknown) {
    super(
      field ? `Validation error for ${field}: ${message}` : `Validation error: ${message}`,
      ErrorCode.VALIDATION_ERROR,
      400, // Bad Request
      details,
      false
    );
  }
}

/**
 * Network error - network/timeout issues
 */
export class NetworkError extends AppError {
  constructor(message: string, details?: unknown, retryable: boolean = true) {
    super(
      `Network error: ${message}`,
      ErrorCode.NETWORK_ERROR,
      504, // Gateway Timeout
      details,
      retryable
    );
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(
      message,
      ErrorCode.UNAUTHORIZED,
      401, // Unauthorized
      undefined,
      false
    );
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(
      message,
      ErrorCode.NOT_FOUND,
      404, // Not Found
      { resource, id },
      false
    );
  }
}

/**
 * Type guard to check if error is AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get service error code from service name
 */
function getServiceErrorCode(service: string): ErrorCode {
  const serviceUpper = service.toUpperCase();
  if (serviceUpper.includes('WALRUS')) return ErrorCode.WALRUS_ERROR;
  if (serviceUpper.includes('SEAL')) return ErrorCode.SEAL_ERROR;
  if (serviceUpper.includes('ZK') || serviceUpper.includes('PROOF')) return ErrorCode.ZK_ERROR;
  return ErrorCode.SERVICE_ERROR;
}

