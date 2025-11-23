/**
 * Security Middleware
 * Rate limiting and security headers (CSP, etc.)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Rate limiting: in-memory store
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach((key) => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * Limits requests per IP address and endpoint
 * Uses in-memory store
 * Supports per-endpoint limits for stricter write operation limits
 */
export function rateLimitMiddleware(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100, // 100 requests per window
  perEndpoint?: boolean // If true, track per endpoint
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = perEndpoint ? req.path : 'global';
    const method = req.method;
    
    // Stricter limits for write operations
    const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const effectiveMaxRequests = isWriteOperation ? Math.floor(maxRequests * 0.5) : maxRequests; // 50% for writes
    
    const key = `rate_limit:${clientIp}:${endpoint}:${method}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    let entry = rateLimitStore[key];
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: resetTime,
      };
      rateLimitStore[key] = entry;
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > effectiveMaxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
        limit: effectiveMaxRequests,
        remaining: 0,
      });
      return;
    }

    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', effectiveMaxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, effectiveMaxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    next();
  };
}

/**
 * Security headers middleware
 * Adds Content Security Policy, HSTS, X-Frame-Options, etc.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Content Security Policy
  // Strict CSP without unsafe-inline/unsafe-eval in all environments
  // Use nonces for inline scripts if needed
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self'", // No unsafe-inline or unsafe-eval
    "style-src 'self' 'unsafe-inline'", // CSS can use inline (needed for React)
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://fullnode.testnet.sui.io https://walrus-rpc.testnet.walrus.space https://seal-key-server-testnet-*.mystenlabs.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);

  // HTTP Strict Transport Security (HSTS)
  // Only set in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS Protection (legacy, but still useful)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );

  next();
}

