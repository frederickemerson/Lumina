/**
 * Utility functions for combining and splitting capsule payloads
 * Combines image, message, and voice into a single encrypted payload
 */

export interface CapsulePayload {
  image: {
    data: Uint8Array;
    mimeType: string;
    fileName?: string;
  };
  message?: string;
  voice?: {
    data: Uint8Array;
    mimeType: string;
  };
  metadata?: {
    description?: string;
    tags?: string[];
    timestamp?: string;
  };
}

/**
 * Combine image, message, and voice into a single payload
 */
export function combineCapsulePayload(payload: CapsulePayload): Buffer {
  const combined = {
    version: 1, // Version for future compatibility
    image: {
      data: Array.from(payload.image.data), // Convert Uint8Array to array for JSON
      mimeType: payload.image.mimeType,
      fileName: payload.image.fileName,
    },
    message: payload.message || null,
    voice: payload.voice ? {
      data: Array.from(payload.voice.data),
      mimeType: payload.voice.mimeType,
    } : null,
    metadata: payload.metadata || {},
  };

  const jsonString = JSON.stringify(combined);
  return Buffer.from(jsonString, 'utf-8');
}

/**
 * Split combined payload back into image, message, and voice
 */
export function splitCapsulePayload(combinedData: Uint8Array): CapsulePayload {
  const jsonString = Buffer.from(combinedData).toString('utf-8');
  const combined = JSON.parse(jsonString);

  if (combined.version !== 1) {
    throw new Error(`Unsupported payload version: ${combined.version}`);
  }

  const result: CapsulePayload = {
    image: {
      data: new Uint8Array(combined.image.data),
      mimeType: combined.image.mimeType,
      fileName: combined.image.fileName,
    },
  };

  if (combined.message) {
    result.message = combined.message;
  }

  if (combined.voice) {
    result.voice = {
      data: new Uint8Array(combined.voice.data),
      mimeType: combined.voice.mimeType,
    };
  }

  if (combined.metadata) {
    result.metadata = combined.metadata;
  }

  return result;
}

/**
 * Check if data is a combined capsule payload (JSON format)
 */
export function isCombinedPayload(data: Uint8Array): boolean {
  try {
    const jsonString = Buffer.from(data.slice(0, Math.min(100, data.length))).toString('utf-8');
    const parsed = JSON.parse(jsonString);
    return parsed.version !== undefined && parsed.image !== undefined;
  } catch {
    return false;
  }
}

