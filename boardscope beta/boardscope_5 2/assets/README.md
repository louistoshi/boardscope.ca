# BoardScope App Icons

This directory should contain the following icon files for native app packaging:

## Required Icon Files

1. **icon.png** (512x512 PNG) - Base icon used for Linux and as source for other formats
2. **icon.ico** (Windows ICO) - For Windows .exe, should contain 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
3. **icon.icns** (macOS ICNS) - For macOS .dmg, contains multiple resolutions

## How to Generate Icons

### Option 1: Using electron-icon-builder (Recommended)
```bash
npm install --save-dev electron-icon-builder
```

Then add to package.json scripts:
```json
"build-icons": "electron-icon-builder --input=./assets/icon.png --output=./assets"
```

### Option 2: Manual Conversion

**For Windows (.ico):**
- Use an online converter like https://convertio.co/png-ico/
- Or use ImageMagick: `magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

**For macOS (.icns):**
- Create an iconset folder: `mkdir icon.iconset`
- Generate sizes: 
  ```bash
  sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
  sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
  sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
  sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
  sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
  sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
  sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
  sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
  sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
  cp icon.png icon.iconset/icon_512x512@2x.png
  ```
- Convert: `iconutil -c icns icon.iconset -o icon.icns`

### Option 3: Use a Placeholder
For development/testing, you can use any 512x512 PNG renamed as icon.png.
The build will work but apps will have a generic Electron icon.
