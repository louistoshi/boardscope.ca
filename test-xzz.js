/*
 * XZZ parser test harness (Node)
 * 1. DES correctness: 16-round chained encrypt/decrypt against the vectors
 *    published in OpenBoardView's Crypto/des.c (dhuertas test main).
 * 2. XZZ round-trip: build a synthetic XZZ file (plain + XOR-obfuscated),
 *    parse it back, verify parts/pins/nets/outline.
 *
 * Run: node test-xzz.js
 */
const XZZPCB = require('./xzz-parser.js');
const fs = require('fs');
const path = require('path');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

/* ── 1. DES test vectors ──
 * From des.c TEST_DES_IMPLEMENTATION: chained E/D with key = value itself. */
console.log('DES correctness (chained E/D vectors from des.c):');
const EXPECTED = [
  '8da744e0c94e5e17', '0cdb25e3ba3c6d79', '4784c4ba5006081f', '1cf1fc126f2ef842',
  'e4be250042098d13', '7bfc5dc6adb5797c', '1ab3b4d82082fb28', 'c1576a14de707097',
  '739b68cd2e26782a', '2a59f0c464506edb', 'a5c39d4251f0a81e', '7239ac9a6107ddb1',
  '070cac8590241233', '78f87b6e3dfecf61', '95ec2578c2c433f0', '1b1a2ddb4c642438'];

