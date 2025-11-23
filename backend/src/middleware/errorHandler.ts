/**
 * Centralized error handling middleware
 * Catches all errors and returns structured responses
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, isAppError, ErrorCode } from '../types/errors';
import { createErrorResponse } from '../utils/errorHandler';
import { getErrorMessage } from '../types/common';
import { logger } from '../utils/logger';

/**
 * Error handling middleware
 * Must be added after all routes
 */
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Don't call next() if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Handle AppError instances
  if (isAppError(err)) {
    const errorResponse = createErrorResponse(err);
    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle validation errors (from express-validator or zod)
  const errorMessage = getErrorMessage(err);
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    res.status(400).json({
      error: 'Validation error',
      details: errorMessage,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Handle unknown errors
  logger.error('Unhandled error', {
    error: err,
    path: req.path,
    method: req.method,
  }, err instanceof Error ? err : undefined);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : errorMessage,
    timestamp: new Date().toISOString(),
  });
}

