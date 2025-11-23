const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB
const IV_PREFIX_LENGTH = 8; // bytes of randomness
const AES_GCM_IV_LENGTH = 12; // required iv length for AES-GCM

export interface EncryptStreamOptions {
  key?: CryptoKey;
  chunkSize?: number;
  onProgress?: (processedBytes: number, totalBytes: number) => void;
}

export interface EncryptionMetadata {
  algorithm: 'AES-GCM';
  chunkSize: number;
  totalChunks: number;
  totalBytes: number;
  ivPrefix: string; // base64 encoded
}

export interface DecryptionMetadata extends EncryptionMetadata {}

export interface EncryptionResult {
  stream: ReadableStream<Uint8Array>;
  key: CryptoKey;
  rawKey: Uint8Array;
  metadata: EncryptionMetadata;
}

/**
 * Generate an AES-GCM key for client-side encryption.
 */
export async function generateAesGcmKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Export a CryptoKey into raw bytes so it can be wrapped by Seal.
 */
export async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

/**
 * Encrypt a file into a ReadableStream of AES-GCM ciphertext chunks.
 * Each chunk uses the same IV prefix with an incremented counter suffix.
 */
export async function encryptFileStream(
  file: File,
  options: EncryptStreamOptions = {},
): Promise<EncryptionResult> {
  const key = options.key ?? (await generateAesGcmKey());
  const rawKey = await exportRawKey(key);
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const ivPrefix = crypto.getRandomValues(new Uint8Array(IV_PREFIX_LENGTH));
  let processedBytes = 0;
  let chunkIndex = 0;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (processedBytes >= file.size) {
        controller.close();
        return;
      }

      if (chunkIndex >= 0xffffffff) {
        controller.error(new Error('Exceeded maximum supported chunk count for AES-GCM counter mode.'));
        return;
      }

      const start = processedBytes;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBuffer = await file.slice(start, end).arrayBuffer();

      const iv = new Uint8Array(AES_GCM_IV_LENGTH);
      iv.set(ivPrefix, 0);
      new DataView(iv.buffer, IV_PREFIX_LENGTH, AES_GCM_IV_LENGTH - IV_PREFIX_LENGTH).setUint32(0, chunkIndex, false);

      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv,
        },
        key,
        chunkBuffer,
      );

      controller.enqueue(new Uint8Array(encryptedBuffer));

      chunkIndex += 1;
      processedBytes = end;
      options.onProgress?.(processedBytes, file.size);
    },
    cancel() {
      // no-op; slicing allocs per pull so nothing to clean up
    },
  });

  return {
    stream,
    key,
    rawKey,
    metadata: {
      algorithm: 'AES-GCM',
      chunkSize,
      totalChunks,
      totalBytes: file.size,
      ivPrefix: toBase64(ivPrefix),
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as Record<string, unknown> | undefined)?.Buffer as
    | { from(data: Uint8Array): { toString(encoding: 'base64'): string } }
    | undefined;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Last-resort fallback: manual base64 encoding
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let result = '';
  let i = 0;
  while (i < binary.length) {
    const chr1 = binary.charCodeAt(i++);
    const chr2 = binary.charCodeAt(i++);
    const chr3 = binary.charCodeAt(i++);

    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
    let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
    let enc4 = chr3 & 63;

    if (isNaN(chr2)) {
      enc3 = enc4 = 64;
    } else if (isNaN(chr3)) {
      enc4 = 64;
    }
    result += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
  }
  return result;
}

export const aesDefaults = {
  CHUNK_SIZE: DEFAULT_CHUNK_SIZE,
  IV_PREFIX_LENGTH,
  AES_GCM_IV_LENGTH,
};

export async function decryptFileChunks(
  ciphertext: Uint8Array,
  rawKey: Uint8Array,
  metadata: DecryptionMetadata,
): Promise<Uint8Array> {
  if (!metadata.ivPrefix) {
    throw new Error('Missing ivPrefix metadata for AES-GCM decryption');
  }
  const keyBuffer = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const ivPrefix = fromBase64(metadata.ivPrefix);
  if (ivPrefix.length !== IV_PREFIX_LENGTH) {
    throw new Error(`Invalid ivPrefix length: expected ${IV_PREFIX_LENGTH}, got ${ivPrefix.length}`);
  }

  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (let chunkIndex = 0; chunkIndex < metadata.totalChunks; chunkIndex += 1) {
    const remaining = ciphertext.length - offset;
    if (remaining <= 0) {
      throw new Error('Ciphertext exhausted before reaching expected chunk count');
    }

    const expectedChunkLength =
      chunkIndex === metadata.totalChunks - 1 ? remaining : metadata.chunkSize + 16;

    if (remaining < expectedChunkLength) {
      throw new Error('Ciphertext truncated before reading full chunk');
    }

    const cipherChunk = ciphertext.subarray(offset, offset + expectedChunkLength);
    const cipherSource = cipherChunk.buffer.slice(
      cipherChunk.byteOffset,
      cipherChunk.byteOffset + cipherChunk.byteLength,
    ) as ArrayBuffer;
    const iv = new Uint8Array(AES_GCM_IV_LENGTH);
    iv.set(ivPrefix, 0);
    new DataView(iv.buffer, IV_PREFIX_LENGTH, AES_GCM_IV_LENGTH - IV_PREFIX_LENGTH).setUint32(
      0,
      chunkIndex,
      false,
    );

    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherSource);
    chunks.push(new Uint8Array(plainBuffer));
    offset += expectedChunkLength;
  }

  const output = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }

  return output;
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const maybeBuffer = (globalThis as Record<string, unknown> | undefined)?.Buffer as
    | { from(data: string, encoding: 'base64'): Uint8Array }
    | undefined;
  if (maybeBuffer) {
    const buffer = maybeBuffer.from(value, 'base64');
    return new Uint8Array(buffer);
  }

  throw new Error('Base64 decoding not supported in this environment');
}

