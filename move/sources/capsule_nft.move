/**
 * LUMINA Capsule NFT Contract
 * Mints NFT for each capsule with dynamic glow intensity synced to heartbeat
 */

#[allow(duplicate_alias)]
module lumina::capsule_nft {
    use sui::object::{UID, ID};
    use sui::clock::Clock;
    use std::string::{Self, String};
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
        // Timed unlock fields
        unlock_at: u64,            // Timestamp when NFT unlocks (0 = no time lock, unlocked immediately)
        is_locked: bool,           // Whether NFT is currently locked (true = locked, false = unlocked)
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

    /// NFT unlocked event
    public struct NFTUnlockedEvent has copy, drop {
        nft_id: ID,
        unlocked_at: u64,
    }

    /// Error codes
    const EInvalidGlowIntensity: u64 = 1;
    const ENotOwner: u64 = 2;
    const ENFTNotLocked: u64 = 3;
    const EUnlockTimeNotReached: u64 = 4;

    /**
     * Mint NFT for a capsule (entry function for external calls)
     * @param capsule_id - Capsule identifier (hash string as bytes)
     * @param owner - Owner address
     * @param media_blob_id - Picture/video blob ID (required)
     * @param message - User message (required)
     * @param voice_blob_id - Voice recording blob ID (optional, empty vector if none)
     * @param unlock_at - Timestamp when NFT unlocks (0 = no time lock, unlocked immediately)
     */
    #[allow(lint(public_entry))]
    public entry fun mint_nft(
        capsule_id: vector<u8>,
        owner: address,
        media_blob_id: vector<u8>,
        message: vector<u8>,
        voice_blob_id: vector<u8>,
        unlock_at: u64,
        ctx: &mut TxContext
    ) {
        let nft = mint_nft_internal(capsule_id, owner, media_blob_id, message, voice_blob_id, unlock_at, ctx);
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
        unlock_at: u64,
        ctx: &mut TxContext
    ): CapsuleNFT {
        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        
        // Determine if NFT should be locked initially
        // If unlock_at is 0, NFT is unlocked immediately
        // If unlock_at > now, NFT is locked until that time
        // If unlock_at <= now, NFT is unlocked immediately
        let is_locked = if (unlock_at == 0) {
            false // No time lock, unlocked immediately
        } else {
            unlock_at > now // Locked if unlock time is in the future
        };
        
        let nft = CapsuleNFT {
            id: sui::object::new(ctx),
            capsule_id,
            owner,
            glow_intensity: 200, // Initial glow (0.8 * 255)
            created_at: now,
            media_blob_id,
            message,
            voice_blob_id,
            unlock_at,
            is_locked,
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

    /**
     * Unlock NFT when unlock time is reached
     * Can be called by anyone once the unlock time has passed
     * @param nft - NFT to unlock
     * @param clock - Sui Clock object for timestamp
     */
    #[allow(lint(public_entry))]
    public entry fun unlock_nft(
        nft: &mut CapsuleNFT,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Check if NFT is locked
        assert!(nft.is_locked, ENFTNotLocked);
        
        // Check if unlock time has been set
        assert!(nft.unlock_at > 0, EUnlockTimeNotReached);
        
        // Get current time from clock
        let now = sui::clock::timestamp_ms(clock);
        
        // Check if unlock time has been reached
        assert!(now >= nft.unlock_at, EUnlockTimeNotReached);
        
        // Unlock the NFT
        nft.is_locked = false;
        
        // Emit unlock event
        sui::event::emit(NFTUnlockedEvent {
            nft_id: sui::object::id(nft),
            unlocked_at: now,
        });
    }

    /**
     * Get unlock timestamp
     */
    public fun get_unlock_at(nft: &CapsuleNFT): u64 {
        nft.unlock_at
    }

    /**
     * Check if NFT is locked
     */
    public fun is_locked(nft: &CapsuleNFT): bool {
        nft.is_locked
    }

    // ========== Display Implementation ==========
    // These functions provide display metadata for Sui wallets
    // Sui wallets call these getter functions to retrieve display metadata
    // Note: For Display to work, you may need to create a Display object
    // using the Display module after publishing the package

    /**
     * Get display name
     */
    public fun name(_nft: &CapsuleNFT): String {
        string::utf8(b"Memory Capsule")
    }

    /**
     * Get display description
     */
    public fun description(nft: &CapsuleNFT): String {
        // Use the message as description if available, otherwise use default
        if (std::vector::length(&nft.message) > 0) {
            string::utf8(nft.message)
        } else {
            string::utf8(b"A preserved memory capsule")
        }
    }

    /**
     * Get image URL
     * Returns the URL to the logo.png preview endpoint
     * Format: https://api.lumina.vercel.app/api/capsule/{capsule_id_hex}/nft/preview
     * Note: Update this URL after deploying to your Vercel domain
     */
    public fun image_url(nft: &CapsuleNFT): String {
        // Build the image URL using capsule_id
        // TODO: Update this to your actual Vercel backend URL
        let mut base = b"https://api.lumina.vercel.app/api/capsule/";
        let suffix = b"/nft/preview";
        
        // Convert capsule_id bytes to hex string for URL
        let capsule_id_hex = get_capsule_id_hex(nft);
        
        // Concatenate: base + capsule_id_hex + suffix
        std::vector::append(&mut base, capsule_id_hex);
        std::vector::append(&mut base, suffix);
        
        string::utf8(base)
    }

    /**
     * Get link URL
     * Returns link to the capsule page
     * Note: Update this URL after deploying to your Vercel domain
     */
    public fun link(nft: &CapsuleNFT): String {
        // TODO: Update this to your actual Vercel frontend URL
        let mut base = b"https://lumina.vercel.app/memory/";
        let capsule_id_hex = get_capsule_id_hex(nft);
        std::vector::append(&mut base, capsule_id_hex);
        string::utf8(base)
    }

    /**
     * Helper function to convert capsule_id bytes to hex string
     */
    fun get_capsule_id_hex(nft: &CapsuleNFT): vector<u8> {
        let capsule_id = nft.capsule_id;
        let hex_chars = b"0123456789abcdef";
        let mut result = std::vector::empty<u8>();
        let len = std::vector::length(&capsule_id);
        let mut i = 0;
        
        while (i < len) {
            let byte = *std::vector::borrow(&capsule_id, i);
            let high_nibble = byte >> 4;
            let low_nibble = byte & 0x0f;
            
            std::vector::push_back(&mut result, *std::vector::borrow(&hex_chars, (high_nibble as u64)));
            std::vector::push_back(&mut result, *std::vector::borrow(&hex_chars, (low_nibble as u64)));
            i = i + 1;
        };
        
        result
    }
}

