/**
 * Audit Logging Middleware
 * Logs all sensitive operations for security and compliance
 */

import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database';
import { logger } from '../utils/logger';
import { sanitizeAddress } from '../utils/sanitize';

interface AuditLogData {
  userAddress?: string;
  action: string;
  resourceId?: string;
  ipAddress?: string;
  success: boolean;
}

/**
 * Log audit event to database
 */
export async function logAuditEvent(data: AuditLogData): Promise<void> {
  try {
    const db = getDatabase();
    await db.execute(
      'INSERT INTO audit_logs (user_address, action, resource_id, ip_address, success) VALUES (?, ?, ?, ?, ?)',
      [
        data.userAddress || null,
        data.action,
        data.resourceId || null,
        data.ipAddress || null,
        data.success ? 1 : 0,
      ]
    );
  } catch (error) {
    logger.error('Failed to log audit event', { error, data });
  }
}

/**
 * Audit logging middleware
 * Automatically logs requests to sensitive endpoints
 */
export function auditLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  // Override res.send to capture response status
  res.send = function(body: unknown) {
    const success = res.statusCode >= 200 && res.statusCode < 400;
    
    // Determine action from route
    const action = getActionFromRoute(req.path, req.method);
    
    // Extract resource ID from params or body
    const resourceId = req.params.capsuleId || req.params.vaultId || req.body.capsuleId || req.body.vaultId;
    
    // Get user address
    const userAddress = req.headers['x-user-address'] 
      ? sanitizeAddress(req.headers['x-user-address'] as string)
      : undefined;

    // Log audit event
    if (action) {
      logAuditEvent({
        userAddress,
        action,
        resourceId,
        ipAddress: req.ip,
        success,
      }).catch(err => logger.error('Failed to log audit event', { error: err }));
    }

    // Call original send
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Determine audit action from route and method
 */
function getActionFromRoute(path: string, method: string): string | null {
  // Capsule operations
  if (path.includes('/capsule/upload')) return 'capsule.create';
  if (path.includes('/capsule/') && path.includes('/unlock')) return 'capsule.unlock';
  if (path.includes('/capsule/public/unlock')) return 'capsule.unlock.public';
  if (path.includes('/capsule/') && path.includes('/generate-unlock-code')) return 'capsule.generate_unlock_code';
  if (path.includes('/capsule/') && path.includes('/vote')) return 'capsule.vote';
  
  // Evidence operations
  if (path.includes('/evidence/upload')) return 'evidence.upload';
  if (path.includes('/evidence/') && method === 'GET') return 'evidence.retrieve';
  
  // Dead man switch operations
  if (path.includes('/dead-man-switch/create')) return 'switch.create';
  if (path.includes('/dead-man-switch/check-in')) return 'switch.check_in';
  
  // ZK proof operations
  if (path.includes('/zk/generate')) return 'zk_proof.generate';
  if (path.includes('/zk/verify')) return 'zk_proof.verify';

  return null;
}

/**
 * Manual audit log helper for custom events
 */
export function auditLog(action: string, req: Request, success: boolean, resourceId?: string): void {
  const userAddress = req.headers['x-user-address'] 
    ? sanitizeAddress(req.headers['x-user-address'] as string)
    : undefined;

  logAuditEvent({
    userAddress,
    action,
    resourceId,
    ipAddress: req.ip,
    success,
  }).catch(err => logger.error('Failed to log audit event', { error: err }));
}

