#!/usr/bin/env node
// Debug script v7 - analyze field lengths to understand structure
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

console.log(`Total fields: ${fields.length}`);

// Analyze field length distribution
const lengthCounts = {};
for (const f of fields) {
  const len = f.length;
  lengthCounts[len] = (lengthCounts[len] || 0) + 1;
}

console.log('\nField length distribution:');
const sortedLengths = Object.keys(lengthCounts).map(Number).sort((a,b) => a-b);
for (const len of sortedLengths.slice(0, 30)) {
  console.log(`  Length ${len}: ${lengthCounts[len]} fields`);
}

// Show first 50 fields with their lengths and types
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

console.log('\n--- First 50 fields ---');
for (let i = 0; i < Math.min(50, fields.length); i++) {
  const f = fields[i];
  const hex = Array.from(f.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  
  // Check for 0x0d0a positions
  const newlinePositions = [];
  for (let j = 0; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      newlinePositions.push(j);
    }
  }
  
  // Try to decode as net if it has 0x0d0a
  let netInfo = '';
  if (newlinePositions.length > 0) {
    const firstNl = newlinePositions[0];
    if (firstNl > 0) {
      // Normal net field
      const netBytes = f.slice(0, firstNl);
      const idxBytes = f.slice(firstNl + 2);
      const netName = decodeNet(netBytes);
      const idxDigits = decodeDigits(idxBytes);
      const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
      netInfo = `net="${netName}" pinIdx=${pinIdx}`;
    } else if (newlinePositions.length > 1) {
      // Empty net name, second 0x0d0a is the separator
      const secondNl = newlinePositions[1];
      const idxBytes = f.slice(secondNl + 2);
      const idxDigits = decodeDigits(idxBytes);
      const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
      netInfo = `net="" pinIdx=${pinIdx}`;
    }
  }
  
  // Try to decode as coord
  const digits = decodeDigits(f);
  const coordVal = digits.length > 0 ? base4ToInt(digits) : -1;
  
  console.log(`Field ${i}: len=${f.length}, newlines=[${newlinePositions.join(',')}], coord=${coordVal}, ${netInfo}`);
  console.log(`  hex: ${hex}`);
}
