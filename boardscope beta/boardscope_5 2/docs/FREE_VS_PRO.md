# BoardScope — Free vs Pro Model

## Overview

BoardScope uses a **freemium licensing model** powered by Polar.sh:

- **Free Version** — All core boardview and diagnostic tools, no license key required
- **Pro Version** — Advanced AI features and automation, requires a valid license key from Polar

---

## Free Features (No License Required)

Users can use these features without entering a license key:

### Core Boardview
- ✅ Load and view `.brd`, `.bvr`, and other boardview formats
- ✅ View PDF schematics side-by-side with the board
- ✅ Interactive zoom, pan, rotate
- ✅ Top / bottom side toggle and butterfly (both sides) view
- ✅ Component search by reference (U1, R2, C3) and net name
- ✅ Net highlighting — click any net to highlight all connected pins
- ✅ Board comparison — load 2 boards and diff them visually

### Measurements & Hardware
- ✅ Voltage measurement log with per-net recording
- ✅ USB multimeter integration (FS9721 protocol)
- ✅ USB oscilloscope support (Hantek, OWON, Rigol, SCPI)
- ✅ Continuity checker and short circuit finder
- ✅ Volt Map and Diode Map overlays
- ✅ Thermal camera alignment

### Diagnostics
- ✅ Power rail analyzer
- ✅ Component library search
- ✅ Measurement history and export (CSV)
- ✅ Repair notes and annotations

---

## Pro Features (License Key Required)

Users must activate a Pro license to use:

### AI & Intelligence
- 🤖 **AI Diagnosis** — Describe a symptom, get Claude/Gemini-powered repair suggestions tailored to your board
- ⚠️ **Smart Fault Trees** — AI generates diagnostic flowcharts for any board or symptom

### Automation & Workflow
- 🎬 **Macro Recorder** — Record measurement sequences, replay them identically on every board of the same model
- ✅ **Post-Repair Test Suite** — Define automated pass/fail criteria; run tests after repair and export HTML/PDF reports

### Advanced Tools
- 💧 **Liquid Damage Mapping** — Zone-based corrosion scoring and BGA reballing tracker (requires Pro license to save/export)
- 👥 **Collaboration** — Real-time multi-technician sessions with shared annotations and cursor tracking (requires PeerJS signaling server)

---

## How Licensing Works

### 1. **License Keys from Polar**

When a customer purchases via Polar.sh, they receive a **license key**:

```
Example: polar_lic_aBcDeFgHiJkLmNoPqRsT
```

### 2. **Key Activation in BoardScope**

User opens BoardScope → Click **Settings** → **License** → Paste key → **Activate**

### 3. **Server-Side Validation**

```
User's Key → /license-validate → Polar API → "Valid ✓" or "Invalid ✗"
```

- App sends key to your local `server.js`
- Server validates against Polar's secure endpoint
- Polar returns: `{valid: true, plan: 'lifetime'|'yearly', expires: date}`
- App stores license in `localStorage`

### 4. **Code Protection**

The actual validation logic is **obfuscated and minified**:
- Variable names are mangled (`_pro`, `LIC.isPro()` become unreadable)
- Source code is stripped of comments
- Function implementations are packed and uglified
- No way to reverse-engineer key validation locally

### 5. **Pro Feature Gating**

Pro features check the license before enabling:

```javascript
if (LIC.isPro()) {
  // AI Diagnosis, Macro Recorder, Test Suite buttons are SHOWN
  // and fully functional
} else {
  // These buttons are HIDDEN or DISABLED
  // "Upgrade to Pro" message appears
}
```

---

## License Types

### Lifetime License
- **Cost**: $129 (one-time)
- **Expiry**: None — works forever
- **Checkout**: https://buy.polar.sh/polar_cl_vLUPGhsZNC3Al3y0NMtgCyqO9joYxBfvKy5GN4gUBj4

### Yearly Subscription
- **Cost**: $59/year (recurring)
- **Expiry**: Must renew annually
- **Checkout**: https://buy.polar.sh/polar_cl_0mXTbnMuZ341LbuSrno6S0KjfTCrJdWMhsV5V2ybxMk

---

## Key Validation Flow (for developers)

### Frontend (boardview.html)

