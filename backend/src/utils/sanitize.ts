/**
 * Input sanitization utilities
 * Validates and sanitizes user inputs to prevent injection attacks
 */

/**
 * Validate and sanitize Sui address
 * @param address Address to validate
 * @returns Sanitized address or throws error
 */
export function sanitizeAddress(address: unknown): string {
  if (typeof address !== 'string') {
    throw new Error('Address must be a string');
  }

  // Sui addresses are 32 bytes (64 hex characters) starting with 0x
  const suiAddressRegex = /^0x[a-fA-F0-9]{64}$/;
  
  if (!suiAddressRegex.test(address)) {
    throw new Error('Invalid Sui address format');
  }

  return address.toLowerCase();
}

/**
 * Validate and sanitize numeric amount
 * @param amount Amount to validate
 * @param min Optional minimum value
 * @param max Optional maximum value
 * @returns Sanitized amount or throws error
 */
export function sanitizeAmount(amount: unknown, min?: number, max?: number): number {
  if (typeof amount === 'string') {
    const parsed = parseFloat(amount);
    if (isNaN(parsed)) {
      throw new Error('Amount must be a valid number');
    }
    amount = parsed;
  }

  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    throw new Error('Amount must be a valid number');
  }

  if (amount < 0) {
    throw new Error('Amount must be non-negative');
  }

  if (min !== undefined && amount < min) {
    throw new Error(`Amount must be at least ${min}`);
  }

  if (max !== undefined && amount > max) {
    throw new Error(`Amount must be at most ${max}`);
  }

  return amount;
}

/**
 * Sanitize string input
 * Removes dangerous characters and limits length
 * @param input String to sanitize
 * @param maxLength Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(input: unknown, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  // Remove null bytes and control characters (except newlines and tabs)
  let sanitized = input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized.trim();
}

/**
 * Validate and sanitize rate (basis points)
 * @param rate Rate to validate
 * @returns Sanitized rate or throws error
 */
export function sanitizeRate(rate: unknown): number {
  const amount = sanitizeAmount(rate, 0, 10000); // 0-100% in basis points
  return Math.floor(amount);
}

