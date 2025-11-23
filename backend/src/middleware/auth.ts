/**
 * Authentication Middleware
 * Simple API key authentication for demo/prototype
 * 
 * Note: For production, use proper OAuth, JWT, or session-based auth
 */

import { Request, Response, NextFunction } from 'express';
export { walletAuth, optionalWalletAuth, WalletAuthenticatedRequest } from './walletAuth';

/**
 * Extended Request interface with authentication status
 */
export interface AuthenticatedRequest extends Request {
  authenticated?: boolean;
}

/**
 * API Key Authentication Middleware
 * Validates API key from header or query parameter
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Get API key from header or query parameter
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;
  const expectedApiKey = process.env.API_KEY;

  // If no API key configured, allow all requests (demo mode)
  if (!expectedApiKey) {
    // Silent mode - don't spam logs in demo mode
    return next();
  }

  // Validate API key
  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      details: 'Please provide a valid API key in the X-API-Key header or apiKey query parameter',
    });
    return;
  }

  next();
}

/**
 * Optional authentication - allows requests with or without API key
 * Useful for public endpoints that can have enhanced features with auth
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;
  const expectedApiKey = process.env.API_KEY;

  // Attach auth status to request for use in handlers
  (req as AuthenticatedRequest).authenticated = !!(expectedApiKey && apiKey === expectedApiKey);

  next();
}

/**
 * Require authentication - stricter than apiKeyAuth
 * Always requires valid API key (no demo mode fallback)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string;
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'API authentication is required but not configured',
      details: 'Please configure API_KEY environment variable',
    });
    return;
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
      details: 'Please provide a valid API key in the X-API-Key header or apiKey query parameter',
    });
    return;
  }

  (req as AuthenticatedRequest).authenticated = true;
  next();
}

