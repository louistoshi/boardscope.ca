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

# Swap originals with obfuscated versions. The restore runs via an EXIT trap:
# a failed or interrupted build (set -e / Ctrl-C) used to skip it, leaving
# obfuscated files in the root — and the NEXT run's .bak then captured the
# obfuscated content as the "original", poisoning every later restore
# (that cascade cost a manual src-unobfuscated/ recovery on 6.0.25).
restore_originals() {
  for f in electron-main.js preload.js server.js; do
    if [ -f "${f}.bak" ]; then
      mv "${f}.bak" "$f"
    fi
  done
}
trap restore_originals EXIT
for f in electron-main.js preload.js server.js; do
  cp "$f" "${f}.bak"
  cp "dist-obfuscated/$f" "$f"
done

# Run electron-builder with any passed arguments
BUILD_EXIT_CODE=0
npx electron-builder "$@" || BUILD_EXIT_CODE=$?
exit $BUILD_EXIT_CODE
