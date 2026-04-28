# BoardScope Launch Completion Guide

**Status:** macOS mostly done, Windows & Linux builds ready to complete

---

## ✅ What's Been Done

### Website & Marketing
- ✅ Landing pages created (3 pages targeting high-value keywords)
- ✅ Blog posts written (5 posts, 9,200+ words)
- ✅ Website live at https://boardscope.ca
- ✅ SEO meta tags and structured data added
- ✅ Pricing page with Polar.sh integration
- ✅ GitHub releases set up

### macOS Build
- ✅ Code-signing configured with Apple Developer certificate
- ✅ DMG builds created (v5.4.0 in `/dist/`)
- ✅ Ready to test and release

### License/Payment System
- ✅ Polar.sh integration (Pro features unlock with license key)
- ✅ Heroku server deployed for license validation
- ✅ Free core features + Pro trial working

### GitHub CI/CD
- ✅ GitHub Actions workflow created (.github/workflows/build.yml)
- ✅ All 3 build scripts added to package.json:
  - `npm run build:secure:mac` ✅
  - `npm run build:secure:win` ✅ (ready)
  - `npm run build:secure:linux` ✅ (ready)

---

## 🔄 What's Left (Complete These Steps)

### 1. Finish macOS Code-Signing & Testing

**Status:** Certificate added to package.json, build should be tested

```bash
cd "/Users/macbookair/boardscope beta/boardscope_5 2"

# Test the signed macOS build
npm run build:secure:mac
```

**Expected output:** `dist/BoardScope-5.4.0-arm64.dmg` and `dist/BoardScope-5.4.0.dmg`

**Test on macOS:**
```bash
open dist/BoardScope-5.4.0.dmg
```

Should NOT show "damaged" warning anymore (code-signed with Apple certificate).

### 2. Build Windows & Linux Locally

**Option A: Build all platforms at once** (recommended)
```bash
npm run build:secure:all
```

**Option B: Build individually**
```bash
npm run build:secure:win    # Creates .exe installer
npm run build:secure:linux  # Creates .AppImage and .deb
```

**Expected outputs:**
- Windows: `dist/BoardScope Setup *.exe`
- Linux: `dist/BoardScope-*.AppImage` + `dist/boardscope_*.deb`

### 3. Create GitHub Release & Upload Artifacts

```bash
# Create a new git tag for release
git tag v5.4.0-release
git push origin v5.4.0-release

# OR upload manually to GitHub Releases:
# 1. Go to https://github.com/louistoshi/boardscope-app/releases
# 2. Click "Create a new release"
# 3. Tag: v5.4.0-release
# 4. Title: "BoardScope 5.4.0 - Multi-Platform Release"
# 5. Upload files:
#    - dist/BoardScope-5.4.0.dmg (macOS Intel)
#    - dist/BoardScope-5.4.0-arm64.dmg (macOS Apple Silicon)
#    - dist/BoardScope Setup *.exe (Windows)
#    - dist/BoardScope-*.AppImage (Linux AppImage)
#    - dist/boardscope_*.deb (Linux Debian)
```

### 4. Update Download Links

Edit `/website/index.html` and `/website/pricing.html`:

**Find:**
```html
<a class="btn-primary" href="https://github.com/louistoshi/boardscope.ca/releases">Download Free</a>
```

**Replace with:**
```html
<a class="btn-primary" href="https://github.com/louistoshi/boardscope-app/releases">Download Free</a>
```

**Note:** The website repo (`boardscope.ca`) is separate from the app repo (`boardscope-app`). Both are at:
- Website: https://github.com/louistoshi/boardscope.ca
- App: https://github.com/louistoshi/boardscope-app

### 5. Test All Platforms

**macOS:**
```bash
open dist/BoardScope-5.4.0.dmg
# Drag to Applications, launch
# ✓ Should open without "damaged" warning
# ✓ Can load .brd files
# ✓ License activation works
```

**Windows (if testing on Windows):**
```bash
# Double-click: dist/BoardScope Setup *.exe
# ✓ Runs installer
# ✓ App launches
# ✓ Can load .brd files
```

**Linux (if testing on Linux):**
```bash
# AppImage:
chmod +x dist/BoardScope-*.AppImage
./dist/BoardScope-*.AppImage

# Or Debian:
sudo dpkg -i dist/boardscope_*.deb
boardscope
```

### 6. Test License System

1. Download BoardScope from releases
2. Open app → Settings → License
3. Enter trial code (get from Polar dashboard or use test code)
4. Should show "Pro features unlocked"
5. Test Pro features (AI Diagnosis, Macro Recorder, etc.)

---

## 📋 Checklist Before Final Release

- [ ] macOS build signed and tested (no warnings)
- [ ] Windows .exe built and tested
- [ ] Linux AppImage built and tested
- [ ] Linux .deb built and tested
- [ ] All files uploaded to GitHub Releases
- [ ] Download links updated on website
- [ ] License system tested with trial code
- [ ] Free core features work on all platforms
- [ ] Pro features unlock with license key

---

## 🚀 How to Release

### Step 1: Build Everything
```bash
cd "/Users/macbookair/boardscope beta/boardscope_5 2"
npm run build:secure:all
```

