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
    const base64Decoded = decodeBase64CapsuleId(value);
    if (base64Decoded) {
      req.params.capsuleId = base64Decoded;
      return next();
    }
    
    if (asciiCapsuleIdPattern.test(value)) {
      const decoded = decodeAsciiCapsuleId(value);
      if (decoded) {
        req.params.capsuleId = decoded;
      }
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

