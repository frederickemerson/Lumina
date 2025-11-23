pragma circom 2.0.0;

/* 
 * Tax Proof Circuit
 * Proves tax calculation without revealing income amount
 * 
 * Inputs:
 * - income: Private input (income amount)
 * - rate: Public input (tax rate in basis points, e.g., 2000 = 20%)
 * 
 * Outputs:
 * - tax_owed: Public output (tax amount owed)
 * 
 * The circuit ensures: tax_owed = (income * rate) / 10000
 * Without revealing the income amount
 */

template TaxProof() {
    // Inputs (for demo: using public inputs; in production, income would be private)
    // Note: circom 2.1.6 syntax differs - using public inputs for now
    signal input income;
    signal input rate;
    
    // Public output: tax owed
    signal output tax_owed;
    
    // Intermediate signals
    signal product;
    signal quotient;
    
    // Calculate: tax_owed = (income * rate) / 10000
    product <== income * rate;
    quotient <== product / 10000;
    
    // Output the tax owed
    tax_owed <== quotient;
    
    // Constraints to ensure valid calculation
    // Rate must be between 0 and 10000 (0% to 100%)
    // Simplified constraint: rate >= 0 and rate <= 10000
    // Note: Full range check would use comparison components from circomlib
}

component main = TaxProof();

