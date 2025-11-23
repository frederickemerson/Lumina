module obscura::obscura;

use sui::coin;
use sui::sui::SUI;
use obscura::types;

/// Create a new vault for a user
public fun create_vault(ctx: &mut sui::tx_context::TxContext): types::Vault {
    types::create_vault(
        std::vector::empty<u8>(),
        sui::tx_context::sender(ctx),
        0,
        ctx
    )
}

/// Deposit USDC into the vault
/// The encrypted blob ID from Walrus should be passed as blob_id
#[allow(lint(self_transfer))]
public fun deposit(
    vault: &mut types::Vault,
    payment: coin::Coin<SUI>, // Using SUI for now, will be USDC in production
    blob_id: vector<u8>,
    ctx: &mut sui::tx_context::TxContext
) {
    let amount = coin::value(&payment);
    let sender = sui::tx_context::sender(ctx);
    
    // Verify ownership
    assert!(types::owner(vault) == sender, 1);
    
    // Update vault state
    types::set_encrypted_blob_id(vault, blob_id);
    types::add_to_deposits(vault, amount);
    
    // Transfer payment to vault (in production, this would be locked)
    // For now, transfer to sender (in production, use treasury)
    sui::transfer::public_transfer(payment, sender);
    
    // Emit deposit event
    types::emit_deposit_event(
        sender,
        amount,
        blob_id,
        sui::tx_context::epoch_timestamp_ms(ctx)
    );
}

/// Get vault information (read-only)
public fun get_vault_info(vault: &types::Vault): (address, u64) {
    (types::owner(vault), types::total_deposits(vault))
}

/// Get encrypted blob ID
public fun get_blob_id(vault: &types::Vault): vector<u8> {
    types::encrypted_blob_id(vault)
}

