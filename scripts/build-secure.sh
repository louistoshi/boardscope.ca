#!/bin/bash
set -e

# Swap originals with obfuscated versions (.bak = safety net)
for f in electron-main.js preload.js server.js; do
  cp "$f" "${f}.bak"
  cp "dist-obfuscated/$f" "$f"
done

# Run electron-builder with any passed arguments
npx electron-builder "$@"
BUILD_EXIT_CODE=$?

# Always restore originals
for f in electron-main.js preload.js server.js; do
  if [ -f "${f}.bak" ]; then
    mv "${f}.bak" "$f"
  fi
done

exit $BUILD_EXIT_CODE
