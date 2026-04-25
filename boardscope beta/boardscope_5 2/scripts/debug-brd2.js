#!/usr/bin/env node
// Debug script v2 - analyze field patterns more carefully
const fs = require('fs');

const filePath = process.argv[2] || '820-01958 A2179.brd';
const buffer = fs.readFileSync(filePath);
const bytes = new Uint8Array(buffer);

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

// Classify each field
function classifyField(f, idx) {
  // Check if starts with 0x0d0a
  const startsWith0d0a = f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a;
  
  // Check if contains 0x0d0a NOT at position 0 (net field)
  let hasInternalNewline = -1;
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      hasInternalNewline = j;
      break;
    }
  }
  
  // Check if it looks like a coord field (short, all bytes decode to base4 digits)
  const digits = decodeDigits(f);
  const isShort = f.length <= 10;
  const allDigits = digits.length > 0 && digits.length === f.filter(b => b !== 0xaa).length;
  
  let type = 'unknown';
  if (startsWith0d0a && hasInternalNewline === -1) {
    type = 'coord';
  } else if (hasInternalNewline > 0) {
    type = 'net';
  } else if (startsWith0d0a) {
    type = 'coord';
  } else if (isShort && allDigits) {
    type = 'coord';
  } else {
    type = 'other';
  }
  
  return { type, startsWith0d0a, hasInternalNewline, digits, value: digits.length > 0 ? base4ToInt(digits) : -1 };
}

// Classify first 50 fields
console.log('--- Field classification (first 50) ---');
for (let i = 0; i < Math.min(50, fields.length); i++) {
  const f = fields[i];
  const info = classifyField(f, i);
  const hex = Array.from(f.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  
  if (info.type === 'net') {
    const netBytes = f.slice(0, info.hasInternalNewline);
    const idxBytes = f.slice(info.hasInternalNewline + 2);
    const netName = decodeNet(netBytes);
    const pinIdx = decodeDigits(idxBytes).length > 0 ? base4ToInt(decodeDigits(idxBytes)) : -1;
    console.log(`Field ${i}: type=NET, net="${netName}", pinIdx=${pinIdx}, len=${f.length}`);
  } else if (info.type === 'coord') {
    console.log(`Field ${i}: type=COORD, value=${info.value}, digits=${info.digits.join('')}, len=${f.length}, hex=${hex}`);
  } else {
    console.log(`Field ${i}: type=${info.type}, len=${f.length}, hex=${hex}`);
  }
}

// Now try to parse with the correct structure:
// Net field -> 3 coord fields -> Net field -> 3 coord fields -> ...
console.log('\n--- Parsing with net+3coords pattern ---');
let parsed = 0;
let i = 0;
while (i < fields.length && parsed < 10) {
  const f = fields[i];
  const info = classifyField(f, i);
  
  if (info.type === 'net') {
    const netBytes = f.slice(0, info.hasInternalNewline);
    const idxBytes = f.slice(info.hasInternalNewline + 2);
    const netName = decodeNet(netBytes);
    const pinIdx = decodeDigits(idxBytes).length > 0 ? base4ToInt(decodeDigits(idxBytes)) : -1;
    
    // Get next 3 fields as coords
    const c1 = i+1 < fields.length ? classifyField(fields[i+1], i+1) : null;
    const c2 = i+2 < fields.length ? classifyField(fields[i+2], i+2) : null;
    const c3 = i+3 < fields.length ? classifyField(fields[i+3], i+3) : null;
    
    console.log(`Pin ${pinIdx}: net="${netName}", coord1=${c1?.value||0}(${c1?.type}), coord2=${c2?.value||0}(${c2?.type}), sideVal=${c3?.value||0}(${c3?.type})`);
    
    i += 4; // Skip net + 3 coords
    parsed++;
  } else {
    i++;
  }
}