### Step 2: Create Release on GitHub
```bash
git tag v5.4.0-release
git push origin v5.4.0-release
```

### Step 3: Upload to Release (Manual)
1. https://github.com/louistoshi/boardscope-app/releases/new
2. Tag: `v5.4.0-release`
3. Title: `BoardScope 5.4.0 - Cross-Platform`
4. Description:
```
## 🎉 BoardScope 5.4.0 — Available on All Platforms

### What's New
- Cross-platform support (macOS, Windows, Linux)
- Code-signed macOS builds (no warnings)
- Professional PCB boardview analysis
- Free core features + Pro AI diagnosis
- 30-day free Pro trial

### Download
- **macOS (Intel):** BoardScope-5.4.0.dmg
- **macOS (Apple Silicon):** BoardScope-5.4.0-arm64.dmg
- **Windows:** BoardScope Setup 5.4.0.exe
- **Linux (AppImage):** BoardScope-5.4.0.AppImage
- **Linux (Debian):** boardscope_5.4.0.deb

### Features
✓ Interactive PCB boardview (.brd files)
✓ Schematic PDF viewer
✓ Net search & highlighting
✓ Voltage measurement overlay
✓ AI-powered diagnosis (Pro)
✓ Macro recorder (Pro)
✓ Test suite automation (Pro)

### Getting Started
1. Download for your platform above
2. Install and launch
3. Open a .brd file
4. Try 30-day Pro trial free

👉 Get started: https://boardscope.ca
```

5. Upload all 5 files:
   - BoardScope-5.4.0.dmg
   - BoardScope-5.4.0-arm64.dmg
   - BoardScope Setup *.exe
   - BoardScope-*.AppImage
   - boardscope_*.deb

### Step 4: Announce
- Update website: https://boardscope.ca (landing page mentions all platforms)
- Post on Reddit (r/electronics, r/pcb, r/MacbookRepair)
- Share on Twitter/LinkedIn
- Email early beta testers

---

## 🔧 Important Files & Locations

```
/Users/macbookair/boardscope beta/boardscope_5 2/
├── package.json              ← Build scripts defined here
├── electron-main.js          ← Main process
├── boardview.html            ← UI
├── server.js                 ← Node server
├── build/
│   ├── entitlements.mac.plist  ← macOS permissions
├── .github/workflows/
│   └── build.yml             ← GitHub Actions CI/CD
├── dist/                     ← Build output (macOS .dmg files)
└── website/                  ← HTML landing pages
    ├── index.html
    ├── pricing.html
    ├── boardview-software.html
    ├── blog/
    │   ├── how-to-read-brd-files.html
    │   ├── pcb-net-tracing.html
    │   ├── hardware-integration.html
    │   ├── ai-board-diagnosis.html
    │   └── flexbv-vs-boardscope.html
```

---

## 🔑 Important Credentials & Config

### GitHub
- Repo: https://github.com/louistoshi/boardscope-app
- Website repo: https://github.com/louistoshi/boardscope.ca

### Polar.sh (Payment)
- Organization ID: `6495f637-d621-4682-a78d-c99365ad90c6`
- Checkout URLs already in pricing.html
- License validation via Heroku server

### Apple Developer
- Certificate: `mac_development.cer` (in project)
- Password: `1111`
- Already configured in package.json

### Heroku (License Server)
- App: `boardscope-server`
- URL: https://boardscope-server.herokuapp.com
- Deploy: `git push heroku main`

---

## 🎯 Next Steps After Release

1. **Monitor GitHub releases** — Check download counts
2. **Collect feedback** — Watch repair forums for users
3. **Bug fixes** — Fix issues as they appear
4. **Marketing** — Execute Phase 2 of SEO strategy (backlinks, YouTube)
5. **Iterate** — Add features based on user feedback

---

## 📞 Troubleshooting

### "Cannot find module" errors on build
- Run `npm install` first
- Make sure `node_modules/` exists

### macOS still shows "damaged" warning
- Certificate might not be properly installed in Keychain
- Try: `security find-identity -v -p codesigning`
- Should list your "Apple Development" certificate

### Windows build fails with NSIS error
- NSIS installer tool might not be installed
- On Windows, electron-builder installs it automatically
- On Mac, might need: `brew install nsis` (via Wine)

### Linux AppImage won't run
- Make executable: `chmod +x BoardScope-*.AppImage`
- Try: `./BoardScope-*.AppImage`

---

## 📚 Documentation

- **User Manual:** `/website/manual.html` (already live at boardscope.ca/manual.html)
- **Free vs Pro:** `/FREE_VS_PRO.md`
- **SEO Strategy:** `/SEO_STRATEGY.md`
- **Deployment:** `/HEROKU_SETUP.md`

---

## ✨ Summary

This project has:
- ✅ Professional website with SEO optimization
- ✅ Payment system integrated (Polar.sh)
- ✅ License validation server (Heroku)
- ✅ Code signing for macOS
- ✅ CI/CD pipeline for all platforms
- ✅ Marketing content (5 blog posts)

**All that's left:** Build Windows/Linux, test all platforms, create release.

**Estimated time to completion:** 2-3 hours for building, testing, and releasing.

Good luck! 🚀
