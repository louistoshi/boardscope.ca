#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}BoardScope Notarization Script${NC}"
echo "================================"

# Check if credentials are set
if [ -z "$APPLEID" ] || [ -z "$APPLEID_PASSWORD" ]; then
    echo "ERROR: APPLEID and APPLEID_PASSWORD environment variables must be set"
    echo "Usage:"
    echo "  export APPLEID='your-email@icloud.com'"
    echo "  export APPLEID_PASSWORD='your-app-specific-password'"
    echo "  ./notarize.sh"
    exit 1
fi

DMG_PATH="dist/BoardScope-5.4.1-arm64.dmg"

if [ ! -f "$DMG_PATH" ]; then
    echo "ERROR: DMG file not found at $DMG_PATH"
    exit 1
fi

echo "Notarizing: $DMG_PATH"
echo "Using Apple ID: $APPLEID"

# Submit for notarization
echo "Submitting app for notarization..."
NOTARY_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLEID" \
    --password "$APPLEID_PASSWORD" \
    --team-id "QWV8X6H5C8" \
    --wait 2>&1)

echo "$NOTARY_OUTPUT"

# Check if submission was successful
if echo "$NOTARY_OUTPUT" | grep -q "Accepted"; then
    echo -e "${GREEN}✓ Notarization successful!${NC}"
    
    # Staple the ticket
    echo "Stapling notarization ticket..."
    xcrun stapler staple "$DMG_PATH"
    echo -e "${GREEN}✓ Stapling complete!${NC}"
else
    echo "Notarization details:"
    echo "$NOTARY_OUTPUT"
fi
