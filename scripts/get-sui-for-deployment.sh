#!/bin/bash
# Request testnet SUI from faucet for deployment address

set -e

export PATH="$HOME/.local/bin:$PATH"

if ! command -v sui &> /dev/null; then
    echo "Error: Sui CLI not found. Please install it first."
    exit 1
fi

ADDRESS=$(sui client active-address)
ENV=$(sui client active-env)

if [ "$ENV" != "testnet" ]; then
    echo "⚠️  Warning: Active environment is '$ENV', not 'testnet'"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "Requesting SUI from faucet..."
echo "Address: $ADDRESS"
echo "Environment: $ENV"
echo ""

sui client faucet || {
    echo ""
    echo "Alternative: Visit https://discord.com/channels/916379725201563759/971488439931392130"
    echo "and request testnet SUI in the #testnet-faucet channel"
}

