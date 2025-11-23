/**
 * LUMINA Capsule NFT Contract
 * Mints NFT for each capsule with dynamic glow intensity synced to heartbeat
 */

#[allow(duplicate_alias)]
module lumina::capsule_nft {
    use sui::object::{UID, ID};
    use sui::clock::Clock;
    use lumina::capsule::{Self, Capsule};

    /// Capsule NFT - represents the orb with dynamic glow
    /// Contains: picture/video (main blob) + message + voice recording (optional)
    public struct CapsuleNFT has key, store {
        id: UID,
        capsule_id: vector<u8>,   // Capsule identifier (hash string as bytes)
        owner: address,
        glow_intensity: u8,        // 0-255 (0 = no glow, 255 = max glow)
        created_at: u64,
        // NFT content components
        media_blob_id: vector<u8>,  // Picture/video blob ID (required)
        message: vector<u8>,        // User message (required)
        voice_blob_id: vector<u8>,  // Voice recording blob ID (optional, empty if none)
    }

    /// NFT created event
    public struct NFTMintedEvent has copy, drop {
        nft_id: ID,
        capsule_id: vector<u8>,
        owner: address,
        glow_intensity: u8,
    }

    /// Glow updated event
    public struct GlowUpdatedEvent has copy, drop {
        nft_id: ID,
        new_glow_intensity: u8,
    }

    /// Error codes
    const EInvalidGlowIntensity: u64 = 1;
    const ENotOwner: u64 = 2;

    /**
     * Mint NFT for a capsule (entry function for external calls)
     * @param capsule_id - Capsule identifier (hash string as bytes)
     * @param owner - Owner address
     * @param media_blob_id - Picture/video blob ID (required)
     * @param message - User message (required)
     * @param voice_blob_id - Voice recording blob ID (optional, empty vector if none)
     */
    #[allow(lint(public_entry))]
    public entry fun mint_nft(
        capsule_id: vector<u8>,
        owner: address,
        media_blob_id: vector<u8>,
        message: vector<u8>,
        voice_blob_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let nft = mint_nft_internal(capsule_id, owner, media_blob_id, message, voice_blob_id, ctx);
        // Transfer NFT to owner
        sui::transfer::transfer(nft, owner);
    }

    /**
     * Internal mint function (returns the NFT object)
     */
    fun mint_nft_internal(
        capsule_id: vector<u8>,
        owner: address,
        media_blob_id: vector<u8>,
        message: vector<u8>,
        voice_blob_id: vector<u8>,
        ctx: &mut TxContext
    ): CapsuleNFT {
        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        
        let nft = CapsuleNFT {
            id: sui::object::new(ctx),
            capsule_id,
            owner,
            glow_intensity: 200, // Initial glow (0.8 * 255)
            created_at: now,
            media_blob_id,
            message,
            voice_blob_id,
        };

        // Emit mint event
        sui::event::emit(NFTMintedEvent {
            nft_id: sui::object::id(&nft),
            capsule_id,
            owner,
            glow_intensity: nft.glow_intensity,
        });

        nft
    }

    /**
     * Update glow intensity (called when heartbeat received)
     */
    public fun update_glow(
        nft: &mut CapsuleNFT,
        new_intensity: u8,
        ctx: &mut TxContext
    ) {
        assert!(new_intensity <= 255, EInvalidGlowIntensity);
        assert!(sui::tx_context::sender(ctx) == nft.owner, ENotOwner);

        nft.glow_intensity = new_intensity;

        // Emit update event
        sui::event::emit(GlowUpdatedEvent {
            nft_id: sui::object::id(nft),
            new_glow_intensity: new_intensity,
        });
    }

    /**
     * Get glow intensity
     */
    public fun get_glow_intensity(nft: &CapsuleNFT): u8 {
        nft.glow_intensity
    }

    /**
     * Get capsule ID
     */
    public fun get_capsule_id(nft: &CapsuleNFT): vector<u8> {
        nft.capsule_id
    }

    /**
     * Sync glow intensity from capsule state
     * Calculates glow based on:
     * - Time until unlock (closer = brighter)
     * - Capsule status (unlocked = max glow)
     * - Access count (more accesses = brighter)
     */
    public fun sync_glow_from_capsule(
        nft: &mut CapsuleNFT,
        capsule: &Capsule,
        clock: &Clock,
        access_count: u64,
        _ctx: &mut TxContext
    ) {
        // Note: capsule_id is now vector<u8>, so we can't directly compare with capsule.id
        // This function may need to be updated if we need to verify capsule_id matches
        let now = sui::clock::timestamp_ms(clock);
        let mut glow: u8 = 100; // Base glow

        // If unlocked, max glow
        if (capsule::is_unlocked(capsule)) {
            glow = 255;
        } else {
            // Calculate glow based on time until unlock
            let unlock_at = capsule::get_unlock_at(capsule);
            if (unlock_at > 0 && unlock_at > now) {
                let time_until_unlock = unlock_at - now;
                let days_until = time_until_unlock / (24 * 60 * 60 * 1000);
                
                // Closer to unlock = brighter (inverse relationship)
                // If < 30 days, max glow; if > 365 days, base glow
                if (days_until < 30) {
                    glow = 255;
                } else {
                    if (days_until < 365) {
                        // Linear interpolation: 30 days = 255, 365 days = 100
                        let progress = (365 - days_until) as u64 / 335; // 0 to 1
                        glow = (100 + (progress * 155) / 1) as u8;
                    } else {
                        glow = 100;
                    };
                };
            };

            // Boost glow based on access count (capped at +50)
            let access_boost = if (access_count > 10) {
                50
            } else {
                (access_count * 5) as u8
            };
            
            let new_glow = (glow as u64) + (access_boost as u64);
            if (new_glow > 255) {
                glow = 255;
            } else {
                glow = new_glow as u8;
            };
        };

        // Update glow
        nft.glow_intensity = glow;

        // Emit update event
        sui::event::emit(GlowUpdatedEvent {
            nft_id: sui::object::id(nft),
            new_glow_intensity: glow,
        });
    }

    /**
     * Transfer NFT
     */
    #[allow(lint(custom_state_change))]
    public fun transfer(mut nft: CapsuleNFT, recipient: address, _ctx: &mut TxContext) {
        nft.owner = recipient;
        sui::transfer::transfer(nft, recipient);
    }

    /**
     * Transfer NFT to another address (for sharing)
     * @param nft - NFT to transfer
     * @param recipient - Recipient wallet address
     */
    #[allow(lint(custom_state_change))]
    public fun transfer_to_address(
        mut nft: CapsuleNFT,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(sui::tx_context::sender(ctx) == nft.owner, ENotOwner);
        nft.owner = recipient;
        sui::transfer::transfer(nft, recipient);
    }
}

