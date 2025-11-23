/**
 * Type definitions for Sui object structures
 */

/**
 * Sui object content structure
 */
export interface SuiObjectContent {
  dataType: 'moveObject' | 'package';
  type: string;
  hasPublicTransfer?: boolean;
  fields?: Record<string, unknown>;
}

/**
 * Sui object data structure
 */
export interface SuiObjectData {
  objectId: string;
  version: string;
  digest: string;
  type?: string;
  owner?: {
    AddressOwner?: string;
    ObjectOwner?: string;
    Shared?: { initial_shared_version: string };
  };
  previousTransaction?: string;
  content?: SuiObjectContent;
  bcs?: string;
  display?: Record<string, string>;
}

/**
 * Sui object response
 */
export interface SuiObjectResponse {
  data: SuiObjectData | null;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Scallop registry content structure
 */
export interface ScallopRegistryContent extends SuiObjectContent {
  fields: {
    pools?: Record<string, string>;
    pool_addresses?: Record<string, string>;
    [key: string]: unknown;
  };
}

/**
 * Scallop pool content structure
 */
export interface ScallopPoolContent extends SuiObjectContent {
  fields: {
    apy?: string | number;
    total_deposits?: string | number;
    total_borrows?: string | number;
    [key: string]: unknown;
  };
}

/**
 * Deposit object content structure
 */
export interface DepositObjectContent extends SuiObjectContent {
  fields: {
    principal?: string | number;
    timestamp?: string | number;
    apy?: string | number;
    [key: string]: unknown;
  };
}

/**
 * Serialized transaction block bytes
 */
export type TransactionBlockBytes = Uint8Array;

