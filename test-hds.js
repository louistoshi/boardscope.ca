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

  /* ── 7. v6.0.20 tester round: fast dialect, RATE presets, reconnect ── */
  console.log('7) v6.0.20 — :DMM:MEAS? dialect, RATE presets, reconnect fallback');
  {
    // Meter that answers ONLY the fast dialect (some HDS242 firmware does)
    class MockHDSFast extends MockHDS {
      _respond(cmd) {
        let resp = null;
        if (cmd === '*IDN?') resp = 'OWON,HDS242,26190843,V8.5.0';
        else if (cmd === ':SCPI:DISP?') resp = 'scpiON';
        else if (cmd === ':DMM:MEAS?') { this.measCount = (this.measCount || 0) + 1; resp = '3.30'; }
        if (resp !== null) setTimeout(() => this._chunks.push(new TextEncoder().encode(resp + '\r\n')), 30);
      }
    }
    const fastPort = new MockHDSFast();
    navigator.serial.requestPort = async () => fastPort;
    const meter2 = new Multimeter();
    const readings2 = [];
    meter2.on('reading', r => readings2.push(r));
    const ok2 = await meter2.connect(null, 'owon-hds');
    check('fast-dialect meter connected', ok2 === true);
    await sleep(2200); // session init (400 ms gap) + a few polls
    check('polls the fast :DMM:MEAS? dialect',
      fastPort.measCount >= 3 && (meter2._scpiReadCmd || ':DMM:MEAS?') === ':DMM:MEAS?',
      `meas=${fastPort.measCount} cmd=${meter2._scpiReadCmd}`);
    check('fast readings arrive', readings2.length >= 3, `got ${readings2.length}`);

    // RATE presets: clamped, and live re-armed on a running session
    meter2.setPollInterval(100);
    check('setPollInterval live while connected',
      meter2.getPollInterval() === 100 && meter2._scpiPollTimer !== null);
    meter2.setPollInterval(5);
    check('rate clamped to >= 50ms', meter2.getPollInterval() === 50);
    meter2.setPollInterval(9999);
    check('rate clamped to <= 2000ms', meter2.getPollInterval() === 2000);

    // Reconnect fallback: a granted port whose getInfo() carries no USB IDs
    // (Chromium's internal usbserial driver) — a lone granted port wins.
    const anonPort = new MockHDS();
    anonPort.getInfo = () => ({});
    navigator.serial.getPorts = async () => [anonPort];
    meter2._transport = 'serial';
    meter2.port = null;                    // simulate the dropped link
    meter2.connected = false;
    meter2._resetSCPISession();
    const recStatuses = [];
    meter2.on('status', s => recStatuses.push(s));
    await meter2._tryReconnectHDS();
    check('serial reconnect via anonymous granted port',
      meter2.port === anonPort && meter2.connected === true,
      meter2.port ? 'port set' : 'port not set');
    check('reconnect status emitted', recStatuses.some(s => /reconnected/.test(s)));

    await meter2.disconnect();
    check('fast meter disconnected', meter2.connected === false);
  }

  /* ── 8. v6.0.21 — silent-meter recovery (tester regression round 3) ── */
  console.log('8) v6.0.21 — silent meter: probe-before-commit, detect deadline, full reset');
  {
    // USB device that opens fine but never answers SCPI (meter asleep/wedged)
    class MockSilentUSB {
      constructor() {
        this.vendorId = 0x5345;
        this.productId = 0x1234;
        this.opened = false;
        this.closeCount = 0;
        this.claimed = false;
      }
      async open() { this.opened = true; }
      async close() { this.opened = false; this.closeCount++; }
      async selectConfiguration() { }
      async claimInterface() { this.claimed = true; }
      async transferOut() { return { status: 'ok' }; }
      async transferIn() { return { status: 'stall', data: null }; } // silence, instantly
    }
    const silentUsb = new MockSilentUSB();
    navigator.usb = {
      getDevices: async () => [silentUsb],
      requestDevice: async () => silentUsb,
      addEventListener: () => { },
    };

    // A) probe-before-commit: connect() must NOT hold the silent device
    navigator.serial.requestPort = async () => { const e = new Error('no port chosen'); e.name = 'NotFoundError'; throw e; };
    const m3 = new Multimeter();
    m3._handshakeFirstMs = 150;
    m3._handshakeNextMs = 100;
    const okProbe = await m3.connect();
    check('silent USB device → connect() fails cleanly', okProbe === false);
    check('probe released the silent device (no hostage claim)', silentUsb.closeCount >= 1,
      `closeCount=${silentUsb.closeCount}`);
    check('no session left running after failed connect', m3._running === false && m3.connected === false);

    // B) reconnect loop on a dropped USB session: probes before committing,
    //    releases the device every attempt, and gives up with a FULL reset
    //    (_running=false → replug listeners go dormant → picker sees the meter)
    const m4 = new Multimeter();
    const closeBefore = silentUsb.closeCount;
    m4._transport = 'usb';
    m4._running = true;      // session that lost its link
    m4.connected = false;
    m4._reconnectAttempts = 2;
    m4._reconnectDelayMs = 30;
    m4._reconnectHandshakeFirstMs = 100;
    m4._reconnectHandshakeNextMs = 60;
    const m4errors = [];
    m4.on('error', e => m4errors.push(e));
    await m4._tryReconnectHDS();
    check('reconnect gave up with error message', m4errors.length === 1 && /stopped answering/.test(m4errors[0]),
      m4errors[0] || 'no error');
    check('give-up fully resets _running (listeners dormant)', m4._running === false);
    check('give-up resets transport to serial', m4._transport === 'serial');
    check('give-up drops the USB device handle', m4._usbDev === null);
    check('silent device released on EVERY attempt', silentUsb.closeCount >= closeBefore + 2,
      `closeCount=${silentUsb.closeCount} (was ${closeBefore})`);
  }
  {
    // C) serial auto-detect deadline: a connected-but-silent port must not
    //    sit at "DISCONNECT + no data + no name" forever (tester, v6.0.20)
    class MockSilentPort {
      constructor() { this.opened = false; }
      async open() { this.opened = true; }
      async close() { this.opened = false; }
      getInfo() { return { usbVendorId: 0x5345, usbProductId: 0x1234 }; }
      get readable() {
        return {
          getReader: () => ({
            read: async () => ({ value: undefined, done: true }),
            releaseLock: () => { },
            cancel: async () => { },
          }),
        };
      }
      get writable() { return { getWriter: () => ({ write: async () => { }, releaseLock: () => { } }) }; }
    }
    const silentPort = new MockSilentPort();
    navigator.serial.requestPort = async () => silentPort;
    navigator.serial.getPorts = async () => [silentPort];
    const m5 = new Multimeter();
    m5._detectTimeoutMs = 600;
    const m5errors = [];
    m5.on('error', e => m5errors.push(e));
    const ok5 = await m5.connect();
    check('silent serial port "connects" (button would say DISCONNECT)', ok5 === true);
    await sleep(1300);
    check('detect deadline fired with actionable error',
      m5errors.some(e => /No response from the meter/.test(e)), m5errors.join(' | '));
    check('deadline fully reset the session (CONNECT works again)',
      m5.connected === false && m5._running === false && m5.port === null);
  }
  {
    // D) dialect rotation: firmware that answers ':DMM:MEAS?' with a
    //    CSV-style line the parser rejects must rotate to ':READ?' instead
    //    of hammering garbage forever (v6.0.20 lock-in trap)
    class MockCSVMeter extends MockHDS {
      _respond(cmd) {
        let resp = null;
        if (cmd === '*IDN?') resp = 'OWON,HDS242,26190843,V8.5.0';
        else if (cmd === ':SCPI:DISP?') resp = 'scpiON';
        else if (cmd === ':DMM:MEAS?') resp = 'VOLT,3.2800E+00'; // parser-rejecting reply
        else if (cmd === ':READ?') resp = 'V=9.99V';
        if (resp !== null) setTimeout(() => this._chunks.push(new TextEncoder().encode(resp + '\r\n')), 15);
      }
    }
    const csvPort = new MockCSVMeter();
    navigator.serial.requestPort = async () => csvPort;
    navigator.serial.getPorts = async () => [csvPort];
    const m6 = new Multimeter();
    m6.setPollInterval(60);
    const readings6 = [];
    m6.on('reading', r => readings6.push(r));
    const ok6 = await m6.connect(null, 'owon-hds');
    check('CSV-dialect meter connected', ok6 === true);
    await sleep(2600); // session init (~700ms) + 5 garbage polls + rotation
    check('rotated from garbage dialect to :READ?', m6._scpiReadCmd === ':READ?',
      `cmd=${m6._scpiReadCmd}`);
    check('readings flow after rotation', readings6.some(r => Math.abs(r.value - 9.99) < 1e-9),
      `got ${readings6.length} readings`);
    await m6.disconnect();
  }

  /* ── 9. v6.0.22 — USB read loop vs the tester's V11-firmware HDS242 ──
     Mirko's report: pyusb (3 s timeouts, stale-flush) talks to this meter
     over raw bulk USB; BoardScope's per-query race pairing did not. The
     persistent read loop + pending-slot query must match that behavior. */
  console.log('9) v6.0.22 — USB read loop: IDN-only meter, stale packet, late reply');
  // Raw bulk-USB meter mock: commands arrive via transferOut, replies are
  // 64-byte-capable packets fetched by the driver's read loop via transferIn.
  // Shared with section 10's mode-sync scenarios.
  class MockUSBMeter {
    constructor() {
      this.vendorId = 0x5345;
      this.productId = 0x1234;
      this.opened = false;
      this.closeCount = 0;
      this._rx = [];          // queued reply packets
      this._lastCmd = null;
      this.writeCount = 0;
    }
    async open() { this.opened = true; }
    async close() { this.opened = false; this.closeCount++; }
    async selectConfiguration() { }
    async claimInterface() { }
    async transferOut(ep, data) {
      this._lastCmd = new TextDecoder().decode(data).trim();
      this.writeCount++;
      this._enqueue(this._lastCmd);
      return { status: 'ok' };
    }
    _enqueue(cmd) { }        // behavior hook — overridden per scenario
    async transferIn() {
      if (this._rx.length) {
        const data = this._rx.shift();
        return { status: 'ok', data: new DataView(data.buffer, data.byteOffset, data.byteLength) };
      }
      await sleep(20);       // nothing queued — pend briefly like real USB
      return { status: 'ok', data: new DataView(new ArrayBuffer(0)) };
    }
    reply(str) { this._rx.push(new TextEncoder().encode(str + '\r\n')); }
  }

  const installUSB = (dev) => {
    navigator.usb = {
      getDevices: async () => [dev],
      requestDevice: async () => dev,
      addEventListener: () => { },
    };
    navigator.serial.requestPort = async () => {
      const e = new Error('no port chosen'); e.name = 'NotFoundError'; throw e;
    };
  };
  {

    // A) Mirko's V11 firmware: answers ONLY *IDN? (proven working in his
    //    pyusb test) — BoardScope must connect on the IDN handshake.
    class MockIDNOnly extends MockUSBMeter {
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        // :SCPI:DISP? / :READ? / :DMM:MEAS? — silence (pend → timeout)
      }
    }
    const idnDev = new MockIDNOnly();
    installUSB(idnDev);
    const m7 = new Multimeter();
    m7._handshakeFirstMs = 300;
    m7._handshakeNextMs = 150;
    const statuses7 = [];
    m7.on('status', s => statuses7.push(s));
    const ok7 = await m7.connect();
    check('IDN-only V11 meter connects over raw USB', ok7 === true && m7.connected === true);
    await sleep(1600); // session init: DISP timeout + *IDN? reply
    check('instrument name shown from *IDN?', statuses7.some(s => /OWON HDS242 — SCPI active/.test(s)),
      statuses7.join(' | ').slice(0, 120));
    await m7.disconnect();

    // B) stale packet queued at claim time — must not desync the session
    class MockStaleUSB extends MockUSBMeter {
      constructor() {
        super();
        this.reply('V=99.99V'); // leftover junk waiting on the endpoint
      }
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('3.30');
      }
    }
    const staleDev = new MockStaleUSB();
    installUSB(staleDev);
    const m8 = new Multimeter();
    m8._handshakeFirstMs = 300;
    m8._handshakeNextMs = 150;
    m8.setPollInterval(100);
    const readings8 = [];
    m8.on('reading', r => readings8.push(r));
    const ok8 = await m8.connect();
    check('connect survives a stale packet on the endpoint', ok8 === true);
    await sleep(1800);
    check('stale reading did not poison later replies',
      readings8.some(r => Math.abs(r.value - 3.3) < 1e-9),
      readings8.map(r => r.display).join(','));
    await m8.disconnect();

    // C) slow reply past the poll timeout — arrives as a reading, not lost
    class MockSlowUSB extends MockUSBMeter {
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') {
          setTimeout(() => this.reply('V=5.55V'), 500); // slower than the poll timeout
        }
      }
    }
    const slowDev = new MockSlowUSB();
    installUSB(slowDev);
    const m9 = new Multimeter();
    m9._handshakeFirstMs = 300;
    m9._handshakeNextMs = 150;
    m9.setPollInterval(200);
    const readings9 = [];
    m9.on('reading', r => readings9.push(r));
    const ok9 = await m9.connect();
    check('slow-reply meter connected', ok9 === true);
    await sleep(2000);
    check('late reply still arrives as a reading',
      readings9.some(r => Math.abs(r.value - 5.55) < 1e-9),
      readings9.map(r => r.display).join(','));
    await m9.disconnect();

    // D) diagnostics trail exists (LOG button / terminal feed)
    const m10 = new Multimeter();
    m10._dbg('test line');
    check('debug ring buffer records the trail',
      m10.getDebugLog().some(l => /test line/.test(l)));
  }

  /* ── 10. v6.0.23 — mode tracking on bare-number dialects (Mirko: knob
     turns stayed in DCV). Root cause: the :DMM:CONFigure? sync was gated
     on _scpiReadCmd === ':DMM:MEAS?', which stays null when the fast
     dialect answers from poll #1 — the sync never ran. */
  console.log('10) v6.0.23 — knob-turn mode sync (CONFigure + labeled probe)');
  {
    // A) firmware answers CONFigure: knob turn VOLTage→RESistance shows up
    class MockKnobUSB extends MockUSBMeter {
      constructor() {
        super();
        this._confCount = 0;
      }
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('3.30');
        else if (cmd === ':DMM:CONFigure?') {
          this._confCount++;
          // first two syncs: voltage; after that the "knob" is on ohms
          this.reply(this._confCount <= 2 ? 'VOLTage DC' : 'RESistance');
        }
      }
    }
    const knobDev = new MockKnobUSB();
    installUSB(knobDev);
    const mK = new Multimeter();
    mK._handshakeFirstMs = 200;
    mK._handshakeNextMs = 100;
    mK._confSyncMs = 400;
    mK._confProvenMs = 400; // v6.0.24 split: proven cadence is its own knob
    mK._confQueryTimeoutMs = 150;
    mK.setPollInterval(80);
    const readingsK = [];
    mK.on('reading', r => readingsK.push(r));
    const okK = await mK.connect();
    check('knob-meter connected', okK === true);
    await sleep(2400); // several CONFigure syncs (400ms cadence)
    check('mode follows knob turn via :DMM:CONFigure?',
      readingsK.some(r => r.mode === 'OHM'),
      readingsK.map(r => r.mode).join(','));
    await mK.disconnect();
  }
  {
    // B) CONFigure silent + :READ? labeled — the labeled probe must carry
    //    the mode when the fast dialect gives bare numbers
    class MockSilentConfUSB extends MockUSBMeter {
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('1.00');
        else if (cmd === ':READ?') this.reply('R=4.700kΩ');
        // :DMM:CONFigure? — silence (pend → timeout)
      }
    }
    const scDev = new MockSilentConfUSB();
    installUSB(scDev);
    const mS = new Multimeter();
    mS._handshakeFirstMs = 200;
    mS._handshakeNextMs = 100;
    mS._confSyncMs = 250;
    mS._confQueryTimeoutMs = 150;
    mS.setPollInterval(80);
    const readingsS = [];
    mS.on('reading', r => readingsS.push(r));
    const okS = await mS.connect();
    check('silent-CONFigure meter connected', okS === true);
    await sleep(3000); // 2 sync attempts + every-8th-poll labeled probe
    check('labeled :READ? probe carries the mode (OHM, not stuck DCV)',
      readingsS.some(r => r.mode === 'OHM'),
      readingsS.map(r => r.mode).join(','));
    await mS.disconnect();
  }
  {
    // C) neither CONFigure nor :READ? answers — probe disables itself and
    //    polling keeps flowing (mode stays DCV; diagnostics show why)
    class MockDeafUSB extends MockUSBMeter {
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('2.50');
        // :DMM:CONFigure? and :READ? — silence
      }
    }
    const deafDev = new MockDeafUSB();
    installUSB(deafDev);
    const mD = new Multimeter();
    mD._handshakeFirstMs = 200;
    mD._handshakeNextMs = 100;
    mD._confSyncMs = 250;
    mD._confQueryTimeoutMs = 150;
    mD.setPollInterval(60);
    const readingsD = [];
    mD.on('reading', r => readingsD.push(r));
    const okD = await mD.connect();
    check('deaf-config meter connected', okD === true);
    await sleep(7000); // 3 silent probes × 1s USB timeout + sync blocks
    check('readings keep flowing without mode info',
      readingsD.length >= 5, `got ${readingsD.length}`);
    check('probe disabled itself after 3 silent tries',
      mD._readProbeDisabled === true && mD.getDebugLog().some(l => /mode probe .* disabled/.test(l)));
    await mD.disconnect();
  }

  /* ── 11. v6.0.24 — Mirko round 2: Ω→DCV never switched, AC never showed,
     knob updates took 2-3 s. Root causes: the CONFigure mapper matched the
     literal word 'volt' only (terse/echo/range-style voltage replies fell
     through and kept the old mode), the AC/DC flavor had no source when the
     echo lacks a qualifier, and the sync cadence was a flat 3 s. */
  console.log('11) v6.0.24 — CONFigure mapping variants, AC/DC flavor, ~1s sync');
  {
    // A) direct mapping table — every plausible reply spelling
    const mV = new Multimeter();
    const cases = [
      // long SCPI forms
      ['VOLTage DC', 'DCV'], ['VOLTage AC', 'ACV'],
      ['CURRent DC', 'DCA'], ['CURRent AC', 'ACA'],
      ['RESistance', 'OHM'], ['CAPacitance', 'CAP'], ['DIODe', 'DIODE'],
      ['CONTinuity', 'CONT'], ['FREQuency', 'FREQ'], ['DUTY', 'DUTY'],
      ['TEMPerature', 'TEMP'],
      // terse echo styles that v6.0.23 fell through on (Ω→DCV bug)
      ['DCV', 'DCV'], ['ACV', 'ACV'], ['V DC', 'DCV'], ['V AC', 'ACV'],
      ['VDC', 'DCV'], ['VAC', 'ACV'], ['DC', 'DCV'], ['AC', 'ACV'],
      // range-style replies (pyusb reference parses these shapes too)
      ['20V', 'DCV'], ['200mV', 'DCV'], ['20MOhm', 'OHM'],
      ['20MΩ', 'OHM'], ['20nF', 'CAP'],
      // current range style
      ['50mA', 'DCA'], ['5A', 'DCA'],
      // qualifier + value echo
      ['VOLTage DC,+3.2800E+00', 'DCV'],
      ['VOLTage AC,+2.3000E+02', 'ACV'],
      // traps: 'capacitance' contains 'ac' — must NOT read as AC
      ['CAPacitance', 'CAP'], ['20nF,AC-range', 'CAP'],
      // unknown replies stay unmapped
      ['AUTO', null], ['scpion', null], ['OWON,HDS242,26190843,V11.0.0', null],
    ];
    for (const [reply, want] of cases) {
      mV._scpiFlavor = { volt: null, curr: null };
      mV._acProbeWanted = false;
      mV._lastSCPIMode = null;
      const got = mV._syncModeFromConfig(reply);
      check(`CONFigure ${JSON.stringify(reply)} → ${want}`,
        got === want && (want === null || mV._lastSCPIMode === want),
        `got ${got} / last=${mV._lastSCPIMode}`);
    }
    check('qualifier-less voltage queues a flavor probe',
      mV._syncModeFromConfig('20V') === 'DCV' && mV._acProbeWanted === true);
    check('qualified voltage does not queue a probe',
      (mV._syncModeFromConfig('VOLTage AC') === 'ACV') && mV._acProbeWanted === false);
  }
  {
    // B) end-to-end: knob Ω → range-style '20V' echo (no qualifier) → DCV
    //    shows; SELECT→AC with no qualifier → flavor probe via labeled
    //    :READ? ('Va=…') upgrades to ACV; further qualifier-less syncs keep
    //    AC (no DCV flapping)
    class MockRangeEchoUSB extends MockUSBMeter {
      constructor() { super(); this.stage = 'ohm'; }
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('3.30');
        else if (cmd === ':DMM:CONFigure?') {
          if (this.stage === 'ohm') this.reply('RESistance');
          else if (this.stage === 'dcv') this.reply('20V');
          else this.reply('VOLTage'); // SELECT pressed — echo lost the qualifier
        } else if (cmd === ':READ?') {
          this.reply(this.stage === 'acv' ? 'Va=230.0V' : 'V=3.30V');
        }
      }
    }
    const reDev = new MockRangeEchoUSB();
    installUSB(reDev);
    const mR = new Multimeter();
    mR._handshakeFirstMs = 200;
    mR._handshakeNextMs = 100;
    mR._confSyncMs = 240;
    mR._confProvenMs = 240;
    mR._confQueryTimeoutMs = 150;
    mR.setPollInterval(80);
    const modesR = [];
    mR.on('reading', r => modesR.push(r.mode));
    const okR = await mR.connect();
    check('range-echo meter connected', okR === true);
    await sleep(1200);
    check('OHM shown', modesR.some(md => md === 'OHM'), modesR.join(','));
    // knob → V position; firmware echoes range-style '20V' (no qualifier)
    reDev.stage = 'dcv';
    const t0 = Date.now();
    await sleep(1400);
    check(`Ω→DCV via range-style echo (v6.0.23 bug), shown in ${Date.now() - t0}ms`,
      modesR.some(md => md === 'DCV'), modesR.join(','));
    // SELECT → AC; echo 'VOLTage' has no qualifier — labeled probe resolves
    reDev.stage = 'acv';
    await sleep(1800);
    check('AC shown via flavor probe (Va label)', modesR.some(md => md === 'ACV'),
      modesR.join(','));
    const acIdx = modesR.indexOf('ACV');
    await sleep(1200);
    check('AC persists — no DCV flap on qualifier-less syncs',
      !modesR.slice(acIdx + 1).includes('DCV'), modesR.join(','));
    await mR.disconnect();
  }
  {
    // C) explicit qualifier: SELECT→AC reflects on the next CONFigure sync
    //    with no probe round-trip
    class MockQualifiedUSB extends MockUSBMeter {
      constructor() { super(); this.ac = false; }
      _enqueue(cmd) {
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':SCPI:DISP?') this.reply('scpiON');
        else if (cmd === ':DMM:MEAS?') this.reply('230.0');
        else if (cmd === ':DMM:CONFigure?') this.reply(this.ac ? 'VOLTage AC' : 'VOLTage DC');
        else if (cmd === ':READ?') this.reply('V=230.0V');
      }
    }
    const qDev = new MockQualifiedUSB();
    installUSB(qDev);
    const mQ = new Multimeter();
    mQ._handshakeFirstMs = 200;
    mQ._handshakeNextMs = 100;
    mQ._confSyncMs = 240;
    mQ._confProvenMs = 240;
    mQ._confQueryTimeoutMs = 150;
    mQ.setPollInterval(80);
    const modesQ = [];
    mQ.on('reading', r => modesQ.push(r.mode));
    const okQ = await mQ.connect();
    check('qualified meter connected', okQ === true);
    await sleep(1000);
    check('DCV shown', modesQ.some(md => md === 'DCV'), modesQ.join(','));
    qDev.ac = true;
    const tQ = Date.now();
    await sleep(1200);
    check(`SELECT→AC shows within ${Date.now() - tQ}ms of the sync`,
      modesQ.some(md => md === 'ACV'), modesQ.join(','));
    check('no flavor probe needed for qualified echoes', mQ._acProbeWanted === false);
    await mQ.disconnect();
  }

  /* ── 12. v6.0.24 — scope module: OWON HDS via WebUSB bulk (Mirko: the
     Oscilloscope CONNECT popup only showed his keyboard/mouse — the HDS is
     a raw bulk device and was in neither the WebUSB filters nor the serial
     picker). */
  console.log('12) v6.0.24 — scope module HDSBulkDriver (chooser + capture + recovery)');
  {
    class MockHDSScope {
      constructor() {
        this.vendorId = 0x5345;
        this.productId = 0x1234;
        this.opened = false;
        this.openCount = 0;
        this._rx = [];
        this.commands = [];
        this.failNextTransferIn = false;
        this.wave = '0.1,0.2,0.3,-0.4';
      }
      async open() { this.openCount++; this.opened = true; }
      async close() { this.opened = false; }
      async selectConfiguration() { }
      async claimInterface() { }
      async transferOut(ep, data) {
        const cmd = new TextDecoder().decode(data).trim();
        this.commands.push(cmd);
        if (cmd === '*IDN?') this.reply('OWON,HDS242,26190843,V11.0.0');
        else if (cmd === ':WAV:DATA?') this.reply(this.wave);
        return { status: 'ok' };
      }
      reply(str) { this._rx.push(new TextEncoder().encode(str + '\r\n')); }
      replySplit(a, b) {
        this._rx.push(new TextEncoder().encode(a));
        this._rx.push(new TextEncoder().encode(b));
      }
      async transferIn() {
        if (this.failNextTransferIn) { this.failNextTransferIn = false; throw new Error('link dead'); }
        if (this._rx.length) {
          const data = this._rx.shift();
          return { status: 'ok', data: new DataView(data.buffer, data.byteOffset, data.byteLength) };
        }
        await sleep(5);
        return { status: 'ok', data: new DataView(new ArrayBuffer(0)) };
      }
    }

    const { Oscilloscope, HDSBulkDriver } = require('./oscilloscope.js');
    check('HDSBulkDriver matches 5345:1234', HDSBulkDriver.matches({ vendorId: 0x5345, productId: 0x1234 }));
    check('HDSBulkDriver rejects other VIDs', !HDSBulkDriver.matches({ vendorId: 0x04B4, productId: 0x6022 }));

    // A) the chooser must OFFER the HDS and the connection must land on it
    const scopeDev = new MockHDSScope();
    let lastFilters = null;
    navigator.usb = {
      getDevices: async () => [scopeDev],
      requestDevice: async (opts) => { lastFilters = opts && opts.filters; return scopeDev; },
      addEventListener: () => { },
    };
    const osc = new Oscilloscope();
    osc.on('error', e => console.log('   [scope error]', e.message));
    const ok = await osc.connect();
    check('scope module connects to the HDS via WebUSB', ok === true);
    check('chooser filters include the HDS VID:PID',
      lastFilters && lastFilters.some(f => f.vendorId === 0x5345 && f.productId === 0x1234),
      lastFilters && JSON.stringify(lastFilters));
    check('routed to the hds bulk driver', osc._driver === 'hds');
    check('IDN handshake named the model', osc._hds.model.includes('HDS242'), osc._hds.model);
    const wf = await osc.capture(0.001);
    check('capture produced a waveform via :WAV:DATA?',
      wf && wf.driver === 'hds' && wf.ch1.length === 4 && Math.abs(wf.ch1[1] - 0.2) < 1e-5,
      wf && `${wf.driver} n=${wf.ch1.length}`);
    check('scope configure commands sent',
      scopeDev.commands.some(c => c.startsWith(':WAV:POIN')) && scopeDev.commands.includes(':SING'));
    await osc.disconnect();
    check('device released on disconnect', scopeDev.opened === false);

    // B) split bulk packets reassemble into one reply
    const dev2 = new MockHDSScope();
    navigator.usb = { getDevices: async () => [dev2], requestDevice: async () => dev2, addEventListener: () => { } };
    const osc2 = new Oscilloscope();
    osc2.on('error', e => console.log('   [scope error]', e.message));
    await osc2.connect();
    dev2.replySplit('0.5,0.', '6,0.7\n');  // one :WAV:DATA? line in two packets
    const wf2 = await osc2.capture(0.001);
    check('split bulk packets reassemble', wf2 && wf2.ch1.length === 3 && Math.abs(wf2.ch1[2] - 0.7) < 1e-5,
      wf2 && `n=${wf2.ch1.length}`);
    await osc2.disconnect();

    // C) firmware link drop → self-heal on the fast retry path
    const dev3 = new MockHDSScope();
    navigator.usb = { getDevices: async () => [dev3], requestDevice: async () => dev3, addEventListener: () => { } };
    const osc3 = new Oscilloscope();
    const evts3 = [];
    osc3.on('connected', e => evts3.push(e));
    osc3.on('disconnected', () => evts3.push({ lost: true }));
    osc3.on('error', e => console.log('   [scope error]', e.message));
    await osc3.connect();
    osc3._hds._retryDelayMs = 20;
    dev3.failNextTransferIn = true;
    await sleep(400);
    check('HDS link drop self-heals (reconnected event)',
      evts3.some(e => e.reconnected === true) && osc3.connected === true,
      JSON.stringify(evts3));
    await osc3.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
