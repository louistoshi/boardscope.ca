# BoardScope v5.4.0 — Release Instructions

## 📦 Files Ready for Release

After builds complete, you'll have in `/dist/`:

```
dist/
├── BoardScope-5.4.0.dmg              (110 MB) — macOS Intel ✓
├── BoardScope-5.4.0-arm64.dmg        (105 MB) — macOS Apple Silicon ✓
├── BoardScope Setup 5.4.0.exe        (~120 MB) — Windows (building...)
├── BoardScope-5.4.0.AppImage         (~90 MB) — Linux universal (building...)
└── boardscope_5.4.0_amd64.deb        (~80 MB) — Linux Debian (building...)
```

---

## 🚀 Step-by-Step Release

### Step 1: Create GitHub Release

**Go to:** https://github.com/louistoshi/boardscope.ca/releases

**Click:** "Create a new release"

**Fill in:**

| Field | Value |
|---|---|
| **Tag version** | `v5.4.0` |
| **Release title** | `BoardScope 5.4.0 — Production Release` |
| **Description** | See below |

**Copy-paste this description:**

```markdown
# 🎉 BoardScope 5.4.0 — Production Release

Fully obfuscated, secure builds with Polar.sh licensing integration.

## 📥 Download

**macOS:**
- [BoardScope-5.4.0.dmg](BoardScope-5.4.0.dmg) — Intel Mac
- [BoardScope-5.4.0-arm64.dmg](BoardScope-5.4.0-arm64.dmg) — Apple Silicon

**Windows:**
- [BoardScope Setup 5.4.0.exe](BoardScope%20Setup%205.4.0.exe) — Windows 10/11 x64

**Linux:**
- [BoardScope-5.4.0.AppImage](BoardScope-5.4.0.AppImage) — Universal Linux
- [boardscope_5.4.0_amd64.deb](boardscope_5.4.0_amd64.deb) — Ubuntu/Debian

## ✨ What's Included

✅ **Core Features (Free)**
- Interactive PCB boardview with zoom, pan, rotate
- PDF schematic overlay with synchronized navigation
- Component search by reference (U1, R2) and net name
- Net highlighting across entire board
- USB multimeter integration (FS9721 protocol)
- USB oscilloscope support (Hantek, OWON, Rigol, SCPI)
- Voltage measurement logging with color-coded pass/fail
- Volt Map and Diode Map heat overlays
- Thermal camera image alignment
- Continuity checker and short circuit finder
- Power rail analyzer
- Component library search
- Repair notes and annotations

🤖 **Pro Features** (requires license key)
- **AI Diagnosis** — Describe symptoms, get Claude/Gemini-powered repair suggestions
- **Macro Recorder** — Record measurement sequences, replay identically on every board
- **Post-Repair Test Suite** — Automated pass/fail testing with HTML/PDF reports
- **Advanced Fault Trees** — AI-generated diagnostic flowcharts for any board

## 🔒 Security

- **Code Protection**: Full JavaScript obfuscation (variables mangled, strings encoded)
- **License Validation**: Server-side validation via Polar.sh API
- **No Serial Numbers**: Modern key-based licensing with automatic expiry
- **Secure Defaults**: Private source code, public installers only

## 📖 Installation

### macOS
1. Download `.dmg` for your Mac (Intel or Apple Silicon)
2. Double-click to mount
3. Drag **BoardScope** to Applications folder
4. Launch from Applications

### Windows
1. Download `BoardScope Setup 5.4.0.exe`
2. Run the installer
3. Follow on-screen instructions
4. Launch from Start menu

### Linux
**Option A: AppImage (universal)**
1. Download `BoardScope-5.4.0.AppImage`
2. Make executable: `chmod +x BoardScope-5.4.0.AppImage`
3. Run: `./BoardScope-5.4.0.AppImage`

**Option B: Debian/Ubuntu**
1. Download `boardscope_5.4.0_amd64.deb`
2. Install: `sudo dpkg -i boardscope_5.4.0_amd64.deb`
3. Launch: `boardscope` or find in applications menu

## 💳 Upgrade to Pro

All features are **free to use**. Unlock Pro features for AI-powered diagnostics:

- **[Lifetime License: $129](https://buy.polar.sh/polar_cl_vLUPGhsZNC3Al3y0NMtgCyqO9joYxBfvKy5GN4gUBj4)** — One-time purchase
- **[Yearly License: $59/year](https://buy.polar.sh/polar_cl_0mXTbnMuZ341LbuSrno6S0KjfTCrJdWMhsV5V2ybxMk)** — Annual subscription

## 🔑 License Activation

1. Purchase on Polar.sh (get your license key via email)
2. Open BoardScope → Settings → License
3. Paste your license key
4. Click "Activate"
5. Pro features unlock instantly ✅

## 📚 Resources

- **Website**: https://boardscope.ca
- **Manual**: https://boardscope.ca/manual.html
- **Pricing**: https://boardscope.ca/pricing.html
- **GitHub (Source)**: https://github.com/louistoshi/boardscope-app (private)

## 🐛 Report Issues

Found a bug? Have a feature request?

Create an issue on the website or contact support.

---

**Release Date:** April 21, 2026
**Version:** 5.4.0
**Build:** Obfuscated & Secure
```

