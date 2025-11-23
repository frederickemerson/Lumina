module obscura::types;

/// Vault object storing encrypted balance references
public struct Vault has key, store {
    id: UID,
    /// Encrypted blob ID from Walrus
    encrypted_blob_id: vector<u8>,
    /// Owner address
    owner: address,
    /// Total deposits (encrypted)
    total_deposits: u64,
}

/// Get owner address
public fun owner(vault: &Vault): address {
    vault.owner
}

/// Get total deposits
public fun total_deposits(vault: &Vault): u64 {
    vault.total_deposits
}

/// Get encrypted blob ID
public fun encrypted_blob_id(vault: &Vault): vector<u8> {
    vault.encrypted_blob_id
}

/// Set encrypted blob ID
public fun set_encrypted_blob_id(vault: &mut Vault, blob_id: vector<u8>) {
    vault.encrypted_blob_id = blob_id;
}

/// Set total deposits
public fun set_total_deposits(vault: &mut Vault, amount: u64) {
    vault.total_deposits = amount;
}

/// Add to total deposits
public fun add_to_deposits(vault: &mut Vault, amount: u64) {
    vault.total_deposits = vault.total_deposits + amount;
}

/// Subtract from total deposits
public fun subtract_from_deposits(vault: &mut Vault, amount: u64) {
    vault.total_deposits = vault.total_deposits - amount;
}

/// Create a new vault (must be in types module to access private fields)
public fun create_vault(
    encrypted_blob_id: vector<u8>,
    owner: address,
    total_deposits: u64,
    ctx: &mut sui::tx_context::TxContext
): Vault {
    Vault {
        id: sui::object::new(ctx),
        encrypted_blob_id,
        owner,
        total_deposits,
    }
}

/// Deposit event
public struct DepositEvent has copy, drop {
    depositor: address,
    amount: u64,
    blob_id: vector<u8>,
    timestamp: u64,
}

/// Withdrawal event
public struct WithdrawEvent has copy, drop {
    withdrawer: address,
    amount: u64,
    timestamp: u64,
}

/// Yield accrual event
public struct YieldEvent has copy, drop {
    vault_id: ID,
    yield_amount: u64,
    timestamp: u64,
}

/// Emit deposit event (helper function)
public fun emit_deposit_event(
    depositor: address,
    amount: u64,
    blob_id: vector<u8>,
    timestamp: u64
) {
    sui::event::emit(DepositEvent {
        depositor,
        amount,
        blob_id,
        timestamp,
    });
}

/// Emit withdraw event (helper function)
public fun emit_withdraw_event(
    withdrawer: address,
    amount: u64,
    timestamp: u64
) {
    sui::event::emit(WithdrawEvent {
        withdrawer,
        amount,
        timestamp,
    });
}

/// Emit yield event (helper function)
public fun emit_yield_event(
    vault_id: ID,
    yield_amount: u64,
    timestamp: u64
) {
    sui::event::emit(YieldEvent {
        vault_id,
        yield_amount,
        timestamp,
    });
}

