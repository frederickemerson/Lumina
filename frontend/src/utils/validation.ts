/**
 * Shared Validation Utilities
 * Reusable validation functions for forms and inputs
 */

/**
 * Validate Sui address format
 */
export function validateAddress(address: string): { valid: boolean; error?: string } {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  // Sui addresses are 32 bytes (64 hex characters) starting with 0x
  const suiAddressRegex = /^0x[a-fA-F0-9]{64}$/;
  
  if (!suiAddressRegex.test(address)) {
    return { valid: false, error: 'Invalid Sui address format' };
  }

  return { valid: true };
}

/**
 * Validate amount (must be positive number)
 */
export function validateAmount(amount: string | number, min: number = 0, max?: number): { valid: boolean; error?: string } {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  if (numAmount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (min !== undefined && numAmount < min) {
    return { valid: false, error: `Amount must be at least ${min}` };
  }

  if (max !== undefined && numAmount > max) {
    return { valid: false, error: `Amount must be at most ${max}` };
  }

  return { valid: true };
}

/**
 * Validate rate in basis points (0-10000)
 */
export function validateRate(rate: string | number): { valid: boolean; error?: string } {
  return validateAmount(rate, 0, 10000);
}

/**
 * Validate age (0-150)
 */
export function validateAge(age: string | number): { valid: boolean; error?: string } {
  return validateAmount(age, 0, 150);
}

/**
 * Validate sanctions check (0 or 1)
 */
export function validateSanctionsCheck(value: string | number): { valid: boolean; error?: string } {
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(numValue) || (numValue !== 0 && numValue !== 1)) {
    return { valid: false, error: 'Sanctions check must be 0 or 1' };
  }

  return { valid: true };
}

