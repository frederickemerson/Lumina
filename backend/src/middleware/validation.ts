/**
 * Input Validation Middleware
 * Uses Zod for schema validation
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Validate request body against Zod schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        logger.warn('Validation error', { errors: zodError.issues, path: req.path });
        res.status(400).json({
          error: 'Validation failed',
          details: zodError.issues.map((e: z.ZodIssue) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        logger.error('Unexpected validation error', { error });
        res.status(500).json({ error: 'Internal validation error' });
      }
    }
  };
}

/**
 * Validate request params against Zod schema
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as unknown as typeof req.params;
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        logger.warn('Params validation error', { errors: zodError.issues, path: req.path });
        res.status(400).json({
          error: 'Invalid parameters',
          details: zodError.issues.map((e: z.ZodIssue) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        logger.error('Unexpected params validation error', { error });
        res.status(500).json({ error: 'Internal validation error' });
      }
    }
  };
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as unknown as typeof req.query;
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        const zodError = error as z.ZodError;
        logger.warn('Query validation error', { errors: zodError.issues, path: req.path });
        res.status(400).json({
          error: 'Invalid query parameters',
          details: zodError.issues.map((e: z.ZodIssue) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        logger.error('Unexpected query validation error', { error });
        res.status(500).json({ error: 'Internal validation error' });
      }
    }
  };
}

// Common validation schemas
export const schemas = {
  // Accept capsule ID with or without 0x prefix (64 hex chars)
  capsuleId: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid capsule ID format'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid user address format'),
  secretPhrase: z.string().min(8, 'Secret phrase must be at least 8 characters').max(128, 'Secret phrase too long'),
  fileSize: z.number().max(1024 * 1024 * 1024, 'File size exceeds 1GB limit'), // 1GB
  unlockYear: z.number().int().min(2025).max(2100),
  description: z.string().max(1000, 'Description too long').optional(),
  tags: z.array(z.string()).max(20, 'Too many tags').optional(),
};
