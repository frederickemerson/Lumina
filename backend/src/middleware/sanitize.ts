/**
 * Input Sanitization Middleware
 * Sanitizes user inputs to prevent XSS and injection attacks
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Sanitize string input
 * Removes potentially dangerous characters and normalizes whitespace
 */
function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return String(input);
  }

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Normalize whitespace (but preserve intentional spaces)
  sanitized = sanitized.trim();

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Sanitize object recursively
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize file name
 * Removes path traversal attempts and dangerous characters
 */
export function sanitizeFileName(fileName: string): string {
  if (typeof fileName !== 'string') {
    return 'file';
  }

  // Remove path separators and dangerous characters
  let sanitized = fileName
    .replace(/[\/\\]/g, '') // Remove path separators
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*\x00-\x1F]/g, '') // Remove invalid filename characters
    .trim();

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    sanitized = sanitized.substring(0, 255 - ext.length) + ext;
  }

  // Ensure it's not empty
  if (!sanitized) {
    sanitized = 'file';
  }

  return sanitized;
}

/**
 * Sanitize request body
 */
export function sanitizeBody(req: Request, res: Response, next: NextFunction): void {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body) as typeof req.body;
    }
    next();
  } catch (error) {
    logger.error('Error sanitizing request body', { error, path: req.path });
    res.status(400).json({ error: 'Invalid request data' });
  }
}

/**
 * Sanitize query parameters
 */
export function sanitizeQuery(req: Request, res: Response, next: NextFunction): void {
  try {
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query) as typeof req.query;
    }
    next();
  } catch (error) {
    logger.error('Error sanitizing query parameters', { error, path: req.path });
    res.status(400).json({ error: 'Invalid query parameters' });
  }
}

/**
 * Sanitize URL parameters
 */
export function sanitizeParams(req: Request, res: Response, next: NextFunction): void {
  try {
    if (req.params && typeof req.params === 'object') {
      const sanitized: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.params)) {
        if (typeof value === 'string') {
          sanitized[key] = sanitizeString(value);
        } else {
          sanitized[key] = String(value);
        }
      }
      req.params = sanitized as typeof req.params;
    }
    next();
  } catch (error) {
    logger.error('Error sanitizing URL parameters', { error, path: req.path });
    res.status(400).json({ error: 'Invalid URL parameters' });
  }
}

/**
 * Combined sanitization middleware
 * Sanitizes body, query, and params
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  sanitizeParams(req, res, () => {
    sanitizeQuery(req, res, () => {
      sanitizeBody(req, res, next);
    });
  });
}

