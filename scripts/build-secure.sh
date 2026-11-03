#!/bin/bash
set -e

# macOS ships BSD ar, which "successfully" writes a 96-byte empty archive
# for deb targets (every .deb built locally before 6.0.15 was a broken stub
# — the app files exist, BSD ar just refuses non-Mach-O members and exits 0).
# Use GNU ar from binutils when available: brew install binutils
if [ "$(uname)" = "Darwin" ] && [ ! -x /opt/homebrew/opt/binutils/bin/ar ]; then
  echo "WARNING: GNU ar not found (brew install binutils) — deb target will produce a broken stub on macOS" >&2
fi
if [ -x /opt/homebrew/opt/binutils/bin/ar ]; then
  export PATH="/opt/homebrew/opt/binutils/bin:$PATH"
fi

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
