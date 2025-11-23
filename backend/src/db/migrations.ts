/**
 * Database Migration System
 * Simple migration system for schema changes
 */

import { getDatabase } from './database';
import { logger } from '../utils/logger';

interface Migration {
  version: number;
  name: string;
  up: (db: ReturnType<typeof getDatabase>) => Promise<void>;
  down?: (db: ReturnType<typeof getDatabase>) => Promise<void>;
}

// Define migrations in order
const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      // Initial schema is created in database.ts initializeDatabase()
      // This migration is a placeholder for future migrations
      logger.info('Migration 1: Initial schema (already applied)');
    },
  },
  {
    version: 2,
    name: 'add_capsule_tables',
    up: async (db) => {
      // Add capsule_unlock_codes, capsule_messages, audit_logs tables
      // These are already created in database.ts, so this is a no-op
      // But we track it for migration history
      logger.info('Migration 2: Capsule tables (already applied)');
    },
  },
];

/**
 * Get current migration version from database
 */
async function getCurrentVersion(db: ReturnType<typeof getDatabase>): Promise<number> {
  try {
    const [rows] = await db.execute(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
    ) as [any[], any];
    const result = rows[0] as { version: number } | undefined;
    return result?.version || 0;
  } catch (error) {
    // Table doesn't exist, create it
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return 0;
  }
}

/**
 * Record migration in database
 */
async function recordMigration(db: ReturnType<typeof getDatabase>, migration: Migration): Promise<void> {
  await db.execute(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
    [migration.version, migration.name]
  );
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  const db = getDatabase();
  const currentVersion = await getCurrentVersion(db);
  
  logger.info('Running migrations', { currentVersion, totalMigrations: migrations.length });

  const pendingMigrations = migrations.filter(m => m.version > currentVersion);
  
  if (pendingMigrations.length === 0) {
    logger.info('No pending migrations');
    return;
  }

  // Run migrations in order
  for (const migration of pendingMigrations) {
    try {
      logger.info(`Running migration ${migration.version}: ${migration.name}`);
      await migration.up(db);
      await recordMigration(db, migration);
      logger.info(`Migration ${migration.version} completed`);
    } catch (error) {
      logger.error(`Migration ${migration.version} failed`, { error, migration: migration.name });
      throw error;
    }
  }

  logger.info('All migrations completed', { applied: pendingMigrations.length });
}

/**
 * Rollback last migration (if supported)
 */
export async function rollbackLastMigration(): Promise<void> {
  const db = getDatabase();
  const currentVersion = await getCurrentVersion(db);
  
  if (currentVersion === 0) {
    logger.warn('No migrations to rollback');
    return;
  }

  const lastMigration = migrations.find(m => m.version === currentVersion);
  if (!lastMigration || !lastMigration.down) {
    logger.warn(`Migration ${currentVersion} does not support rollback`);
    return;
  }

  try {
    logger.info(`Rolling back migration ${currentVersion}: ${lastMigration.name}`);
    if (lastMigration.down) {
      await lastMigration.down(db);
    }
    
    // Remove migration record
    await db.execute(
      'DELETE FROM schema_migrations WHERE version = ?',
      [currentVersion]
    );
    
    logger.info(`Migration ${currentVersion} rolled back`);
  } catch (error) {
    logger.error(`Rollback failed`, { error, migration: lastMigration.name });
    throw error;
  }
}

