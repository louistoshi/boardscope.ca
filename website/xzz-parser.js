/*
 * XZZ (.pcb) boardview parser — XinZhiZao (鑫智造) board files
 * ═══════════════════════════════════════════════════════════════
 * Format documentation credit: OpenBoardView project (MIT license)
 *   https://github.com/OpenBoardView/OpenBoardView
 *   (FileFormats/XZZPCBFile.cpp, Crypto/des.c)
 * DES implementation after Daniel Huertas' DES (FIPS PUB 46-3).
 *
 * File layout:
 *   0x00        "XZZPCB" signature (optionally XOR-obfuscated, see below)
 *   0x10        XOR key byte (0x00 = no XOR layer)
 *   0x20        u32le main data offset (relative to 0x20)
 *   0x28        u32le net data offset  (relative to 0x20)
 *   main data:  u32le total blocks size, then blocks:
 *               u8 type, u32le size, payload
 *                 0x01 arc (board outline when layer == 28)
 *                 0x02 via            (unused)
 *                 0x05 line segment   (board outline when layer == 28)
 *                 0x06 text           (unused)
 *                 0x07 part/pin       (DES-ECB encrypted)
 *                 0x09 test pad
 *   net data:   u32le total size, then records: u32le recSize, u32le netIndex, name
 *
 * Coordinates are scaled by XZZ_SCALE (10000); angles share the same scale.
 *
 * Exposes:
 *   XZZPCB.isXZZ(bytes)       → bool
 *   XZZPCB.parse(bytes)       → { comps, outline, error? }  (BoardScope shape)
 * Works in the browser (window.XZZPCB) and Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.XZZPCB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const XZZ_SCALE = 10000;
  // Pre-computed DES key 0xDCFC12AC00000000
  // (seed bytes {0xE0,0xCF,0x2E,0x9F,0x3C,0x33,0x3C,0x33} each XORed with 0x3C33)
  const KEY_HI = 0xdcfc12ac, KEY_LO = 0x00000000;

  /* ════════════════ DES (FIPS 46-3) ════════════════
   * 64-bit values are kept as [hi, lo] unsigned 32-bit pairs;
   * ≤53-bit values as plain Numbers (exact in IEEE doubles). */

  const IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 
    62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8, 
    57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 
    61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];
  const PI = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 
    38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29, 
    36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 
    34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25];
  const E = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 
    8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 
    16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25, 
    24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1];
  const P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 
    2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];
  const S = [
    /* S1 */ [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
    /* S2 */ [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
    /* S3 */ [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
    /* S4 */ [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
    /* S5 */ [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
    /* S6 */ [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
    /* S7 */ [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
    /* S8 */ [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]];
  const PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 
    10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36, 
    63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 
    14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4];
  const PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 
    23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 
    41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 
    44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32];
  const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

  function bit64(hi, lo, p) { // p: 1-based bit position from MSB
    return p <= 32 ? ((hi >>> (32 - p)) & 1) : ((lo >>> (64 - p)) & 1);
  }

  // 16 round keys as 48-bit Numbers
  function desSubkeys(keyHi, keyLo) {
    // PC1 → 56 bits, accumulated as two 28-bit halves; a single 56-bit
    // Number would lose low bits (doubles are only exact up to 2^53)
    let c = 0, d = 0;
    for (let i = 0; i < 28; i++) c = c * 2 + bit64(keyHi, keyLo, PC1[i]);
    for (let i = 28; i < 56; i++) d = d * 2 + bit64(keyHi, keyLo, PC1[i]);
    const keys = [];
    for (let r = 0; r < 16; r++) {
      const s = SHIFTS[r];
      c = ((c << s) | (c >>> (28 - s))) & 0x0FFFFFFF;
      d = ((d << s) | (d >>> (28 - s))) & 0x0FFFFFFF;
      let k = 0;
      for (let i = 0; i < 48; i++) {
        const p = PC2[i];
        const bit = p <= 28 ? ((c >>> (28 - p)) & 1) : ((d >>> (56 - p)) & 1);
        k = k * 2 + bit;
      }
      keys.push(k);
    }
    return keys;
  }

  function perm64(hi, lo, table) { // table with ≤53 outputs → Number
    let out = 0;
    for (let i = 0; i < table.length; i++) out = out * 2 + bit64(hi, lo, table[i]);
    return out;
  }

  function perm32(v, table) { // 32→N bits, N ≤ 48
    let out = 0;
    for (let i = 0; i < table.length; i++) out = out * 2 + ((v >>> (32 - table[i])) & 1);
    return out;
  }

  function feistel(r, k) {
    let x = perm32(r, E); // 48-bit expansion
    // x ^= k (48-bit safe XOR via 24-bit halves)
    const xh = Math.floor(x / 0x1000000), xl = x % 0x1000000;
    const kh = Math.floor(k / 0x1000000), kl = k % 0x1000000;
    x = ((xh ^ kh) * 0x1000000) + ((xl ^ kl) >>> 0);
    // S-boxes: 8×6-bit groups, MSB group first
    let sOut = 0;
    for (let j = 0; j < 8; j++) {
      const g = Math.floor(x / Math.pow(2, 42 - 6 * j)) & 0x3F;
      const row = ((g >> 4) & 2) | (g & 1);
      const col = (g >> 1) & 0xF;
      sOut = ((sOut << 4) | S[j][row * 16 + col]) >>> 0;
    }
    return perm32(sOut, P) >>> 0;
  }

  // One DES block. decrypt: subkeys in reverse order. Returns [hi, lo].
  function desBlock(hi, lo, keys, decrypt) {
    let ih = 0, il = 0;
    for (let i = 0; i < 32; i++) ih = ih * 2 + bit64(hi, lo, IP[i]);
    for (let i = 32; i < 64; i++) il = il * 2 + bit64(hi, lo, IP[i]);
    let l = ih >>> 0, r = il >>> 0;
    for (let i = 0; i < 16; i++) {
      const k = keys[decrypt ? 15 - i : i];
      const t = r;
      r = (l ^ feistel(r, k)) >>> 0;
      l = t;
    }
    // pre-output = (R << 32) | L, then final permutation
    let oh = 0, ol = 0;
    for (let i = 0; i < 32; i++) oh = oh * 2 + bit64(r, l, PI[i]);
    for (let i = 32; i < 64; i++) ol = ol * 2 + bit64(r, l, PI[i]);
    return [oh >>> 0, ol >>> 0];
  }

  // DES-ECB decrypt every 8-byte chunk (big-endian block order, as XZZ writes it)
  function desDecryptBuffer(bytes, keyHi, keyLo) {
    const keys = desSubkeys(keyHi, keyLo);
    const out = new Uint8Array(bytes.length);
    for (let pos = 0; pos < bytes.length; pos += 8) {
      const b = [0, 0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 8 && pos + i < bytes.length; i++) b[i] = bytes[pos + i];
      const hi = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
      const lo = ((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0;
      const [ohi, olo] = desBlock(hi, lo, keys, true);
      const ob = [(ohi >>> 24) & 255, (ohi >>> 16) & 255, (ohi >>> 8) & 255, ohi & 255,
                  (olo >>> 24) & 255, (olo >>> 16) & 255, (olo >>> 8) & 255, olo & 255];
      for (let i = 0; i < 8 && pos + i < bytes.length; i++) out[pos + i] = ob[i];
    }
    return out;
  }

  /* ════════════════ byte helpers ════════════════ */

  function rd32(b, pos) { // u32 little-endian, 0 when out of bounds
    if (pos < 0 || pos + 4 > b.length) return 0;
    return (b[pos] | (b[pos + 1] << 8) | (b[pos + 2] << 16) | (b[pos + 3] << 24)) >>> 0;
  }

  function rds32(b, pos) { // i32 little-endian — coordinates may be negative
    return rd32(b, pos) | 0;
  }

  // Record names: UTF-8 when valid, else windows-1252; trailing NULs trimmed
  function decodeName(b, pos, len) {
    if (pos < 0 || len < 0 || pos + len > b.length) return '';
    let end = pos + len;
    while (end > pos && b[end - 1] === 0) end--;
    const slice = b.subarray(pos, end);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(slice); }
    catch (e) { return new TextDecoder('windows-1252').decode(slice); }
  }

  function latin1(b, pos, len) {
    if (pos < 0 || len < 0 || pos + len > b.length) return '';
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(b[pos + i]);
    return s;
  }

  function indexOfBytes(hay, needle, from) {
    outer: for (let i = from || 0; i <= hay.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }

  /* ════════════════ format detection ════════════════ */

  function isXZZ(bytes) {
    if (!bytes || bytes.length < 6) return false;
    if (latin1(bytes, 0, 6) === 'XZZPCB') return true;
    if (bytes.length > 0x10 && bytes[0x10] !== 0) {
      const k = bytes[0x10];
      const magic = [0x58, 0x5A, 0x5A, 0x50, 0x43, 0x42]; // "XZZPCB"
      for (let i = 0; i < 6; i++) if ((bytes[i] ^ k) !== magic[i]) return false;
      return true;
    }
    return false;
  }

  /* ════════════════ outline assembly ════════════════ */

  // Turn outline segments into the longest connected polyline (board edge loop).
  // Joints match within JOIN_TOL: arc chords computed by the exporter don't always
  // meet adjacent line endpoints exactly in real files (≈1 unit ≈ 0.1 mil).
  const JOIN_TOL = 1.5;
  function chainSegments(segs) {
    const key = (x, y) => Math.round(x / JOIN_TOL) + ',' + Math.round(y / JOIN_TOL);
    const near = (a, b) => Math.abs(a[0] - b[0]) <= JOIN_TOL && Math.abs(a[1] - b[1]) <= JOIN_TOL;
    const byPoint = new Map();
    segs.forEach((s, i) => {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        const k = key(x, y);
        if (!byPoint.has(k)) byPoint.set(k, []);
        byPoint.get(k).push(i);
      }
    });
    const used = new Array(segs.length).fill(false);

    function walk(startSeg, startEnd) { // startEnd: which endpoint of seg we begin at
      const chain = [];
      let segIdx = startSeg, from = startEnd;
      while (segIdx >= 0 && !used[segIdx]) {
        used[segIdx] = true;
        const s = segs[segIdx];
        const enter = from === 0 ? [s.x1, s.y1] : [s.x2, s.y2];
        const leave = from === 0 ? [s.x2, s.y2] : [s.x1, s.y1];
        if (chain.length === 0) chain.push({ x: enter[0], y: enter[1] });
        chain.push({ x: leave[0], y: leave[1] });
        const candidates = [];
        const gx = Math.round(leave[0] / JOIN_TOL), gy = Math.round(leave[1] / JOIN_TOL);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const bucket = byPoint.get((gx + dx) + ',' + (gy + dy));
          if (bucket) for (const ci of bucket) if (!used[ci]) candidates.push(ci);
        }
        segIdx = -1;
        for (const ci of candidates) {
          const ns = segs[ci];
          if (near([ns.x1, ns.y1], leave)) { segIdx = ci; from = 0; break; }
          if (near([ns.x2, ns.y2], leave)) { segIdx = ci; from = 1; break; }
        }
      }
      return chain;
    }

    let best = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      for (const end of [0, 1]) {
        const chain = walk(i, end);
        if (chain.length > best.length) best = chain;
      }
    }
    return best;
  }

  // Approximate arc with 10 segments (matches OpenBoardView output)
  function arcToSegments(startAngle, endAngle, r, cx, cy) {
    if (startAngle > endAngle) { const t = startAngle; startAngle = endAngle; endAngle = t; }
    if (endAngle - startAngle > 180) startAngle += 360;
    const degToRad = Math.PI / 180;
    const a0 = startAngle * degToRad, a1 = endAngle * degToRad;
    const step = (a1 - a0) / 9;
    const segs = [];
    let px = Math.round(cx + r * Math.cos(a0)), py = Math.round(cy + r * Math.sin(a0));
    for (let i = 1; i < 10; i++) {
      const a = a0 + i * step;
      const x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a));
      segs.push({ x1: px, y1: py, x2: x, y2: y });
      px = x; py = y;
    }
    return segs;
  }

  /* ════════════════ parser ════════════════ */

  function parse(buffer) {
    const fail = (error) => ({ comps: [], outline: [], error });
    let bytes;
    if (buffer instanceof Uint8Array) bytes = buffer;
    else if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
    else return fail('Unsupported buffer type');

    if (!isXZZ(bytes)) return fail('Not an XZZ PCB file');
    if (bytes.length < 0x20) return fail('File too small');

    // Undo the XOR obfuscation layer (everything up to the "v6v6555v6v6" marker)
    const MARKER = [0x76, 0x36, 0x36, 0x36, 0x35, 0x35, 0x35, 0x76, 0x36, 0x76, 0x36];
    const buf = bytes.slice();
    const xorKey = buf[0x10];
    if (xorKey !== 0) {
      const markerPos = indexOfBytes(buf, MARKER);
      const end = markerPos < 0 ? buf.length : markerPos;
      for (let i = 0; i < end; i++) buf[i] ^= xorKey;
    }

    const mainDataOffset = rd32(buf, 0x20);
    const netDataOffset = rd32(buf, 0x28);
    const mainDataStart = mainDataOffset + 0x20;
    const netDataStart = netDataOffset + 0x20;
    const mainBlocksSize = rd32(buf, mainDataStart);
    const netBlockSize = rd32(buf, netDataStart);

    // ── net name table ──
    const netDict = new Map();
    let np = netDataStart + 4;
    const netEnd = Math.min(netDataStart + 4 + netBlockSize, buf.length);
    while (np + 8 <= netEnd) {
      const recSize = rd32(buf, np);
      const netIndex = rd32(buf, np + 4);
      const nameLen = recSize - 8;
      if (nameLen < 0 || np + 8 + nameLen > buf.length) break;
      netDict.set(netIndex, decodeName(buf, np + 8, nameLen));
      np += 8 + nameLen;
    }

    // ── main data blocks ──
    const outlineSegs = [];
    const parts = []; // { name, pins: [{x, y, name, net}] }
    let q = mainDataStart + 4;
    const blocksEnd = Math.min(mainDataStart + 4 + mainBlocksSize, buf.length);

    function parsePin(dec, ptr, pinIndex) { // returns [pin, nextPtr]
      const blockSize = rd32(dec, ptr);
      const blockEnd = ptr + blockSize + 4;
      ptr += 8; // size + unknown u32
      const x = rds32(dec, ptr); ptr += 4;
      const y = rds32(dec, ptr); ptr += 4;
      ptr += 8; // unknown
      const nameLen = rd32(dec, ptr); ptr += 4;
      const name = decodeName(dec, ptr, nameLen) || String(pinIndex); ptr += nameLen + 32;
      const netIndex = rd32(dec, ptr);
      return [{ x: x / XZZ_SCALE, y: y / XZZ_SCALE, name, netIndex }, blockEnd];
    }

    // Structural check: does this buffer decode as a component record?
    // (also tells plaintext records from DES ciphertext — some files ship unencrypted)
    function partHeader(dec) {
      if (dec.length < 61) return undefined; // size + 18 unknown + group name + 35-byte label record
      const end = rd32(dec, 0) + 4;
      if (end > dec.length) return undefined;
      let ptr = 22;
      const groupNameSize = rd32(dec, ptr); ptr += 4 + groupNameSize;
      if (ptr + 35 > end || dec[ptr] !== 0x06) return undefined;
      ptr += 31;
      const nameLen = rd32(dec, ptr);
      if (ptr + 4 + nameLen > end) return undefined;
      return { end, namePos: ptr + 4, nameLen };
    }

    function parsePart(block) {
      let dec = block, head = partHeader(dec);
      if (!head) {
        dec = desDecryptBuffer(block, KEY_HI, KEY_LO);
        head = partHeader(dec);
        if (!head) return; // neither plaintext nor decryptable — skip like OpenBoardView
      }
      let ptr = head.namePos;
      const name = decodeName(dec, ptr, head.nameLen); ptr += head.nameLen;

      const part = { name, pins: [] };
      let pinCount = 0;
      while (ptr < head.end && ptr < dec.length) {
        const sub = dec[ptr]; ptr += 1;
        if (sub === 0x01 || sub === 0x05 || sub === 0x06) {
          ptr += rd32(dec, ptr) + 4; // skip unrelated sub-block
        } else if (sub === 0x09) {
          const [pin, next] = parsePin(dec, ptr, part.pins.length + 1);
          ptr = next;
          let net = netDict.get(pin.netIndex) || '';
          if (net === 'NC') net = 'UNCONNECTED';
          part.pins.push({ x: pin.x, y: pin.y, name: pin.name, net });
          pinCount++;
        }
        // other sub types: advance by one byte only (as OpenBoardView does)
      }
      if (pinCount) parts.push(part);
    }

    function parseTestPad(block) {
      const x = rds32(block, 4) / XZZ_SCALE;
      const y = rds32(block, 8) / XZZ_SCALE;
      const nameLen = rd32(block, 20);
      const name = decodeName(block, 24, nameLen);
      const netIndex = rd32(block, block.length - 4);
      let net = netDict.get(netIndex) || '';
      if (net === 'NC' || net === 'UNCONNECTED') net = '';
      parts.push({ name: '...' + name, pins: [{ x, y, name, net }] });
    }

    while (q < blocksEnd) {
      const type = buf[q]; q += 1;
      const size = rd32(buf, q); q += 4;
      if (q + size > buf.length) break;
      const block = buf.subarray(q, q + size);
      if (type === 0x01) { // arc
        const layer = rd32(block, 0);
        if (layer === 28) {
          const x = rds32(block, 4), y = rds32(block, 8), r = rd32(block, 12);
          const a1 = rds32(block, 16), a2 = rds32(block, 20);
          outlineSegs.push(...arcToSegments(
            Math.round(a1 / XZZ_SCALE), Math.round(a2 / XZZ_SCALE),
            Math.round(r / XZZ_SCALE), Math.round(x / XZZ_SCALE), Math.round(y / XZZ_SCALE)));
        }
      } else if (type === 0x05) { // line
        const layer = rd32(block, 0);
        if (layer === 28) {
          outlineSegs.push({
            x1: rds32(block, 4) / XZZ_SCALE, y1: rds32(block, 8) / XZZ_SCALE,
            x2: rds32(block, 12) / XZZ_SCALE, y2: rds32(block, 16) / XZZ_SCALE,
          });
        }
      } else if (type === 0x07) {
        parsePart(block);
      } else if (type === 0x09) {
        parseTestPad(block);
      }
      q += size;
    }

    if (!parts.length) return fail('No parts found in XZZ file');

    // ── normalise coordinates (shift so min outline point is the origin) ──
    let tx = 0, ty = 0;
    if (outlineSegs.length) {
      tx = Math.min(outlineSegs[0].x1, outlineSegs[0].x2);
      ty = Math.min(outlineSegs[0].y1, outlineSegs[0].y2);
      for (const s of outlineSegs) {
        tx = Math.min(tx, s.x1, s.x2);
        ty = Math.min(ty, s.y1, s.y2);
      }
    }

    // ── build BoardScope comps ──
    const comps = [];
    for (const part of parts) {
      if (!part.pins.length) continue;
      const pins = part.pins.map(p => ({
        x: p.x - tx, y: p.y - ty, net: p.net || '', side: 'T', radius: 4,
        num: p.name || '', outline: [],
      }));
      const avgX = pins.reduce((a, p) => a + p.x, 0) / pins.length;
      const avgY = pins.reduce((a, p) => a + p.y, 0) / pins.length;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pins) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      const pad = 15;
      comps.push({
        ref: part.name, x: avgX, y: avgY, side: 'T', mount: 'SMD', pins,
        outline: [
          { x: minX - pad, y: minY - pad }, { x: maxX + pad, y: minY - pad },
          { x: maxX + pad, y: maxY + pad }, { x: minX - pad, y: maxY + pad },
        ],
      });
    }
    if (!comps.length) return fail('No parts with pins found in XZZ file');

    // ── board outline (longest connected loop; bbox fallback) ──
    let outline = [];
    if (outlineSegs.length) {
      outline = chainSegments(outlineSegs).map(p => ({ x: p.x - tx, y: p.y - ty }));
    }
    if (outline.length < 3) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of comps) for (const p of c.pins) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      outline = [
        { x: minX - 50, y: minY - 50 }, { x: maxX + 50, y: minY - 50 },
        { x: maxX + 50, y: maxY + 50 }, { x: minX - 50, y: maxY + 50 },
        { x: minX - 50, y: minY - 50 },
      ];
    }

    return { comps, outline };
  }

  return { isXZZ, parse, desDecryptBuffer, desSubkeys, desBlock, XZZ_SCALE };
});
