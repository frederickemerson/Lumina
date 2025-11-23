/**
 * LUMINA Capsule Contract
 * 
 * Manages encrypted memory vaults (capsules) with programmable unlock conditions:
 * - Time-based: Unlock at specific date
 * - Manual: Owner can unlock at any time
 * 
 * Integrates with Seal for threshold decryption when unlock conditions are met.
 */

#[allow(duplicate_alias)]
module lumina::capsule {
    use sui::clock::Clock;
    use sui::object::{UID, ID};
    use sui::tx_context::TxContext;
    use std::string::String;
    use lumina::vault;

    /// Capsule object - represents an encrypted memory vault (now a memory in a vault)
    public struct Capsule has key, store {
        id: UID,
        owner: address,
        vault_id: ID,              // Reference to user's vault
        blob_id: vector<u8>,        // Walrus blob ID
        policy_id: vector<u8>,     // Seal policy ID
        encrypted_aes_key_seal: vector<u8>, // Seal-encrypted AES key used for file encryption (optional for legacy)
        created_at: u64,
        unlock_at: u64,            // Timestamp when capsule unlocks (0 = never, unless manual unlock)
        is_public: bool,           // Whether capsule is publicly viewable
        status: u8,                // 0 = locked, 1 = unlocked
        unlock_condition: u8,      // 0 = time, 1 = manual
    }

    /// Capsule created event
    public struct CapsuleCreatedEvent has copy, drop {
        capsule_id: ID,
        owner: address,
        blob_id: vector<u8>,
        unlock_at: u64,
        unlock_condition: u8,
    }

    /// Capsule unlocked event
    public struct CapsuleUnlockedEvent has copy, drop {
        capsule_id: ID,
        unlocked_at: u64,
        unlock_reason: String,
    }

    /// Shared ownership - multiple owners with quorum threshold
    public struct SharedOwnership has key {
        id: UID,
        capsule_id: ID,
        owners: vector<address>,
        threshold: u8,           // Number of owners needed to unlock
        votes: vector<address>,   // Current votes for unlock
    }

    /// Delegation - temporary access grant
    public struct Delegation has key {
        id: UID,
        capsule_id: ID,
        delegate: address,
        expires_at: u64,          // 0 = never expires
        created_at: u64,
    }

    /// Inheritance policy - transfer on death/condition
    public struct InheritancePolicy has key {
        id: UID,
        capsule_id: ID,
        heir: address,
        trigger_condition: u8,   // 0 = death, 1 = time, 2 = manual
        trigger_value: u64,       // Timestamp or other value
    }

    /// Events
    public struct OwnerAddedEvent has copy, drop {
        capsule_id: ID,
        new_owner: address,
    }

    public struct OwnerRemovedEvent has copy, drop {
        capsule_id: ID,
        removed_owner: address,
    }

    public struct QuorumUnlockInitiatedEvent has copy, drop {
        capsule_id: ID,
        votes: vector<address>,
        threshold: u8,
    }

    public struct DelegationCreatedEvent has copy, drop {
        capsule_id: ID,
        delegate: address,
        expires_at: u64,
    }

    public struct InheritanceSetEvent has copy, drop {
        capsule_id: ID,
        heir: address,
        condition: u8,
    }

    /// Error codes
    const ECapsuleNotLocked: u64 = 1;
    const EInvalidUnlockCondition: u64 = 2;
    const ENotOwner: u64 = 5;
    const EInvalidThreshold: u64 = 10;
    const EAlreadyOwner: u64 = 11;
    const ENotAnOwner: u64 = 12;
    #[allow(unused_const)]
    const EQuorumNotMet: u64 = 13;
    #[allow(unused_const)]
    const EDelegationExpired: u64 = 14;
    const EInvalidInheritanceCondition: u64 = 15;
    const ESealedKeyRequired: u64 = 16;

