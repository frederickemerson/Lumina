#!/bin/bash

# Build and publish Move package
# This script finds sui CLI and runs build/publish

set -e

# Try to find sui CLI
SUI_CMD=""

# Check common locations
if command -v sui &> /dev/null; then
    SUI_CMD="sui"
elif [ -f "$HOME/.cargo/bin/sui" ]; then
    SUI_CMD="$HOME/.cargo/bin/sui"
    export PATH="$HOME/.cargo/bin:$PATH"
elif [ -f "/usr/local/bin/sui" ]; then
    SUI_CMD="/usr/local/bin/sui"
elif [ -f "/opt/homebrew/bin/sui" ]; then
    SUI_CMD="/opt/homebrew/bin/sui"
else
    echo "❌ Error: Sui CLI not found"
    echo "Install it with:"
    echo "  cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui"
    exit 1
fi

echo "✅ Found Sui CLI: $SUI_CMD"
echo ""

cd move

# Build until successful
echo "🔨 Building Move package..."
MAX_ATTEMPTS=10
ATTEMPT=1

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    
    BUILD_OUTPUT=$($SUI_CMD move build 2>&1)
    BUILD_EXIT=$?
    
    if [ $BUILD_EXIT -eq 0 ]; then
        echo "✅ Build successful!"
        echo ""
        break
    else
        echo "$BUILD_OUTPUT"
        echo ""
        echo "❌ Build failed. Please fix the errors above and press Enter to retry..."
        read -r
        ATTEMPT=$((ATTEMPT + 1))
    fi
done

if [ $BUILD_EXIT -ne 0 ]; then
    echo "❌ Build failed after $MAX_ATTEMPTS attempts"
    exit 1
fi

# Publish
echo "📤 Publishing package to testnet..."
echo ""

$SUI_CMD client publish --skip-dependency-verification --gas-budget 100000000

echo ""
echo "✅ Done!"

