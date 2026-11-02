#!/usr/bin/env node
// Generate a BoardScope tester license: BS-XXXX-XXXX-XXXX-XXXX
//
// These are the legacy locally-validated keys the app accepts offline:
// lifetime Pro, no expiry, no internet needed after activation, and no
// machine counting — the same key activates on any number of devices.
// Validated client-side by LIC.validateLegacyKey() in boardview.html
// (checksum: first char of the last group = letter from the char-code
// sum of the first 12 chars mod 26).
//
// Use for testers and reviewers. Paying customers get Polar keys
// (revocable, managed). Usage:
//   node scripts/tester-key.js           → 1 key
//   node scripts/tester-key.js 5         → 5 keys
//   node scripts/tester-key.js "Alex"    → 1 key with a label

const arg = process.argv[2];
const count = /^\d+$/.test(arg || '') ? Math.min(parseInt(arg, 10), 50) : 1;
const label = /^\d+$/.test(arg || '') ? 'Tester' : (arg || 'Tester');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — avoid transcription errors

function genKey() {
  let body = '';
  for (let i = 0; i < 12; i++) body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const sum = body.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const check = String.fromCharCode((sum % 26) + 65);
  let tail = check;
  for (let i = 0; i < 3; i++) tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const full = body + tail;
  return 'BS-' + full.match(/.{1,4}/g).join('-');
}

// Verify with the same checksum the app uses, so a broken generator fails loudly
function verify(key) {
  let clean = key.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.startsWith('BS')) clean = clean.slice(2);
  if (clean.length !== 16) return false;
  const seg = [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12), clean.slice(12, 16)];
  const sum = seg.slice(0, 3).join('').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const check = String.fromCharCode((sum % 26) + 65);
  return seg[3][0] === check;
}

const keys = [];
for (let i = 0; i < count; i++) {
  let k = genKey();
  while (!verify(k)) k = genKey(); // should never loop, but be safe
  keys.push(k);
}

console.log(`
BoardScope Tester License${count > 1 ? `s (${count})` : ''} — ${label}
────────────────────────
${keys.map(k => `Key: ${k}`).join('\n')}
Plan:     Pro — Lifetime (tester)
Machines: no limit (activate on as many as needed)
Offline:  yes — validates locally, never phones home

Ready to send:
────────────────────────
Hi! Here's your BoardScope Pro tester license${count > 1 ? ' keys' : ''} —
lifetime access, yours to keep.

1. Download BoardScope: https://boardscope.ca
2. Open the app → click UPGRADE TO PRO (top right)
3. Enter this key${count > 1 ? ' (one per machine)' : ''}: ${keys[0]}${count > 1 ? '\n   (additional: ' + keys.slice(1).join(', ') + ')' : ''}
4. Click Activate — that's it, all Pro features unlock

Thanks for testing BoardScope!
────────────────────────
`);
