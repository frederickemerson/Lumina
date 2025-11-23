/**
 * Evidence Vault Contract
 * 
 * Manages evidence vault objects on-chain.
 * Stores metadata and ownership information.
 */

module obscura::evidence_vault {
    use std::string::String;

    /// Evidence vault object
    public struct EvidenceVault has key {
        id: UID,
        vault_id: String,
        owner: address,
        blob_id: String, // Walrus blob ID
        encrypted_data_id: String, // Seal encrypted data ID
        metadata_hash: vector<u8>, // SHA256 hash of metadata
        created_at: u64,
        release_triggered: bool,
    }

    /// Vault created event
    public struct VaultCreatedEvent has copy, drop {
        vault_id: String,
        owner: address,
        blob_id: String,
        created_at: u64,
    }

    /// Ownership transferred event
    public struct OwnershipTransferredEvent has copy, drop {
        vault_id: String,
        old_owner: address,
        new_owner: address,
    }

    /// Error codes
    const EUnauthorized: u64 = 0;
    const EInvalidMetadata: u64 = 2;

    /**
     * Create a new evidence vault
     */
    public fun create_vault(
        vault_id: vector<u8>,
        blob_id: vector<u8>,
        encrypted_data_id: vector<u8>,
        metadata_hash: vector<u8>,
        ctx: &mut sui::tx_context::TxContext
    ) {
        // Validate inputs
        assert!(std::vector::length(&metadata_hash) == 32, EInvalidMetadata); // SHA256 = 32 bytes

        let owner = sui::tx_context::sender(ctx);
        let now = sui::tx_context::epoch_timestamp_ms(ctx);

        let vault = EvidenceVault {
            id: sui::object::new(ctx),
            vault_id: std::string::utf8(vault_id),
            owner,
            blob_id: std::string::utf8(blob_id),
            encrypted_data_id: std::string::utf8(encrypted_data_id),
            metadata_hash,
            created_at: now,
            release_triggered: false,
        };

        // Transfer to owner
        sui::transfer::transfer(vault, owner);

        // Emit creation event
        sui::event::emit(VaultCreatedEvent {
            vault_id: std::string::utf8(vault_id),
            owner,
            blob_id: std::string::utf8(blob_id),
            created_at: now,
        });
    }

    /**
     * Transfer vault ownership
     */
    public fun transfer_ownership(
        vault: &mut EvidenceVault,
        new_owner: address,
        ctx: &sui::tx_context::TxContext
    ) {
        let old_owner = vault.owner;
        assert!(sui::tx_context::sender(ctx) == old_owner, EUnauthorized);

        vault.owner = new_owner;

        // Emit transfer event
        sui::event::emit(OwnershipTransferredEvent {
            vault_id: vault.vault_id,
            old_owner,
            new_owner,
        });
    }

    /**
     * Mark vault as released (called by auto-release service)
     */
    public fun mark_released(
        vault: &mut EvidenceVault,
        ctx: &sui::tx_context::TxContext
    ) {
        assert!(sui::tx_context::sender(ctx) == vault.owner, EUnauthorized);
        vault.release_triggered = true;
    }

    /**
     * Get vault info
     */
    public fun get_vault_info(vault: &EvidenceVault): (String, address, String, String, bool) {
        (
            vault.vault_id,
            vault.owner,
            vault.blob_id,
            vault.encrypted_data_id,
            vault.release_triggered
        )
    }

    /**
     * Verify ownership
     */
    public fun verify_ownership(vault: &EvidenceVault, address: address): bool {
        vault.owner == address
    }
}