    /**
     * Create a new capsule
     */
    public fun create_capsule(
        vault_id: ID,
        blob_id: vector<u8>,
        policy_id: vector<u8>,
        unlock_at: u64,
        is_public: bool,
        unlock_condition: u8,
        ctx: &mut TxContext
    ) {
        let empty_key = vector::empty<u8>();
        create_capsule_internal(
            vault_id,
            blob_id,
            policy_id,
            empty_key,
            unlock_at,
            is_public,
            unlock_condition,
            ctx,
        );
    }

    /**
     * Create a new capsule supplying a Seal-encrypted AES key that guards the Walrus blob.
     */
    public fun create_capsule_with_sealed_key(
        vault_id: ID,
        blob_id: vector<u8>,
        policy_id: vector<u8>,
        encrypted_aes_key_seal: vector<u8>,
        unlock_at: u64,
        is_public: bool,
        unlock_condition: u8,
        ctx: &mut TxContext
    ) {
        assert!(
            vector::length(&encrypted_aes_key_seal) > 0,
            ESealedKeyRequired
        );
        create_capsule_internal(
            vault_id,
            blob_id,
            policy_id,
            encrypted_aes_key_seal,
            unlock_at,
            is_public,
            unlock_condition,
            ctx,
        );
    }

    /**
     * Entry function: Create capsule with vault in a single transaction.
     * This creates a new vault and capsule atomically.
     * Used by browser-based frontend for 100% trustless capsule creation.
     */
    #[allow(lint(public_entry))]
    public entry fun create_capsule_with_vault(
        blob_id: vector<u8>,
        policy_id: vector<u8>,
        encrypted_aes_key_seal: vector<u8>,
        unlock_at: u64,
        is_public: bool,
        unlock_condition: u8,
        ctx: &mut TxContext
    ) {
        assert!(
            vector::length(&encrypted_aes_key_seal) > 0,
            ESealedKeyRequired
        );
        
        // Create vault first (manual unlock type = 2, no secret phrase, no unlock time)
        let vault = vault::create_vault(
            tx_context::sender(ctx),
            2, // unlock_type: 2 = manual
            vector::empty<u8>(), // empty secret_phrase_hash
            0, // unlock_at: 0 = never (manual only)
            ctx
        );
        
        let vault_id = sui::object::id(&vault);
        
        // Create capsule with the vault
        create_capsule_internal(
            vault_id,
            blob_id,
            policy_id,
            encrypted_aes_key_seal,
            unlock_at,
            is_public,
            unlock_condition,
            ctx,
        );
        
        // Transfer vault to sender (use public_transfer since Vault is defined in vault module)
        sui::transfer::public_transfer(vault, tx_context::sender(ctx));
    }

    #[allow(lint(self_transfer))]
    fun create_capsule_internal(
        vault_id: ID,
        blob_id: vector<u8>,
        policy_id: vector<u8>,
        encrypted_aes_key_seal: vector<u8>,
        unlock_at: u64,
        is_public: bool,
        unlock_condition: u8,
        ctx: &mut TxContext
    ) {
        assert!(unlock_condition <= 1, EInvalidUnlockCondition); // 0 = time, 1 = manual

        let now = tx_context::epoch_timestamp_ms(ctx);
        
        let capsule = Capsule {
            id: sui::object::new(ctx),
            owner: tx_context::sender(ctx),
            vault_id,
            blob_id,
            policy_id,
            encrypted_aes_key_seal,
            created_at: now,
            unlock_at,
            is_public,
            status: 0, // locked
            unlock_condition,
        };

        // Note: Dynamic fields for pulse and votes will be added when needed
        // We don't add them at creation to avoid complexity

        // Emit creation event
        sui::event::emit(CapsuleCreatedEvent {
            capsule_id: sui::object::id(&capsule),
            owner: capsule.owner,
            blob_id: capsule.blob_id,
            unlock_at: capsule.unlock_at,
            unlock_condition: capsule.unlock_condition,
        });

        sui::transfer::transfer(capsule, tx_context::sender(ctx));
    }

