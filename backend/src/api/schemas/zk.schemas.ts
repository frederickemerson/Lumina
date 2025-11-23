/**
 * Validation Schemas for ZK API
 */

import { z } from 'zod';

export const taxProofSchema = z.object({
  income: z.number()
    .positive('Income must be greater than 0')
    .max(1000000000, 'Income exceeds maximum limit'),
  rate: z.number()
    .min(0, 'Tax rate must be >= 0')
    .max(10000, 'Tax rate must be <= 10000 basis points (100%)'),
});

export const kycProofSchema = z.object({
  age: z.number()
    .int('Age must be an integer')
    .min(0, 'Age must be >= 0')
    .max(150, 'Age must be <= 150'),
  sanctionsCheck: z.number()
    .int('Sanctions check must be 0 or 1')
    .refine(
      (val) => val === 0 || val === 1,
      {
        message: 'Sanctions check must be 0 (not on list) or 1 (on list)',
      }
    ),
});

export const verifyProofSchema = z.object({
  proof: z.object({
    pi_a: z.array(z.string()),
    pi_b: z.array(z.array(z.string())),
    pi_c: z.array(z.string()),
  }),
  publicSignals: z.array(z.string()),
  circuitType: z.enum(['tax_proof', 'kyc_proof']),
  userId: z.string().optional(),
});

