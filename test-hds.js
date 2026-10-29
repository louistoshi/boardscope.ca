#!/usr/bin/env node
/**
 * test-hds.js — OWON HDS200 series (HDS242 / HO5xS) SCPI protocol tests
 *
 * Covers:
 *   1. ':READ?' response parsing (SI prefixes, labels, units, OL)
 *   2. Line assembly from the serial byte stream (CR / LF / CRLF / chunks)
 *   3. Auto-detection from the '*IDN?' probe response
 *   4. Probe-response discrimination (Metex CR-only replies are not SCPI)
 *   5. Regression: FS9721 / binary-OWON / Metex still auto-detect
 *   6. End-to-end session against a mock Web Serial HDS242
 *
 * Run:  node test-hds.js
 */

const { Multimeter } = require('./multimeter.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 1. ':READ?' response parsing ───────────────────────────────── */
console.log('1) _parseOWONHDS response parsing');
{
  const m = new Multimeter();
  const cases = [
    // [input, expected value, expected mode, expected unit, expected display]
    ['V=28.00mV', 0.028, 'DCV', 'V', '28 mV'],
    ['V=12.34V', 12.34, 'DCV', 'V', '12.34 V'],
    ['Va=230.0V', 230.0, 'ACV', 'V', '230 V'],
    ['R=4.700kΩ', 4700, 'OHM', 'Ω', '4.7 kΩ'],
    ['R=4.700k' + String.fromCharCode(0xCE, 0xA9), 4700, 'OHM', 'Ω', '4.7 kΩ'], // raw UTF-8 Ω
    ['R=10.00MΩ', 1e7, 'OHM', 'Ω', '10 MΩ'],
    ['I=10.5uA', 1.05e-5, 'DCA', 'A', '10.5 uA'],
    ['Ia=125.0mA', 0.125, 'ACA', 'A', '125 mA'],
    ['C=225nF', 2.25e-7, 'CAP', 'F', '225 nF'],
    ['F=60.96kHz', 60960, 'FREQ', 'Hz', '60.96 kHz'],
    ['T=25.5°C', 25.5, 'TEMP', '°C', '25.5 °C'],
    ['D=0.578V', 0.578, 'DIODE', 'V', '578 mV'],
    ['BEEP=0.001Ω', 0.001, 'CONT', 'Ω', '1 mΩ'],
  ];
  for (const [input, val, mode, unit, display] of cases) {
    const r = m._parseOWONHDS(input);
    const valOk = r && Math.abs(r.value - val) <= Math.abs(val) * 1e-9 + 1e-15;
    check(`${input} → ${val} ${mode}`, valOk && r.mode === mode && r.unit === unit,
      r ? `got ${r.value} ${r.mode} ${r.unit}` : 'null');
    check(`   display "${display}"`, r && r.display === display, r && `got "${r.display}"`);
  }
  check('OL defaults DCV', new Multimeter()._parseOWONHDS('OL').ol === true);
  m._lastSCPIMode = 'OHM';
  check('OL keeps last mode', m._parseOWONHDS('OL').mode === 'OHM');
  check('bare number defaults DCV', new Multimeter()._parseOWONHDS('3.280').mode === 'DCV');
  m._lastSCPIMode = 'TEMP';
  check('bare number keeps last mode', m._parseOWONHDS('3.280').mode === 'TEMP');
  for (const bad of ['scpion', 'OWON,HDS242,26190843,V8.5.0', '', '---', 'V=']) {
    check(`"${bad}" rejected as a reading`, m._parseOWONHDS(bad) === null);
  }
}

/* ── 2. Line assembly from byte stream ──────────────────────────── */
console.log('2) _processBufferSCPI line assembly (CR, LF, CRLF, split chunks)');
{
  const m = new Multimeter();
  const readings = [];
  m._detectedProtocol = 'owon-hds';
  m.on('reading', r => readings.push(r));
  const feed = (str) => {
    for (const ch of str) m._buffer.push(ch.charCodeAt(0));
    m._processBuffer();
  };
  feed('V=1.2\r');       // CR-terminated
  feed('V=3.4\n');       // LF-terminated
  feed('V=5.6');         // partial line…
  feed('78V\r\n');       // …completed + CRLF
  feed(':READ? lol\r\n'); // junk line ignored
  check('4 readings assembled', readings.length === 4, `got ${readings.length}`);
  check('values 1.2/3.4/5.678',
    Math.abs(readings[0].value - 1.2) < 1e-9 &&
    Math.abs(readings[1].value - 3.4) < 1e-9 &&
    Math.abs(readings[2].value - 5.678) < 1e-9,
    JSON.stringify(readings.map(r => r.value)));
  check('no leftover bytes', m._buffer.length === 0);
}

/* ── 3. Auto-detection from probe response ──────────────────────── */
console.log('3) auto-detect via *IDN? probe response');
{
  const m = new Multimeter();
  let protoEvt = null;
  m.on('protocol', p => protoEvt = p);
  m._protocol = 'auto';
  m._probeSentAt = Date.now();
  m._initSCPISession = () => { m.sessionStarted = true; };
  for (const c of 'OWON,HDS242,26190843,V8.5.0\r\n') m._buffer.push(c.charCodeAt(0));
  m._tryDetectProtocol();
  check('detected owon-hds', m._detectedProtocol === 'owon-hds');
  check('protocol event fired', protoEvt === 'owon-hds');
  check('session started', m.sessionStarted === true);
  check('buffer consumed', m._buffer.length === 0);

  const m5 = new Multimeter();
  m5._protocol = 'auto';
  m5._probeSentAt = Date.now();
  for (const c of 'SIGLENT,SDS1102,01234,1.1.1\n') m5._buffer.push(c.charCodeAt(0));
  m5._tryDetectProtocol();
  check('foreign IDN ignored', m5._detectedProtocol !== 'owon-hds');
}

/* ── 4. Probe-response discrimination ───────────────────────────── */
console.log('4) probe response discrimination');
{
  const m7 = new Multimeter();
  m7._protocol = 'auto';
  m7._probeSentAt = Date.now();
  for (const c of 'DCV  1.234 V \r') m7._buffer.push(c.charCodeAt(0));
  m7._tryDetectProtocol();
  check('CR-only metex reply not misdetected', m7._detectedProtocol !== 'owon-hds');

  const m8 = new Multimeter();
  m8._protocol = 'auto';
  m8._probeSentAt = Date.now();
  m8._initSCPISession = () => { m8.sessionStarted = true; };
  for (const c of 'V=3.30V\n') m8._buffer.push(c.charCodeAt(0));
  m8._tryDetectProtocol();
  check('LF value line detected as owon-hds', m8._detectedProtocol === 'owon-hds' && m8.sessionStarted === true);
}

/* ── 5. Regression: existing protocols still auto-detect ────────── */
console.log('5) existing protocol regression');
{
  const m = new Multimeter();
  m._protocol = 'auto';
  const readings = [];
  m.on('reading', r => readings.push(r));
  const frame = [0x01, 0x12, 0x22, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  let sum = 0; for (let i = 0; i < 13; i++) sum += frame[i];
  frame[13] = sum & 0x0F;
  m._buffer = frame.slice();
  m._processBuffer();
  check('FS9721 auto-detected', m._detectedProtocol === 'fs9721');
  check('FS9721 reading parsed', readings.length === 1 && readings[0].mode === 'DCV');
}
{
  const m = new Multimeter();
  m._protocol = 'auto';
  const readings = [];
  m.on('reading', r => readings.push(r));
  m._buffer = [0xAB, 0x00, 0x02, 0x00, 0x00, 0x12, 0x34, 0x00, 0x00, 0x00, 0x0D];
  m._processBuffer();
  check('binary OWON auto-detected', m._detectedProtocol === 'owon');
  check('binary OWON reading 12.34 V', readings.length === 1 && Math.abs(readings[0].value - 12.34) < 1e-9);
}
{
  const m = new Multimeter();
  m._protocol = 'auto';
  const frame = Array.from('DCV  1.23 V  ').map(c => c.charCodeAt(0)); frame.push(0x0D);
  m._buffer = frame.slice();
  m._processBuffer();
  check('Metex auto-detected', m._detectedProtocol === 'metex');
}

/* ── 6. End-to-end session with a mock Web Serial HDS242 ────────── */
console.log('6) end-to-end session (mock Web Serial)');

class MockHDS {
  // Silent until addressed; replies to *IDN?, :SCPI:DISP?, :READ? after 60 ms
  constructor() {
    this._rxBuf = '';
    this._chunks = [];
    this._closed = false;
    this.readCount = 0;
    this.readable = {
      getReader: () => ({
        read: async () => {
          if (this._closed) return { value: undefined, done: true };
          if (!this._chunks.length) {
            await sleep(20);
            if (!this._chunks.length) return { value: new Uint8Array(0), done: false };
          }
          return { value: this._chunks.shift(), done: false };
        },
        releaseLock: () => {},
        cancel: async () => {},
      }),
    };
    this.writable = {
      getWriter: () => ({
        write: async (u8) => {
          this._rxBuf += new TextDecoder().decode(u8);
          let idx;
          while ((idx = this._rxBuf.indexOf('\n')) >= 0) {
            this._respond(this._rxBuf.slice(0, idx).trim());
            this._rxBuf = this._rxBuf.slice(idx + 1);
          }
        },
        releaseLock: () => {},
      }),
    };
  }
  async open() { this._closed = false; }
  async close() { this._closed = true; }
  getInfo() { return { usbVendorId: 0x5345, usbProductId: 0x1234 }; }
  _respond(cmd) {
    let resp = null;
    if (cmd === '*IDN?') resp = 'OWON,HDS242,26190843,V8.5.0';
    else if (cmd === ':SCPI:DISP?') resp = 'scpiON';
    else if (cmd === ':READ?') {
      this.readCount++;
      resp = this.readCount <= 2 ? 'V=28.00mV' : (this.readCount <= 4 ? 'R=4.700kΩ' : 'V=12.34V');
    }
    if (resp !== null) setTimeout(() => this._chunks.push(new TextEncoder().encode(resp + '\r\n')), 60);
  }
}

const mockPort = new MockHDS();
Object.defineProperty(globalThis, 'navigator', {
  value: { serial: { requestPort: async () => mockPort, getPorts: async () => [mockPort] } },
  configurable: true,
});

(async () => {
  const meter = new Multimeter();
  const readings = [], statuses = [], protos = [];
  meter.on('reading', r => readings.push(r));
  meter.on('status', s => statuses.push(s));
  meter.on('protocol', p => protos.push(p));

  const ok = await meter.connect();
  check('connected', ok === true);
  await sleep(4600); // 1.8s probe + session init + several 500ms polls
  check('protocol detected', meter._detectedProtocol === 'owon-hds', `got ${meter._detectedProtocol}`);
  check('protocol event', protos.includes('owon-hds'));
  check('readings received', readings.length >= 3, `got ${readings.length}`);
  check('first reading 28 mV DCV',
    readings[0] && Math.abs(readings[0].value - 0.028) < 1e-9 && readings[0].mode === 'DCV');
  const ohm = readings.find(r => r.mode === 'OHM');
  check('ohm reading 4700', ohm && Math.abs(ohm.value - 4700) < 1e-6, ohm && `${ohm.value} ${ohm.display}`);
  check('status mentions OWON HDS SCPI', statuses.some(s => /OWON HDS SCPI/.test(s)));
  check('trend history filled', meter.getTrendHistory().length >= 3);

  await meter.disconnect();
  check('poll timer stopped', meter._scpiPollTimer === null);
  check('disconnected', meter.connected === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
