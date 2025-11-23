#!/bin/bash

# Deploy Seal Access Policy Package to Sui Testnet
# This script deploys the seal_policy.move module and extracts the package ID

set -e

echo "🚀 Deploying Seal Access Policy Package to Sui Testnet"
echo ""

# Check if Sui CLI is installed
if ! command -v sui &> /dev/null; then
    echo "❌ Error: Sui CLI not found"
    echo "Install it with: cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui"
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "move" ]; then
    echo "❌ Error: 'move' directory not found"
    echo "Please run this script from the project root"
    exit 1
fi

# Check if Move package is built
if [ ! -d "move/build/obscura" ]; then
    echo "📦 Building Move package..."
    cd move
    sui move build
    cd ..
fi

# Check for active address
echo "🔍 Checking for active Sui address..."
ACTIVE_ADDRESS=$(sui client active-address 2>/dev/null || echo "")

if [ -z "$ACTIVE_ADDRESS" ]; then
    echo "❌ Error: No active Sui address found"
    echo ""
    echo "To set up:"
    echo "1. Create a new address: sui client new-address ed25519"
    echo "2. Set as active: sui client switch --address <address>"
    echo "3. Get testnet SUI from: https://discord.com/channels/916379725201563759/971488439931392130"
    exit 1
fi

echo "✅ Active address: $ACTIVE_ADDRESS"
echo ""

# Check gas balance
echo "💰 Checking gas balance..."
BALANCE=$(sui client gas 2>/dev/null | grep -oP 'Total Gas: \K[0-9.]+' || echo "0")
echo "   Balance: $BALANCE SUI"
echo ""

if (( $(echo "$BALANCE < 0.1" | bc -l) )); then
    echo "⚠️  Warning: Low gas balance. You may need more SUI for deployment."
    echo "   Get testnet SUI from: https://discord.com/channels/916379725201563759/971488439931392130"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Deploy the package
echo "📤 Deploying package..."
cd move

# Publish the package (includes seal_policy module)
# Note: We publish the whole package, but only seal_policy is needed for Seal
DEPLOY_OUTPUT=$(sui client publish --skip-dependency-verification --gas-budget 100000000 --json 2>&1)

# Check if deployment succeeded
if echo "$DEPLOY_OUTPUT" | grep -q '"status":"success"'; then
    echo "✅ Deployment successful!"
    echo ""
    
    # Extract package ID from JSON output
    PACKAGE_ID=$(echo "$DEPLOY_OUTPUT" | grep -oP '"packageId":"\K[^"]+' | head -1)
    
    if [ -z "$PACKAGE_ID" ]; then
        # Try alternative extraction method
        PACKAGE_ID=$(echo "$DEPLOY_OUTPUT" | jq -r '.objectChanges[] | select(.type=="published") | .packageId' 2>/dev/null || echo "")
    fi
    
    if [ -n "$PACKAGE_ID" ]; then
        echo "📋 Deployment Information:"
        echo "   Package ID: $PACKAGE_ID"
        echo "   Network: testnet"
        echo "   Explorer: https://suiexplorer.com/object/$PACKAGE_ID?network=testnet"
        echo ""
        
        # Update backend/.env if it exists
        if [ -f "../backend/.env" ]; then
            if grep -q "SEAL_PACKAGE_ID=" "../backend/.env"; then
                # Update existing entry
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    # macOS
                    sed -i '' "s/SEAL_PACKAGE_ID=.*/SEAL_PACKAGE_ID=$PACKAGE_ID/" "../backend/.env"
                else
                    # Linux
                    sed -i "s/SEAL_PACKAGE_ID=.*/SEAL_PACKAGE_ID=$PACKAGE_ID/" "../backend/.env"
                fi
            else
                # Add new entry
                echo "SEAL_PACKAGE_ID=$PACKAGE_ID" >> "../backend/.env"
            fi
            echo "✅ Updated backend/.env automatically!"
        else
            echo "💾 Add to backend/.env:"
            echo "   SEAL_PACKAGE_ID=$PACKAGE_ID"
        fi
        echo ""
        echo "🔄 Restart your backend server to use the new package ID"
    else
        echo "⚠️  Could not extract package ID automatically"
        echo "   Check the output above for the package ID"
        echo "   Look for a line like: Published package: 0x..."
    fi
else
    echo "❌ Deployment failed!"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

cd ..

