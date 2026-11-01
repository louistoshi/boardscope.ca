#!/usr/bin/env node
// Generate a BoardScope trial license key: BOARDSCOPE-TRIAL-YYYYMMDD
// Pro features work through the end of the expiry day, then the key is
// rejected by the license server and the app drops back to Free.
//
// Usage:
//   node scripts/trial-key.js              → 14-day trial from today
//   node scripts/trial-key.js 30           → 30-day trial from today
//   node scripts/trial-key.js 2026-12-25   → trial expiring on that date

const arg = process.argv[2];
let expiry;

if (!arg) {
  expiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
} else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
  expiry = new Date(arg + 'T00:00:00');
  if (isNaN(expiry)) { console.error('Invalid date: ' + arg); process.exit(1); }
} else if (/^\d+$/.test(arg)) {
  expiry = new Date(Date.now() + parseInt(arg, 10) * 24 * 60 * 60 * 1000);
} else {
  console.error('Usage: node scripts/trial-key.js [days | YYYY-MM-DD]');
  process.exit(1);
}

const y = expiry.getFullYear();
const m = String(expiry.getMonth() + 1).padStart(2, '0');
const d = String(expiry.getDate()).padStart(2, '0');
const key = `BOARDSCOPE-TRIAL-${y}${m}${d}`;

const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const human = `${months[expiry.getMonth()]} ${expiry.getDate()}, ${y}`;

console.log(`
BoardScope Trial License
────────────────────────
Key:     ${key}
Expires: ${human} (end of day)

Ready to send:
────────────────────────
Hi! Here's your BoardScope Pro trial license — valid through ${human}.

1. Download BoardScope: https://boardscope.ca
2. Open the app → Settings → License
3. Enter this key: ${key}
4. Click Activate

After ${human} the Pro features lock automatically, but all core
features stay free forever. Enjoy!
────────────────────────
`);
