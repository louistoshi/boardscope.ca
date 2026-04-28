# BoardScope Code Protection & Sales Portal Setup Guide

This guide explains how to protect your BoardScope code and set it up for sale on a portal.

## Overview

BoardScope already has a solid foundation for code protection and licensing:

1. **Code Obfuscation** - JavaScript code is obfuscated using `javascript-obfuscator`
2. **License Management** - Polar.sh integration for license key validation
3. **Secure Builds** - Build scripts that combine obfuscation with packaging
4. **Server-Side Validation** - License keys are validated server-side, keeping your organization ID secret

## 1. Code Obfuscation Setup

### Current Configuration

Your project already has obfuscation configured in [`obfuscate.config.json`](obfuscate.config.json:1):

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

### What This Protects

- **String Encryption** - All strings are encoded with RC4 encryption
- **Control Flow Flattening** - Makes code logic harder to follow
- **Dead Code Injection** - Adds fake code to confuse reverse engineers
- **Variable Renaming** - All variables are renamed to meaningless identifiers
- **Code Splitting** - Strings are split into chunks to prevent easy extraction

### Files to Obfuscate

The following files are obfuscated for distribution:
- `electron-main.js` - Main Electron process
- `preload.js` - Electron preload script
- `server.js` - Web server with license validation
- `sw.js` - Service worker for PWA

**Note:** `boardview.html` and other frontend files are NOT obfuscated since they run in the browser and need to be readable for the browser to execute them.

## 2. License Management with Polar.sh

### How It Works

1. **Customer purchases** license on your Polar.sh portal
2. **Polar generates** a license key tied to the customer's email
3. **Customer enters** key in BoardScope
4. **BoardScope validates** key against Polar API (server-side)
5. **License is activated** and Pro features unlock

### Server-Side Validation

Your [`server.js`](server.js:466) includes a `/license-validate` endpoint that:

```javascript
// Validates a Polar license key server-side so the org_id stays secret
if (pathname === '/license-validate' && req.method === 'POST') {
  // 1. Receives license key from client
  // 2. Calls Polar API to validate
  // 3. Returns validation result to client
}
```

This keeps your Polar organization ID secret - clients never see it.

### Webhook Integration

Your [`server.js`](server.js:563) also includes a `/polar-webhook` endpoint that:

- Receives events from Polar when licenses are created/updated/revoked
- Can be used to track license activity
- Validates webhook signatures for security

## 3. Secure Build Process

### Build Scripts

Your [`package.json`](package.json:8) includes these build commands:

```json
{
  "scripts": {
    "obfuscate": "javascript-obfuscator electron-main.js --output dist-obfuscated/electron-main.js --config obfuscate.config.json && ...",
    "electron:build:secure": "npm run obfuscate && cp dist-obfuscated/*.js . && electron-builder",
    "build:secure:win": "npm run electron:build:secure -- --win",
    "build:secure:mac": "npm run electron:build:secure -- --mac",
    "build:secure:all": "npm run electron:build:secure -- --win --mac --linux"
  }
}
```

### Build Process

1. **Obfuscate** - Run `npm run obfuscate` to create obfuscated versions
2. **Copy** - Replace original files with obfuscated versions
3. **Package** - Run `electron-builder` to create distributable packages
4. **Sign** - (macOS) Code signing is configured for hardened runtime

### Creating a Secure Build

```bash
# Build for all platforms
npm run build:secure:all

# Build for specific platform
npm run build:secure:win
npm run build:secure:mac
```

## 4. Setting Up Polar.sh for Sales

### Step 1: Create Polar Organization

