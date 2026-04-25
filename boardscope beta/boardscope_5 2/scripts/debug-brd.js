#!/usr/bin/env node
// Debug script to analyze Apple binary BRD file structure
const fs = require('fs');

const filePath = process.argv[2] || '820-01958 A2179.brd';
const buffer = fs.readFileSync(filePath);
const bytes = new Uint8Array(buffer);

console.log('File size:', bytes.length, 'bytes');
console.log('First 20 bytes (hex):', Array.from(bytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('First 20 bytes (raw):', Array.from(bytes.slice(0, 20)).join(' '));

// Split by 0xf7
const fields = [];
let start = 0;
for (let i = 0; i < bytes.length; i++) {
  if (bytes[i] === 0xf7) {
    if (i > start) fields.push(bytes.slice(start, i));
    start = i + 1;
  }
}
if (start < bytes.length) fields.push(bytes.slice(start));

console.log('\nTotal fields:', fields.length);

// Show first 30 fields in detail
console.log('\n--- First 30 fields ---');
for (let i = 0; i < Math.min(30, fields.length); i++) {
  const f = fields[i];
  const hex = Array.from(f.slice(0, 30)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const hasNewline = f.length > 1 && f[0] === 0x0d && f[1] === 0x0a;
  const newlinePos = f.findIndex((b, idx) => idx > 0 && b === 0x0d && f[idx+1] === 0x0a);
  console.log(`Field ${i}: len=${f.length}, starts_with_0d0a=${hasNewline}, newline_at=${newlinePos}, hex=${hex}`);
}

// Find net fields (contain 0x0d0a NOT at position 0)
const CIPHER = {
  0xeb:'P', 0x6b:'P', 0x6a:'V', 0xea:'V', 0x6c:'N', 0xec:'N',
  0x6e:'D', 0xee:'D', 0x2f:'C', 0xaf:'C', 0x2e:'G', 0xae:'G',
  0x2a:'U', 0xaa:'U', 0x2b:'S', 0xab:'S', 0x28:'_', 0xa8:'_',
  0x6f:'O', 0xef:'O', 0x6d:'M', 0xed:'M', 0x69:'I', 0xe9:'I',
  0x2c:'R', 0xac:'R', 0x2d:'H', 0xad:'H', 0x29:'A', 0xa9:'A',
  0x23:'B', 0xa3:'B', 0x26:'E', 0xa6:'E', 0x24:'T', 0xa4:'T',
  0x63:'L', 0xe3:'L', 0x64:'F', 0xe4:'F', 0x62:'K', 0xe2:'K',
};

function decodeNet(data) {
  const result = [];
  for (const b of data) {
    if (CIPHER[b]) {
      result.push(CIPHER[b]);
    } else {
      const lb = b & 0x7F;
      for (const base of [0x30, 0x70, 0xb0, 0xf0]) {
        if (lb >= base && lb <= base + 9) {
          result.push(String(lb - base));
          break;
        }
      }
    }
  }
  return result.join('');
}

function decodeDigits(data) {
  const digits = [];
  for (const b of data) {
    if (b === 0xaa) continue;
    const lb = b & 0x7F;
    for (const base of [0x30, 0x70, 0xb0, 0xf0]) {
      if (lb >= base && lb <= base + 9) {
        digits.push(lb - base);
        break;
      }
    }
  }
  return digits;
}

function base4ToInt(digits) {
  let r = 0;
  for (const d of digits) r = r * 4 + d;
  return r;
}

// Find and decode first 10 net fields
console.log('\n--- Net fields (first 10) ---');
let netCount = 0;
for (let i = 0; i < fields.length && netCount < 10; i++) {
  const f = fields[i];
  if (f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a) continue;
  
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      const netBytes = f.slice(0, j);
      const idxBytes = f.slice(j + 2);
      const netName = decodeNet(netBytes);
      const idxDigits = decodeDigits(idxBytes);
      const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
      
      // Get next 3 fields as coords
      let c1=0, c2=0, c3=0;
      if (i+3 < fields.length) {
        const d1 = decodeDigits(fields[i+1]);
        const d2 = decodeDigits(fields[i+2]);
        const d3 = decodeDigits(fields[i+3]);
        if (d1.length > 0) c1 = base4ToInt(d1);
        if (d2.length > 0) c2 = base4ToInt(d2);
        if (d3.length > 0) c3 = base4ToInt(d3);
      }
      
      console.log(`Net field ${i}: net="${netName}" pinIdx=${pinIdx} coord1=${c1} coord2=${c2} sideVal=${c3}`);
      console.log(`  Raw net bytes: ${Array.from(netBytes).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Raw idx bytes: ${Array.from(idxBytes).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Raw coord1: ${Array.from(fields[i+1]).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Raw coord2: ${Array.from(fields[i+2]).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Raw coord3: ${Array.from(fields[i+3]).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      
      netCount++;
      break;
    }
  }
}

// Show some coord-only fields (start with 0x0d0a)
console.log('\n--- Coord-only fields (first 10) ---');
let coordCount = 0;
for (let i = 0; i < fields.length && coordCount < 10; i++) {
  const f = fields[i];
  if (f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a) {
    const digits = decodeDigits(f);
    const val = digits.length > 0 ? base4ToInt(digits) : -1;
    console.log(`Coord field ${i}: len=${f.length}, digits=${digits.join('')}, value=${val}, hex=${Array.from(f).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
    coordCount++;
  }
}
