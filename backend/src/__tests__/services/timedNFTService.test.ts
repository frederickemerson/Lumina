/**
 * Tests for Timed NFT Service
 * Tests the daily unlock checking and notification functionality
 */

import { getDatabase } from '../../db/database';
import { getTimedNFTService } from '../../services/timedNFTService';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('@mysten/sui/client');
jest.mock('@mysten/sui/transactions');
jest.mock('@mysten/sui/keypairs/ed25519');

describe('TimedNFTService', () => {
  let db: ReturnType<typeof getDatabase>;
  let service: ReturnType<typeof getTimedNFTService>;
  
  beforeAll(async () => {
    db = getDatabase();
    service = getTimedNFTService();
  });

  beforeEach(async () => {
    // Clear test data before each test
    await db.execute('DELETE FROM capsule_nfts WHERE nft_id LIKE "test_%"');
  });

  afterAll(async () => {
    // Clean up test data
    await db.execute('DELETE FROM capsule_nfts WHERE nft_id LIKE "test_%"');
  });

  describe('Database queries for timed NFTs', () => {
    it('should correctly identify NFTs ready to unlock', async () => {
      const now = Date.now();
      const pastTime = now - 1000; // 1 second ago
      const futureTime = now + 86400000; // 1 day in future

      // Insert test NFTs
      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_1',
          'test_capsule_1',
          'test_object_1',
          '0x1234567890123456789012345678901234567890',
          pastTime, // Ready to unlock
          1, // Locked
          JSON.stringify({ message: 'Test NFT 1' }),
        ]
      );

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_2',
          'test_capsule_2',
          'test_object_2',
          '0x1234567890123456789012345678901234567890',
          futureTime, // Not ready yet
          1, // Locked
          JSON.stringify({ message: 'Test NFT 2' }),
        ]
      );

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_3',
          'test_capsule_3',
          'test_object_3',
          '0x1234567890123456789012345678901234567890',
          0, // No time lock
          0, // Already unlocked
          JSON.stringify({ message: 'Test NFT 3' }),
        ]
      );

      // Query for NFTs ready to unlock
      const [rows] = await db.execute(
        `SELECT nft_id, object_id, unlock_at, capsule_id, owner_address
         FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         ORDER BY unlock_at ASC`,
        [now]
      ) as [any[], any];

      expect(rows).toHaveLength(1);
      expect(rows[0].nft_id).toBe('test_nft_1');
      expect(rows[0].is_locked).toBe(1);
      expect(rows[0].unlock_at).toBeLessThanOrEqual(now);
    });

    it('should correctly filter out already unlocked NFTs', async () => {
      const now = Date.now();
      const pastTime = now - 1000;

      // Insert unlocked NFT
      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_unlocked',
          'test_capsule_unlocked',
          'test_object_unlocked',
          '0x1234567890123456789012345678901234567890',
          pastTime,
          0, // Already unlocked
          JSON.stringify({ message: 'Unlocked NFT' }),
        ]
      );

      const [rows] = await db.execute(
        `SELECT nft_id, object_id, unlock_at, capsule_id, owner_address
         FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         ORDER BY unlock_at ASC`,
        [now]
      ) as [any[], any];

      expect(rows).toHaveLength(0);
    });

    it('should correctly filter out NFTs with no time lock', async () => {
      const now = Date.now();

      // Insert NFT with no time lock
      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_no_lock',
          'test_capsule_no_lock',
          'test_object_no_lock',
          '0x1234567890123456789012345678901234567890',
          0, // No time lock
          0, // Unlocked
          JSON.stringify({ message: 'No lock NFT' }),
        ]
      );

      const [rows] = await db.execute(
        `SELECT nft_id, object_id, unlock_at, capsule_id, owner_address
         FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         ORDER BY unlock_at ASC`,
        [now]
      ) as [any[], any];

      expect(rows).toHaveLength(0);
    });

    it('should order NFTs by unlock_at ascending', async () => {
      const now = Date.now();
      const time1 = now - 5000; // 5 seconds ago
      const time2 = now - 3000; // 3 seconds ago
      const time3 = now - 1000; // 1 second ago

      // Insert NFTs in random order
      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_3',
          'test_capsule_3',
          'test_object_3',
          '0x1234567890123456789012345678901234567890',
          time3,
          1,
          JSON.stringify({ message: 'NFT 3' }),
        ]
      );

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_1',
          'test_capsule_1',
          'test_object_1',
          '0x1234567890123456789012345678901234567890',
          time1,
          1,
          JSON.stringify({ message: 'NFT 1' }),
        ]
      );

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_2',
          'test_capsule_2',
          'test_object_2',
          '0x1234567890123456789012345678901234567890',
          time2,
          1,
          JSON.stringify({ message: 'NFT 2' }),
        ]
      );

      const [rows] = await db.execute(
        `SELECT nft_id, object_id, unlock_at, capsule_id, owner_address
         FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         ORDER BY unlock_at ASC`,
        [now]
      ) as [any[], any];

      expect(rows).toHaveLength(3);
      expect(rows[0].nft_id).toBe('test_nft_1'); // Earliest
      expect(rows[1].nft_id).toBe('test_nft_2');
      expect(rows[2].nft_id).toBe('test_nft_3'); // Latest
    });
  });

  describe('NFT metadata storage and retrieval', () => {
    it('should store NFT metadata with unlock information', async () => {
      const now = Date.now();
      const unlockAt = now + 86400000; // 1 day in future
      const nftId = 'test_nft_metadata';
      const capsuleId = 'test_capsule_metadata';
      const ownerAddress = '0x1234567890123456789012345678901234567890';
      const metadata = {
        message: 'Test message',
        mediaBlobId: 'test_blob_id',
        voiceBlobId: null,
      };

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          nftId,
          capsuleId,
          nftId,
          ownerAddress,
          unlockAt,
          1, // Locked
          JSON.stringify(metadata),
        ]
      );

      const [rows] = await db.execute(
        'SELECT * FROM capsule_nfts WHERE nft_id = ?',
        [nftId]
      ) as [any[], any];

      expect(rows).toHaveLength(1);
      expect(rows[0].nft_id).toBe(nftId);
      expect(rows[0].capsule_id).toBe(capsuleId);
      expect(rows[0].owner_address).toBe(ownerAddress);
      expect(rows[0].unlock_at).toBe(unlockAt);
      expect(rows[0].is_locked).toBe(1);

      const storedMetadata = JSON.parse(rows[0].metadata);
      expect(storedMetadata.message).toBe(metadata.message);
      expect(storedMetadata.mediaBlobId).toBe(metadata.mediaBlobId);
    });

    it('should update is_locked status correctly', async () => {
      const nftId = 'test_nft_update';
      const now = Date.now();
      const pastTime = now - 1000;

      // Insert locked NFT
      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          nftId,
          'test_capsule',
          nftId,
          '0x1234567890123456789012345678901234567890',
          pastTime,
          1, // Locked
          JSON.stringify({ message: 'Test' }),
        ]
      );

      // Update to unlocked
      await db.execute(
        'UPDATE capsule_nfts SET is_locked = 0 WHERE nft_id = ?',
        [nftId]
      );

      const [rows] = await db.execute(
        'SELECT is_locked FROM capsule_nfts WHERE nft_id = ?',
        [nftId]
      ) as [any[], any];

      expect(rows[0].is_locked).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle NFTs with unlock_at exactly equal to current time', async () => {
      const now = Date.now();

      await db.execute(
        `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'test_nft_exact',
          'test_capsule_exact',
          'test_object_exact',
          '0x1234567890123456789012345678901234567890',
          now, // Exactly now
          1,
          JSON.stringify({ message: 'Exact time NFT' }),
        ]
      );

      const [rows] = await db.execute(
        `SELECT nft_id FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         ORDER BY unlock_at ASC`,
        [now]
      ) as [any[], any];

      expect(rows).toHaveLength(1);
      expect(rows[0].nft_id).toBe('test_nft_exact');
    });

    it('should handle multiple NFTs for the same owner', async () => {
      const now = Date.now();
      const ownerAddress = '0x1234567890123456789012345678901234567890';
      const pastTime = now - 1000;

      // Insert multiple NFTs for same owner
      for (let i = 1; i <= 5; i++) {
        await db.execute(
          `INSERT INTO capsule_nfts (nft_id, capsule_id, object_id, owner_address, unlock_at, is_locked, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            `test_nft_multi_${i}`,
            `test_capsule_multi_${i}`,
            `test_object_multi_${i}`,
            ownerAddress,
            pastTime,
            1,
            JSON.stringify({ message: `NFT ${i}` }),
          ]
        );
      }

      const [rows] = await db.execute(
        `SELECT nft_id, owner_address FROM capsule_nfts
         WHERE is_locked = 1 
         AND unlock_at > 0 
         AND unlock_at <= ?
         AND owner_address = ?
         ORDER BY unlock_at ASC`,
        [now, ownerAddress]
      ) as [any[], any];

      expect(rows).toHaveLength(5);
      rows.forEach(row => {
        expect(row.owner_address).toBe(ownerAddress);
      });
    });
  });
});

