#!/bin/bash
# BoardScope Build Script
# Builds native applications for Windows, macOS, and Linux

set -e

echo "╔══════════════════════════════════════════╗"
echo "║          BoardScope Build Script         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Run this script from the boardscope_5 2 directory."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo ""

# Check for icon files
if [ ! -f "assets/icon.png" ]; then
    echo "⚠️  Warning: assets/icon.png not found."
    echo "   Apps will use a default Electron icon."
    echo "   See assets/README.md for icon generation instructions."
    echo ""
fi

# Parse command line arguments
PLATFORM="${1:-all}"

case "$PLATFORM" in
    win|windows)
        echo "🪟 Building Windows application..."
        npx electron-builder --win
        echo ""
        echo "✅ Windows build complete!"
        echo "   Output: dist/BoardScope Setup *.exe"
        ;;
    mac|macos)
        echo "🍎 Building macOS application..."
        npx electron-builder --mac
        echo ""
        echo "✅ macOS build complete!"
        echo "   Output: dist/BoardScope *.dmg"
        ;;
    linux)
        echo "🐧 Building Linux application..."
        npx electron-builder --linux
        echo ""
        echo "✅ Linux build complete!"
        echo "   Output: dist/BoardScope-*.AppImage, dist/boardscope_*.deb"
        ;;
    all)
        echo "🌍 Building all platforms..."
        echo ""
        echo "Note: Building for all platforms requires platform-specific tools."
        echo "  - Windows: Requires wine (for macOS/Linux) or native Windows"
        echo "  - macOS: Native or requires signing certificates"
        echo "  - Linux: Native"
        echo ""
        npx electron-builder --win --mac --linux
        echo ""
        echo "✅ All builds complete!"
        echo "   Output: dist/"
        ;;
    *)
        echo "Usage: ./build.sh [win|mac|linux|all]"
        echo ""
        echo "Options:"
        echo "  win     Build Windows .exe only"
        echo "  mac     Build macOS .dmg only"
        echo "  linux   Build Linux AppImage/.deb only"
        echo "  all     Build for all platforms (default)"
        exit 1
        ;;
esac

echo ""
echo "📁 Distribution files are in the dist/ directory"
