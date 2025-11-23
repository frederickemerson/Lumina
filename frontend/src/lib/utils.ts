import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Encode capsule ID to comma-separated ASCII codes (legacy format)
 * @param capsuleId - Hex string (with or without 0x prefix)
 * @returns Comma-separated ASCII codes string
 */
export function encodeCapsuleIdToBase64(capsuleId: string): string {
  // Remove 0x prefix if present
  const cleanId = capsuleId.startsWith('0x') ? capsuleId.slice(2) : capsuleId;
  
  // Validate it's a valid hex string
  if (!/^[a-fA-F0-9]+$/.test(cleanId)) {
    console.error('Invalid hex string for encoding:', capsuleId);
    throw new Error('Invalid capsule ID format');
  }
  
  // Ensure even length (pad with 0 if odd)
  const paddedId = cleanId.length % 2 === 0 ? cleanId : '0' + cleanId;
  
  // Convert hex string to bytes, then to comma-separated ASCII codes
  const codes: number[] = [];
  for (let i = 0; i < paddedId.length; i += 2) {
    const hexPair = paddedId.substring(i, i + 2);
    const byte = parseInt(hexPair, 16);
    if (isNaN(byte)) {
      console.error('Failed to parse hex pair:', hexPair, 'from capsuleId:', capsuleId);
      throw new Error(`Invalid hex pair: ${hexPair}`);
    }
    codes.push(byte);
  }
  
  // Convert to comma-separated string
  return codes.join(',');
}

/**
 * Decode base64 URL-safe string to capsule ID
 * @param base64Id - Base64 URL-safe encoded string
 * @returns Hex string with 0x prefix
 */
export function decodeBase64ToCapsuleId(base64Id: string): string {
  // Restore URL-safe characters: - to +, _ to /
  let base64 = base64Id.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  
  // Decode base64 to binary string
  const binary = atob(base64);
  
  // Convert binary string to hex
  let hex = '';
  for (let i = 0; i < binary.length; i++) {
    const charCode = binary.charCodeAt(i);
    hex += charCode.toString(16).padStart(2, '0');
  }
  
  return `0x${hex}`;
}
