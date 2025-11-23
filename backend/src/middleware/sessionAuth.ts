/**
 * Session-based Authentication Middleware
 * Allows users to sign once and use a session token for subsequent requests
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';
import { walletAuth, WalletAuthenticatedRequest } from './walletAuth';

export interface SessionAuthenticatedRequest extends Request {
  walletAddress?: string;
  walletAuthenticated?: boolean;
  sessionAuthenticated?: boolean;
}

interface Session {
  address: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TOKEN_HEADER = 'X-Session-Token';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// In-memory session store
const sessions: Map<string, Session> = new Map();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(token);
    }
  }
}, SESSION_CLEANUP_INTERVAL_MS);

/**
 * Create a new session token
 */
export function createSession(address: string): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  
  sessions.set(token, {
    address,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  });
  
  logger.debug('Session created', { address, token: token.substring(0, 8) + '...' });
  return token;
}

/**
 * Verify and get session
 */
export function getSession(token: string): Session | null {
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  
  return session;
}

/**
 * Invalidate a session
 */
export function invalidateSession(token: string): void {
  sessions.delete(token);
}

/**
 * Invalidate all sessions for an address
 */
export function invalidateSessionsForAddress(address: string): void {
  for (const [token, session] of sessions.entries()) {
    if (session.address.toLowerCase() === address.toLowerCase()) {
      sessions.delete(token);
    }
  }
}

/**
 * Session authentication middleware
 * Checks for session token first, falls back to wallet signature if no token
 */
export function sessionAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const sessionToken = req.headers[SESSION_TOKEN_HEADER.toLowerCase()] as string;
  
  // If session token is provided, verify it
  if (sessionToken) {
    const session = getSession(sessionToken);
    if (session) {
      (req as SessionAuthenticatedRequest).walletAddress = session.address;
      (req as SessionAuthenticatedRequest).walletAuthenticated = true;
      (req as SessionAuthenticatedRequest).sessionAuthenticated = true;
      return next();
    } else {
      // Invalid or expired session token - clear it and fall through to wallet auth
      logger.debug('Invalid or expired session token', { path: req.path });
    }
  }
  
  // No valid session token, require wallet signature
  // Use walletAuth middleware but modify it to create session on success
  const originalNext = next;
  const modifiedNext = (err?: any) => {
    if (!err && (req as WalletAuthenticatedRequest).walletAuthenticated) {
      const address = (req as WalletAuthenticatedRequest).walletAddress;
      if (address) {
        // Create session token for future requests
        const newToken = createSession(address);
        // Attach token to response header so frontend can save it
        res.setHeader('X-New-Session-Token', newToken);
      }
    }
    originalNext(err);
  };
  
  walletAuth(req, res, modifiedNext);
}

/**
 * Create session endpoint
 * POST /api/auth/session
 * Requires wallet signature, returns session token
 */
export function createSessionEndpoint(req: Request, res: Response): void {
  const walletReq = req as WalletAuthenticatedRequest;
  
  if (!walletReq.walletAuthenticated || !walletReq.walletAddress) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Wallet signature required to create session',
    });
    return;
  }
  
  const address = walletReq.walletAddress;
  const token = createSession(address);
  
  res.json({
    success: true,
    sessionToken: token,
    expiresAt: Date.now() + SESSION_DURATION_MS,
    address,
  });
}

/**
 * Invalidate session endpoint
 * POST /api/auth/session/invalidate
 */
export function invalidateSessionEndpoint(req: Request, res: Response): void {
  const sessionToken = req.headers[SESSION_TOKEN_HEADER.toLowerCase()] as string;
  
  if (sessionToken) {
    invalidateSession(sessionToken);
    res.json({
      success: true,
      message: 'Session invalidated',
    });
  } else {
    res.status(400).json({
      error: 'Missing session token',
    });
  }
}

