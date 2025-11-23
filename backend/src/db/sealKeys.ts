import { getDatabase } from './database';

interface SealKeyRow {
  metadata: string;
}

export async function saveSealKeyMetadata(keyId: string, metadata: string): Promise<void> {
  const db = getDatabase();
  await db.execute(
    'INSERT INTO seal_encrypted_keys (key_id, metadata) VALUES (?, ?) ON DUPLICATE KEY UPDATE metadata = VALUES(metadata)',
    [keyId, metadata]
  );
}

export async function getSealKeyMetadata(keyId: string): Promise<string | null> {
  const db = getDatabase();
  const [rows] = await db.execute(
    'SELECT metadata FROM seal_encrypted_keys WHERE key_id = ? LIMIT 1',
    [keyId]
  ) as [SealKeyRow[], unknown];

  if (!rows.length) {
    return null;
  }
  return rows[0].metadata;
}

