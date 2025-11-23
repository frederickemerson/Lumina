/**
 * Capsule API Router
 * Main router that combines all capsule endpoints
 */

import { Router } from 'express';
import { createUploadRouter } from './upload';
import { createRetrieveRouter } from './retrieve';
import { createUnlockRouter } from './unlock';
import { createPublicRouter } from './public';
import { createInheritanceRouter } from './inheritance';
import { createContributionsRouter } from './contributions';
import { decodeAsciiCapsuleId, decodeBase64CapsuleId, asciiCapsuleIdPattern } from './utils';

const router = Router();

// Decode capsule ID parameter (supports base64 and ASCII encoding)
router.param('capsuleId', (req, _res, next, value: string) => {
  if (typeof value === 'string') {
    // URL decode first in case commas were encoded
    const urlDecoded = decodeURIComponent(value);
    
    // Try base64 decoding first
    const base64Decoded = decodeBase64CapsuleId(urlDecoded);
    if (base64Decoded) {
      req.params.capsuleId = base64Decoded;
      return next();
    }
    
    // Try ASCII decoding (comma-separated numbers)
    if (asciiCapsuleIdPattern.test(urlDecoded)) {
      const decoded = decodeAsciiCapsuleId(urlDecoded);
      if (decoded) {
        req.params.capsuleId = decoded;
        return next();
      }
    }
    
    // If no decoding worked, use the value as-is (might already be a hex string)
    // But ensure it has 0x prefix if it's a 64-char hex string
    if (/^[a-fA-F0-9]{64}$/.test(urlDecoded)) {
      req.params.capsuleId = `0x${urlDecoded}`;
      return next();
    }
  }
  next();
});

// Mount sub-routers
router.use(createUploadRouter());
router.use(createRetrieveRouter());
router.use(createUnlockRouter());
router.use(createPublicRouter());
router.use(createInheritanceRouter());
router.use(createContributionsRouter());

export default router;

