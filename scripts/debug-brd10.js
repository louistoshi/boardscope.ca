#!/usr/bin/env node
// Debug script v10 - scan ALL fields and classify them, then find the pattern
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
function classifyField(f) {
  // Check for 0x0d0a positions
  const newlinePositions = [];
  for (let j = 0; j < f.length - 1; j++) {
    if (f[j] === 0x0d && f[j+1] === 0x0a) {
      newlinePositions.push(j);
    }
  }
  
  // Type 1: Has 0x0d0a NOT at position 0 → NET field with name
  if (newlinePositions.length > 0 && newlinePositions[0] > 0) {
    const nlPos = newlinePositions[0];
    const netBytes = f.slice(0, nlPos);
    const idxBytes = f.slice(nlPos + 2);
    const netName = decodeNet(netBytes);
    const idxDigits = decodeDigits(idxBytes);
    const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
    return { type: 'NET_NAMED', netName, pinIdx, newlinePositions };
  }
  
  // Type 2: Starts with 0x0d0a and has another 0x0d0a later → NET field with empty name
  if (newlinePositions.length >= 2 && newlinePositions[0] === 0) {
    const nlPos = newlinePositions[1]; // Use second 0x0d0a as separator
    const idxBytes = f.slice(nlPos + 2);
    const idxDigits = decodeDigits(idxBytes);
    const pinIdx = idxDigits.length > 0 ? base4ToInt(idxDigits) : -1;
    return { type: 'NET_EMPTY', netName: '', pinIdx, newlinePositions };
  }
  
  // Type 3: Starts with 0x0d0a but no other 0x0d0a → COORD field
  if (newlinePositions.length === 1 && newlinePositions[0] === 0) {
    const digits = decodeDigits(f);
    const val = digits.length > 0 ? base4ToInt(digits) : -1;
    return { type: 'COORD', value: val, newlinePositions };
  }
  
  // Type 4: No 0x0d0a at all → COORD field
  if (newlinePositions.length === 0) {
    const digits = decodeDigits(f);
    const val = digits.length > 0 ? base4ToInt(digits) : -1;
    return { type: 'COORD', value: val, newlinePositions };
  }
  
  return { type: 'UNKNOWN', newlinePositions };
}

// Classify first 100 fields
console.log('--- Field classification (first 100) ---');
const classifications = [];
for (let i = 0; i < Math.min(100, fields.length); i++) {
  const info = classifyField(fields[i]);
  classifications.push(info);
  
  if (info.type === 'NET_NAMED') {
    console.log(`Field ${i}: ${info.type}, net="${info.netName}", pinIdx=${info.pinIdx}, len=${fields[i].length}`);
  } else if (info.type === 'NET_EMPTY') {
    console.log(`Field ${i}: ${info.type}, pinIdx=${info.pinIdx}, len=${fields[i].length}`);
  } else {
    console.log(`Field ${i}: ${info.type}, value=${info.value}, len=${fields[i].length}`);
  }
}

// Find the pattern: look for sequences of NET fields followed by COORD fields
console.log('\n--- Looking for net+coord patterns ---');
let netCount = 0;
let coordCount = 0;
let lastNetIdx = -1;

for (let i = 0; i < classifications.length; i++) {
  const info = classifications[i];
  if (info.type.startsWith('NET')) {
    if (lastNetIdx >= 0) {
      const gap = i - lastNetIdx;
      console.log(`Gap between net fields ${lastNetIdx} and ${i}: ${gap} fields`);
    }
    lastNetIdx = i;
    netCount++;
  }
}

console.log(`\nTotal net fields in first 100: ${netCount}`);

// Now parse all fields and find all net fields
console.log('\n--- Parsing all fields ---');
const allNetFields = [];
for (let i = 0; i < fields.length; i++) {
  const info = classifyField(fields[i]);
  if (info.type.startsWith('NET') && info.pinIdx >= 0) {
    allNetFields.push({ idx: i, ...info });
  }
}

console.log(`Total net fields found: ${allNetFields.length}`);

// Show gaps between consecutive net fields
console.log('\n--- Gaps between first 30 net fields ---');
for (let i = 1; i < Math.min(30, allNetFields.length); i++) {
  const gap = allNetFields[i].idx - allNetFields[i-1].idx;
  if (i <= 5 || gap !== allNetFields[i-1].idx - allNetFields[i-2].idx) {
    console.log(`Net field ${i}: idx=${allNetFields[i].idx}, gap=${gap}, pinIdx=${allNetFields[i].pinIdx}, net="${allNetFields[i].netName}"`);
  }
}
