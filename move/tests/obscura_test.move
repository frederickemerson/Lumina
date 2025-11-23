#[test_only]
module obscura::obscura_test;

use obscura::obscura;
use obscura::types::Vault;
use sui::test_scenario;
use sui::coin;
use sui::sui::SUI;
use sui::transfer;

#[test]
fun test_create_vault() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;
    let ctx = test_scenario::ctx(scenario);

    // Create vault
    let vault = obscura::create_vault(ctx);
    
    // Transfer vault to test account so it can be cleaned up
    transfer::public_transfer(vault, @0x1);
    
    // Verify vault was created (we can't access it after transfer, but creation succeeded)
    test_scenario::end(scenario_val);
}

#[test]
fun test_deposit() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;
    let ctx = test_scenario::ctx(scenario);
    
    // Create vault
    let mut vault = obscura::create_vault(ctx);
    
    // Create test coin
    let coin = coin::mint_for_testing<SUI>(1000, ctx);
    let blob_id = b"test-blob-id";
    
    // Deposit
    obscura::deposit(&mut vault, coin, blob_id, ctx);
    
    // Verify deposit
    let (_owner, deposits) = obscura::get_vault_info(&vault);
    assert!(deposits == 1000, 0);
    
    // Transfer vault to test account so it can be cleaned up
    transfer::public_transfer(vault, @0x1);
    
    test_scenario::end(scenario_val);
}

#[test]
#[expected_failure(abort_code = obscura::ENotOwner)]
fun test_deposit_wrong_owner() {
    let mut scenario_val = test_scenario::begin(@0x1);
    let scenario = &mut scenario_val;
    let ctx = test_scenario::ctx(scenario);
    
    // Create vault with user 1
    let vault = obscura::create_vault(ctx);
    
    // Transfer vault to account so it persists across transactions
    transfer::public_transfer(vault, @0x1);
    
    // Switch to user 2
    test_scenario::next_tx(scenario, @0x2);
    
    // Get vault from account @0x1 (not from sender since sender is now @0x2)
    let mut vault = test_scenario::take_from_address<Vault>(scenario, @0x1);
    let ctx2 = test_scenario::ctx(scenario);
    let coin = coin::mint_for_testing<SUI>(1000, ctx2);
    let blob_id = b"test-blob-id";
    
    // Try to deposit with wrong owner (should fail)
    obscura::deposit(&mut vault, coin, blob_id, ctx2);
    
    // Return vault (won't reach here due to expected failure)
    test_scenario::return_to_sender(scenario, vault);
    test_scenario::end(scenario_val);
}

