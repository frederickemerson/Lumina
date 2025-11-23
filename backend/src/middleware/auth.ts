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
 * DISABLED - No authentication required
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Authentication completely disabled - just pass through
  (req as AuthenticatedRequest).authenticated = false;
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
 * DISABLED - No authentication required
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Authentication completely disabled - just pass through
  (req as AuthenticatedRequest).authenticated = false;
  next();
}

