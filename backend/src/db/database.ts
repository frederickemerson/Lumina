/**
 * Database Service
 * Uses MySQL for production-ready database
 */

import mysql from 'mysql2/promise';
import { logger } from '../utils/logger';

// MySQL connection configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'lumina',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Create connection pool
let pool: mysql.Pool | null = null;

/**
 * Get MySQL connection pool
 */
export function getDatabase(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    logger.info('MySQL connection pool created', { 
      host: dbConfig.host, 
      port: dbConfig.port, 
      database: dbConfig.database 
    });
  }
  return pool;
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(): Promise<void> {
  const db = getDatabase();
  
  try {
    // Vaults table - One vault per user, contains multiple memories
    await db.execute(`
      CREATE TABLE IF NOT EXISTS vaults (
        vault_id VARCHAR(255) PRIMARY KEY,
        user_address VARCHAR(255) NOT NULL UNIQUE,
        unlock_type VARCHAR(50) NOT NULL CHECK(unlock_type IN ('secret_phrase', 'timer', 'manual')),
        secret_phrase_hash TEXT,
        unlock_at DATETIME,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unlocked_at DATETIME,
        INDEX idx_user_address (user_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Evidence vaults table - Stores encrypted evidence metadata (now called memories)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS evidence_vaults (
        vault_id VARCHAR(255) PRIMARY KEY,
        user_vault_id VARCHAR(255) NOT NULL,
        user_address VARCHAR(255) NOT NULL,
        blob_id VARCHAR(255) NOT NULL,
        encrypted_data_id VARCHAR(255) NOT NULL,
        metadata_hash VARCHAR(255),
        file_size BIGINT,
        file_type VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        release_triggered_at DATETIME,
        FOREIGN KEY (user_vault_id) REFERENCES vaults(vault_id) ON DELETE CASCADE,
        INDEX idx_user_vault_id (user_vault_id),
        INDEX idx_user_address (user_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Dead-man's switches table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS dead_man_switches (
        switch_id VARCHAR(255) PRIMARY KEY,
        vault_id VARCHAR(255) NOT NULL UNIQUE,
        policy_id VARCHAR(255) NOT NULL,
        check_in_interval_hours INT NOT NULL,
        max_missed_checkins INT NOT NULL DEFAULT 3,
        trigger_conditions TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'triggered', 'disabled')),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_check_in DATETIME,
        next_check_in_due DATETIME NOT NULL,
        missed_checkins_count INT NOT NULL DEFAULT 0,
        FOREIGN KEY (vault_id) REFERENCES evidence_vaults(vault_id) ON DELETE CASCADE,
        INDEX idx_vault_id (vault_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Check-ins table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS check_ins (
        check_in_id VARCHAR(255) PRIMARY KEY,
        vault_id VARCHAR(255) NOT NULL,
        switch_id VARCHAR(255) NOT NULL,
        check_in_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        method VARCHAR(50) NOT NULL CHECK(method IN ('transaction', 'biometric', 'manual')),
        verified TINYINT(1) NOT NULL DEFAULT 1,
        attestation_id VARCHAR(255),
        FOREIGN KEY (vault_id) REFERENCES evidence_vaults(vault_id) ON DELETE CASCADE,
        FOREIGN KEY (switch_id) REFERENCES dead_man_switches(switch_id) ON DELETE CASCADE,
        INDEX idx_vault_id (vault_id),
        INDEX idx_switch_id (switch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ZK proofs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS zk_proofs (
        proof_id VARCHAR(255) PRIMARY KEY,
        vault_id VARCHAR(255) NOT NULL,
        claim_type VARCHAR(50) NOT NULL,
        claim_value TEXT NOT NULL,
        proof_data TEXT NOT NULL,
        verified TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        verified_at DATETIME,
        FOREIGN KEY (vault_id) REFERENCES evidence_vaults(vault_id) ON DELETE CASCADE,
        INDEX idx_vault_id (vault_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Release logs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS release_logs (
        log_id VARCHAR(255) PRIMARY KEY,
        vault_id VARCHAR(255) NOT NULL,
        switch_id VARCHAR(255),
        trigger_type VARCHAR(50) NOT NULL,
        trigger_data TEXT,
        released_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        recipient_address VARCHAR(255),
        FOREIGN KEY (vault_id) REFERENCES evidence_vaults(vault_id) ON DELETE CASCADE,
        INDEX idx_vault_id (vault_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule NFTs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_nfts (
        nft_id VARCHAR(255) PRIMARY KEY,
        capsule_id VARCHAR(255) NOT NULL UNIQUE,
        object_id VARCHAR(255) NOT NULL,
        owner_address VARCHAR(255) NOT NULL,
        metadata TEXT,
        unlock_at BIGINT DEFAULT 0,
        is_locked TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id),
        INDEX idx_owner_address (owner_address),
        INDEX idx_unlock_at (unlock_at),
        INDEX idx_is_locked (is_locked)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Add unlock_at and is_locked columns if they don't exist (for existing databases)
    try {
      const [columns] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'capsule_nfts' 
        AND COLUMN_NAME = 'unlock_at'
      `) as [any[], any];
      
      if (columns.length === 0) {
        await db.execute(`
          ALTER TABLE capsule_nfts 
          ADD COLUMN unlock_at BIGINT DEFAULT 0
        `);
        logger.info('Added unlock_at column to capsule_nfts');
      }
    } catch (error: any) {
      logger.warn('Failed to add unlock_at column', { error });
    }
    
    try {
      const [columns] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'capsule_nfts' 
        AND COLUMN_NAME = 'is_locked'
      `) as [any[], any];
      
      if (columns.length === 0) {
        await db.execute(`
          ALTER TABLE capsule_nfts 
          ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0
        `);
        logger.info('Added is_locked column to capsule_nfts');
      }
    } catch (error: any) {
      logger.warn('Failed to add is_locked column', { error });
    }
    
    // Add indexes if they don't exist
    try {
      const [indexes] = await db.execute(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'capsule_nfts' 
        AND INDEX_NAME = 'idx_unlock_at'
      `) as [any[], any];
      
      if (indexes.length === 0) {
        await db.execute(`
          CREATE INDEX idx_unlock_at ON capsule_nfts(unlock_at)
        `);
        logger.info('Created idx_unlock_at index');
      }
    } catch (error: any) {
      logger.debug('Index idx_unlock_at might already exist', { error });
    }
    
    try {
      const [indexes] = await db.execute(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'capsule_nfts' 
        AND INDEX_NAME = 'idx_is_locked'
      `) as [any[], any];
      
      if (indexes.length === 0) {
        await db.execute(`
          CREATE INDEX idx_is_locked ON capsule_nfts(is_locked)
        `);
        logger.info('Created idx_is_locked index');
      }
    } catch (error: any) {
      logger.debug('Index idx_is_locked might already exist', { error });
    }

    // AR anchors table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ar_anchors (
        anchor_id VARCHAR(255) PRIMARY KEY,
        capsule_id VARCHAR(255) NOT NULL,
        qr_code_url TEXT,
        anchor_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule policies table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_policies (
        capsule_id VARCHAR(255) PRIMARY KEY,
        policy_type VARCHAR(50) NOT NULL,
        policy_id VARCHAR(255) NOT NULL,
        policy_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_inheritance (
        capsule_id VARCHAR(255) PRIMARY KEY,
        fallback_addresses TEXT,
        inactive_after_days INT DEFAULT 365,
        last_ping DATETIME,
        auto_transfer TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_inheritance (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_contributions (
        contribution_id VARCHAR(255) PRIMARY KEY,
        capsule_id VARCHAR(255) NOT NULL,
        contributor_address VARCHAR(255) NOT NULL,
        payload TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id),
        INDEX idx_contributor_address (contributor_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule messages table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_messages (
        message_id VARCHAR(255) PRIMARY KEY,
        capsule_id VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        author_address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule origin proofs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_origin_proofs (
        capsule_id VARCHAR(255) PRIMARY KEY,
        proof TEXT NOT NULL,
        public_signals TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_capsule_id (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule unlock codes table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_unlock_codes (
        capsule_id VARCHAR(255) NOT NULL,
        unlock_code_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (capsule_id, unlock_code_hash),
        INDEX idx_capsule_id (capsule_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // NFT shares table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS nft_shares (
        share_id VARCHAR(255) PRIMARY KEY,
        nft_id VARCHAR(255) NOT NULL,
        from_address VARCHAR(255) NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        shared_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unlocked TINYINT(1) NOT NULL DEFAULT 0,
        INDEX idx_nft_id (nft_id),
        INDEX idx_to_address (to_address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Capsule provenance table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS capsule_provenance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        capsule_id VARCHAR(255) NOT NULL,
        actor_address VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        timestamp BIGINT NOT NULL,
        metadata TEXT,
        INDEX idx_capsule_id (capsule_id),
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Audit logs table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_address VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        resource_id VARCHAR(255),
        ip_address VARCHAR(45),
        success TINYINT(1) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_address (user_address),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seal encrypted key metadata
    await db.execute(`
      CREATE TABLE IF NOT EXISTS seal_encrypted_keys (
        key_id VARCHAR(255) PRIMARY KEY,
        metadata TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User notification preferences
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        user_address VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255),
        webhook TEXT,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        notify_on_unlock TINYINT(1) NOT NULL DEFAULT 1,
        notify_on_unlock_soon TINYINT(1) NOT NULL DEFAULT 0,
        unlock_soon_threshold INT NOT NULL DEFAULT 24,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_enabled (enabled),
        INDEX idx_notify_unlock_soon (notify_on_unlock_soon)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Notification sent log (to prevent duplicate notifications)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notification_sent (
        notification_id VARCHAR(255) PRIMARY KEY,
        user_address VARCHAR(255) NOT NULL,
        nft_id VARCHAR(255) NOT NULL,
        notification_type VARCHAR(50) NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_address (user_address),
        INDEX idx_nft_id (nft_id),
        INDEX idx_notification_type (notification_type),
        INDEX idx_sent_at (sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize database schema', { error });
    throw error;
  }
}

/**
 * Close database connection pool
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}

// Initialize on module load
initializeDatabase().catch((error) => {
  logger.error('Failed to initialize database', { error });
  process.exit(1);
});

/**
 * Clear test data (for testing only)
 */
export async function clearTestData(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('clearTestData cannot be used in production');
  }
  
  const db = getDatabase();
  try {
    // Delete all test data in reverse order of foreign key dependencies
    await db.execute('DELETE FROM nft_shares');
    await db.execute('DELETE FROM capsule_nfts');
    await db.execute('DELETE FROM check_ins');
    await db.execute('DELETE FROM dead_man_switches');
    await db.execute('DELETE FROM release_logs');
    await db.execute('DELETE FROM zk_proofs');
    await db.execute('DELETE FROM capsule_provenance');
    await db.execute('DELETE FROM capsule_unlock_codes');
    await db.execute('DELETE FROM capsule_origin_proofs');
    await db.execute('DELETE FROM capsule_messages');
    await db.execute('DELETE FROM capsule_policies');
    await db.execute('DELETE FROM ar_anchors');
    await db.execute('DELETE FROM evidence_vaults');
    await db.execute('DELETE FROM vaults');
    await db.execute('DELETE FROM audit_logs');
    logger.info('Test data cleared');
  } catch (error) {
    logger.error('Failed to clear test data', { error });
    throw error;
  }
}

export default getDatabase;
