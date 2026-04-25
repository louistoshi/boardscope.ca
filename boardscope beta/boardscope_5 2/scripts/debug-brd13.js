#!/usr/bin/env node
/**
 * Debug script to decode and dump the Apple BRD file structure
 */
const fs = require('fs');
const path = require('path');

const brdPath = path.join(__dirname, '..', 'brd file and pdf', 'MacbookAir820-00165', 'J113  820-00165.brd');
const bytes = fs.readFileSync(brdPath);

console.log('File size:', bytes.length, 'bytes');
console.log('First 16 bytes:', bytes.slice(0, 16).toString('hex'));

// XOR decode (OpenBoardView algorithm)
function decodeByte(c) {
  if (c === 0x0d || c === 0x0a || c === 0x00) return c;
  return (~(((c >> 6) & 3) | (c << 2))) & 0xFF;
}

// Decode entire file
const decoded = Buffer.alloc(bytes.length);
for (let i = 0; i < bytes.length; i++) {
  decoded[i] = decodeByte(bytes[i]);
}

// Save decoded output for inspection
const decodedPath = path.join(__dirname, 'decoded.txt');
fs.writeFileSync(decodedPath, decoded);
console.log('\nDecoded output saved to:', decodedPath);

// Show first 2000 chars of decoded text
console.log('\n--- First 2000 chars of decoded text ---');
console.log(decoded.slice(0, 2000).toString('utf8'));

// Split into lines and show structure
console.log('\n--- Line structure ---');
const lines = decoded.toString('utf8').split(/\r?\n/).filter(l => l.trim().length > 0);
console.log('Total non-empty lines:', lines.length);
for (let i = 0; i < Math.min(50, lines.length); i++) {
  const line = lines[i].trim();
  const preview = line.length > 120 ? line.substring(0, 120) + '...' : line;
  console.log(`  [${i}] ${preview}`);
}

// Look for section headers
console.log('\n--- Section headers found ---');
const sectionHeaders = ['str_length:', 'var_data:', 'Format:', 'format:', 'Parts:', 'Pins1:', 'Pins:', 'Pins2:', 'Nails:'];
for (const header of sectionHeaders) {
  const idx = decoded.indexOf(header);
  if (idx >= 0) {
    console.log(`  "${header}" found at offset ${idx} (0x${idx.toString(16)})`);
    // Show context around it
    const start = Math.max(0, idx - 20);
    const end = Math.min(decoded.length, idx + header.length + 60);
    console.log(`    Context: ${decoded.slice(start, end).toString('utf8').replace(/\r?\n/g, '\\n')}`);
  }
}

// Also try to find any readable text patterns
console.log('\n--- Looking for component-like patterns ---');
const text = decoded.toString('utf8');
const refRegex = /([A-Z]{1,3}\d{2,5})/g;
const matches = text.match(refRegex);
if (matches) {
  const unique = [...new Set(matches)].sort();
  console.log(`  Found ${matches.length} refs, ${unique.length} unique`);
  console.log('  First 30:', unique.slice(0, 30).join(', '));
}