### Step 2: Attach All Files

In the GitHub release form:

1. **Click "Attach binaries by dropping them here"** (or browse)
2. **Upload all files from `/dist/`:**
   - `BoardScope-5.4.0.dmg`
   - `BoardScope-5.4.0-arm64.dmg`
   - `BoardScope Setup 5.4.0.exe`
   - `BoardScope-5.4.0.AppImage`
   - `boardscope_5.4.0_amd64.deb`

3. **Click "Publish release"** ✅

---

## 🌐 Update Website

Optional: Add download button to `website/index.html`

```html
<!-- Add after hero section -->
<section id="download" style="padding: 100px 40px; text-align: center; max-width: 1200px; margin: 0 auto;">
  <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #00d9a6; text-transform: uppercase; margin-bottom: 14px;">Download</div>
  <h2 style="font-size: 48px; font-weight: 800; letter-spacing: -1.5px; margin-bottom: 16px;">Get BoardScope</h2>
  <p style="font-size: 17px; color: #9aa3b5; max-width: 560px; margin: 0 auto 60px; line-height: 1.65;">
    Free to use. All core features included. No account required.
  </p>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
    <a href="https://github.com/louistoshi/boardscope.ca/releases/download/v5.4.0/BoardScope-5.4.0.dmg" 
       style="padding: 24px; background: #111418; border: 1px solid #1e2430; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
      <div style="font-size: 40px; margin-bottom: 12px;">🍎</div>
      <div style="font-weight: 700; color: #e8edf5; margin-bottom: 4px;">macOS Intel</div>
      <div style="font-size: 12px; color: #9aa3b5;">Intel Mac</div>
    </a>

    <a href="https://github.com/louistoshi/boardscope.ca/releases/download/v5.4.0/BoardScope-5.4.0-arm64.dmg"
       style="padding: 24px; background: #111418; border: 1px solid #1e2430; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
      <div style="font-size: 40px; margin-bottom: 12px;">🍎</div>
      <div style="font-weight: 700; color: #e8edf5; margin-bottom: 4px;">macOS Apple Silicon</div>
      <div style="font-size: 12px; color: #9aa3b5;">M1, M2, M3</div>
    </a>

    <a href="https://github.com/louistoshi/boardscope.ca/releases/download/v5.4.0/BoardScope%20Setup%205.4.0.exe"
       style="padding: 24px; background: #111418; border: 1px solid #1e2430; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
      <div style="font-size: 40px; margin-bottom: 12px;">🪟</div>
      <div style="font-weight: 700; color: #e8edf5; margin-bottom: 4px;">Windows</div>
      <div style="font-size: 12px; color: #9aa3b5;">Windows 10/11 x64</div>
    </a>

    <a href="https://github.com/louistoshi/boardscope.ca/releases/download/v5.4.0/BoardScope-5.4.0.AppImage"
       style="padding: 24px; background: #111418; border: 1px solid #1e2430; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
      <div style="font-size: 40px; margin-bottom: 12px;">🐧</div>
      <div style="font-weight: 700; color: #e8edf5; margin-bottom: 4px;">Linux</div>
      <div style="font-size: 12px; color: #9aa3b5;">Universal AppImage</div>
    </a>

    <a href="https://github.com/louistoshi/boardscope.ca/releases/download/v5.4.0/boardscope_5.4.0_amd64.deb"
       style="padding: 24px; background: #111418; border: 1px solid #1e2430; border-radius: 10px; text-decoration: none; transition: all 0.2s;">
      <div style="font-size: 40px; margin-bottom: 12px;">📦</div>
      <div style="font-weight: 700; color: #e8edf5; margin-bottom: 4px;">Debian/Ubuntu</div>
      <div style="font-size: 12px; color: #9aa3b5;">Ubuntu/Debian .deb</div>
    </a>
  </div>
</section>
```

Then commit and push:
```bash
cd website
git add index.html
git commit -m "Add download section"
git push origin main
```

---

## ✅ Post-Launch Checklist

- [ ] Create GitHub Release with all 5 files
- [ ] Verify download links work
- [ ] Update website with download section
- [ ] Share on Twitter/forums
- [ ] Test actual purchase → license key → activation

---

## 🎉 You're Done!

Your app is now **publicly released** across all platforms with:
- ✅ Secure obfuscated code
- ✅ Polar licensing integration
- ✅ Free + Pro features
- ✅ macOS, Windows, Linux support

**Next:** Watch for feedback and fix any platform-specific issues!
