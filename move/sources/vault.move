/**
 * LUMINA Vault Contract
 * 
 * Manages user vaults - one vault per user containing multiple memories.
 * Vault-level unlock conditions (secret phrase, timer, or manual).
 */

#[allow(duplicate_alias)]
module lumina::vault {
    use sui::clock::Clock;
    use sui::object::{UID, ID};
    use sui::tx_context::TxContext;
    use std::hash;
    use sui::event;

    /// Vault object - one per user, contains multiple memories
    public struct Vault has key, store {
        id: UID,
        owner: address,
        unlock_type: u8, // 0 = secret_phrase, 1 = timer, 2 = manual
        secret_phrase_hash: vector<u8>, // SHA-256 hash of secret phrase
        unlock_at: u64, // Timestamp when vault unlocks (0 = never, unless manual unlock)
        created_at: u64,
        unlocked_at: u64, // 0 = locked, >0 = unlocked timestamp
        memory_count: u64, // Number of memories in vault
    }

    /// Vault created event
    public struct VaultCreatedEvent has copy, drop {
        vault_id: ID,
        owner: address,
        unlock_type: u8,
        unlock_at: u64,
    }

    /// Vault unlocked event
    public struct VaultUnlockedEvent has copy, drop {
        vault_id: ID,
        unlocked_at: u64,
    }

    /// Memory added to vault event
    public struct MemoryAddedEvent has copy, drop {
        vault_id: ID,
        memory_id: ID,
    }

    /// Error codes
    const EInvalidUnlockType: u64 = 1;
    const EVaultAlreadyUnlocked: u64 = 2;
    const EInvalidSecretPhrase: u64 = 3;
    #[allow(unused_const)]
    const ETimeLockNotMet: u64 = 4;
    const ENotOwner: u64 = 5;

    /**
     * Create a new vault for a user
     * @param owner - Owner address
     * @param unlock_type - 0 = secret_phrase, 1 = timer, 2 = manual
     * @param secret_phrase_hash - SHA-256 hash of secret phrase (empty if not using secret phrase)
     * @param unlock_at - Timestamp when vault unlocks (0 if not using timer)
     */
    public fun create_vault(
        owner: address,
        unlock_type: u8,
        secret_phrase_hash: vector<u8>,
        unlock_at: u64,
        ctx: &mut TxContext
    ): Vault {
        assert!(unlock_type <= 2, EInvalidUnlockType);

        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        
        let vault = Vault {
            id: sui::object::new(ctx),
            owner,
            unlock_type,
            secret_phrase_hash,
            unlock_at,
            created_at: now,
            unlocked_at: 0,
            memory_count: 0,
        };

        // Emit creation event
        event::emit(VaultCreatedEvent {
            vault_id: sui::object::id(&vault),
            owner,
            unlock_type,
            unlock_at,
        });

        vault
    }

    /**
     * Add a memory to the vault
     * @param vault - Mutable reference to vault
     * @param memory_id - ID of the memory to add
     */
    public fun add_memory_to_vault(
        vault: &mut Vault,
        memory_id: ID,
        ctx: &mut TxContext
    ) {
        assert!(sui::tx_context::sender(ctx) == vault.owner, ENotOwner);
        
        vault.memory_count = vault.memory_count + 1;

        // Emit event
        event::emit(MemoryAddedEvent {
            vault_id: sui::object::id(vault),
            memory_id,
        });
    }

    /**
     * Unlock vault with secret phrase
     * @param vault - Mutable reference to vault
     * @param secret_phrase - Secret phrase to verify
     */
    public fun unlock_vault(
        vault: &mut Vault,
        secret_phrase: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(vault.unlocked_at == 0, EVaultAlreadyUnlocked);
        assert!(vault.unlock_type == 0, EInvalidUnlockType); // Must be secret_phrase type

        // Hash the provided secret phrase
        let phrase_hash = hash::sha3_256(secret_phrase);

        // Verify hash matches
        assert!(phrase_hash == vault.secret_phrase_hash, EInvalidSecretPhrase);

        // Unlock vault
        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        vault.unlocked_at = now;

        // Emit unlock event
        event::emit(VaultUnlockedEvent {
            vault_id: sui::object::id(vault),
            unlocked_at: now,
        });
    }

    /**
     * Check if vault is unlocked (for timer-based or manual unlock)
     * @param vault - Reference to vault
     * @param clock - Clock object for time checks
     * @return true if vault is unlocked, false otherwise
     */
    public fun check_vault_unlocked(
        vault: &Vault,
        clock: &Clock
    ): bool {
        if (vault.unlocked_at > 0) {
            return true // Already unlocked
        };

        if (vault.unlock_type == 1) {
            // Timer-based unlock
            let now = sui::clock::timestamp_ms(clock);
            if (vault.unlock_at > 0 && now >= vault.unlock_at) {
                return true
            }
        } else if (vault.unlock_type == 2) {
            // Manual unlock - owner can unlock anytime
            return true
        };

        false
    }

    /**
     * Manually unlock vault (for manual unlock type or owner override)
     * @param vault - Mutable reference to vault
     */
    public fun manual_unlock_vault(
        vault: &mut Vault,
        ctx: &mut TxContext
    ) {
        assert!(sui::tx_context::sender(ctx) == vault.owner, ENotOwner);
        assert!(vault.unlocked_at == 0, EVaultAlreadyUnlocked);

        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        vault.unlocked_at = now;

        // Emit unlock event
        event::emit(VaultUnlockedEvent {
            vault_id: sui::object::id(vault),
            unlocked_at: now,
        });
    }

    /**
     * Get vault unlock status
     */
    public fun is_unlocked(vault: &Vault): bool {
        vault.unlocked_at > 0
    }

    /**
     * Get vault owner
     */
    public fun get_owner(vault: &Vault): address {
        vault.owner
    }

    /**
     * Get vault unlock type
     */
    public fun get_unlock_type(vault: &Vault): u8 {
        vault.unlock_type
    }

    /**
     * Get vault unlock timestamp
     */
    public fun get_unlock_at(vault: &Vault): u64 {
        vault.unlock_at
    }

    /**
     * Get memory count
     */
    public fun get_memory_count(vault: &Vault): u64 {
        vault.memory_count
    }
}

