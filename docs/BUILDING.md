# BoardScope - Cross-Platform Build Guide

## Overview

BoardScope is now a cross-platform desktop application that can be built for:
- **Windows** (.exe installer)
- **macOS** (.dmg disk image, Intel + Apple Silicon)
- **Linux** (AppImage + .deb package)
- **iPad/iOS** (via PWA - Progressive Web App)

## Quick Start

### Prerequisites

- **Node.js 18+** (LTS recommended)
- **npm** (comes with Node.js)

### Platform-Specific Build Requirements

| Platform | Build On | Additional Requirements |
|----------|----------|------------------------|
| Windows  | Windows  | None (NSIS included)   |
| macOS    | macOS    | Xcode command line tools |
| Linux    | Linux    | None                   |

> **Note:** Cross-compiling (e.g., building Windows on macOS) requires additional tools like Wine.

## Building

### 1. Install Dependencies

```bash
cd "boardscope_5 2"
npm install
```

### 2. Build for Your Current Platform

```bash
# Build for the platform you're currently on
npm run electron:build

# Or use the build script
./build.sh        # All platforms
./build.sh win    # Windows only
./build.sh mac    # macOS only
./build.sh linux  # Linux only
```

### 3. Build for All Platforms (CI/CD)

```bash
npm run build:all
```

### Output Locations

After building, find your installers in the `dist/` directory:

| Platform | Output File |
|----------|-------------|
| Windows  | `dist/BoardScope Setup X.X.X.exe` |
| macOS    | `dist/BoardScope X.X.X.dmg` |
| Linux    | `dist/BoardScope-X.X.X.AppImage` |
| Linux    | `dist/boardscope_X.X.X_amd64.deb` |

## Installation

### Windows
1. Download the `.exe` installer
2. Run it and follow the installation wizard
3. Launch BoardScope from the Start Menu

### macOS
1. Download the `.dmg` file
2. Double-click to mount
3. Drag BoardScope to Applications folder
4. **First launch:** Right-click → Open (if Gatekeeper blocks it)

### Linux (AppImage)
```bash
chmod +x BoardScope-*.AppImage
./BoardScope-*.AppImage
```

### Linux (.deb)
```bash
sudo dpkg -i boardscope_*.deb
```

## iPad / iOS (PWA)

BoardScope works as a Progressive Web App on iPad:

1. **Host the app** on a local server or deploy to a web host
2. Open Safari on iPad
3. Navigate to the BoardScope URL
4. Tap the **Share** button
5. Select **"Add to Home Screen"**
6. The app will now launch in standalone mode (no Safari chrome)

### PWA Features
- Offline caching for faster loading
- Full-screen mode (no browser UI)
- Home screen icon
- Works on iOS 11.3+

## Development

### Run in Development Mode

```bash
# Web mode (browser)
npm start

# Electron desktop mode
npm run electron:dev
```

### Open DevTools in Electron

```bash
npm run electron:dev -- --devtools
```

## Customizing the App Icon

The app currently uses a placeholder icon. To customize:

1. Create a 512x512 PNG icon
2. Place it in `assets/icon.png`
3. Generate platform-specific formats:

```bash
# Windows ICO
npx electron-icon-builder --input=./assets/icon.png --output=./assets --flatten

# macOS ICNS (on macOS)
mkdir icon.iconset
sips -z 16 16   icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32   icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64   icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
cp icon.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o assets/icon.icns
```

## File Associations

BoardScope registers `.brd` files so you can:
- Double-click a `.brd` file to open it in BoardScope
- Right-click → Open With → BoardScope

## Troubleshooting

### Build fails with "wine not found" (building Windows on macOS/Linux)
You can only build for your current platform without cross-compilation tools. Use `./build.sh mac` or `./build.sh linux` instead.

### macOS app says "damaged and can't be opened"
Run: `xattr -cr /Applications/BoardScope.app`

### App won't start on Linux
Make sure you have required libraries:
```bash
sudo apt-get install libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6
```

### PWA not installing on iPad
- Ensure you're using HTTPS (required for PWA)
- Check that the service worker is registered (Safari Web Inspector)
- iOS 11.3+ required for PWA support

## Project Structure

```
boardscope_5 2/
├── electron-main.js    # Electron main process
├── preload.js          # Secure bridge between main and renderer
├── server.js           # HTTP server (also serves Electron content)
├── boardview.html      # Main UI
├── sw.js               # Service worker (PWA)
├── manifest.json       # Web app manifest (PWA)
├── package.json        # Dependencies + electron-builder config
├── build.sh            # Cross-platform build script
├── build/
│   └── entitlements.mac.plist  # macOS sandbox permissions
├── assets/
│   ├── icon.png        # Base icon (512x512)
│   ├── icon.ico        # Windows icon
│   └── icon.icns       # macOS icon
└── dist/               # Built installers (after build)
```

## License

MIT
