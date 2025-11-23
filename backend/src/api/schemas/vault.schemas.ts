/**
 * Validation Schemas for Vault API
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Sui address validation (basic - 0x followed by hex)
const suiAddressRegex = /^0x[a-fA-F0-9]{1,64}$/;

export const depositSchema = z.object({
  amount: z.number()
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount exceeds maximum limit'),
  userAddress: z.string()
    .min(1, 'User address is required')
    .regex(suiAddressRegex, 'Invalid Sui address format'),
  encryptedData: z.string().optional(), // Optional blob ID or raw data
});

export const yieldInfoSchema = z.object({
  depositId: z.string().min(1, 'Deposit ID is required'),
});

export const encryptLendingSchema = z.object({
  lenderId: z.string()
    .min(1, 'Lender ID is required')
    .regex(suiAddressRegex, 'Invalid Sui address format'),
  amount: z.number()
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount exceeds maximum limit'),
  minRate: z.number()
    .min(0, 'Min rate must be >= 0')
    .max(10000, 'Min rate must be <= 10000 basis points (100%)'),
  maxRate: z.number()
    .min(0, 'Max rate must be >= 0')
    .max(10000, 'Max rate must be <= 10000 basis points (100%)'),
}).refine(
  (data) => data.maxRate >= data.minRate,
  {
    message: 'Max rate must be >= min rate',
    path: ['maxRate'],
  }
);

export const encryptBorrowingSchema = z.object({
  borrowerId: z.string()
    .min(1, 'Borrower ID is required')
    .regex(suiAddressRegex, 'Invalid Sui address format'),
  amount: z.number()
    .positive('Amount must be greater than 0')
    .max(1000000000, 'Amount exceeds maximum limit'),
  maxRate: z.number()
    .min(0, 'Max rate must be >= 0')
    .max(10000, 'Max rate must be <= 10000 basis points (100%)'),
});

export const lendSchema = z.object({
  lenderEncrypted: z.object({
    encryptedBytes: z.union([z.string(), z.array(z.number())]),
    id: z.string().min(1, 'Lender encrypted ID is required'),
  }),
  borrowerEncrypted: z.object({
    encryptedBytes: z.union([z.string(), z.array(z.number())]),
    id: z.string().min(1, 'Borrower encrypted ID is required'),
  }),
});

export const storeBlobSchema = z.object({
  data: z.string().min(1, 'Data is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const getBlobParamsSchema = z.object({
  blobId: z.string().min(1, 'Blob ID is required'),
});

export const yieldInfoParamsSchema = z.object({
  depositId: z.string().min(1, 'Deposit ID is required'),
});

