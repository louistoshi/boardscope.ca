#!/usr/bin/env node
// Debug script v11 - find all net fields, then parse coords between them
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

// A field is a NET field ONLY if it has 0x0d0a NOT at position 0
// Fields starting with 0x0d0a are COORD fields (even if they have another 0x0d0a later)
function isNetField(f) {
  if (f.length < 3) return false;
  if (f[0] === 0x0d && f[1] === 0x0a) return false; // Starts with 0x0d0a = COORD field
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) return true;
  }
  return false;
}

function getNetInfo(f) {
  for (let j = 1; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      const netBytes = f.slice(0, j);
      const idxBytes = f.slice(j + 2);
      const netName = decodeNet(netBytes);
      const idxDigits = decodeDigits(idxBytes);
      const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
      return { netName, pinIdx };
    }
  }
  return null;
}

function getCoordValue(f) {
  const digits = decodeDigits(f);
  return digits.length > 0 ? base4ToInt(digits) : 0;
}

// Find all net fields
const netFieldIndices = [];
for (let i = 0; i < fields.length; i++) {
  if (isNetField(fields[i])) {
    netFieldIndices.push(i);
  }
}

console.log(`Total fields: ${fields.length}`);
console.log(`Net fields found: ${netFieldIndices.length}`);

// Show gaps between consecutive net fields
console.log('\n--- Gaps between first 30 net fields ---');
const gaps = [];
for (let i = 1; i < Math.min(30, netFieldIndices.length); i++) {
  const gap = netFieldIndices[i] - netFieldIndices[i-1];
  gaps.push(gap);
  console.log(`Net field ${i}: idx=${netFieldIndices[i]}, gap=${gap}`);
}

// Find the most common gap
const gapCounts = {};
for (const g of gaps) {
  gapCounts[g] = (gapCounts[g] || 0) + 1;
}
const sortedGaps = Object.entries(gapCounts).sort((a,b) => b[1] - a[1]);
console.log('\n--- Most common gaps ---');
for (const [gap, count] of sortedGaps.slice(0, 10)) {
  console.log(`Gap ${gap}: ${count} occurrences`);
}

// Now parse using the most common gap pattern
const commonGap = parseInt(sortedGaps[0][0]);
console.log(`\n--- Parsing with gap=${commonGap} ---`);

let lastNetName = '';
const pins = [];

for (let i = 0; i < netFieldIndices.length; i++) {
  const netIdx = netFieldIndices[i];
  const netField = fields[netIdx];
  const info = getNetInfo(netField);
  
  if (!info || info.pinIdx < 0) continue;
  
  const netName = info.netName || lastNetName;
  lastNetName = netName;
  
  // Get coord fields between this net field and the next
  const nextNetIdx = i + 1 < netFieldIndices.length ? netFieldIndices[i+1] : fields.length;
  const coordFieldIndices = [];
  for (let j = netIdx + 1; j < nextNetIdx; j++) {
    coordFieldIndices.push(j);
  }
  
  // We expect 3 coord fields (Y, X, side)
  const y = coordFieldIndices[0] !== undefined ? getCoordValue(fields[coordFieldIndices[0]]) : 0;
  const x = coordFieldIndices[1] !== undefined ? getCoordValue(fields[coordFieldIndices[1]]) : 0;
  const sideVal = coordFieldIndices[2] !== undefined ? getCoordValue(fields[coordFieldIndices[2]]) : 0;
  const side = (sideVal % 2 === 0) ? 'T' : 'B';
  
  if (pins.length < 30) {
    console.log(`Pin ${info.pinIdx}: net="${netName}", x=${x}, y=${y}, side=${side} (${coordFieldIndices.length} coord fields)`);
  }
  
  pins.push({ pinIdx: info.pinIdx, net: netName, x, y, side });
}

console.log(`\n--- Statistics (${pins.length} pins) ---`);
if (pins.length > 0) {
  const xs = pins.map(p => p.x);
  const ys = pins.map(p => p.y);
  console.log(`X range: ${Math.min(...xs)} - ${Math.max(...xs)}`);
  console.log(`Y range: ${Math.min(...ys)} - ${Math.max(...ys)}`);
  console.log(`Board size: ${Math.max(...xs) - Math.min(...xs)} x ${Math.max(...ys) - Math.min(...ys)}`);
  
  const nets = new Set(pins.map(p => p.net));
  console.log(`Unique nets: ${nets.size}`);
}
