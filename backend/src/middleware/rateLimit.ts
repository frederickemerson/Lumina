/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Rate limiter for public unlock endpoint
 * 5 attempts per IP per 15 minutes
 */
export const publicUnlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many unlock attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded for public unlock', { ip: req.ip });
    res.status(429).json({
      error: 'Too many unlock attempts',
      message: 'Please try again in 15 minutes.',
    });
  },
});

/**
 * Rate limiter for general API endpoints
 * 100 requests per IP per minute
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded for API', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please slow down and try again in a minute.',
    });
  },
});

/**
 * Rate limiter for file uploads
 * 10 uploads per user per hour
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 uploads per hour
  message: 'Too many uploads. Please try again in an hour.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Use user address if available, otherwise IP
    const userAddress = req.headers['x-user-address'] as string | undefined;
    if (userAddress) {
      return userAddress.toLowerCase();
    }
    const ip = req.ip || req.socket.remoteAddress || '';
    return ipKeyGenerator(ip);
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded for uploads', { 
      ip: req.ip, 
      userAddress: req.headers['x-user-address'],
    });
    res.status(429).json({
      error: 'Too many uploads',
      message: 'Please try again in an hour.',
    });
  },
});