    /**
     * Unlock capsule (time-based or manual)
     * Note: Vault must be unlocked first for vault-level unlock conditions
     */
    public fun unlock_capsule(
        capsule: &mut Capsule,
        vault: &vault::Vault,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(capsule.status == 0, ECapsuleNotLocked); // Must be locked

        // Get current time (needed for both branches)
        let now = sui::clock::timestamp_ms(clock);
        let unlock_reason: String;

        // First check if vault is unlocked (for vault-level unlock conditions)
        let vault_unlocked = vault::check_vault_unlocked(vault, clock);
        if (!vault_unlocked) {
            // If vault is not unlocked, check individual capsule unlock condition
            // Check unlock condition
            if (capsule.unlock_condition == 0) {
                // Time-based: check if current time >= unlock_at
                assert!(now >= capsule.unlock_at, EInvalidUnlockCondition);
                unlock_reason = std::string::utf8(b"time_based");
            } else {
                // Manual unlock (owner only)
                assert!(sui::tx_context::sender(ctx) == capsule.owner, ENotOwner);
                unlock_reason = std::string::utf8(b"manual");
            };
        } else {
            // Vault is unlocked, so capsule can be unlocked
            unlock_reason = std::string::utf8(b"vault_unlocked");
        };

        capsule.status = 1; // unlocked

        sui::event::emit(CapsuleUnlockedEvent {
            capsule_id: sui::object::id(capsule),
            unlocked_at: now,
            unlock_reason,
        });
    }


    /**
     * Get capsule status
     */
    public fun get_status(capsule: &Capsule): u8 {
        capsule.status
    }

    /**
     * Get unlock condition
     */
    public fun get_unlock_condition(capsule: &Capsule): u8 {
        capsule.unlock_condition
    }

    /**
     * Check if capsule is unlocked
     */
    public fun is_unlocked(capsule: &Capsule): bool {
        capsule.status == 1
    }

    /**
     * Get unlock timestamp
     */
    public fun get_unlock_at(capsule: &Capsule): u64 {
        capsule.unlock_at
    }

    /**
     * Create shared ownership for a capsule
     */
    public fun create_shared_ownership(
        capsule: &Capsule,
        owners: vector<address>,
        threshold: u8,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);
        assert!(threshold > 0 && (threshold as u64) <= vector::length(&owners), EInvalidThreshold);

        let shared = SharedOwnership {
            id: sui::object::new(ctx),
            capsule_id: sui::object::id(capsule),
            owners,
            threshold,
            votes: vector::empty<address>(),
        };