// uint64 as [hi, lo]; helpers for chained test
function fromHex(hex) {
  const h = hex.padStart(16, '0');
  return [parseInt(h.slice(0, 8), 16) >>> 0, parseInt(h.slice(8), 16) >>> 0];
}
function toHex([hi, lo]) {
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

let state = fromHex('9474B8E8C73BCA7D');
for (let i = 0; i < 16; i++) {
  const ks = XZZPCB.desSubkeys(state[0], state[1]);
  const [ohi, olo] = XZZPCB.desBlock(state[0], state[1], ks, i % 2 === 1);
  state = [ohi >>> 0, olo >>> 0];
  check('round ' + (i + 1) + ' = ' + EXPECTED[i], toHex(state) === EXPECTED[i], 'got ' + toHex(state));
}

/* ── 2. synthetic XZZ file ── */
console.log('\nXZZ round-trip (synthetic file):');

function u32le(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
function str(s) { return [...s].map(c => c.charCodeAt(0)); }

// Minimal DES-ECB encryptor for the test (reuse decrypt internals via block fn)
function desEncryptBuffer(bytes) {
  const keys = XZZPCB.desSubkeys(0xdcfc12ac, 0);
  const out = new Uint8Array(bytes.length);
  for (let pos = 0; pos < bytes.length; pos += 8) {
    const b = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 8 && pos + i < bytes.length; i++) b[i] = bytes[pos + i];
    const hi = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    const lo = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
    const [ohi, olo] = XZZPCB.desBlock(hi, lo, keys, false);
    const ob = [(ohi >>> 24) & 255, (ohi >>> 16) & 255, (ohi >>> 8) & 255, ohi & 255,
                (olo >>> 24) & 255, (olo >>> 16) & 255, (olo >>> 8) & 255, olo & 255];
    for (let i = 0; i < 8 && pos + i < bytes.length; i++) out[pos + i] = ob[i];
  }
  return out;
}

function buildXzz(xorKey) {
  // net table
  const nets = [[1, 'PP3V3_S5'], [2, 'NC'], [3, 'SPI_ROM_CS']];
  const netRecs = [];
  for (const [idx, name] of nets) {
    netRecs.push(...u32le(name.length + 8), ...u32le(idx), ...str(name));
  }
  const netBlock = [...u32le(netRecs.length), ...netRecs];

  // main data blocks
  const blocks = [];
  const seg = (layer, x1, y1, x2, y2) => {
    const payload = [...u32le(layer), ...u32le(x1), ...u32le(y1), ...u32le(x2), ...u32le(y2), ...u32le(10000)];
    blocks.push(0x05, ...u32le(payload.length), ...payload);
  };
  // board rectangle (0,0)-(4000,3000) in scaled-down units → x10000 in file
  const S = 10000;
  seg(28, 100 * S, 100 * S, 4100 * S, 100 * S);
  seg(28, 4100 * S, 100 * S, 4100 * S, 3100 * S);
  seg(28, 4100 * S, 3100 * S, 100 * S, 3100 * S);
  seg(28, 100 * S, 3100 * S, 100 * S, 100 * S);
  // a decoy trace on layer 3 (must be ignored for outline)
  seg(3, 0, 0, 9999 * S, 9999 * S);

  // part block (type 0x07, DES-encrypted)
  const partName = 'U8300';
  const groupName = 'IC-PWR';
  const pinDefs = [ // [pinName, x, y, netIndex]
    ['A1', 1005 * S, 1002 * S, 1],
    ['A2', 1010 * S, 1002 * S, 2],
    ['B1', 1005 * S, 1007 * S, 3],
  ];
  const pinBlocks = pinDefs.map(([nm, px, py, netIdx]) => {
    const rec = [...u32le(0xDEAD), ...u32le(px), ...u32le(py), ...u32le(0), ...u32le(0),
                 ...u32le(nm.length), ...str(nm), ...new Array(32).fill(0x20), ...u32le(netIdx)];
    return [0x09, ...u32le(rec.length), ...rec]; // type byte, then size, then record
  }).flat();
  const label = [...str('some-label-block')];
  const partRec = [
    ...u32le(0), // part size placeholder (patched below)
    ...new Array(18).fill(0x11),
    ...u32le(groupName.length), ...str(groupName),
    0x06, ...new Array(30).fill(0x22), // 0x06 + 31 bytes total skipped before name len
    ...u32le(partName.length), ...str(partName),
    0x06, ...u32le(label.length), ...label, // decoy label sub-block
    ...pinBlocks,
  ];
  const partSize = partRec.length - 4;
  partRec[0] = partSize & 255; partRec[1] = (partSize >> 8) & 255;
  partRec[2] = (partSize >> 16) & 255; partRec[3] = (partSize >>> 24) & 255;
  // encrypted regions are whole DES blocks in real files — pad to 8-byte multiple
  while (partRec.length % 8 !== 0) partRec.push(0);
  const encPart = [...desEncryptBuffer(new Uint8Array(partRec))];
  blocks.push(0x07, ...u32le(encPart.length), ...encPart);

  // test pad (type 0x09, not encrypted)
  const padName = 'TP301';
  const padRec = [...u32le(7), ...u32le(2005 * S), ...u32le(2008 * S),
                  ...u32le(0), ...u32le(0), ...u32le(padName.length), ...str(padName), ...u32le(1)];
  blocks.push(0x09, ...u32le(padRec.length), ...padRec);
  // unknown block type must be skipped gracefully
  blocks.push(0x42, ...u32le(3), 1, 2, 3);

  const mainBlock = [...u32le(blocks.length), ...blocks];

  // header (0x40 bytes), main data follows at 0x40, net data after that
  const header = new Array(0x40).fill(0);
  [...str('XZZPCB')].forEach((c, i) => { header[i] = c; });
  header[0x10] = 0; // plain padding slot; becomes the XOR key after obfuscation
  const mainOff = 0x40 - 0x20; // main data right after header, relative to 0x20
  const netOff = (0x40 + mainBlock.length) - 0x20;
  header.splice(0x20, 4, ...u32le(mainOff));
  header.splice(0x28, 4, ...u32le(netOff));

  let file = new Uint8Array([...header, ...mainBlock, ...netBlock]);
  if (xorKey !== 0) {
    // real XOR-obfuscated files carry the post-v6 marker after all data;
    // everything before the marker is XOR-encoded
    const marker = [...str('v6v6555v6v6')];
    const withMarker = new Uint8Array(file.length + marker.length);
    withMarker.set(file, 0);
    withMarker.set(marker, file.length);
    for (let i = 0; i < file.length; i++) withMarker[i] ^= xorKey;
    file = withMarker;
  }
  return file;
}

for (const variant of [[0, 'plain'], [0xA7, 'XOR-obfuscated']]) {
  const [xorKey, label] = variant;
  console.log('  variant: ' + label + (xorKey ? ' (key 0x' + xorKey.toString(16) + ')' : ''));
  const file = buildXzz(xorKey);
  check('detected as XZZ', XZZPCB.isXZZ(file));

  const res = XZZPCB.parse(file);
  check('no parse error', !res.error, res.error);
  check('2 comps (U8300 + test pad)', res.comps.length === 2, 'got ' + res.comps.length);

  const u = res.comps.find(c => c.ref === 'U8300');
  check('part name U8300', !!u);
  if (u) {
    check('3 pins', u.pins.length === 3, 'got ' + u.pins.length);
    check('pin names kept', u.pins[0].num === 'A1' && u.pins[1].num === 'A2' && u.pins[2].num === 'B1');
    check('net mapping + NC→UNCONNECTED',
      u.pins[0].net === 'PP3V3_S5' && u.pins[1].net === 'UNCONNECTED' && u.pins[2].net === 'SPI_ROM_CS',
      JSON.stringify(u.pins.map(p => p.net)));
    // translation: min outline point is (100,100) → pin A1 lands at (905,902)
    check('translation applied', u.pins[0].x === 905 && u.pins[0].y === 902,
      'got ' + u.pins[0].x + ',' + u.pins[0].y);
  }
  const tp = res.comps.find(c => c.ref === '...TP301');
  check('test pad present with net', !!tp && tp.pins[0].net === 'PP3V3_S5');

  // outline: rectangle 4000×3000 → chained loop of ≥4 points within bounds
  const xs = res.outline.map(p => p.x), ys = res.outline.map(p => p.y);
  check('outline ignores decoy layer-3 trace',
    Math.max(...xs) === 4000 && Math.max(...ys) === 3000 && Math.min(...xs) === 0 && Math.min(...ys) === 0,
    'bounds ' + Math.min(...xs) + '..' + Math.max(...xs) + ' / ' + Math.min(...ys) + '..' + Math.max(...ys));
  check('outline has ≥4 points', res.outline.length >= 4, 'got ' + res.outline.length);
}

/* ── 3. real-world hardening variants ── */
console.log('\nXZZ hardening (unencrypted parts, negative coords, NUL names, arcs):');
{
  const S = 10000;
  const strUtf8 = s => [...new TextEncoder().encode(s)];
  // net table: one name with trailing NUL padding (as some exporters write), UTF-8 name
  const netRecs = [];
  for (const [idx, name, pad] of [[1, 'PP3V3_S5', 4], [2, '主板网络', 0]]) {
    const bytes = strUtf8(name);
    netRecs.push(...u32le(bytes.length + 8 + pad), ...u32le(idx), ...bytes, ...new Array(pad).fill(0));
  }
  const netBlock = [...u32le(netRecs.length), ...netRecs];

  const blocks = [];
  // outline: three lines + an arc closing the loop (rounded corner)
  const seg = (layer, x1, y1, x2, y2) => {
    const payload = [...u32le(layer), ...u32le(x1), ...u32le(y1), ...u32le(x2), ...u32le(y2), ...u32le(10000)];
    blocks.push(0x05, ...u32le(payload.length), ...payload);
  };
  seg(28, 200 * S, 100 * S, 400 * S, 100 * S);       // top edge (leaves a gap 100..200 for the arc)
  seg(28, 400 * S, 100 * S, 400 * S, 300 * S);       // right edge
  seg(28, 400 * S, 300 * S, 100 * S, 300 * S);       // bottom
  // arc: quarter circle centred at (200,200)r100 from 180°…270° —
  // endpoints (100,200) and (200,100) close the gap in the top-left corner
  const arcPayload = [...u32le(28), ...u32le(200 * S), ...u32le(200 * S), ...u32le(100 * S),
                      ...u32le(180 * S), ...u32le(270 * S), ...u32le(10000)];
  blocks.push(0x01, ...u32le(arcPayload.length), ...arcPayload);
  // close the loop from arc end (100,200) down to (100,300)
  seg(28, 100 * S, 200 * S, 100 * S, 300 * S);

  // part with UNENCRYPTED records and a pin at negative coordinates
  const pinRec = (nm, px, py, netIdx) => {
    const rec = [...u32le(0xDEAD), ...u32le(px >>> 0), ...u32le(py >>> 0), ...u32le(0), ...u32le(0),
                 ...u32le(nm.length), ...str(nm), ...new Array(32).fill(0), ...u32le(netIdx)];
    return [0x09, ...u32le(rec.length), ...rec];
  };
  const label = [0x06, ...u32le(30), ...new Array(30).fill(0x22)];
  const body = [...u32le(0), ...new Array(18).fill(0), ...u32le(2), ...str('IC'),
                0x06, ...new Array(30).fill(0), ...u32le(4), ...str('U100'),
                ...label, ...pinRec('K1', -50 * S, -25 * S, 1), ...pinRec('K2', 20 * S, 20 * S, 2)];
  const partSize = body.length - 4;
  body[0] = partSize & 255; body[1] = (partSize >> 8) & 255;
  body[2] = (partSize >> 16) & 255; body[3] = (partSize >>> 24) & 255;
  while (body.length % 8) body.push(0); // whole DES blocks (harmless for plaintext)
  blocks.push(0x07, ...u32le(body.length), ...body);

  const mainBlock = [...u32le(blocks.length), ...blocks];
  const header = new Array(0x40).fill(0);
  [...str('XZZPCB')].forEach((c, i) => { header[i] = c; });
  header.splice(0x20, 4, ...u32le(0x40 - 0x20));
  header.splice(0x28, 4, ...u32le((0x40 + mainBlock.length) - 0x20));
  const file = new Uint8Array([...header, ...mainBlock, ...netBlock]);

  check('detected as XZZ', XZZPCB.isXZZ(file));
  const res = XZZPCB.parse(file);
  check('no parse error', !res.error, res.error);
  const u = (res.comps || []).find(c => c.ref === 'U100');
  check('unencrypted part parsed (plaintext-first path)', !!u);
  if (u) {
    // translation by outline origin (100,100) applies: pin (-50,-25) → (-150,-125)
    check('negative coordinates kept', u.pins[0].x === -150 && u.pins[0].y === -125,
      'got ' + u.pins[0].x + ',' + u.pins[0].y);
    check('NUL-padded net name trimmed', u.pins[0].net === 'PP3V3_S5', "got '" + u.pins[0].net + "'");
    check('UTF-8 net name decoded', u.pins[1].net === '主板网络', "got '" + u.pins[1].net + "'");
  }
  // outline: arc chords + lines chain into one loop covering the full extent
  const xs = (res.outline || []).map(p => p.x), ys = (res.outline || []).map(p => p.y);
  check('arc+line outline chained', res.outline.length >= 6, 'got ' + res.outline.length + ' pts');
  // outline translated by (100,100): raw 100..400 / 100..300 → 0..300 / 0..200
  check('outline bounds complete', Math.min(...xs) === 0 && Math.max(...xs) === 300 &&
    Math.min(...ys) === 0 && Math.max(...ys) === 200,
    'bounds ' + Math.min(...xs) + '..' + Math.max(...xs) + ' / ' + Math.min(...ys) + '..' + Math.max(...ys));
}

// garbage must not throw or false-positive
console.log('  variant: rejection');
check('random bytes not detected', !XZZPCB.isXZZ(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0x50, 0x51])));
const bad = XZZPCB.parse(new Uint8Array([1, 2, 3]));
check('garbage returns error, no throw', !!bad.error && bad.comps.length === 0);

