#!/bin/bash
# Deploy Obscura Move contracts to Sui testnet

set -e

# Add Sui to PATH if not already there
export PATH="$HOME/.local/bin:$PATH"

# Check if sui is available
if ! command -v sui &> /dev/null; then
    echo "Error: Sui CLI not found. Please install it first."
    exit 1
fi

# Navigate to move directory
cd "$(dirname "$0")/../move"

echo "Building Move contracts..."
sui move build

echo ""
echo "Publishing to testnet..."
echo "Wallet: $(sui client active-address)"
echo ""

# Publish with gas budget
sui client publish --gas-budget 100000000

echo ""
echo "✅ Deployment complete!"
echo "Check deploy-result.txt for package details."

