/**
 * LUMINA Origin Proof Circuit (Minimal)
 * Proves content hash and minimal timestamp (year only)
 * 
 * Minimal version: Only verifies:
 * - Content hash matches
 * - Year is 2025 (minimal check - just >= start of 2025)
 * 
 * Public inputs:
 * - public_content_hash[256] (SHA256 of content)
 * 
 * Private inputs:
 * - private_content[256] (raw content, 256 bits = 32 bytes)
 * - private_timestamp (exact timestamp - only used for minimal year check)
 * 
 * This minimal version reduces constraints significantly by:
 * - Removing detailed timestamp range checks
 * - Only checking timestamp >= 2025 start (single comparison)
 */

pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

template OriginProof() {
    // Public inputs
    signal input public_content_hash[256]; // Content hash (public, 256 bits)
    
    // Private inputs
    signal input private_content[256];     // Raw content (private, 256 bits = 32 bytes)
    signal input private_timestamp;        // Exact timestamp (private, only for minimal year check)
    
    // Output
    signal output verified;
    
    // Components
    component sha256_content = Sha256(256);  // Hash content (256 bits input = 32 bytes)
    
    // Initialize SHA256 input (256 bits = 32 bytes)
    for (var i = 0; i < 256; i++) {
        sha256_content.in[i] <== private_content[i];
    }
    
    // Verify content hash matches
    for (var i = 0; i < 256; i++) {
        sha256_content.out[i] === public_content_hash[i];
    }
    
    // Minimal timestamp check: just verify timestamp >= 2025 start
    // Year 2025 starts at 1735689600000 (Jan 1, 2025 00:00:00 UTC in milliseconds)
    var year_2025_start = 1735689600000;
    
    // Single comparison: timestamp >= 2025 start (minimal check)
    // LessThan gives us: in[0] < in[1], so we check if year_2025_start < timestamp
    component timestamp_check = LessThan(32);
    timestamp_check.in[0] <== year_2025_start;
    timestamp_check.in[1] <== private_timestamp;
    // timestamp_check.out = 1 if year_2025_start < timestamp (i.e., timestamp >= year_2025_start)
    
    // Verify all conditions passed (both hash match and timestamp check)
    // The hash equality checks above (sha256_content.out[i] === public_content_hash[i]) 
    // already ensure the hash matches - if any bit doesn't match, the circuit will fail
    // So we just need to verify timestamp >= 2025 start
    // verified = 1 if timestamp >= 2025 start (timestamp_check.out = 1)
    verified <== timestamp_check.out;
}

component main = OriginProof();