```javascript
// User clicks "Activate License"
const key = prompt("Enter your license key:");

// Send to server
const response = await fetch('/license-validate', {
  method: 'POST',
  body: JSON.stringify({key})
});

const {valid, plan, expires} = await response.json();

if (valid) {
  // Store in localStorage
  localStorage.setItem('boardscope_license_key', key);
  localStorage.setItem('boardscope_license_plan', plan);
  localStorage.setItem('boardscope_license_expires', expires);
  
  // Unlock Pro features
  LIC.activate(key, plan, expires);
  
  // Show success
  showNotification(`✓ ${plan} license activated!`);
} else {
  // Show error
  showError(`Invalid key: ${error}`);
}
```

### Backend (server.js)

```javascript
// POST /license-validate
// 1. Extract key from request
// 2. Load Polar org ID from .polar_config or env var
// 3. Call Polar API: https://api.polar.sh/v1/customer-portal/license-keys/validate
// 4. Return {valid, plan, expires}
```

**Security:**
- Org ID is NEVER sent to frontend (kept server-side)
- Keys are validated against Polar's authoritative database
- Expiry dates are checked server-side
- No offline key generation — all keys come from Polar

---

## Polar Integration

### Webhook Configuration

Set up in your Polar dashboard at https://dashboard.polar.sh:

- **Webhook URL**: `https://boardscope.ca/polar-webhook`
- **Secret**: Set in environment as `POLAR_WEBHOOK_SECRET`

### Events Handled

- `checkout.completed` — Customer purchased a license
- `subscription.created` — Yearly subscription started
- `subscription.updated` — Renewal or plan change
- `license.granted` — Key activated successfully
- `license.revoked` — Key was deactivated (refund, chargeback)

---

## Code Protection Strategy

### Obfuscation (build-secure.sh)

All JavaScript is processed through `javascript-obfuscator`:

1. **Variable mangling** — `isPro()` → `a()`, `_pro` → `_b`
2. **String encoding** — Strings are hex-encoded
3. **Control flow flattening** — Logic becomes non-sequential
4. **Dead code injection** — Fake logic added to confuse reverse engineering
5. **No comments or whitespace** — 1-line minified output

### Built Artifacts

- `dist/boardscope-secure.js` — Obfuscated main app
- `dist/boardscope-mac.dmg` — Signed, notarized macOS installer
- `dist/boardscope-win.exe` — Windows NSIS installer
- `dist/BoardScope-linux.AppImage` — Linux AppImage

### What Users Can't Do

❌ Modify license validation logic
❌ Bypass key expiry checks
❌ Unlock Pro features without a valid key
❌ Reverse-engineer the key format or algorithm

### What's Still Safe

✅ Users can read/use the free features
✅ Licensed users can use all Pro features
✅ Server validation is the source of truth (can't be fooled by client-side tampering)

---

## Distribution

### Free Version
- Published on GitHub Releases (no license key needed)
- Available on boardscope.ca/download
- All core features functional

### Pro Installation
1. User downloads free version
2. User purchases on Polar.sh
3. User receives license key via email
4. User enters key in Settings
5. Pro features instantly unlock

---

## FAQ

**Q: Can users share a license key?**
A: Not practically. Each key can be activated on a limited number of machines (set in Polar dashboard). Attempting to reactivate elsewhere will fail.

**Q: What if Polar's servers are down?**
A: On first activation, the license is validated and stored locally. If Polar is temporarily down, the app continues to work with the cached license. After expiry date, the app contacts Polar again.

**Q: Can someone crack the obfuscated code?**
A: Obfuscation is a speed bump, not unbreakable. The real security is **server-side validation** — even if someone removes license checks locally, the app will still validate against Polar's API for any online features. And the Org ID (needed for validation) is never exposed to the frontend.

**Q: How does yearly renewal work?**
A: When a yearly license expires, Polar's API returns `valid: false` with an expiry date. User must purchase a renewal. Polar sends a new key via email.

---

## Next Steps

1. **Build secure versions**: `./build-secure.sh all`
2. **Create GitHub Release** with installers
3. **Test the license flow** in dev mode (POLAR_ORG_ID not required)
4. **Deploy to production** with POLAR_ORG_ID set
