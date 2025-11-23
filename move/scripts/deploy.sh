#!/bin/bash

# Deploy LUMINA Move contracts to Sui testnet
# 
# Prerequisites:
# 1. Install Sui CLI: https://docs.sui.io/build/install
# 2. Get testnet SUI: sui client faucet
# 3. Make sure you're on testnet: sui client switch --env testnet

set -e

NETWORK=${1:-testnet}  # Default to testnet, can override with: ./deploy.sh devnet

echo "🚀 Deploying LUMINA contracts to Sui $NETWORK..."

# Check if Sui CLI is installed
if ! command -v sui &> /dev/null; then
    echo "❌ Sui CLI not found. Please install it first."
    echo "   Visit: https://docs.sui.io/build/install"
    exit 1
fi

# Switch to correct network
CURRENT_ENV=$(sui client active-env 2>/dev/null || echo "unknown")
if [ "$CURRENT_ENV" != "$NETWORK" ]; then
    echo "⚠️  Current environment is $CURRENT_ENV"
    echo "   Switching to $NETWORK..."
    sui client switch --env $NETWORK
fi

# Check if we have SUI
echo "💰 Checking SUI balance..."
BALANCE=$(sui client gas 2>/dev/null | head -1 || echo "0")
if [ "$BALANCE" = "0" ] || [ -z "$BALANCE" ]; then
    echo "⚠️  No SUI detected. Getting from faucet..."
    sui client faucet || echo "⚠️  Faucet failed. Make sure you have SUI for gas."
fi

# Build contracts
echo "📦 Building Move contracts..."
cd "$(dirname "$0")/.."  # Go to move/ directory
sui move build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors and try again."
    exit 1
fi

# Get gas budget (default 100M = 0.1 SUI)
GAS_BUDGET=${GAS_BUDGET:-100000000}

# Publish contracts
echo "📤 Publishing contracts to $NETWORK..."
echo "   Gas budget: $GAS_BUDGET MIST ($(echo "scale=4; $GAS_BUDGET/1000000000" | bc) SUI)"
PUBLISH_OUTPUT=$(sui client publish --gas-budget $GAS_BUDGET --json 2>&1)

# Extract package ID (try multiple methods)
PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | jq -r '.objectChanges[]? | select(.type == "published") | .packageId' 2>/dev/null)

if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" == "null" ]; then
    # Try alternative extraction method
    PACKAGE_ID=$(echo "$PUBLISH_OUTPUT" | grep -oP 'Published Objects:.*?PackageID: \K[0-9a-fx]+' | head -1)
fi

if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" == "null" ]; then
    echo "❌ Failed to extract package ID from publish output"
    echo ""
    echo "Publish output:"
    echo "$PUBLISH_OUTPUT"
    echo ""
    echo "💡 Try manually extracting the Package ID from the output above"
    exit 1
fi

echo ""
echo "✅ Contracts deployed successfully!"
echo ""
echo "📋 Deployment Information:"
echo "   Package ID: $PACKAGE_ID"
echo "   Network: $NETWORK"
echo "   Explorer: https://suiexplorer.com/object/$PACKAGE_ID?network=$NETWORK"
echo ""
echo "💾 Add this to your frontend/.env file:"
echo "   VITE_CAPSULE_PACKAGE_ID=$PACKAGE_ID"
echo "   VITE_CAPSULE_NFT_PACKAGE_ID=$PACKAGE_ID"
echo ""
echo "💾 Add this to your backend/.env file (if using backend):"
echo "   CAPSULE_PACKAGE_ID=$PACKAGE_ID"
echo ""

# Save to file
echo "CAPSULE_PACKAGE_ID=$PACKAGE_ID" > .deployment
echo "CAPSULE_NFT_PACKAGE_ID=$PACKAGE_ID" >> .deployment
echo "NETWORK=$NETWORK" >> .deployment
echo "DEPLOYED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> .deployment

echo "📝 Deployment info saved to move/.deployment"
echo ""
echo "🎉 Next steps:"
echo "   1. Copy the Package ID above to your .env files"
echo "   2. Start frontend: cd frontend && npm run dev"
echo "   3. Test capsule creation!"

