#!/usr/bin/env node
// Debug script v4 - parse sequentially: net, Y, X, side, net, Y, X, side...
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

// Find net fields: fields that contain 0x0d0a NOT at position 0
// AND have at least one cipher byte before the 0x0d0a
function findNetFields() {
  const netFields = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    // Skip if starts with 0x0d0a (these are coord fields)
    if (f.length >= 2 && f[0] === 0x0d && f[1] === 0x0a) continue;
    
    // Look for 0x0d0a at position > 0
    for (let j = 1; j < f.length - 1; j++) {
      if (f[j] === 0x0d && f[j+1] === 0x0a) {
        // Check if net name portion has at least one cipher byte
        const netBytes = f.slice(0, j);
        let hasCipher = false;
        for (const b of netBytes) {
          if (CIPHER[b]) { hasCipher = true; break; }
        }
        if (hasCipher) {
          netFields.push(i);
        }
        break;
      }
    }
  }
  return netFields;
}

const netFieldIndices = findNetFields();
console.log(`Found ${netFieldIndices.length} net fields`);
console.log('First 20 net field indices:', netFieldIndices.slice(0, 20));

// Now parse pins: for each net field, get the next 3 fields as coords
let lastNetName = '';
const pins = [];

for (const idx of netFieldIndices) {
  const f = fields[idx];
  
  // Find 0x0d0a position
  let newlinePos = -1;
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      newlinePos = j;
      break;
    }
  }
  
  if (newlinePos === -1) continue;
  
  const netBytes = f.slice(0, newlinePos);
  const idxBytes = f.slice(newlinePos + 2);
  const netName = decodeNet(netBytes);
  const idxDigits = decodeDigits(idxBytes);
  const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
  
  const actualNetName = netName || lastNetName;
  lastNetName = actualNetName;
  
  // Get next 3 fields as coords (Y, X, side)
  // But skip any fields that are net fields themselves
  let coordFields = [];
  let fi = idx + 1;
  while (coordFields.length < 3 && fi < fields.length) {
    if (!netFieldIndices.includes(fi)) {
      coordFields.push(fi);
    }
    fi++;
  }
  
  const y = coordFields[0] !== undefined ? base4ToInt(decodeDigits(fields[coordFields[0]])) : 0;
  const x = coordFields[1] !== undefined ? base4ToInt(decodeDigits(fields[coordFields[1]])) : 0;
  const sideVal = coordFields[2] !== undefined ? base4ToInt(decodeDigits(fields[coordFields[2]])) : 0;
  const side = (sideVal % 2 === 0) ? 'T' : 'B';
  
  pins.push({ pinIdx, net: actualNetName, x, y, side, sideVal });
}

console.log(`\nTotal pins parsed: ${pins.length}`);

// Show first 20 pins
console.log('\nFirst 20 pins:');
for (let i = 0; i < Math.min(20, pins.length); i++) {
  const p = pins[i];
  console.log(`  Pin ${p.pinIdx}: net="${p.net}", x=${p.x}, y=${p.y}, side=${p.side}`);
}

// Show coordinate ranges
if (pins.length > 0) {
  const xs = pins.map(p => p.x);
  const ys = pins.map(p => p.y);
  console.log(`\nX range: ${Math.min(...xs)} - ${Math.max(...xs)}`);
  console.log(`Y range: ${Math.min(...ys)} - ${Math.max(...ys)}`);
  console.log(`Board size: ${Math.max(...xs) - Math.min(...xs)} x ${Math.max(...ys) - Math.min(...ys)}`);
  
  // Show unique nets
  const nets = new Set(pins.map(p => p.net));
  console.log(`Unique nets: ${nets.size}`);
}
