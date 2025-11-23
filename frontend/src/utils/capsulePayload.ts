export interface CapsulePayload {
  image: {
    data: Uint8Array;
    mimeType: string;
    fileName?: string;
  };
  message?: string | null;
  voice?: {
    data: Uint8Array;
    mimeType: string;
  } | null;
  metadata?: {
    description?: string;
    tags?: string[];
    timestamp?: string;
  };
}

export function splitCapsulePayload(combinedData: Uint8Array): CapsulePayload {
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(combinedData);
  const combined = JSON.parse(jsonString);

  if (combined.version !== 1 || !combined.image) {
    throw new Error('Unsupported combined payload format');
  }

  const payload: CapsulePayload = {
    image: {
      data: new Uint8Array(combined.image.data),
      mimeType: combined.image.mimeType,
      fileName: combined.image.fileName,
    },
    message: combined.message ?? null,
    voice: combined.voice
      ? {
          data: new Uint8Array(combined.voice.data),
          mimeType: combined.voice.mimeType,
        }
      : null,
    metadata: combined.metadata ?? {},
  };

  return payload;
}

export function trySplitCapsulePayload(
  data: Uint8Array,
): { payload: CapsulePayload | null; isCombined: boolean } {
  try {
    const payload = splitCapsulePayload(data);
    return { payload, isCombined: true };
  } catch {
    return { payload: null, isCombined: false };
  }
}

/**
 * Combine image, message, and voice into a single JSON-encoded payload
 */
export function combineCapsulePayload(payload: CapsulePayload): Uint8Array {
  const combined = {
    version: 1,
    image: {
      data: Array.from(payload.image.data),
      mimeType: payload.image.mimeType,
      fileName: payload.image.fileName,
    },
    message: payload.message ?? null,
    voice: payload.voice
      ? {
          data: Array.from(payload.voice.data),
          mimeType: payload.voice.mimeType,
        }
      : null,
    metadata: payload.metadata ?? {},
  };

  const jsonString = JSON.stringify(combined);
  return new TextEncoder().encode(jsonString);
}