        let sender = tx_context::sender(ctx);
        sui::transfer::transfer(shared, sender);
    }

    /**
     * Add owner to shared ownership
     */
    public fun add_owner(
        shared: &mut SharedOwnership,
        capsule: &Capsule,
        new_owner: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);
        
        // Check if already an owner
        let mut is_owner = false;
        let mut i = 0;
        let len = vector::length(&shared.owners);
        while (i < len) {
            if (*vector::borrow(&shared.owners, i) == new_owner) {
                is_owner = true;
                break
            };
            i = i + 1;
        };
        assert!(!is_owner, EAlreadyOwner);

        vector::push_back(&mut shared.owners, new_owner);

        sui::event::emit(OwnerAddedEvent {
            capsule_id: shared.capsule_id,
            new_owner,
        });
    }

    /**
     * Remove owner from shared ownership
     */
    public fun remove_owner(
        shared: &mut SharedOwnership,
        capsule: &Capsule,
        owner_to_remove: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);
        assert!((vector::length(&shared.owners) as u8) > shared.threshold, EInvalidThreshold);

        // Remove from owners
        let mut i = 0;
        let len = vector::length(&shared.owners);
        while (i < len) {
            if (*vector::borrow(&shared.owners, i) == owner_to_remove) {
                vector::remove(&mut shared.owners, i);
                break
            };
            i = i + 1;
        };

        // Remove from votes if present
        let mut j = 0;
        let votes_len = vector::length(&shared.votes);
        while (j < votes_len) {
            if (*vector::borrow(&shared.votes, j) == owner_to_remove) {
                vector::remove(&mut shared.votes, j);
                break
            };
            j = j + 1;
        };

        sui::event::emit(OwnerRemovedEvent {
            capsule_id: shared.capsule_id,
            removed_owner: owner_to_remove,
        });
    }

    /**
     * Vote for quorum unlock
     */
    public fun vote_for_unlock(
        shared: &mut SharedOwnership,
        capsule: &mut Capsule,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let voter = tx_context::sender(ctx);
        
        // Check if voter is an owner
        let mut is_owner = false;
        let mut i = 0;
        let len = vector::length(&shared.owners);
        while (i < len) {
            if (*vector::borrow(&shared.owners, i) == voter) {
                is_owner = true;
                break
            };
            i = i + 1;
        };
        assert!(is_owner, ENotAnOwner);

        // Check if already voted
        let mut already_voted = false;
        let mut j = 0;
        let votes_len = vector::length(&shared.votes);
        while (j < votes_len) {
            if (*vector::borrow(&shared.votes, j) == voter) {
                already_voted = true;
                break
            };
            j = j + 1;
        };

        if (!already_voted) {
            vector::push_back(&mut shared.votes, voter);
        };

        // Check if quorum is met
        let vote_count = vector::length(&shared.votes);
        if ((vote_count as u8) >= shared.threshold) {
            // Unlock capsule
            capsule.status = 1; // unlocked
            
            let now = sui::clock::timestamp_ms(clock);
            sui::event::emit(CapsuleUnlockedEvent {
                capsule_id: shared.capsule_id,
                unlocked_at: now,
                unlock_reason: std::string::utf8(b"quorum"),
            });

            sui::event::emit(QuorumUnlockInitiatedEvent {
                capsule_id: shared.capsule_id,
                votes: shared.votes,
                threshold: shared.threshold,
            });
        };
    }

    /**
     * Create delegation (temporary access grant)
     */
    public fun delegate_access(
        capsule: &Capsule,
        delegate: address,
        expires_at: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);

        let now = tx_context::epoch_timestamp_ms(ctx);
        let delegation = Delegation {
            id: sui::object::new(ctx),
            capsule_id: sui::object::id(capsule),
            delegate,
            expires_at,
            created_at: now,
        };

        sui::event::emit(DelegationCreatedEvent {
            capsule_id: delegation.capsule_id,
            delegate,
            expires_at,
        });

        let sender = tx_context::sender(ctx);
        sui::transfer::transfer(delegation, sender);
    }

    /**
     * Revoke delegation
     */
    public fun revoke_delegation(
        delegation: Delegation,
        capsule: &Capsule,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);
        // Delegation is destroyed by being moved (consumed)
        // Transfer to sender to consume it
        let sender = tx_context::sender(ctx);
        sui::transfer::transfer(delegation, sender);
    }

    /**
     * Set inheritance policy
     */
    public fun set_inheritance(
        capsule: &Capsule,
        heir: address,
        trigger_condition: u8,
        trigger_value: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == capsule.owner, ENotOwner);
        assert!(trigger_condition <= 2, EInvalidInheritanceCondition);

        let policy = InheritancePolicy {
            id: sui::object::new(ctx),
            capsule_id: sui::object::id(capsule),
            heir,
            trigger_condition,
            trigger_value,
        };

        sui::event::emit(InheritanceSetEvent {
            capsule_id: policy.capsule_id,
            heir,
            condition: trigger_condition,
        });

        let sender = tx_context::sender(ctx);
        sui::transfer::transfer(policy, sender);
    }

    /**
     * Claim inheritance (requires proof of condition)
     */
    public fun claim_inheritance(
        policy: &InheritancePolicy,
        capsule: &mut Capsule,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == policy.heir, ENotOwner);

        let now = sui::clock::timestamp_ms(clock);
        let condition_met = if (policy.trigger_condition == 0) {
            // Death condition - would require external proof
            false // In production, would verify death certificate or similar
        } else if (policy.trigger_condition == 1) {
            // Time-based condition
            now >= policy.trigger_value
        } else if (policy.trigger_condition == 2) {
            // Manual condition - always met if called
            true
        } else {
            false
        };

        assert!(condition_met, EInvalidInheritanceCondition);

        // Transfer ownership
        capsule.owner = policy.heir;
    }
}

