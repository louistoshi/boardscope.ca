#!/bin/bash
set -e

echo "=== BoardScope Release Build ==="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT"

# 1. Safety check: restore readable source if root files are obfuscated (1 line = obfuscated)
echo "--- Checking source state..."
for f in electron-main.js preload.js server.js; do
  lines=$(wc -l < "$f" | tr -d ' ')
  if [ "$lines" -le 1 ] && [ -f "src-unobfuscated/$f" ]; then
    echo "  Restoring $f from src-unobfuscated/ (was obfuscated)"
    cp "src-unobfuscated/$f" "$f"
  fi
done

# 2. Back up readable source to src-unobfuscated/ and produce obfuscated output
echo "--- Obfuscating source..."
npm run obfuscate

# 3. Build all platforms using obfuscated source (build-secure.sh swaps, builds, restores)
echo "--- Building all platforms..."
bash scripts/build-secure.sh --win --mac --linux --publish never

# 4. Ensure readable source is restored in root (belt and suspenders)
echo "--- Restoring readable source..."
for f in electron-main.js preload.js server.js; do
  if [ -f "src-unobfuscated/$f" ]; then
    cp "src-unobfuscated/$f" "$f"
  fi
done

VERSION=$(node -p "require('./package.json').version")
echo ""
echo "=== Done! BoardScope v$VERSION built for all platforms ==="
echo "Artifacts in dist/:"
ls dist/ | grep "$VERSION" | sed 's/^/  /'
echo ""
echo "Root source files are readable. src-unobfuscated/ is up to date."
