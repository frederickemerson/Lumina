/**
 * CSRF Protection Middleware
 * Generates and validates CSRF tokens for state-changing requests
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';

const CSRF_TOKEN_HEADER = 'X-CSRF-Token';
const CSRF_TOKEN_COOKIE = 'csrf-token';
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

// In-memory token store
interface TokenStore {
  [token: string]: {
    expiresAt: number;
    used: boolean;
  };
}

const tokenStore: TokenStore = {};

// Clean up expired tokens every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of Object.entries(tokenStore)) {
    if (entry.expiresAt < now) {
      delete tokenStore[token];
    }
  }
}, 60 * 60 * 1000);

/**
 * Generate a CSRF token
 */
function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Store CSRF token (in-memory)
 */
function storeToken(token: string, expiresIn: number): void {
  const expiresAt = Date.now() + expiresIn * 1000;
  tokenStore[token] = {
    expiresAt,
    used: false,
  };
}

/**
 * Verify CSRF token
 */
function verifyToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const entry = tokenStore[token];
  if (!entry) {
    return false;
  }

  if (entry.expiresAt < Date.now()) {
    delete tokenStore[token];
    return false;
  }

  if (entry.used) {
    return false;
  }

  // Mark as used
  entry.used = true;
  return true;
}

/**
 * Generate and return CSRF token
 * GET /api/csrf-token
 */
export function generateCsrfToken(req: Request, res: Response): void {
  const token = generateToken();
  const expiresIn = CSRF_TOKEN_EXPIRY;

  storeToken(token, expiresIn);

  // Set cookie
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: expiresIn * 1000,
  });

  // Also return in response for clients that don't use cookies
  res.json({
    success: true,
    token,
    expiresIn,
  });
}

/**
 * CSRF protection middleware
 * Validates CSRF token on state-changing requests
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Only protect state-changing methods
  const protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!protectedMethods.includes(req.method)) {
    return next();
  }

  // Skip CSRF for public endpoints
  if (req.path.includes('/public/')) {
    return next();
  }

  // Get token from header or cookie
  const token = (req.headers[CSRF_TOKEN_HEADER.toLowerCase()] as string) || req.cookies?.[CSRF_TOKEN_COOKIE];

  if (!token) {
    logger.warn('CSRF token missing', { path: req.path, method: req.method });
    res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF token missing',
      details: 'Please include X-CSRF-Token header or csrf-token cookie',
    });
    return;
  }

  const isValid = verifyToken(token);
  if (!isValid) {
    logger.warn('Invalid CSRF token', { path: req.path, method: req.method });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or expired CSRF token',
      details: 'Please request a new CSRF token',
    });
    return;
  }

  next();
}

