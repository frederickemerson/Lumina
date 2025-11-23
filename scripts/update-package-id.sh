#!/bin/bash
# Update SEAL_PACKAGE_ID in backend .env file

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_ID="0xb2068a2d668415b7ac93c331ad6e7318a03abab0aa7c1c009257abb3855500dc"
ENV_FILE="$PROJECT_ROOT/backend/.env"

echo "Updating SEAL_PACKAGE_ID in backend/.env..."
echo "Package ID: $PACKAGE_ID"
echo ""

# Create .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating $ENV_FILE..."
    touch "$ENV_FILE"
fi

# Update or add SEAL_PACKAGE_ID
if grep -q "^SEAL_PACKAGE_ID=" "$ENV_FILE"; then
    # Update existing entry
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^SEAL_PACKAGE_ID=.*|SEAL_PACKAGE_ID=$PACKAGE_ID|" "$ENV_FILE"
    else
        # Linux
        sed -i "s|^SEAL_PACKAGE_ID=.*|SEAL_PACKAGE_ID=$PACKAGE_ID|" "$ENV_FILE"
    fi
    echo "✅ Updated SEAL_PACKAGE_ID"
else
    # Add new entry
    echo "SEAL_PACKAGE_ID=$PACKAGE_ID" >> "$ENV_FILE"
    echo "✅ Added SEAL_PACKAGE_ID"
fi

echo ""
echo "Current SEAL_PACKAGE_ID:"
grep "^SEAL_PACKAGE_ID=" "$ENV_FILE" || echo "Not found"

