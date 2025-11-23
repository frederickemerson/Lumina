/**
 * Dead-Man's Switch Policy Contract
 * 
 * Manages programmable dead-man's switch policies with check-ins and auto-release triggers.
 * Integrates with Seal for threshold decryption when switch triggers.
 */

module obscura::dead_man_switch {
    use sui::clock;
    use std::string::String;

    /// Dead-man's switch policy object
    public struct DeadManSwitch has key {
        id: UID,
        vault_id: String,
        policy_id: String, // Seal policy ID
        check_in_interval_seconds: u64, // Check-in interval in seconds
        max_missed_checkins: u64,
        status: u8, // 0 = active, 1 = triggered, 2 = disabled
        created_at: u64,
        last_check_in: u64,
        next_check_in_due: u64,
        missed_checkins_count: u64,
    }

    /// Check-in event
    public struct CheckInEvent has copy, drop {
        vault_id: String,
        switch_id: ID,
        check_in_time: u64,
        method: u8, // 0 = transaction, 1 = biometric, 2 = manual
    }

    /// Switch triggered event
    public struct SwitchTriggeredEvent has copy, drop {
        vault_id: String,
        switch_id: ID,
        trigger_reason: String,
        triggered_at: u64,
    }

    /// Error codes
    const ESwitchNotActive: u64 = 1;
    const EInvalidConfig: u64 = 3;

    /**
     * Create a new dead-man's switch policy
     */
    public fun create_switch(
        vault_id: vector<u8>,
        policy_id: vector<u8>,
        check_in_interval_hours: u64,
        max_missed_checkins: u64,
        ctx: &mut sui::tx_context::TxContext
    ) {
        // Validate configuration
        assert!(check_in_interval_hours > 0, EInvalidConfig);
        assert!(max_missed_checkins > 0, EInvalidConfig);
        assert!(check_in_interval_hours <= 8760, EInvalidConfig); // Max 1 year

        let now = sui::tx_context::epoch_timestamp_ms(ctx);
        let check_in_interval_seconds = check_in_interval_hours * 3600;
        let next_check_in_due = now + (check_in_interval_seconds * 1000); // Convert to milliseconds

        let switch = DeadManSwitch {
            id: sui::object::new(ctx),
            vault_id: std::string::utf8(vault_id),
            policy_id: std::string::utf8(policy_id),
            check_in_interval_seconds,
            max_missed_checkins,
            status: 0, // active
            created_at: now,
            last_check_in: 0,
            next_check_in_due,
            missed_checkins_count: 0,
        };

        // Transfer to sender (vault owner)
        sui::transfer::transfer(switch, sui::tx_context::sender(ctx));
    }

    /**
     * Record a check-in
     */
    public fun record_check_in(
        switch: &mut DeadManSwitch,
        method: u8, // 0 = transaction, 1 = biometric, 2 = manual
        clock: &clock::Clock,
        _ctx: &sui::tx_context::TxContext
    ) {
        assert!(switch.status == 0, ESwitchNotActive); // Must be active

        let now = sui::clock::timestamp_ms(clock);
        switch.last_check_in = now;
        switch.next_check_in_due = now + (switch.check_in_interval_seconds * 1000); // Convert seconds to milliseconds
        switch.missed_checkins_count = 0;

        // Emit check-in event
        sui::event::emit(CheckInEvent {
            vault_id: switch.vault_id,
            switch_id: sui::object::id(switch),
            check_in_time: now,
            method,
        });
    }

    /**
     * Check if trigger conditions are met
     * Returns true if switch should trigger release
     */
    public fun check_trigger_conditions(
        switch: &DeadManSwitch,
        clock: &clock::Clock
    ): bool {
        if (switch.status != 0) {
            return false // Not active
        };

        let now = sui::clock::timestamp_ms(clock);
        
        // Check if check-in is overdue
        if (now > switch.next_check_in_due) {
            // Calculate missed check-ins
            let overdue_ms = now - switch.next_check_in_due;
            let interval_ms = switch.check_in_interval_seconds * 1000; // Convert to milliseconds
            let missed_intervals = overdue_ms / interval_ms + 1;
            
            return missed_intervals >= switch.max_missed_checkins
        };

        false
    }

    /**
     * Trigger release (called by monitoring service)
     */
    public fun trigger_release(
        switch: &mut DeadManSwitch,
        trigger_reason: vector<u8>,
        clock: &clock::Clock,
        _ctx: &sui::tx_context::TxContext
    ) {
        assert!(switch.status == 0, ESwitchNotActive); // Must be active

        let now = sui::clock::timestamp_ms(clock);
        switch.status = 1; // triggered
        switch.missed_checkins_count = switch.max_missed_checkins;

        // Emit trigger event
        sui::event::emit(SwitchTriggeredEvent {
            vault_id: switch.vault_id,
            switch_id: sui::object::id(switch),
            trigger_reason: std::string::utf8(trigger_reason),
            triggered_at: now,
        });

        // Note: Seal decryption will be triggered by backend service
        // based on this event
    }

    /**
     * Disable switch (owner can disable manually)
     */
    public fun disable_switch(
        switch: &mut DeadManSwitch,
        _ctx: &sui::tx_context::TxContext
    ) {
        // Note: Ownership is verified by the fact that only the owner can pass &mut
        // In a real implementation, you'd store owner address in the struct
        switch.status = 2; // disabled
    }

    /**
     * Get switch status
     */
    public fun get_status(switch: &DeadManSwitch): (u8, u64, u64, u64) {
        (
            switch.status,
            switch.last_check_in,
            switch.next_check_in_due,
            switch.missed_checkins_count
        )
    }

    /**
     * Get switch info
     */
    public fun get_info(switch: &DeadManSwitch): (String, String, u64, u64) {
        (
            switch.vault_id,
            switch.policy_id,
            switch.check_in_interval_seconds,
            switch.max_missed_checkins
        )
    }
}

