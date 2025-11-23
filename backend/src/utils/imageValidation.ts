/**
 * Image validation utilities
 * Helps verify decrypted data is valid image data
 */

import { logger } from './logger';

/**
 * Check if data is a valid image by checking magic bytes
 */
export function isValidImage(data: Uint8Array): { valid: boolean; format?: string } {
  if (data.length < 4) {
    return { valid: false };
  }

  // JPEG: FF D8 FF
  if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
    return { valid: true, format: 'jpeg' };
  }

  // PNG: 89 50 4E 47
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return { valid: true, format: 'png' };
  }

  // GIF: 47 49 46 38
  if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) {
    return { valid: true, format: 'gif' };
  }

  // WebP: Check for RIFF...WEBP
  if (data.length >= 12 && 
      data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 &&
      data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) {
    return { valid: true, format: 'webp' };
  }

  return { valid: false };
}

/**
 * Validate file by checking magic numbers (file signatures)
 * Returns the detected MIME type based on file content, not just extension
 */
export function validateFileByMagicNumber(
  buffer: Buffer,
  declaredMimeType: string
): { valid: boolean; detectedMimeType?: string; error?: string } {
  if (buffer.length < 4) {
    return { valid: false, error: 'File too small to validate' };
  }

  const bytes = new Uint8Array(buffer);

  // Image formats
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    const detected = 'image/jpeg';
    if (declaredMimeType.startsWith('image/') && !declaredMimeType.includes('jpeg')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const detected = 'image/png';
    if (declaredMimeType.startsWith('image/') && !declaredMimeType.includes('png')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    const detected = 'image/gif';
    if (declaredMimeType.startsWith('image/') && !declaredMimeType.includes('gif')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // WebP: RIFF...WEBP
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const detected = 'image/webp';
    if (declaredMimeType.startsWith('image/') && !declaredMimeType.includes('webp')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // Video formats
  // MP4: ftyp box at offset 4
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const detected = 'video/mp4';
    if (declaredMimeType.startsWith('video/') && !declaredMimeType.includes('mp4')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // WebM: 1A 45 DF A3 (can contain video, audio, or both)
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    // WebM containers can contain audio-only, video-only, or both
    // Accept video/webm detection for audio/webm declarations since WebM is a container format
    if (declaredMimeType === 'audio/webm') {
      return { valid: true, detectedMimeType: 'audio/webm' };
    }

    const detected = 'video/webm';
    if (declaredMimeType.startsWith('video/') && !declaredMimeType.includes('webm')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // QuickTime/MOV: ftyp box
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // Check for QuickTime brand
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'qt  ' || brand.includes('qt')) {
      const detected = 'video/quicktime';
      if (declaredMimeType.startsWith('video/') && !declaredMimeType.includes('quicktime')) {
        logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
      }
      return { valid: true, detectedMimeType: detected };
    }
  }

  // Audio formats
  // MP3: ID3 tag (ID3) or frame sync (FF FB/FF F3/FF F2)
  if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xFF && (bytes[1] === 0xFB || bytes[1] === 0xF3 || bytes[1] === 0xF2))) {
    const detected = 'audio/mpeg';
    if (declaredMimeType.startsWith('audio/') && !declaredMimeType.includes('mpeg')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // WAV: RIFF...WAVE
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
    const detected = 'audio/wav';
    if (declaredMimeType.startsWith('audio/') && !declaredMimeType.includes('wav')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // WebM audio: Same as WebM video
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    const detected = 'audio/webm';
    if (declaredMimeType.startsWith('audio/') && !declaredMimeType.includes('webm')) {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // PDF: %PDF-
  if (bytes.length >= 4 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    const detected = 'application/pdf';
    if (declaredMimeType !== 'application/pdf') {
      logger.warn('MIME type mismatch', { declared: declaredMimeType, detected });
    }
    return { valid: true, detectedMimeType: detected };
  }

  // Text/JSON: Check if it's valid UTF-8 text
  try {
    const text = buffer.toString('utf8');
    // If it's valid UTF-8 and looks like text, allow it
    if (declaredMimeType === 'text/plain' || declaredMimeType === 'application/json') {
      // For JSON, try to parse it
      if (declaredMimeType === 'application/json') {
        try {
          JSON.parse(text);
          return { valid: true, detectedMimeType: 'application/json' };
        } catch {
          return { valid: false, error: 'Invalid JSON format' };
        }
      }
      return { valid: true, detectedMimeType: 'text/plain' };
    }
  } catch {
    // Not valid UTF-8, continue checking
  }

  // If we can't detect the format but declared MIME type is in allowed list, allow it
  // For Lumina, we trust any declared MIME type since we want to support preserving any memory/file
  // Magic number validation is mainly for detecting obviously corrupted files
  logger.info('File type not recognized by magic bytes, accepting declared MIME type', {
    declaredMimeType,
    header: Array.from(bytes.slice(0, 16))
      .map(b => '0x' + b.toString(16).padStart(2, '0'))
      .join(' '),
    dataSize: bytes.length,
  });

  return { valid: true, detectedMimeType: declaredMimeType };
}

/**
 * Try to fix corrupted image data by attempting different decryption methods
 * This is a fallback if initial decryption produces invalid data
 */
export function tryFixImageData(
  data: Uint8Array, 
  encryptedDataId: string
): Uint8Array | null {
  // First check if it's already valid
  if (isValidImage(data).valid) {
    return data;
  }

  // Log the first few bytes for debugging
  const header = Array.from(data.slice(0, 16))
    .map(b => '0x' + b.toString(16).padStart(2, '0'))
    .join(' ');
  
  logger.warn('Invalid image data detected', {
    header,
    dataSize: data.length,
    encryptedDataId,
  });
  
  // Check if data looks like it might still be encrypted (high entropy)
  // Encrypted data typically has high entropy (random-looking bytes)
  // Image data has lower entropy (structured patterns)
  let entropy = 0;
  const byteFreq = new Array(256).fill(0);
  const sampleSize = Math.min(data.length, 1000);
  for (let i = 0; i < sampleSize; i++) {
    byteFreq[data[i]]++;
  }
  for (let i = 0; i < 256; i++) {
    if (byteFreq[i] > 0) {
      const p = byteFreq[i] / sampleSize;
      entropy -= p * Math.log2(p);
    }
  }
  
  logger.debug('Image data entropy analysis', {
    entropy: entropy.toFixed(2),
    encryptedDataId,
    interpretation: entropy > 7.5 ? 'high (possibly encrypted)' : 'low (possibly decrypted)',
  });
  
  // If entropy is very high (> 7.5), data might still be encrypted
  if (entropy > 7.5) {
    logger.warn('High entropy detected - data might still be encrypted', {
      entropy: entropy.toFixed(2),
      encryptedDataId,
    });
  }
  
  // The data might still be encrypted or corrupted
  // Return null to indicate we couldn't fix it
  return null;
}

