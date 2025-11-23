/**
 * Lumina Backend Server
 * Main Express server for Lumina API
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { metricsMiddleware, getMetricsHandler } from './middleware/metrics';
import { rateLimitMiddleware, securityHeadersMiddleware } from './middleware/security';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { getDatabase } from './db/database';
import { SuiClient } from '@mysten/sui.js/client';
import { sanitizeInput } from './middleware/sanitize';
import { csrfProtection, generateCsrfToken } from './middleware/csrf';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-CSRF-Token',
    'x-user-address',
    'x-wallet-signature',
    'x-wallet-message',
    'x-wallet-nonce',
    'x-wallet-timestamp',
  ],
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers (CSP, HSTS, etc.)
app.use(securityHeadersMiddleware);

// Rate limiting (100 requests per 15 minutes per IP, per-endpoint tracking enabled)
app.use(rateLimitMiddleware(15 * 60 * 1000, 100, true));

// Metrics middleware (collects performance and error metrics)
app.use(metricsMiddleware);

// Health check endpoint
app.get('/health', async (req, res) => {
  const health: {
    status: 'ok' | 'degraded' | 'down';
    timestamp: string;
    service: string;
    checks: {
      database: 'ok' | 'error';
      suiClient: 'ok' | 'error';
      walrus: 'ok' | 'error' | 'not_configured';
      seal: 'ok' | 'error' | 'not_configured';
    };
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'lumina-backend',
    checks: {
      database: 'ok',
      suiClient: 'ok',
      walrus: 'not_configured',
      seal: 'not_configured',
    },
  };

  try {
    // Check database
    try {
      const db = getDatabase();
      await db.execute('SELECT 1');
      health.checks.database = 'ok';
    } catch (error) {
      logger.error('Database health check failed', { error });
      health.checks.database = 'error';
      health.status = 'degraded';
    }

    // Check Sui client
    try {
      const fullnodeUrl = process.env.SUI_FULLNODE_URL || 'https://fullnode.testnet.sui.io:443';
      const suiClient = new SuiClient({ url: fullnodeUrl });
      await suiClient.getLatestSuiSystemState();
      health.checks.suiClient = 'ok';
    } catch (error) {
      logger.error('Sui client health check failed', { error });
      health.checks.suiClient = 'error';
      health.status = 'degraded';
    }

        // Check Walrus (if configured)
        if (process.env.WALRUS_SERVICE_KEYPAIR) {
          try {
            const walrusModule = await import('./services/walrus');
            if (walrusModule.default) {
              health.checks.walrus = 'ok';
            }
          } catch (error) {
            logger.warn('Walrus service check failed', { error });
            health.checks.walrus = 'error';
          }
        } else {
          health.checks.walrus = 'not_configured';
        }

        // Check Seal Protocol (if configured)
        if (process.env.SEAL_PACKAGE_ID || process.env.SUI_NETWORK) {
          try {
            const sealModule = await import('./services/seal');
            const isConnected = await sealModule.getSealService().verifyConnectivity('health');
            health.checks.seal = isConnected ? 'ok' : 'error';
          } catch (error) {
            logger.warn('Seal Protocol service check failed', { error });
            health.checks.seal = 'error';
          }
        } else {
          health.checks.seal = 'not_configured';
        }

    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', { error });
    health.status = 'down';
    res.status(503).json(health);
  }
});

// Metrics endpoint (for monitoring)
app.get('/metrics', getMetricsHandler);

// CSRF token endpoint (before CSRF protection)
app.get('/api/csrf-token', generateCsrfToken);

// Input sanitization middleware (apply to all routes)
app.use(sanitizeInput);

// CSRF protection (apply to all routes)
app.use(csrfProtection);

// API routes
import evidenceRouter from './api/evidence';
import capsuleRouter from './api/capsule';
import notificationsRouter from './api/notifications';

app.use('/api/evidence', evidenceRouter);
app.use('/api/capsule', capsuleRouter);
app.use('/api/notifications', notificationsRouter);

// Error handling middleware (must be last)
app.use(errorHandlerMiddleware);

// Create HTTP server for graceful shutdown
let server: ReturnType<typeof app.listen> | null = null;

// Import AR sync service
import ARSyncService from './services/arSync';
const arSyncService = new ARSyncService();

// Import Timed NFT service
import { getTimedNFTService } from './services/timedNFTService';
const timedNFTService = getTimedNFTService();

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      
          // Stop services
      arSyncService.stop();
      timedNFTService.stop();
      
      // Close database connections
          try {
            import('./db/database').then((dbModule) => {
              if (dbModule.closeDatabase) {
                dbModule.closeDatabase();
                logger.info('Database connections closed');
              }
            }).catch((error) => {
              logger.error('Error closing database', { error });
            });
          } catch (error) {
            logger.error('Error closing database', { error });
          }
      
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
  // Don't exit on unhandled rejection, just log it
});

// Start AR sync WebSocket server

if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  const arSyncPort = parseInt(process.env.AR_SYNC_PORT || '8080');
  arSyncService.start(arSyncPort);
  
  // Start Timed NFT service (daily cron job for unlocking NFTs)
  timedNFTService.start();
  
  // Start checking for upcoming unlocks (for advance notifications)
  timedNFTService.startUpcomingUnlockChecks();
}

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  server = app.listen(PORT, () => {
    logger.info('Lumina backend server started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      healthCheck: `http://localhost:${PORT}/health`,
      arSyncPort: process.env.AR_SYNC_PORT || '8080',
    });
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down gracefully');
    arSyncService.stop();
    timedNFTService.stop();
    if (server) {
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;


