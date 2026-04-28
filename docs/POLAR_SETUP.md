# BoardScope — Selling via Polar.sh: Complete Setup Guide

This guide covers everything you need to sell BoardScope through Polar.sh:
setting up products, generating license keys, protecting your source code,
and integrating license validation into the app.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Setting Up Polar.sh](#2-setting-up-polarsh)
3. [Creating Products](#3-creating-products)
4. [License Key Generation](#4-license-key-generation)
5. [Integrating License Validation](#5-integrating-license-validation)
6. [Protecting Your Source Code](#6-protecting-your-source-code)
7. [Building for Distribution](#7-building-for-distribution)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Overview

### Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Customer   │────▶│  Polar.sh    │────▶│  Your App    │
│  purchases  │     │  validates   │     │  validates   │
│  license    │     │  & delivers  │     │  locally     │
└─────────────┘     └──────────────┘     └──────────────┘
```

### How It Works

1. Customer purchases BoardScope on Polar.sh
2. Polar.sh generates and delivers a license key
3. Customer enters the key in BoardScope
4. BoardScope validates the key against Polar's API
5. Pro features unlock on successful validation

---

## 2. Setting Up Polar.sh

### Step 1: Create Your Polar Account

1. Go to [polar.sh](https://polar.sh) and sign up
2. Complete your organization profile
3. Connect your Stripe account for payouts

### Step 2: Configure Your Organization

1. Go to **Settings → Organization**
2. Set your organization name (e.g., "The Logic Lab")
3. Upload your logo and set branding colors
4. Note your **Organization ID** — you'll need it later

### Step 3: Set Up License Keys

1. Go to **Settings → License Keys**
2. Enable license keys for your organization
3. Configure the key format:
   - **Prefix**: `BS-` (for BoardScope)
   - **Length**: 4 segments of 4 characters
   - **Example**: `BS-XXXX-XXXX-XXXX-XXXX`

---

## 3. Creating Products

### Product 1: BoardScope Pro — Lifetime License

1. Go to **Products → New Product**
2. Fill in:
   - **Name**: BoardScope Pro — Lifetime
   - **Description**: Permanent access to all Pro features including AI analysis, multi-board tabs, and priority support
   - **Type**: One-time purchase
   - **Price**: $49.00 (or your price)
   - **License key**: Enable — assign to this product
3. Upload product images (screenshots of the app)
4. Set up checkout page customization
5. Publish the product

### Product 2: BoardScope Pro — Yearly Subscription

1. Create a second product:
   - **Name**: BoardScope Pro — Yearly
   - **Type**: Recurring (yearly)
   - **Price**: $19/year
   - **License key**: Enable
2. This gives you a lower entry price with recurring revenue

### Product 3: BoardScope Free (Optional)

You can also create a free tier product with limited features to attract users.

---

## 4. License Key Generation

### Automatic Key Generation

Polar.sh handles license key generation automatically. When a customer purchases:

1. Polar generates a unique key in your configured format
2. The key is associated with the customer's email
3. The key is delivered via email and shown on the purchase confirmation page

### Key Format Configuration

In **Settings → License Keys**, configure:

```
Prefix:     BS-
Segments:   4
Chars/seg:  4
Characters: Uppercase letters + numbers (excluding ambiguous chars like 0/O, 1/I)
Example:    BS-A7K3-M9P2-X4R8-W6N1
```

### Managing Keys

In the Polar dashboard you can:

- **View all keys** — see status (granted, revoked, expired)
- **Revoke keys** — for refunds or abuse
- **Extend expiry** — for yearly renewals
- **Search by email** — find a customer's key

### Manual Key Generation (for testing)

You can generate test keys in the Polar dashboard:

1. Go to **License Keys → Create Key**
2. Select the product
3. Optionally set an expiry date
4. Copy the generated key

---

## 5. Integrating License Validation

### How Validation Works

BoardScope validates keys server-side through Polar's API. The app never stores
your organization ID or API secrets — validation happens on your server.

### Server-Side Validation (in server.js)

The existing `server.js` already includes a `/license-validate` endpoint. Here's
how it works and how to configure it:

```javascript
// In server.js — the validation endpoint
if (pathname === '/license-validate' && req.method === 'POST') {
  // 1. Receive the license key from the app
  const json = await readBody(req);
  const key = JSON.parse(json).key;

  // 2. Load your Polar org ID (keep this SECRET)
  let orgId = process.env.POLAR_ORG_ID;

  // 3. Call Polar's validation API
  const body = JSON.stringify({
    key,
    organization_id: orgId,
    label: 'boardscope-activation',
  });

  // 4. Forward the response to the app
  // Returns: { valid: true/false, plan: 'lifetime'|'yearly', expires: null|date }
}
```

### Setting Your Polar Org ID

Create a `.polar_config` file next to `server.js`:

```
org_id=your_polar_organization_id_here
```

Or set it as an environment variable:

```bash
POLAR_ORG_ID=your_org_id node server.js
```

**Never commit this file to version control.** Add it to `.gitignore`.

### App-Side Validation Flow

In the Electron app (`electron-main.js`), the validation flow is:

1. User enters license key in the UI
2. App sends key to `http://localhost:8080/license-validate`
3. Server forwards to Polar API
4. Server returns result (valid/invalid, plan type)
5. App stores validation result in localStorage
6. Pro features unlock based on validation

### License Check Response Format

```json
{
  "valid": true,
  "plan": "lifetime",
  "expires": null
}
```

Or for yearly:

```json
{
  "valid": true,
  "plan": "yearly",
  "expires": "2027-04-17T00:00:00Z"
}
```

Or invalid:

```json
{
  "valid": false,
  "error": "Key not found or already deactivated"
}
```

---

## 6. Protecting Your Source Code

When distributing a desktop app, your source code is inherently accessible to
users. Here are multiple layers of protection to make reverse engineering
significantly harder.

### Layer 1: JavaScript Obfuscation

Use `javascript-obfuscator` to make your code unreadable:

```bash
npm install --save-dev javascript-obfuscator
```

Add an obfuscation script to `package.json`:

```json
{
  "scripts": {
    "obfuscate": "javascript-obfuscator electron-main.js --output dist-obfuscated/electron-main.js --compact true --control-flow-flattening true --dead-code-injection true --debug-protection false --disable-console-output true --string-array true --string-array-encoding rc4 --rotate-string-array true"
  }
}
```

Create `obfuscate.config.json`:

```json
{
  "compact": true,
  "controlFlowFlattening": true,
  "controlFlowFlatteningThreshold": 0.75,
  "deadCodeInjection": true,
  "deadCodeInjectionThreshold": 0.4,
  "debugProtection": false,
  "disableConsoleOutput": true,
  "stringArray": true,
  "stringArrayEncoding": ["rc4"],
  "stringArrayThreshold": 0.75,
  "rotateStringArray": true,
  "shuffleStringArray": true,
  "splitStrings": true,
  "splitStringsChunkLength": 5,
  "transformObjectKeys": true,
  "unicodeEscapeSequence": false
}
```

Run obfuscation before building:

```bash
npm run obfuscate
npm run build:mac
```

### Layer 2: ASAR Archive

Electron packages your app in an ASAR archive by default. This bundles all
source files into a single archive, making casual browsing harder:

```bash
# ASAR is enabled by default in electron-builder
# To verify:
npx asar list dist/mac/BoardScope.app/Contents/Resources/app.asar
```

For extra protection, enable ASAR unpacking prevention in `package.json`:

```json
{
  "build": {
    "asar": true,
    "asarUnpack": []
  }
}
```

### Layer 3: Native Node Modules

Move critical code (license validation, key handling) into a compiled Node.js
native module. This compiles to machine code that's much harder to reverse:

```bash
npm install --save-dev node-gyp
```

Create `src/license-check.cc`:

```cpp
#include <napi.h>
#include <string>

Napi::Value ValidateKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string key = info[0].As<Napi::String>().Utf8Value();
  // Validation logic here
  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("validateKey", Napi::Function::New(env, ValidateKey));
  return exports;
}

NODE_API_MODULE(licensecheck, Init)
```

### Layer 4: Server-Side Validation

**This is the most important protection.** Never validate license keys purely
client-side. Always route validation through your server:

```
App → Your Server → Polar API → Your Server → App
```

The app only receives the result (valid/invalid), never the API credentials.

### Layer 5: Code Signing

#### macOS Code Signing

1. Enroll in the Apple Developer Program ($99/year)
2. Create a signing certificate in Keychain Access
3. Configure electron-builder:

```json
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "identity": "Your Name (TEAM_ID)"
    }
  }
}
```

4. Notarize your app:

```json
{
  "build": {
    "mac": {
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

Set environment variables for notarization:

```bash
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=app-specific-password
export APPLE_TEAM_ID=YOUR_TEAM_ID
```

#### Windows Code Signing

1. Purchase a code signing certificate from a CA (Sectigo, DigiCert, etc.)
2. Sign the installer:

```json
{
  "build": {
    "win": {
      "signingHashAlgorithms": ["sha256"],
      "signDlls": true
    }
  }
}
```

### Layer 6: Anti-Tampering

Add runtime integrity checks to detect if the app has been modified:

```javascript
// In electron-main.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function checkIntegrity() {
  const appPath = __dirname;
  const expectedHash = 'YOUR_PRECOMPUTED_HASH';

  // Hash critical files
  const files = ['electron-main.js', 'preload.js', 'server.js'];
  let combined = '';

  for (const file of files) {
    const content = fs.readFileSync(path.join(appPath, file));
    combined += content.toString();
  }

  const hash = crypto.createHash('sha256').update(combined).digest('hex');

  if (hash !== expectedHash) {
    console.error('INTEGRITY CHECK FAILED — app may have been tampered with');
    // Optionally disable pro features or exit
  }
}

// Run on startup
app.whenReady().then(() => {
  checkIntegrity();
  createWindow();
});
```

### Layer 7: License Persistence

Store license validation securely and check periodically:

```javascript
// In preload.js
contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...

  // License methods
  saveLicense: (key, validation) => {
    localStorage.setItem('bs_license_key', key);
    localStorage.setItem('bs_license_validation', JSON.stringify(validation));
    localStorage.setItem('bs_license_date', new Date().toISOString());
  },

  getLicense: () => {
    const key = localStorage.getItem('bs_license_key');
    const validation = JSON.parse(localStorage.getItem('bs_license_validation') || 'null');
    const date = localStorage.getItem('bs_license_date');
    return { key, validation, date };
  },

  clearLicense: () => {
    localStorage.removeItem('bs_license_key');
    localStorage.removeItem('bs_license_validation');
    localStorage.removeItem('bs_license_date');
  },
});
```

### Summary of Protection Layers

| Layer | Protection Level | Effort |
|-------|-----------------|--------|
| Obfuscation | Medium | Low |
| ASAR Archive | Low | None (default) |
| Native Modules | High | Medium |
| Server-Side Validation | High | Medium |
| Code Signing | Medium | High (costs $) |
| Anti-Tampering | Medium | Low |
| License Persistence | Low | Low |

**Recommended minimum**: Obfuscation + Server-Side Validation + ASAR

---

## 7. Building for Distribution

### Pre-Build Checklist

- [ ] Set `POLAR_ORG_ID` in environment or `.polar_config`
- [ ] Obfuscate source code (`npm run obfuscate`)
- [ ] Update version number in `package.json`
- [ ] Test license validation locally
- [ ] Generate icons for all platforms
- [ ] Set up code signing certificates

### Build Commands

```bash
# Install dependencies
npm install

# Obfuscate code
npm run obfuscate

# Build for your current platform
npm run build:mac     # macOS
npm run build:win     # Windows
npm run build:linux   # Linux

# Or build all platforms
npm run build:all
```

### Output Files

```
dist/
├── BoardScope-1.0.0.dmg          # macOS (Intel)
├── BoardScope-1.0.0-arm64.dmg    # macOS (Apple Silicon)
├── BoardScope Setup 1.0.0.exe    # Windows installer
├── BoardScope-1.0.0.AppImage     # Linux AppImage
└── boardscope_1.0.0_amd64.deb    # Linux .deb
```

### Uploading to Polar.sh

1. Go to your product in the Polar dashboard
2. Upload the build files as product attachments
3. Or provide download links on your product page
4. Alternatively, host builds on your own server and link from Polar

---

## 8. Troubleshooting

### License validation returns "POLAR_ORG_ID not set"

Make sure your `.polar_config` file exists and contains the correct org ID:

```
org_id=your_actual_org_id
```

Or set the environment variable:

```bash
export POLAR_ORG_ID=your_org_id
```

### Obfuscation breaks the app

Some obfuscation settings can break Electron apps. Try reducing the aggressiveness:

```json
{
  "controlFlowFlatteningThreshold": 0.5,
  "deadCodeInjectionThreshold": 0.2,
  "stringArrayThreshold": 0.5
}
```

### macOS says app is damaged after notarization

This usually means notarization failed. Check:

```bash
xcrun altool --notarization-info YOUR_REQUEST_ID -u APPLE_ID -p APP_PASSWORD
```

### License key not validating

Check the server logs when running `node server.js`:

```
[License] Validating key: BS-XXXX-XXXX-XXXX-XXXX
[License] Polar response: { valid: true, plan: 'lifetime' }
```

If you see errors, check your Polar API connection and org ID.

---

## Quick Reference

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `POLAR_ORG_ID` | Polar organization ID | `org_abc123` |
| `AI_PROVIDER` | AI service provider | `google` |
| `AI_API_KEY` | AI service API key | `your-key` |

### Important Files

| File | Purpose | Keep Secret? |
|------|---------|--------------|
| `.polar_config` | Polar org ID | Yes |
| `.api_key` | AI provider config | Yes |
| `electron-main.js` | App main process | Obfuscate |
| `server.js` | HTTP server + validation | Obfuscate |

### Polar Dashboard URLs

- Dashboard: [polar.sh/dashboard](https://polar.sh/dashboard)
- Products: [polar.sh/dashboard/products](https://polar.sh/dashboard/products)
- License Keys: [polar.sh/dashboard/license-keys](https://polar.sh/dashboard/license-keys)
- Settings: [polar.sh/dashboard/settings](https://polar.sh/dashboard/settings)
