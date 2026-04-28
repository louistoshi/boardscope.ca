#!/usr/bin/env node
// Debug script v9 - parse strictly sequentially: find first net field, then every 4th field is a net field
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

// Find the first net field by looking for 0x0d0a NOT at position 0
function findFirstNetField() {
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.length < 3) continue;
    // Look for 0x0d0a NOT at position 0
    for (let j = 1; j < f.length - 1; j++) {
      if (f[j] === 0x0d && f[j+1] === 0x0a) {
        return i;
      }
    }
  }
  return -1;
}

function getNetInfo(f) {
  // Look for 0x0d0a NOT at position 0
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

// Find first net field
const firstNetIdx = findFirstNetField();
console.log(`First net field at index: ${firstNetIdx}`);

if (firstNetIdx >= 0) {
  console.log('\n--- Sequential parsing (net at firstNetIdx, then every 4th field) ---');
  let lastNetName = '';
  const pins = [];
  
  // Start from firstNetIdx and parse every 4 fields
  for (let i = firstNetIdx; i < fields.length - 3; i += 4) {
    const netField = fields[i];
    const yField = fields[i+1];
    const xField = fields[i+2];
    const sideField = fields[i+3];
    
    const info = getNetInfo(netField);
    if (!info || info.pinIdx < 0) {
      console.log(`Skipping field ${i}: not a valid net field`);
      continue;
    }
    
    const netName = info.netName || lastNetName;
    lastNetName = netName;
    
    const y = getCoordValue(yField);
    const x = getCoordValue(xField);
    const sideVal = getCoordValue(sideField);
    const side = (sideVal % 2 === 0) ? 'T' : 'B';
    
    if (pins.length < 30) {
      console.log(`Pin ${info.pinIdx}: net="${netName}", x=${x}, y=${y}, side=${side}`);
      console.log(`  Net field (${netField.length}b): ${Array.from(netField.slice(0,20)).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Y field (${yField.length}b): ${Array.from(yField).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  X field (${xField.length}b): ${Array.from(xField).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
      console.log(`  Side field (${sideField.length}b): ${Array.from(sideField).map(b=>b.toString(16).padStart(2,'0')).join(' ')}`);
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
    console.log(`First 20 nets:`, [...nets].slice(0, 20).join(', '));
  }
}
