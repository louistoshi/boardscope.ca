/*
 * board-parsers.js — extended board & schematic format parsers for BoardScope
 *
 * Parses (all output the standard BoardScope model:
 *   { comps:[{ref,x,y,side:'T'|'B',mount,pins:[{id,num,net,x,y,radius,side,name}]}],
 *     outline:[{x,y}], copper?:[{x1,y1,x2,y2,w}|{x,y,w,h,rot,type:'pad'}], warning? }):
 *
 *   BoardParsers.kicadPcb(text)   KiCad .kicad_pcb (S-expression, v5-v9)
 *   BoardParsers.kicadSch(text)   KiCad .kicad_sch (flat sheet layout)
 *   BoardParsers.eagleBoard(text) Eagle .brd XML (v6+)
 *   BoardParsers.eagleSch(text)   Eagle .sch XML (flat sheet layout)
 *   BoardParsers.specctra(text)   Specctra .dsn (placement/pins/nets)
 *   BoardParsers.genCAD(text)     GenCAD .cad ($HEADER/$SHAPES/...)
 *   BoardParsers.bdv(text)        BDV plain-text boardview (BRDOUT/NETS/PARTS/PINS/NAILS)
 *   BoardParsers.ipc356(text)     IPC-D-356(A) fabrication netlist
 *   BoardParsers.gerber(text)     Gerber RS-274X -> copper underlay
 *   BoardParsers.fzParse(bytes, key)  ASUS .fz (RC6+zlib) — key NOT bundled (see fzKey*)
 *   BoardParsers.fzDetect(bytes)  returns 'plain'|'encrypted'|null
 *   BoardParsers.fzCheckKey(words) validate 44-word key against parity fingerprint
 *   BoardParsers.odbpp(bytes)     ODB++ .tgz (gzip+ustar subset) [async]
 *
 * Coordinates are kept in the source file's units; BoardScope auto-fits.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoardParsers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const fail = (msg) => ({ comps: [], outline: [], error: msg });
  const mk = (comps, outline, extra) => Object.assign({ comps, outline }, extra || {});

  /* ══════════════ S-expression reader ══════════════ */
  // Returns nested arrays; bare tokens are strings, quoted tokens lose their quotes.
  function sexpr(text) {
    let i = 0;
    const n = text.length;
    function skipWs() {
      while (i < n) {
        const c = text[i];
        if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
        else if (c === '#') { while (i < n && text[i] !== '\n') i++; }
        else break;
      }
    }
    function parse() {
      skipWs();
      if (i >= n) return null;
      if (text[i] === '(') {
        i++;
        const list = [];
        for (;;) {
          skipWs();
          if (i >= n) break;
          if (text[i] === ')') { i++; break; }
          const v = parse();
          if (v !== null) list.push(v);
        }
        return list;
      }
      if (text[i] === '"') {
        i++;
        let s = '';
        while (i < n && text[i] !== '"') {
          if (text[i] === '\\' && i + 1 < n) { s += text[i + 1]; i += 2; }
          else s += text[i++];
        }
        i++;
        return s;
      }
      let s = '';
      while (i < n && !' \t\r\n()"'.includes(text[i])) s += text[i++];
      return s;
    }
    const out = [];
    for (;;) {
      skipWs();
      if (i >= n) break;
      const v = parse();
      if (v !== null) out.push(v);
    }
    return out;
  }
  const tok = (v) => typeof v === 'string' ? v : null;
  const num = (v) => { const f = parseFloat(v); return isNaN(f) ? 0 : f; };
  // find first child list whose head === key
  function kid(list, key) {
    for (const c of list) if (Array.isArray(c) && tok(c[0]) === key) return c;
    return null;
  }
  function kids(list, key) {
    return list.filter((c) => Array.isArray(c) && tok(c[0]) === key);
  }
  // props like (property "Reference" "U1" ...)
  function propVal(list, name) {
    for (const c of kids(list, 'property')) {
      if (c[1] === name && c.length > 2) return tok(c[2]) || '';
    }
    return '';
  }

  /* ══════════════ minimal XML (no DOMParser dependency) ══════════════ */
  // Produces {tag, attrs:{}, children:[], text} nodes.
  function xmlParse(text) {
    const rootEl = { tag: '#root', attrs: {}, children: [], text: '' };
    const stack = [rootEl];
    const re = /<\?[\s\S]*?\?>|<![CDATA[[\s\S]*?]]>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|<\/([^>]+)>|<([^>\s\/]+)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[0][1] === '?') continue;
      if (m[0].startsWith('<!')) { // CDATA/doctype/comment — append text of CDATA
        if (m[0].startsWith('<![CDATA[')) {
          const t = m[0].slice(9, -3);
          stack[stack.length - 1].text += t;
        }
        continue;
      }
      if (m[1]) { // closing
        for (let s = stack.length - 1; s > 0; s--) {
          if (stack[s].tag === m[1].trim()) { stack.length = s; break; }
        }
        continue;
      }
      const el = { tag: m[2], attrs: {}, children: [], text: '' };
      const am = /([:\w-]+)\s*=\s*"([^"]*)"|([:\w-]+)\s*=\s*'([^']*)'/g;
      let a;
      while ((a = am.exec(m[3]))) el.attrs[a[1] || a[3]] = a[2] !== undefined ? a[2] : a[4];
      stack[stack.length - 1].children.push(el);
      if (!m[4]) stack.push(el);
    }
    return rootEl;
  }
  function xKids(el, tag) { return el ? el.children.filter((c) => c.tag === tag) : []; }
  function xKid(el, tag) { return xKids(el, tag)[0] || null; }
  const xNum = (v) => { const f = parseFloat(v); return isNaN(f) ? 0 : f; };

  // "R90 90" / "MR180" / "" → {deg, mirror}
  function eagleRot(s) {
    s = (s || '').trim().toUpperCase();
    const mirror = s.startsWith('M');
    const deg = parseFloat(s.replace(/^M?S?/, '')) || 0;
    return { deg, mirror };
  }
  function rotPt(x, y, deg) {
    const r = (-deg * Math.PI) / 180; // Eagle y-up, CW-positive
    const c = Math.cos(r), s = Math.sin(r);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  /* ══════════════ KiCad .kicad_pcb ══════════════ */
  // Footprint pads: rotate (dx,dy) by footprint angle; mirror x for back side.
  function kicadPcb(text) {
    const top = sexpr(text);
    const pcb = top.find((n) => Array.isArray(n) && tok(n[0]) === 'kicad_pcb');
    if (!pcb) return fail('Not a kicad_pcb file');
    const comps = [], outline = [];
    const rot2 = (x, y, deg) => {
      const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      return { x: x * c - y * s, y: x * s + y * c };
    };
    // board outline from Edge.Cuts graphics
    for (const g of ['gr_line', 'gr_rect', 'gr_poly', 'gr_arc']) {
      for (const gl of kids(pcb, g)) {
        const layer = kid(gl, 'layer');
        if (!layer || !/Edge\.Cuts/.test(tok(layer[1]) || '')) continue;
        const pts = [];
        if (g === 'gr_line') {
          const st = kid(gl, 'start'), en = kid(gl, 'end');
          if (st && en) { pts.push({ x: num(st[1]), y: num(st[2]) }, { x: num(en[1]), y: num(en[2]) }); }
        } else if (g === 'gr_rect') {
          const st = kid(gl, 'start'), en = kid(gl, 'end');
          if (st && en) {
            const x1 = num(st[1]), y1 = num(st[2]), x2 = num(en[1]), y2 = num(en[2]);
            pts.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 });
          }
        } else {
          const ptsL = kid(gl, 'pts');
          if (ptsL) for (const p of ptsL.slice(1)) { const xy = kid(p, 'xy'); if (xy) pts.push({ x: num(xy[1]), y: num(xy[2]) }); }
        }
        outline.push(...pts);
      }
    }
    for (const fp of kids(pcb, 'footprint').concat(kids(pcb, 'module'))) {
      const at = kid(fp, 'at');
      const fx = at ? num(at[1]) : 0, fy = at ? num(at[2]) : 0;
      const fdeg = at && at.length > 3 ? num(at[3]) : 0;
      const layer = kid(fp, 'layer');
      const side = /B\./.test(tok(layer && layer[1]) || 'F.Cu') ? 'B' : 'T';
      let ref = propVal(fp, 'Reference');
      if (!ref) { const fb = kid(fp, 'fp_reference'); ref = tok(fb && fb[1]) || ''; }
      if (!ref) ref = 'FP' + (comps.length + 1);
      const value = propVal(fp, 'Value');
      const comp = { ref, x: fx, y: fy, side, mount: 'SMD', pins: [], name: value };
      for (const pad of kids(fp, 'pad')) {
        const pnum = tok(pad[1]) || '';
        const pat = kid(pad, 'at');
        const pnet = kid(pad, 'net');
        const net = pnet ? (tok(pnet[2]) || '') : '';
        if (!pat) continue;
        let px = num(pat[1]), py = num(pat[2]);
        const pdeg = pat.length > 3 ? num(pat[3]) : 0;
        // pad relative pos: rotate by footprint angle, mirror x on back
        let rp = rot2(px, py, fdeg);
        const wx = fx + rp.x, wy = fy + rp.y;
        const size = kid(pad, 'size');
        const radius = size ? Math.max(num(size[1]), num(size[2])) / 2 || 3 : 3;
        comp.pins.push({
          id: ref + '-' + pnum, num: pnum, net, x: wx, y: wy, radius,
          side: side, name: '', type: '', comment: '', outline: [], padRot: pdeg,
        });
      }
      comps.push(comp);
    }
    if (!comps.length) return fail('No footprints found in kicad_pcb');
    return mk(comps, outline);
  }

  /* ══════════════ KiCad .kicad_sch ══════════════ */
  // Flat sheet layout: symbol instances at sheet coords, pins from lib_symbols.
  function kicadSch(text) {
    const top = sexpr(text);
    const sch = top.find((n) => Array.isArray(n) && tok(n[0]) === 'kicad_sch');
    if (!sch) return fail('Not a kicad_sch file');
    const libs = kid(sch, 'lib_symbols');
    const libMap = new Map(); // "Lib:Name" -> { pins: [{num,dx,dy}] }
    if (libs) {
      for (const sym of kids(libs, 'symbol')) {
        const name = tok(sym[1]) || '';
        const pins = [];
        const collect = (node) => {
          for (const c of node) if (Array.isArray(c)) {
            if (tok(c[0]) === 'pin') {
              const at = kid(c, 'at');
              if (at) pins.push({ num: tok(c[1]) || '', dx: num(at[1]), dy: num(at[2]), deg: at.length > 3 ? num(at[3]) : 0 });
            }
            collect(c);
          }
        };
        collect(sym);
        // sub-units ("Name:0:1" style names) and child units — store all pins under base name
        libMap.set(name, { pins });
        const base = name.split(':').pop();
        if (!libMap.has(base)) libMap.set(base, { pins });
      }
    }
    const comps = [];
    for (const inst of kids(sch, 'symbol')) {
      const libId = tok(inst[1]) || '';
      const at = kid(inst, 'at');
      const ix = at ? num(at[1]) : 0, iy = at ? num(at[2]) : 0;
      const deg = at && at.length > 3 ? num(at[3]) : 0;
      const mirror = kid(inst, 'mirror');
      const mx = mirror && (tok(mirror[1]) === 'x'), my = mirror && (tok(mirror[1]) === 'y');
      let ref = propVal(inst, 'Reference');
      if (!ref) continue;
      const value = propVal(inst, 'Value');
      // lib lookup: try full id, then base
      let lib = libMap.get(libId);
      if (!lib) {
        const base = libId.split(':').pop();
        for (const [k, v] of libMap) if (k.endsWith(':' + base) || k === base) { lib = v; break; }
      }
      const comp = { ref, x: ix, y: iy, side: 'T', mount: 'SMD', pins: [], name: value };
      if (lib) {
        lib.pins.forEach((p, idx) => {
          let { dx, dy } = p;
          if (mx) dy = -dy;
          if (my) dx = -dx;
          const r = (-deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
          const wx = ix + dx * c - dy * s, wy = iy + dx * s + dy * c;
          const pnum = p.num || String(idx + 1);
          comp.pins.push({ id: ref + '-' + pnum, num: pnum, net: '', x: wx, y: wy, radius: 3, side: 'T', name: '', type: '', comment: '', outline: [] });
        });
      }
      comps.push(comp);
    }
    if (!comps.length) return fail('No symbol instances found in kicad_sch');
    const outline = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 0 }];
    return mk(comps, outline, { schematic: true });
  }

  /* ══════════════ Eagle XML (board + schematic) ══════════════ */
  function eagleLibraryPinGeometry(libNode) {
    // library → packages/symbols: name → [{name,dx,dy,rot}]
    const map = new Map();
    for (const pkg of xKids(xKid(libNode, 'packages'), 'package')) {
      const items = [];
      for (const p of xKids(pkg, 'pin').concat(xKids(pkg, 'pad'))) {
        items.push({ name: p.attrs.name || '', dx: xNum(p.attrs.x), dy: xNum(p.attrs.y), rot: p.attrs.rot || '' });
      }
      map.set(pkg.attrs.name, { type: 'pkg', items });
    }
    for (const sym of xKids(xKid(libNode, 'symbols'), 'symbol')) {
      const items = [];
      for (const p of xKids(sym, 'pin')) {
        items.push({ name: p.attrs.name || '', dx: xNum(p.attrs.x), dy: xNum(p.attrs.y), rot: p.attrs.rot || '' });
      }
      map.set(sym.attrs.name, { type: 'sym', items });
    }
    return map;
  }

  function eagleBoard(text) {
    const root = xmlParse(text);
    const eagle = xKid(root, 'eagle');
    if (!eagle) return fail('Not an Eagle XML file');
    const drawing = xKid(eagle, 'drawing');
    const board = drawing && xKid(drawing, 'board');
    if (!board) return fail('Eagle XML contains no <board>');
    const libMap = new Map();
    for (const lib of xKids(xKid(board, 'libraries'), 'library')) for (const [k, v] of eagleLibraryPinGeometry(lib)) libMap.set(k, v);
    // signals: element+pad → net
    const netMap = new Map();
    for (const sig of xKids(xKid(board, 'signals'), 'signal')) {
      const netName = sig.attrs.name || '';
      for (const cr of xKids(sig, 'contactref')) {
        netMap.set(cr.attrs.element + '\u0000' + cr.attrs.pad, netName);
      }
    }
    const comps = [];
    for (const el of xKids(xKid(board, 'elements'), 'element')) {
      const ref = el.attrs.name || '';
      const { deg, mirror } = eagleRot(el.attrs.rot);
      const side = mirror ? 'B' : 'T';
      const pkg = el.attrs.package || '';
      const geo = libMap.get(pkg);
      const ex = xNum(el.attrs.x), ey = xNum(el.attrs.y);
      const comp = { ref, x: ex, y: ey, side, mount: 'SMD', pins: [] };
      if (geo) {
        for (const p of geo.items) {
          let { dx, dy } = p;
          const pr = eagleRot(p.rot);
          let pt = rotPt(dx, dy, pr.deg);
          pt = rotPt(pt.x, pt.y, deg);
          if (mirror) pt.x = -pt.x;
          const pnum = p.name;
          const net = netMap.get(ref + '\u0000' + pnum) || '';
          comp.pins.push({ id: ref + '-' + pnum, num: pnum, net, x: ex + pt.x, y: ey + pt.y, radius: 3, side, name: '', type: '', comment: '', outline: [] });
        }
      }
      comps.push(comp);
    }
    // outline: plain wires on layers 20 (Dimension) / 46
    const outline = [];
    const plain = xKid(board, 'plain');
    const gatherWires = (node) => {
      for (const w of xKids(node, 'wire')) {
        const layer = w.attrs.layer || '';
        if (layer === '20' || layer === '46') {
          outline.push({ x: xNum(w.attrs.x1), y: xNum(w.attrs.y1) }, { x: xNum(w.attrs.x2), y: xNum(w.attrs.y2) });
        }
      }
    };
    if (plain) gatherWires(plain);
    if (!comps.length) return fail('No elements found in Eagle board');
    return mk(comps, outline);
  }

  function eagleSch(text) {
    const root = xmlParse(text);
    const eagle = xKid(root, 'eagle');
    if (!eagle) return fail('Not an Eagle XML file');
    const drawing = xKid(eagle, 'drawing');
    const sch = drawing && xKid(drawing, 'schematic');
    if (!sch) return fail('Eagle XML contains no <schematic>');
    const libMap = new Map();
    for (const lib of xKids(xKid(sch, 'libraries'), 'library')) for (const [k, v] of eagleLibraryPinGeometry(lib)) libMap.set(k, v);
    // part name → deviceset; deviceset gate → symbol
    const partDev = new Map();
    for (const p of xKids(xKid(sch, 'parts'), 'part')) partDev.set(p.attrs.name, p.attrs.deviceset || '');
    const gateSym = new Map(); // deviceset → { gate: symbolName }
    for (const ds of xKids(xKid(sch, 'devicesets'), 'deviceset')) {
      const gates = {};
      for (const g of xKids(xKid(ds, 'gates'), 'gate')) gates[g.attrs.name] = g.attrs.symbol || '';
      gateSym.set(ds.attrs.name, gates);
    }
    const comps = [];
    for (const sheet of xKids(xKid(sch, 'sheets'), 'sheet')) {
      for (const inst of xKids(xKid(sheet, 'instances'), 'instance')) {
        const part = inst.attrs.part || '';
        const ref = part;
        if (!ref) continue;
        const gate = inst.attrs.gate || 'G1';
        const dev = partDev.get(part) || '';
        const gates = gateSym.get(dev) || {};
        const symName = gates[gate] || Object.values(gates)[0] || '';
        const geo = libMap.get(symName);
        const { deg } = eagleRot(inst.attrs.rot);
        const ix = xNum(inst.attrs.x), iy = xNum(inst.attrs.y);
        const comp = { ref, x: ix, y: iy, side: 'T', mount: 'SMD', pins: [] };
        if (geo) {
          for (const p of geo.items) {
            const pt = rotPt(p.dx, p.dy, deg);
            const pnum = p.name;
            comp.pins.push({ id: ref + '-' + pnum, num: pnum, net: '', x: ix + pt.x, y: iy + pt.y, radius: 3, side: 'T', name: '', type: '', comment: '', outline: [] });
          }
        }
        comps.push(comp);
      }
    }
    if (!comps.length) return fail('No instances found in Eagle schematic');
    const outline = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }, { x: 0, y: 0 }];
    return mk(comps, outline, { schematic: true });
  }

  /* ══════════════ Specctra .dsn ══════════════ */
  function specctra(text) {
    // Normalize Specctra quirks before S-expr parsing:
    //  - backslash-newline string continuations (long file paths)
    //  - (string_quote ") declares the quote char with a bare quote token,
    //    which would leave a naive parser stuck "inside a string" for the
    //    rest of the file — drop the declaration (quote is always " in practice).
    text = text.replace(/\\\r?\n/g, '').replace(/\(\s*string_quote\s+\S\s*\)/g, '');
    const top = sexpr(text);
    const pcb = top.find((n) => Array.isArray(n) && /^(pcb|design)$/.test(tok(n[0]) || ''));
    if (!pcb) return fail('Not a Specctra design file');
    // library images: name → pins [{num,dx,dy}]
    const images = new Map();
    const lib = kid(pcb, 'library');
    if (lib) {
      for (const img of kids(lib, 'image')) {
        const name = tok(img[1]) || '';
        const pins = [];
        for (const p of kids(img, 'pin')) {
          // (pin <padstack> <pinNumber> <x> <y> [rot])
          pins.push({ num: tok(p[2]) || '', dx: num(p[3]), dy: num(p[4]) });
        }
        images.set(name, pins);
      }
    }
    // placement
    const comps = [];
    const place = kid(pcb, 'placement');
    const imgByComp = new Map();
    if (place) {
      for (const compL of kids(place, 'component')) {
        const imgName = tok(compL[1]) || '';
        for (const pl of kids(compL, 'place')) {
          // (place REF x y side [rotation])
          const ref = tok(pl[1]) || '';
          const x = num(pl[2]), y = num(pl[3]);
          const sideTok = (tok(pl[4]) || 'front').toLowerCase();
          const deg = pl.length > 5 && typeof pl[5] === 'string' ? num(pl[5]) : 0;
          imgByComp.set(ref, imgName);
          const comp = { ref, x, y, side: sideTok === 'back' ? 'B' : 'T', mount: 'SMD', pins: [] };
          const pins = images.get(imgName) || [];
          const r = (-deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
          for (const p of pins) {
            comp.pins.push({ id: ref + '-' + p.num, num: p.num, net: '', x: x + p.dx * c - p.dy * s, y: y + p.dx * s + p.dy * c, radius: 3, side: comp.side, name: '', type: '', comment: '', outline: [] });
          }
          comps.push(comp);
        }
      }
    }
    // nets: (net NAME (pins REF-NUM ...)) — also (pin ...) in netlists
    const netPin = new Map();
    for (const net of kids(pcb, 'net')) {
      const netName = tok(net[1]) || '';
      const pinsL = kid(net, 'pins');
      if (pinsL) {
        for (const ref of pinsL.slice(1)) {
          const s = tok(ref);
          if (s) netPin.set(s, netName);
        }
      }
      for (const pin of kids(net, 'pin')) {
        const s = tok(pin[1]);
        if (s) netPin.set(s, netName);
      }
    }
    for (const comp of comps) {
      for (const p of comp.pins) {
        const net = netPin.get(comp.ref + '-' + p.num);
        if (net) p.net = net;
      }
    }
    // outline: (boundary (path layer ... pts) | (rect layer x y w h) | (polygon ...)
    const outline = [];
    const bounds = [];
    const scanBoundary = (list) => {
      for (const c of list) {
        if (!Array.isArray(c)) continue;
        if (tok(c[0]) === 'boundary') {
          const path = kid(c, 'path'), poly = kid(c, 'polygon'), rect = kid(c, 'rect');
          if (path) {
            for (const pt of path.slice(3)) if (Array.isArray(pt)) outline.push({ x: num(pt[0]), y: num(pt[1]) });
          } else if (poly) {
            for (const pt of poly.slice(2)) if (Array.isArray(pt)) outline.push({ x: num(pt[0]), y: num(pt[1]) });
          } else if (rect) {
            const x1 = num(rect[2]), y1 = num(rect[3]), x2 = x1 + num(rect[4]), y2 = y1 + num(rect[5]);
            outline.push({ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 });
          }
        } else if (tok(c[0]) !== 'library' && tok(c[0]) !== 'placement' && tok(c[0]) !== 'net') scanBoundary(c);
      }
    };
    scanBoundary(kid(pcb, 'structure') ? [kid(pcb, 'structure')] : []);
    if (!outline.length) scanBoundary(pcb.slice(1));
    if (!comps.length) return fail('No placement found in Specctra file');
    return mk(comps, outline);
  }

  /* ══════════════ GenCAD .cad ══════════════ */
  function genCAD(text) {
    if (!/\$HEADER/i.test(text.slice(0, 512)) || !/GENCAD/i.test(text.slice(0, 2048))) return fail('Not a GenCAD file');
    const lines = text.split(/\r?\n/);
    const comps = [], outline = [];
    const shapes = new Map(); // SHAPE name → pins [{name,dx,dy}]
    let unitsDiv = 1000;
    let curShape = null, curComp = null;
    let sec = '';
    const refds = new Map(); // COMPONENT name → { place, layer, rot, shape }
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const up = line.toUpperCase();
      if (up.startsWith('$HEADER')) { sec = 'header'; continue; }
      if (up.startsWith('$SHAPES')) { sec = 'shapes'; continue; }
      if (up.startsWith('$COMPONENTS')) { sec = 'comps'; continue; }
      if (up.startsWith('$SIGNALS')) { sec = 'sigs'; continue; }
      if (up.startsWith('$LAYER')) { sec = 'layer'; continue; }
      if (/^\$END/.test(up)) { if (sec === 'shapes') curShape = null; if (sec === 'comps') curComp = null; continue; }
      const t = line.split(/\s+/);
      if (sec === 'header' && t[0].toUpperCase() === 'UNITS') { unitsDiv = num(t[2]) || 1000; continue; }
      if (sec === 'shapes' && t[0].toUpperCase() === 'SHAPE') { curShape = t[1]; shapes.set(curShape, []); continue; }
      if (sec === 'shapes' && curShape && t[0].toUpperCase() === 'PIN') {
        shapes.get(curShape).push({ name: t[1], dx: num(t[3]), dy: num(t[4]) });
        continue;
      }
      if (sec === 'comps' && t[0].toUpperCase() === 'COMPONENT') {
        curComp = { name: t[1], x: 0, y: 0, side: 'T', deg: 0, shape: '' };
        refds.set(t[1], curComp);
        continue;
      }
      if (sec === 'comps' && curComp) {
        const k = t[0].toUpperCase();
        if (k === 'PLACE') { curComp.x = num(t[1]); curComp.y = num(t[2]); }
        else if (k === 'LAYER') curComp.side = /BOT|B$/i.test(t[1]) ? 'B' : 'T';
        else if (k === 'ROTATION') curComp.deg = num(t[1]);
        else if (k === 'SHAPE') curComp.shape = t[1];
      }
    }
    const r = (deg) => (deg * Math.PI) / 180;
    for (const [, c] of refds) {
      const comp = { ref: c.name, x: c.x, y: c.y, side: c.side, mount: 'SMD', pins: [] };
      const pins = shapes.get(c.shape) || [];
      for (const p of pins) {
        const cr = Math.cos(r(c.deg)), sr = Math.sin(r(c.deg));
        const wx = c.x + p.dx * cr - p.dy * sr, wy = c.y + p.dx * sr + p.dy * cr;
        comp.pins.push({ id: c.name + '-' + p.name, num: p.name, net: '', x: wx, y: wy, radius: 3, side: c.side, name: '', type: '', comment: '', outline: [] });
      }
      comps.push(comp);
    }
    // nets
    const netMap = new Map();
    sec = '';
    for (const raw of lines) {
      const t = raw.trim().split(/\s+/);
      if (t[0] && t[0].toUpperCase() === '$SIGNALS') { sec = 'sigs'; continue; }
      if (t[0] && /^\$END/.test(t[0].toUpperCase())) { sec = ''; continue; }
      if (sec === 'sigs' && t[0] && t[0].toUpperCase() === 'SIGNAL') { sec = 'sigs:' + t[1]; continue; }
      if (sec && sec.startsWith('sigs:') && t[0] && t[0].toUpperCase() === 'NODE') {
        netMap.set(t[1] + '\u0000' + t[2], sec.slice(5));
      }
    }
    for (const comp of comps) for (const p of comp.pins) {
      const n = netMap.get(comp.ref + '\u0000' + p.num);
      if (n) p.net = n;
    }
    if (!comps.length) return fail('No components found in GenCAD file');
    return mk(comps, outline);
  }

  /* ══════════════ BDV plain-text boardview ══════════════ */
  // Layout per spec: PARTS rows are "name x1 y1 x2 y2 pinStartIdx side" (bounding box),
  // PINS is a flat "x y netIdx side" array owned by index ranges. The BoardViewer-style
  // variant parsed by parseBRD2 has different sections; this parser takes over only
  // when the bounding-box PARTS layout is detected.
  function bdv(text) {
    const lines = text.split(/\r?\n/);
    const nets = [''];
    const comps = [], outline = [];
    const flatPins = [], nails = [];
    let sec = '';
    let parts = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('BRDOUT:')) {
        const t = line.split(/\s+/);
        const nv = parseInt(t[1]) || 0;
        for (let i = 0, seen = 0; i < lines.length && seen < nv; i++) { /* filled below */ }
        sec = 'brdout:' + nv;
        continue;
      }
      if (line.startsWith('NETS:')) { sec = 'nets'; continue; }
      if (line.startsWith('PARTS:')) { sec = 'parts'; continue; }
      if (line.startsWith('PINS:')) { sec = 'pins'; continue; }
      if (line.startsWith('NAILS:')) { sec = 'nails'; continue; }
      const t = line.split(/\s+/).filter(Boolean);
      if (sec.startsWith('brdout:')) {
        const nv = parseInt(sec.split(':')[1]) || 0;
        if (t.length >= 2 && outline.length < nv) outline.push({ x: num(t[0]), y: num(t[1]) });
        continue;
      }
      if (sec === 'nets') { if (t.length >= 2) nets[parseInt(t[0])] = t[1]; else nets.push(t[0]); continue; }
      if (sec === 'parts') {
        if (t.length >= 7 && !isNaN(parseFloat(t[1]))) {
          parts.push({ ref: t[0], x1: num(t[1]), y1: num(t[2]), x2: num(t[3]), y2: num(t[4]), pinStart: parseInt(t[5]) || 0, sideRaw: t[6] });
        }
        continue;
      }
      if (sec === 'pins') { if (t.length >= 4) flatPins.push({ x: num(t[0]), y: num(t[1]), netIdx: parseInt(t[2]) || 0, sideRaw: t[3] }); continue; }
      if (sec === 'nails') { if (t.length >= 5) nails.push({ id: t[0], x: num(t[1]), y: num(t[2]), netIdx: parseInt(t[3]) || 0, sideRaw: t[4] }); continue; }
    }
    if (!parts.length) return fail('No PARTS found in BDV file');
    // side decode: 1 = top, 2 = bottom, 0/other = bottom (spec: some exporters emit 0)
    const decSide = (s) => String(s).trim() === '1' ? 'T' : 'B';
    parts.forEach((p, i) => {
      const next = parts[i + 1];
      const end = next ? next.pinStart : flatPins.length;
      const side = decSide(p.sideRaw);
      const comp = {
        ref: p.ref,
        x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2,
        side, mount: 'SMD', pins: [],
      };
      for (let k = p.pinStart; k < end && k < flatPins.length; k++) {
        const fp = flatPins[k];
        const pnum = String(k - p.pinStart + 1);
        comp.pins.push({ id: p.ref + '-' + pnum, num: pnum, net: nets[fp.netIdx] || '', x: fp.x, y: fp.y, radius: 3, side: decSide(fp.sideRaw), name: '', type: '', comment: '', outline: [] });
      }
      comps.push(comp);
    });
    // nails as TP components
    for (const n of nails) {
      comps.push({ ref: 'TP' + n.id, x: n.x, y: n.y, side: decSide(n.sideRaw), mount: 'SMD', pins: [{ id: 'TP' + n.id + '-1', num: '1', net: nets[n.netIdx] || '', x: n.x, y: n.y, radius: 3, side: decSide(n.sideRaw), name: '', type: '', comment: '', outline: [] }] });
    }
    return mk(comps, outline);
  }
  // Detection helper: does this text use the bounding-box BDV layout?
  function bdvLooksLike(text) {
    if (!/BRDOUT:/.test(text.slice(0, 512))) return false;
    const m = text.match(/^PARTS:\s*\d+\s*$/m);
    if (!m) return false;
    const idx = text.indexOf(m[0]) + m[0].length;
    const sample = text.slice(idx, idx + 400).split(/\r?\n/).filter((l) => l.trim());
    return sample.length > 0 && /\s/.test(sample[0]) && sample[0].trim().split(/\s+/).length >= 7;
  }

  /* ══════════════ IPC-D-356(A) ══════════════ */
  // Fixed-column-ish records: 317 (component pin), 327 (via), 367 (mid pins), C (comment), P (param)
  function ipc356(text) {
    if (!/^\s*(317|327|367|C |P )/m.test(text)) return fail('Not an IPC-D-356 netlist');
    const comps = [], outline = [];
    const byRef = new Map();
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let raw of text.split(/\r?\n/)) {
      if (!raw || raw.length < 3) continue;
      const rec = raw.slice(0, 3);
      if (rec !== '317') continue; // 327(via)/367(mid) records skipped in v1
      // columns (1-based per spec, tolerant slices):
      //   refdes 9-24, pin 25-28, X 29-36, Y 38-45, net (356A) 63-80
      const slice = (a, b) => (raw.length > a ? raw.slice(a - 1, b).trim() : '');
      let ref = slice(9, 24);
      let pin = slice(25, 28);
      const xs = slice(29, 36), ys = slice(38, 45);
      let net = slice(63, 80);
      if (rec === '327') { ref = 'VIA'; pin = String(comps.length ? '' : ''); ref = slice(9, 24) || 'VIA' + (byRef.get('VIA')?.pins.length + 1 || 1); }
      const x = parseFloat(xs), y = parseFloat(ys);
      if (isNaN(x) || isNaN(y)) continue;
      if (!ref) continue;
      // metric files use 3 decimals — scale heuristic handled by fitView; keep raw
      let comp = byRef.get(ref);
      if (!comp) {
        comp = { ref, x: 0, y: 0, side: 'T', mount: 'SMD', pins: [] };
        byRef.set(ref, comp);
        comps.push(comp);
      }
      // side char after coordinates (T/B) if present
      const sideChar = raw.length > 59 ? raw[59] : '';
      if (sideChar === 'B' || sideChar === '2') comp.side = 'B';
      comp.pins.push({ id: ref + '-' + (pin || comp.pins.length + 1), num: pin || String(comp.pins.length + 1), net, x, y, radius: 3, side: comp.side, name: '', type: '', comment: '', outline: [] });
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
    // comp origins = mean of pins
    for (const c of comps) {
      if (c.pins.length) {
        c.x = c.pins.reduce((a, p) => a + p.x, 0) / c.pins.length;
        c.y = c.pins.reduce((a, p) => a + p.y, 0) / c.pins.length;
      }
    }
    if (!comps.length) return fail('No 317/327 records found in IPC-356 file');
    const m = 50;
    outline.push({ x: xMin - m, y: yMin - m }, { x: xMax + m, y: yMin - m }, { x: xMax + m, y: yMax + m }, { x: xMin - m, y: yMax + m }, { x: xMin - m, y: yMin - m });
    return mk(comps, outline);
  }

  /* ══════════════ Gerber RS-274X ══════════════ */
  // Produces copper underlay: lines + pad flashes. No refs/nets (format has none).
  function gerber(text) {
    if (!/%FS|G04/.test(text.slice(0, 1024))) return fail('Not a Gerber file');
    return finishGerber(text);
  }

  function finishGerber(text) {
    const copper = [], pads = [];
    let fmt = { x: 6, y: 6 };
    const apertures = new Map();
    let curAp = null;
    let x = 0, y = 0, px = 0, py = 0;
    let lastD = 2;
    const scaleCoord = (s, dec) => {
      const neg = s.startsWith('-');
      const digits = s.replace(/[+-]/g, '');
      const v = parseInt(digits || '0');
      return (neg ? -v : v) / Math.pow(10, dec);
    };
    for (let raw of text.split(/\r?\n/)) {
      raw = raw.trim();
      if (!raw) continue;
      if (raw.startsWith('%FS')) {
        const m = raw.match(/X(\d)(\d)Y(\d)(\d)/);
        if (m) fmt = { x: parseInt(m[2]), y: parseInt(m[4]) };
        continue;
      }
      if (raw.startsWith('%ADD')) {
        const m = raw.match(/^%ADD(\d+)([A-Za-z]+),([^*]*)\*%/);
        if (m) apertures.set('D' + m[1], { type: m[2], mods: m[3].split('X').map((v) => parseFloat(v) || 0) });
        continue;
      }
      if (raw.startsWith('%') || raw.startsWith('G04')) continue;
      if (raw.startsWith('G36') || raw.startsWith('G37') || raw.startsWith('G70') || raw.startsWith('G71')) continue;
      let body = raw.replace(/\*$/, '').replace(/^G0?[123](D\d+)?/, (mm) => mm.replace(/G0?[123]/, ''));
      if (raw.startsWith('G54') || raw.startsWith('G55')) body = raw.replace(/^G5[45]/, '').replace(/\*$/, '');
      const dm = body.match(/^(?:X([+-]?\d+))?(?:Y([+-]?\d+))?(?:I([+-]?\d+))?(?:J([+-]?\d+))?D0*(\d+)?$/);
      if (!dm) continue;
      px = x; py = y;
      if (dm[1] !== undefined) x = scaleCoord(dm[1], fmt.x);
      if (dm[2] !== undefined) y = scaleCoord(dm[2], fmt.y);
      const d = dm[5] !== undefined ? parseInt(dm[5]) : null;
      if (d !== null && d >= 10) { curAp = 'D' + d; continue; }
      const ap = apertures.get(curAp);
      const w = ap && ap.mods[0] ? ap.mods[0] : 0;
      if (d === 2) { lastD = 2; continue; }
      if (d === 1) { lastD = 1; copper.push({ x1: px, y1: py, x2: x, y2: y, w }); continue; }
      if (d === 3) { lastD = 3; pads.push({ x, y, w: w || 4, h: (ap && ap.mods[1]) || w || 4, type: ap ? ap.type : 'C' }); continue; }
      // bare coord line without D code: assume previous op
      if (lastD === 1) copper.push({ x1: px, y1: py, x2: x, y2: y, w });
      else if (lastD === 3) pads.push({ x, y, w: w || 4, h: (ap && ap.mods[1]) || w || 4, type: ap ? ap.type : 'C' });
    }
    if (!copper.length && !pads.length) return fail('No graphics found in Gerber file');
    return mk([], [], { copper, pads });
  }

  /* ══════════════ ASUS .fz (RC6 + zlib) ══════════════ */
  // RC6-32/r/20 in the modified byte-at-a-time stream mode used by ASUS
  // (algorithm from the Rivest et al. RC6 paper; stream feedback as used by
  // OpenBoardView's FZFile::decode). The 44-word key is NOT bundled — users
  // supply it (auto-fetched from public mirrors or pasted), same posture as
  // OpenBoardView/BoardRipper.
  const rotl32 = (a, b) => ((a << b) | (a >>> (32 - b))) >>> 0;

  function rc6StreamDecrypt(bytes, key) {
    // key: array of 44 uint32 (round keys S[0..43])
    const r = 20;
    const out = new Uint8Array(bytes.length);
    let A = 0, B = 0, C = 0, D = 0;
    const ibuf = new Uint8Array(16);
    for (let pos = 0; pos < bytes.length; pos++) {
      B = (B + key[0]) >>> 0;
      D = (D + key[1]) >>> 0;
      for (let i = 1; i <= r; i++) {
        // 32-bit wrapping multiply — Math.imul, not *: B*(2B+1) overflows 2^53 in doubles
        const t = rotl32(Math.imul(B, Math.imul(2, B) + 1) >>> 0, 5) >>> 0;
        const u = rotl32(Math.imul(D, Math.imul(2, D) + 1) >>> 0, 5) >>> 0;
        A = (rotl32((A ^ t) >>> 0, u % 32) + key[2 * i]) >>> 0;
        C = (rotl32((C ^ u) >>> 0, t % 32) + key[2 * i + 1]) >>> 0;
        const tmp = A; A = B; B = C; C = D; D = tmp;
      }
      A = (A + key[2 * r + 2]) >>> 0;
      C = (C + key[2 * r + 3]) >>> 0;
      const cur = bytes[pos];
      out[pos] = cur ^ (A & 0xFF);
      for (let i = 0; i < 15; i++) ibuf[i] = ibuf[i + 1];
      ibuf[15] = cur;
      A = (ibuf[0] | (ibuf[1] << 8) | (ibuf[2] << 16) | (ibuf[3] << 24)) >>> 0;
      B = (ibuf[4] | (ibuf[5] << 8) | (ibuf[6] << 16) | (ibuf[7] << 24)) >>> 0;
      C = (ibuf[8] | (ibuf[9] << 8) | (ibuf[10] << 16) | (ibuf[11] << 24)) >>> 0;
      D = (ibuf[12] | (ibuf[13] << 8) | (ibuf[14] << 16) | (ibuf[15] << 24)) >>> 0;
    }
    return out;
  }

  const FZ_KEY_PARITY = [0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1];
  function fzCheckKey(words) {
    if (!Array.isArray(words) || words.length !== 44) return false;
    for (let i = 0; i < 44; i++) {
      let t = words[i] >>> 0;
      t ^= t >>> 16; t ^= t >>> 8; t ^= t >>> 4; t ^= t >>> 2; t ^= t >>> 1;
      if (((~t) & 1) !== FZ_KEY_PARITY[i]) return false;
    }
    return true;
  }
  function fzParseKeyHex(text) {
    const words = (text.match(/0x[0-9a-fA-F]{1,8}/g) || [])
      .map((h) => parseInt(h.slice(2).padStart(8, '0'), 16) >>> 0);
    return words.length >= 44 ? words.slice(0, 44) : null;
  }
  function fzDetect(bytes) {
    if (bytes.length > 8) {
      if (bytes[4] === 0x78 && (bytes[5] === 0x9c || bytes[5] === 0xda || bytes[5] === 0x01 || bytes[5] === 0x5e)) return 'plain';
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) return null; // gzip — not fz
    }
    // Encrypted fz has no distinctive magic; extension sniffing decides.
    return 'maybe';
  }
  function fzInflate(bytes) {
    // DecompressionStream('deflate') = zlib wrapper; available in Chromium/Node 18+
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable');
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  }
  async function fzParse(bytes, keyWords) {
    try {
      // detect encryption: bytes 4-5 should be zlib magic when plain
      const plainZlib = bytes[4] === 0x78 && (bytes[5] === 0x9c || bytes[5] === 0xda || bytes[5] === 0x01 || bytes[5] === 0x5e);
      let dec;
      if (!plainZlib) {
        if (!keyWords || !fzCheckKey(keyWords)) return fail('FZ_KEY_REQUIRED');
        // the ENTIRE file is RC6-encrypted (verified against real ASUS fz:
        // decrypting the whole buffer yields the zlib magic at offset 4)
        dec = rc6StreamDecrypt(bytes, keyWords);
        if (!(dec[4] === 0x78 && (dec[5] === 0x9c || dec[5] === 0xda || dec[5] === 0x01 || dec[5] === 0x5e))) {
          return fail('FZ key did not decrypt this file (invalid key for this board)');
        }
      } else {
        dec = bytes;
      }
      // layout (read from the DECRYPTED buffer, as OpenBoardView does):
      // 4-byte header, content (zlib), description (zlib), descSize (u32le)
      const dv = new DataView(dec.buffer, dec.byteOffset, dec.byteLength);
      const descSize = dv.getUint32(dec.length - 4, true);
      const content = dec.subarray(4, Math.max(4, dec.length - 4 - descSize));
      const contentBuf = await fzInflate(content);
      const contentText = new TextDecoder().decode(contentBuf);
      return fzParseContent(contentText);
    } catch (e) {
      return fail('FZ parse failed: ' + (e.message || e));
    }
  }
  function fzParseContent(text) {
    const lines = text.split(/\r\n?|\n/);
    const compsMap = new Map();
    const nails = [];
    let unit = 'mils';
    for (const line of lines) {
      const f = line.split('!');
      if (f[0] === 'A' && f[1] === 'UNIT' && f[2]) unit = f[2].trim().toLowerCase();
    }
    // Two-pass: first collect headers to know block types by column count
    let mode = '';
    for (const line of lines) {
      const f = line.split('!');
      if (f[0] === 'A') {
        if (f[1] === 'NET_NAME') mode = 'pins';
        else if (f[1] === 'REFDES') mode = 'comps';
        else if (f[1] === 'TESTVIA') mode = 'nails';
        continue;
      }
      if (f[0] !== 'S') continue;
      if (mode === 'comps' && f.length >= 6) {
        // S!REFDES!CIC!SNAME!MIRROR!ROTATE!
        const ref = f[1];
        const mirror = (f[4] || '').toUpperCase() === 'YES'; // YES = top
        let c = compsMap.get(ref);
        if (!c) { c = { ref, x: 0, y: 0, side: mirror ? 'T' : 'B', mount: 'SMD', pins: [] }; compsMap.set(ref, c); }
        else c.side = mirror ? 'T' : 'B';
      } else if (mode === 'pins' && f.length >= 8) {
        // S!NET_NAME!REFDES!PIN_NUMBER!PIN_NAME!X!Y!TEST_POINT![RADIUS]
        const net = f[1], ref = f[2], pnum = f[3], pname = f[4];
        let x = parseFloat((f[5] || '').replace(',', '.')), y = parseFloat((f[6] || '').replace(',', '.'));
        if (isNaN(x) || isNaN(y) || !ref) continue;
        const radius = Math.max((parseFloat(f[8]) || 25) / 100, 0.5);
        let c = compsMap.get(ref);
        if (!c) { c = { ref, x: 0, y: 0, side: 'T', mount: 'SMD', pins: [] }; compsMap.set(ref, c); }
        c.pins.push({ id: ref + '-' + pnum, num: pnum, net, x, y, radius, side: c.side, name: pname, type: '', comment: '', outline: [] });
      } else if (mode === 'nails' && f.length >= 10) {
        // S!Y!NET!REF!PIN!PADNAME!X!Y!LOCATION!RADIUS!
        let x = parseFloat((f[6] || '').replace(',', '.')), y = parseFloat((f[7] || '').replace(',', '.'));
        if (isNaN(x) || isNaN(y)) continue;
        nails.push({ net: f[2], ref: f[3], x, y, loc: f[8], radius: parseFloat(f[9]) || 25 });
      }
    }
    const comps = [...compsMap.values()];
    // comp origin = pin centroid
    for (const c of comps) if (c.pins.length) {
      c.x = c.pins.reduce((a, p) => a + p.x, 0) / c.pins.length;
      c.y = c.pins.reduce((a, p) => a + p.y, 0) / c.pins.length;
    }
    // UNIT guard: many files mislabel mils as millimeters — only convert when plausible
    if (/mill?imet/.test(unit)) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      comps.forEach((c) => c.pins.forEach((p) => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }));
      const span = Math.max(maxX - minX, maxY - minY);
      if (!isFinite(span) || span <= 700) {
        comps.forEach((c) => {
          c.x *= 39.3701; c.y *= 39.3701;
          c.pins.forEach((p) => { p.x *= 39.3701; p.y *= 39.3701; });
        });
        nails.forEach((n) => { n.x *= 39.3701; n.y *= 39.3701; });
      }
    }
    if (!comps.length) return fail('FZ content contained no parts');
    // outline from pin bounding box + margin
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    comps.forEach((c) => c.pins.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }));
    const m = 20;
    const outline = [{ x: minX - m, y: minY - m }, { x: maxX + m, y: minY - m }, { x: maxX + m, y: maxY + m }, { x: minX - m, y: maxY + m }, { x: minX - m, y: minY - m }];
    // nails as TP comps
    nails.forEach((n, i) => {
      comps.push({ ref: 'TP' + (n.ref ? n.ref + '-' : '') + (i + 1), x: n.x, y: n.y, side: (n.loc || 'T').toUpperCase().startsWith('B') ? 'B' : 'T', mount: 'SMD', pins: [{ id: 'TP' + i + '-1', num: '1', net: n.net || '', x: n.x, y: n.y, radius: Math.max(n.radius / 100, 0.5), side: 'T', name: '', type: '', comment: '', outline: [] }] });
    });
    return mk(comps, outline);
  }

  /* ══════════════ ODB++ .tgz ══════════════ */
  async function gunzip(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable');
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  function untar(buf) {
    // minimal ustar reader: returns Map path → Uint8Array
    const files = new Map();
    const dv = new DataView(buf);
    let off = 0;
    while (off + 512 <= buf.byteLength) {
      const nameEnd = new Uint8Array(buf, off, 100);
      let nlen = 0;
      for (let i = 0; i < 100 && nameEnd[i]; i++) nlen = i + 1;
      const name = new TextDecoder().decode(nameEnd.subarray(0, nlen));
      if (!name) break;
      const sizeStr = new TextDecoder().decode(new Uint8Array(buf, off + 124, 12)).replace(/[\0 ]/g, '');
      const size = parseInt(sizeStr, 8) || 0;
      const prefix = new TextDecoder().decode(new Uint8Array(buf, off + 345, 155)).replace(/\0.*$/, '');
      const full = (prefix ? prefix + '/' : '') + name;
      if (size > 0) files.set(full, new Uint8Array(buf, off + 512, Math.min(size, buf.byteLength - off - 512)));
      off += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }
  async function odbpp(bytes) {
    try {
      const buf = await gunzip(bytes);
      const files = untar(buf);
      const comps = [], outline = [];
      const netPins = new Map();
      // netlist: " $NETNAME C1.1 R2.3" / "* signal" styles
      for (const [path, f] of files) {
        if (!/netlist$/.test(path)) continue;
        const text = new TextDecoder().decode(f);
        for (const line of text.split(/\r?\n/)) {
          const t = line.trim().split(/\s+/);
          if (t.length >= 2 && t[0].startsWith('$')) {
            for (const p of t.slice(1)) {
              const m = p.match(/^(\S+)\.(\S+)$/);
              if (m) { if (!netPins.has(m[1])) netPins.set(m[1], new Map()); netPins.get(m[1]).set(m[2], t[0].slice(1)); }
            }
          }
        }
      }
      // components: steps/*/layers/comp_*/components — "REF X Y ROT SIDE [PKG]"
      for (const [path, f] of files) {
        if (!/components$/.test(path) || !/comp_/.test(path)) continue;
        const text = new TextDecoder().decode(f);
        for (const line of text.split(/\r?\n/)) {
          const t = line.trim().split(/\s+/);
          if (t.length >= 5 && /^[A-Za-z]/.test(t[0]) && !t[0].startsWith('#')) {
            const ref = t[0], x = parseFloat(t[1]), y = parseFloat(t[2]), rot = parseFloat(t[3]) || 0;
            const side = /BOT|B/i.test(t[4]) ? 'B' : 'T';
            if (isNaN(x) || isNaN(y)) continue;
            const comp = { ref, x, y, side, mount: 'SMD', pins: [] };
            const nets = netPins.get(ref);
            if (nets) for (const [pnum, net] of nets) {
              comp.pins.push({ id: ref + '-' + pnum, num: pnum, net, x, y, radius: 3, side, name: '', type: '', comment: '', outline: [] });
            }
            comps.push(comp);
          }
        }
      }
      // profile: "(xs sy)" pairs
      for (const [path, f] of files) {
        if (!/profile$/.test(path)) continue;
        const text = new TextDecoder().decode(f);
        const pts = [...text.matchAll(/\(([-\d.]+)\s+([-\d.]+)\)/g)].map((mm) => ({ x: parseFloat(mm[1]), y: parseFloat(mm[2]) }));
        outline.push(...pts);
        break;
      }
      if (!comps.length) return fail('No components found in ODB++ archive');
      return mk(comps, outline);
    } catch (e) {
      return fail('ODB++ parse failed: ' + (e.message || e));
    }
  }

  /* ══════════════ content detection ══════════════ */
  function detect(text, bytes, fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    const head = text.slice(0, 2048);
    if (/^\s*\(kicad_pcb\b/.test(head)) return 'kicad_pcb';
    if (/^\s*\(kicad_sch\b/.test(head)) return 'kicad_sch';
    if (/^\s*\(pcb\b|\(DESIGN\b/.test(head)) return 'specctra';
    if (/<\?xml|<eagle/i.test(head) && /eagle/i.test(head)) {
      return /<board\b/i.test(text) ? 'eagle_board' : (/<schematic\b/i.test(text) ? 'eagle_sch' : 'eagle_board');
    }
    if (/\$HEADER/.test(head) && /GENCAD/i.test(text.slice(0, 4096))) return 'gencad';
    if (bdvLooksLike(text)) return 'bdv';
    if (bytes && bytes.length > 1024 && bytes[0] === 0x1f && bytes[1] === 0x8b && /\.(tgz|tar\.gz|odb|odbpp)$/i.test(fileName || '')) return 'odbpp';
    if (/^\s*(317|327|367)/m.test(head) && /^\s*(C |P )/m.test(head)) return 'ipc356';
    if (/%FS/.test(head) || /^G04/.test(head)) return 'gerber';
    // extension fallbacks for encrypted formats without magic
    if (ext === 'fz' || ext === 'cae') return 'fz';
    if (ext === 'bdv') return 'bdv'; // may fail parse if BoardViewer variant — caller falls back
    if (ext === 'dsn') return 'specctra';
    if (ext === 'gbr' || ext === 'gko' || ext === 'gtl' || ext === 'gbl') return 'gerber';
    if (ext === '356' || ext === 'ipc' || ext === 'net') return 'ipc356';
    if (ext === 'tgz' || ext === 'tar' || ext === 'odbpp' || /\.tar\.gz$/i.test(fileName || '')) return 'odbpp';
    if (ext === 'sch') return 'eagle_sch_try';
    return null;
  }

  function parse(text, bytes, fileName) {
    const kind = detect(text, bytes, fileName);
    switch (kind) {
      case 'kicad_pcb': return kicadPcb(text);
      case 'kicad_sch': return kicadSch(text);
      case 'eagle_board': return eagleBoard(text);
      case 'eagle_sch': case 'eagle_sch_try': return eagleSch(text);
      case 'specctra': return specctra(text);
      case 'gencad': return genCAD(text);
      case 'bdv': {
        const r = bdv(text);
        return r.error ? { error: r.error, fallback: true } : r;
      }
      case 'ipc356': return ipc356(text);
      case 'gerber': return gerber(text);
      case 'fz': return fail('FZ_KEY_REQUIRED');
      case 'odbpp': return fail('ODBPP_ASYNC');
      default: return null;
    }
  }

  return {
    sexpr, xmlParse, kicadPcb, kicadSch, eagleBoard, eagleSch, specctra, genCAD,
    bdv, bdvLooksLike, ipc356, gerber, rc6StreamDecrypt, fzCheckKey, fzParseKeyHex,
    fzDetect, fzParse, fzParseContent, odbpp, untar, detect, parse,
  };
});