1. Sign up at [polar.sh](https://polar.sh)
2. Create an organization for BoardScope
3. Set up your billing and payment methods

### Step 2: Create Products

Create two products in Polar:

1. **BoardScope Pro - Lifetime**
   - One-time payment
   - No expiration
   - Price: Your choice (e.g., $199)

2. **BoardScope Pro - Yearly**
   - Annual subscription
   - Price: Your choice (e.g., $99/year)

### Step 3: Configure License Keys

1. In Polar dashboard, go to **Products** → **License Keys**
2. Enable license key generation for your products
3. Set the license key format (default: `BS-XXXX-XXXX-XXXX-XXXX`)

### Step 4: Get Your Organization ID

1. In Polar dashboard, go to **Settings** → **Organization**
2. Copy your **Organization ID**
3. Set it in your environment or config file:

```bash
# Option 1: Environment variable
export POLAR_ORG_ID=your_org_id_here

# Option 2: Config file (.polar_config)
echo "org_id=your_org_id_here" > .polar_config
```

### Step 5: Configure Webhook Secret

1. In Polar dashboard, go to **Settings** → **Webhooks**
2. Set your webhook URL: `https://your-domain.com/polar-webhook`
3. Copy the webhook secret
4. Set it in your environment or config file:

```bash
# Option 1: Environment variable
export POLAR_WEBHOOK_SECRET=your_webhook_secret_here

# Option 2: Config file (.polar_config)
echo "webhook_secret=your_webhook_secret_here" >> .polar_config
```

### Step 6: Set Up Pricing Page

Your [`website/pricing.html`](website/pricing.html:1) is already configured with:

- Lifetime license option
- Yearly license option
- FAQ section
- Polar checkout integration

Update the pricing and features as needed.

## 5. Deployment Checklist

### Before First Sale

- [ ] Create Polar organization
- [ ] Set up products with pricing
- [ ] Configure license key generation
- [ ] Get Organization ID and set in environment/config
- [ ] Set up webhook URL and secret
- [ ] Test license validation locally
- [ ] Build secure packages for all platforms
- [ ] Test installation and license activation
- [ ] Set up your sales portal/website

### Security Best Practices

1. **Never commit secrets** - Use environment variables or `.gitignore` config files
2. **Keep org_id secret** - Always validate licenses server-side
3. **Use HTTPS** - Serve your application over HTTPS in production
4. **Regular updates** - Keep Electron and dependencies updated
5. **Code signing** - Sign macOS builds for Gatekeeper compatibility

### Testing License Flow

1. **Local test**: Run `node server.js` and visit `http://localhost:8080`
2. **Test validation**: Use a test license key from Polar
3. **Test webhook**: Use Polar's webhook testing tool
4. **Test builds**: Install and test each platform build

## 6. Troubleshooting

### License Validation Fails

- Check that `POLAR_ORG_ID` is set correctly
- Verify the license key format is correct
- Check Polar dashboard for license status
- Review server logs for validation errors

### Obfuscation Breaks Code

- Test obfuscated code before distribution
- Some libraries may not work well with obfuscation
- Consider excluding certain files from obfuscation
- Use `--skip-obfuscate` flag for testing

### Build Fails

- Ensure all dependencies are installed
- Check that icon files exist in `assets/`
- Verify Electron Builder configuration
- Check platform-specific requirements (wine for Windows on macOS/Linux)

## 7. Advanced Protection (Optional)

### Additional Security Measures

1. **Code Signing**
   - macOS: Requires Apple Developer account
   - Windows: Requires code signing certificate
   - Linux: Not typically required

2. **Tamper Detection**
   - Add checksums to detect file modifications
   - Use Electron's `safeStorage` for sensitive data

3. **Anti-Debugging**
   - Enable `debugProtection` in obfuscation config
   - Detect DevTools opening

4. **Watermarking**
   - Add license info to application metadata
   - Track installations (with user consent)

### Performance Considerations

- Obfuscation increases file size slightly
- Control flow flattening can impact performance
- Test performance with obfuscated code
- Consider using `--compact` for smaller files

## 8. Legal Considerations

### Terms of Service

- Include clear terms of service
- Specify license transfer policies
- Define refund policy (Polar supports 14-day refunds)

### Privacy Policy

- Explain what data is collected
- Describe license validation process
- Comply with GDPR/CCPA as applicable

### License Agreement

- Define what users can and cannot do
- Specify number of devices per license
- Clarify support terms

## 9. Support & Maintenance

### Customer Support

- Set up support email (e.g., support@boardscope.com)
- Create FAQ in manual
- Provide license recovery process

### Updates

- Plan for regular updates
- Consider auto-update mechanism
- Communicate changes to customers

### Monitoring

- Monitor license validation success rate
- Track webhook events
- Review server logs regularly

## 10. Quick Start Commands

```bash
# Install dependencies
npm install

# Test locally (without obfuscation)
npm run dev

# Build secure packages
npm run build:secure:all

# Generate license keys (for testing)
node server.js keygen 5

# Obfuscate only
npm run obfuscate
```

## Summary

Your BoardScope project is well-configured for commercial distribution:

✅ **Code Protection** - Obfuscation configured and working
✅ **License Management** - Polar.sh integration ready
✅ **Secure Builds** - Build scripts for all platforms
✅ **Server Validation** - License keys validated server-side
✅ **Sales Portal** - Pricing page ready with Polar checkout

**Next Steps:**
1. Set up your Polar organization and products
2. Configure environment variables for Polar credentials
3. Test the complete license flow locally
4. Build and test distributable packages
5. Deploy your sales portal and start selling!

For questions or support, contact: support@boardscope.com