/* ── 4. real-world integration (files from slimeinacloak/XZZPCB-ImHex) ──
 * Kept out of git (.gitignore); download via:
 *   github.com/slimeinacloak/XZZPCB-ImHex → Example PCB Files
 */
console.log('\nXZZ real files:');
const realDir = path.join(__dirname, 'test-files', 'xzz');
if (fs.existsSync(realDir)) {
  const files = fs.readdirSync(realDir).filter(f => f.endsWith('.pcb'));
  check('sample files present', files.length >= 5, 'found ' + files.length);
  let parsed = 0;
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(realDir, f));
    if (!XZZPCB.isXZZ(bytes)) { failures++; console.log('  ✗ ' + f + ' — NOT DETECTED'); continue; }
    const res = XZZPCB.parse(bytes);
    if (res.error || !res.comps.length) { failures++; console.log('  ✗ ' + f + ' — ' + res.error); continue; }
    parsed++;
    const pinOk = res.comps.every(c => typeof c.ref === 'string' && c.pins.every(p =>
      isFinite(p.x) && isFinite(p.y)));
    if (!pinOk) { failures++; console.log('  ✗ ' + f + ' — malformed comp/pin data'); continue; }
    console.log('  ✓ ' + f + ' — ' + res.comps.length + ' comps, ' +
      res.comps.reduce((a, c) => a + c.pins.length, 0) + ' pins');
  }
  check('all real files parsed', parsed === files.length, parsed + '/' + files.length);

  // encrypted vs decrypted copies of the same board must agree on part refs
  const pair = ['820-01124.pcb', '820-01124_decrypted.pcb'];
  if (pair.every(f => files.includes(f))) {
    const refsOf = f => new Set(XZZPCB.parse(fs.readFileSync(path.join(realDir, f))).comps.map(c => c.ref));
    const a = refsOf(pair[0]), b = refsOf(pair[1]);
    const missing = [...b].filter(r => !a.has(r));
    check('encrypted ⊇ decrypted part refs', missing.length === 0,
      'decrypted-only refs: ' + missing.join(', '));
  }
  // XOR vs no-XOR copies must be identical boards
  const xorPair = ['SWITCH OLED-HEG-CPU-01-PCB Layer.pcb', 'SWITCH OLED-HEG-CPU-01-PCB Layer No XOR.pcb'];
  if (xorPair.every(f => files.includes(f))) {
    const sig = f => {
      const r = XZZPCB.parse(fs.readFileSync(path.join(realDir, f)));
      return r.comps.map(c => c.ref + ':' + c.pins.map(p => p.num + '@' + p.x + ',' + p.y).join('|')).sort().join(';');
    };
    check('XOR and no-XOR variants identical', sig(xorPair[0]) === sig(xorPair[1]));
  }
} else {
  console.log('  (skipped — no files in test-files/xzz)');
}

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'ALL TESTS PASSED'));
process.exit(failures ? 1 : 0);
