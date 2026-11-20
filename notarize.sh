#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}BoardScope Notarization Script${NC}"
echo "================================"

# Check if credentials are set — either env vars, or the keychain profile
# "notarytool" (created once with: xcrun notarytool store-credentials
# "notarytool" --apple-id <email> --team-id QWV8X6H5C8 --password <app-specific-password>)
USE_KEYCHAIN=0
if [ -z "$APPLEID" ] || [ -z "$APPLEID_PASSWORD" ]; then
    if security find-generic-password -s "notarytool" >/dev/null 2>&1; then
        USE_KEYCHAIN=1
        echo "Using keychain profile 'notarytool'"
    else
        echo "ERROR: no credentials found"
        echo "Either export APPLEID and APPLEID_PASSWORD (app-specific password), or run:"
        echo "  xcrun notarytool store-credentials 'notarytool' \\"
        echo "      --apple-id 'your-email@icloud.com' --team-id QWV8X6H5C8 \\"
        echo "      --password 'your-app-specific-password'"
        exit 1
    fi
fi

# Newest DMG in dist/ — was hardcoded to a 5.4.1 path and failed on every later release
DMG_PATH=$(ls -t dist/BoardScope-*-arm64.dmg 2>/dev/null | head -1)

if [ -z "$DMG_PATH" ] || [ ! -f "$DMG_PATH" ]; then
    echo "ERROR: no BoardScope-*-arm64.dmg found in dist/"
    exit 1
fi

echo "Notarizing: $DMG_PATH"

# Submit for notarization
echo "Submitting app for notarization..."
if [ "$USE_KEYCHAIN" = "1" ]; then
    NOTARY_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
        --keychain-profile "notarytool" \
        --wait 2>&1)
else
    echo "Using Apple ID: $APPLEID"
    NOTARY_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
        --apple-id "$APPLEID" \
        --password "$APPLEID_PASSWORD" \
        --team-id "QWV8X6H5C8" \
        --wait 2>&1)
fi

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
