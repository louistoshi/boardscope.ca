/**
 * BoardScope Multimeter Interface
 * Web Serial API — multi-protocol parser for USB multimeters
 *
 * Supported protocols / brands:
 *   FS9721  — UNI-T UT61E/D, Victor VC86/82, Mastech MS8250D, Voltcraft VC-820/840,
 *              Digitech QM-1531, Lilliput DM25/T-28, many Chinese clones
 *              Baud: 2400, 14-byte frames
 *
 *   OWON    — OWON OW16B, OW16C and compatible USB serial meters
 *              Baud: 9600, 11-byte frames (0xAB/0xAC start, 0x0D end)
 *
 *   OWON HDS — OWON HDS200-series handheld scopes with built-in DMM
 *              (HDS242, HDS272, Hanmatek HO5xS rebadges). USB ID 5345:1234.
 *              SCPI over USB serial. Baud: 115200 (nominal — the device is a
 *              USB bulk transport, so the baud setting is ignored by the OS).
 *              Session: '*IDN?' → ':SCPI:DISP?' (activates DMM SCPI) → poll ':READ?'
 *              Responses are ASCII lines: 'V=28.00mV', 'F=60.96kHz', 'R=4.7kΩ', 'OL'.
 *              The meter must be in Multimeter mode on its front panel.
 *              Firmware drops the USB port when the serial line goes idle, so
 *              the driver keeps a 500 ms ':READ?' poll running and auto-reconnects
 *              (matching VID:PID) if the port is torn down.
 *
 *   Metex   — Metex M-3860M, Voltcraft M-3860, Conrad ME-32
 *              Baud: 1200, 14-byte ASCII frames (start with mode, end 0x0D)
 *
 * Protocol is auto-detected from the first valid frame received.
 * Streaming meters (FS9721 / OWON binary / Metex) are detected passively;
 * the silent SCPI devices are found by an active '*IDN?' probe after ~2 s.
 * You can also force a protocol: meter.setProtocol('owon-hds')
 *
 * sigrok note: FS9721 and Metex are the same protocols sigrok implements.
 * OWON USB meters are also supported in sigrok as 'owon-ow18e' (BLE variant)
 * and related drivers. This implementation covers the serial/USB variants.
 *
 * Usage:
 *   const meter = new Multimeter();
 *   meter.on('reading', (r) => console.log(r));
 *   meter.on('stable', (r) => console.log('stable:', r));
 *   await meter.connect();        // opens browser port picker, auto-detects protocol
 *   await meter.connect(9600, 'owon'); // force OWON at 9600 baud
 *   meter.disconnect();
 *
 * Events: reading | stable | mode | status | error | protocol
 */

class Multimeter {
  constructor() {
    this.port = null;
    this.reader = null;
    this.connected = false;
    this._running = false;
    this._buffer = [];
    this._lastReading = null;
    this._readingsPerSecond = 0;
    this._readingCount = 0;

    // Protocol detection
    this._protocol = 'auto';          // user setting
    this._detectedProtocol = null;    // confirmed after first valid frame
    this._readingTimer = null;

    // OWON HDS SCPI session state
    this._writer = null;              // Web Serial writable stream writer
    this._scpiPollTimer = null;       // ':READ?' keepalive poll
    this._scpiProbeTimer = null;      // auto-detect '*IDN?' probe
    this._scpiProbeCount = 0;
    this._probeSentAt = 0;            // timestamp of last probe write
    this._scpiPending = null;         // { resolve } — response correlation
    this._scpiBusy = false;
    this._scpiFails = 0;
    this._scpiHintShown = false;
    this._lastSCPIMode = null;        // bare-number responses keep last mode

    // Event bus
    this._listeners = {};

    // Debounce / stable detection
    this._stableWindow = 1000;     // ms: reading must be stable for this long
    this._stableTolerance = 0.01;  // 1% tolerance for "same" reading
    this._stableStart = null;
    this._lastStableValue = null;
    this._lastStableMode = null;
    this._stableReading = null;

    // Reading history (for debounce and trend)
    this._history = [];
    this._maxHistory = 30;

    // Phase 2.1: Min/Max/Avg statistics
    this._minValue = null;
    this._maxValue = null;
    this._sumValue = 0;
    this._countValue = 0;
    this._avgValue = 0;
    this._statsMode = null;  // track mode for stats reset

    // Phase 2.1: Hold mode
    this._hold = false;
    this._heldReading = null;

    // Phase 2.1: Relative mode (Δ)
    this._relative = false;
    this._relativeRef = null;

    // Phase 2.1: Extended history for trending (last 200 readings)
    this._trendHistory = [];
    this._maxTrendHistory = 200;

    // Phase 2.2: Calibration offsets per mode
    this._calibration = {};

    // Phase 2.3: Full reading log for export
    this._readingLog = [];
    this._maxReadingLog = 10000;

    // Phase 3.1: Voltage rail detection
    this._voltageRails = [
      { name: 'PPBUS_G3H', expected: 12.6, tolerance: 0.5 },
      { name: 'PP3V42_G3H', expected: 3.42, tolerance: 0.1 },
      { name: 'PP5V_G3H', expected: 5.0, tolerance: 0.2 },
      { name: 'PP1V8_S0', expected: 1.8, tolerance: 0.1 },
      { name: 'PP1V05_PCH', expected: 1.05, tolerance: 0.05 },
      { name: 'PP0V85_PCH', expected: 0.85, tolerance: 0.05 },
      { name: 'PPVAR_CPU', expected: 1.0, tolerance: 0.3 },
      { name: 'PP1V2_PCH', expected: 1.2, tolerance: 0.1 },
      { name: 'PP3V3_S5', expected: 3.3, tolerance: 0.1 },
      { name: 'PP5V_S0', expected: 5.0, tolerance: 0.2 },
      { name: 'PP12V_PSYS', expected: 12.0, tolerance: 0.5 },
      { name: 'PPGPU', expected: 0.8, tolerance: 0.3 },
      { name: 'PPRAM', expected: 1.35, tolerance: 0.1 },
      { name: 'PP1V5_S0', expected: 1.5, tolerance: 0.1 },
      { name: 'PP2V5', expected: 2.5, tolerance: 0.1 },
      { name: 'PPAVDD', expected: 1.8, tolerance: 0.1 },
      { name: 'PP1V8', expected: 1.8, tolerance: 0.1 },
      { name: 'PP3V3', expected: 3.3, tolerance: 0.1 },
      { name: 'PP5V', expected: 5.0, tolerance: 0.2 },
      { name: 'PP12V', expected: 12.0, tolerance: 0.5 },
      { name: 'GND', expected: 0.0, tolerance: 0.05 },
    ];
    this._detectedRail = null;

    // Phase 4.1: Diode reference database
    this._diodeRefs = {
      'CPU_VCC': { expected: 0.400, range: [0.300, 0.600] },
      'CPU_RAM': { expected: 0.500, range: [0.350, 0.650] },
      'GPU_CORE': { expected: 0.350, range: [0.250, 0.500] },
      'PCH': { expected: 0.550, range: [0.400, 0.700] },
      'USB_DATA': { expected: 0.600, range: [0.500, 0.750] },
      'SATA': { expected: 0.550, range: [0.400, 0.700] },
      'PCIE': { expected: 0.500, range: [0.350, 0.650] },
      'DDR_VTT': { expected: 0.450, range: [0.300, 0.600] },
      'BACKLIGHT': { expected: 0.300, range: [0.200, 0.500] },
      'AUDIO': { expected: 0.600, range: [0.500, 0.750] },
      'WIFI': { expected: 0.500, range: [0.350, 0.650] },
      'CHARGER': { expected: 0.400, range: [0.300, 0.550] },
      'BATTERY': { expected: 0.500, range: [0.350, 0.650] },
      'POWER_BTN': { expected: 0.600, range: [0.500, 0.750] },
      'RESET': { expected: 0.550, range: [0.400, 0.700] },
      'DEFAULT': { expected: 0.500, range: [0.300, 0.700] },
    };
    this._shortThreshold = 0.050;
    this._openThreshold = 2.0;
  }

  /* ── Event Bus ─────────────────────────────────────────────────── */

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._listeners[event]) return this;
    if (fn) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    } else {
      delete this._listeners[event];
    }
    return this;
  }

  _emit(event, data) {
    const fns = this._listeners[event] || [];
    for (const fn of fns) {
      try { fn(data); } catch (_) { }
    }
  }

  /* ── Protocol Selection ────────────────────────────────────────── */

  // Protocol info for UI display
  static PROTOCOLS = {
    auto: { label: 'Auto-detect', baud: 2400 },
    fs9721: { label: 'FS9721 (UNI-T / Mastech / Lilliput / Voltcraft)', baud: 2400 },
    owon: { label: 'OWON (OW16B / OW16C)', baud: 9600 },
    'owon-hds': { label: 'OWON HDS200 series (HDS242 / HO5xS, SCPI)', baud: 115200 },
    metex: { label: 'Metex / Voltcraft M-3860 / Conrad ME-32', baud: 1200 },
  };

  // OWON test equipment all share this generic USB ID (HDS/PDS/VDS/SDS series)
  static OWON_USB = { vendorId: 0x5345, productId: 0x1234 };

  setProtocol(name) {
    if (!Multimeter.PROTOCOLS[name]) return;
    this._protocol = name;
    this._detectedProtocol = name !== 'auto' ? name : null;
  }

  getProtocol() {
    return this._detectedProtocol || this._protocol || 'auto';
  }

  /* ── Web Serial Connection ─────────────────────────────────────── */

  isSupported() {
    return 'serial' in navigator;
  }

  // baudRate: override; protocol: 'auto'|'fs9721'|'owon'|'owon-hds'|'metex'
  async connect(baudRate = null, protocol = 'auto') {
    if (!this.isSupported()) {
      this._emit('error', 'Web Serial not supported. Use Chrome or Edge.');
      return false;
    }

    this._resetSCPISession();
    this._protocol = protocol;
    this._detectedProtocol = protocol !== 'auto' ? protocol : null;

    // Baud rate: explicit arg > protocol default > 2400
    const baud = baudRate || Multimeter.PROTOCOLS[protocol]?.baud || 2400;

    try {
      this.port = await navigator.serial.requestPort();
    } catch (err) {
      if (err.name === 'NotFoundError') return false;
      this._emit('error', 'Port selection failed: ' + err.message);
      return false;
    }
    const openOpts = { baudRate: baud, dataBits: 8, stopBits: 1, parity: 'none' };
    const isLinux = /Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent);
    try {
      try {
        await this.port.open(openOpts);
      } catch (err) {
        // ModemManager probes every newly plugged tty with AT commands for a
        // few seconds; on Linux the first open can lose that race. One retry
        // after the probe window usually wins.
        if (!isLinux || err.name === 'InvalidStateError') throw err;
        this._emit('status', 'Port busy — retrying in 3 s (ModemManager probe?)');
        await new Promise(r => setTimeout(r, 3000));
        await this.port.open(openOpts);
      }
      this.connected = true;
      this._emit('status', 'Connected — protocol: ' + (this._detectedProtocol || 'detecting…'));
      this._startReading();
      if (this._detectedProtocol === 'owon-hds') {
        this._initSCPISession();
      } else if (this._protocol === 'auto') {
        // SCPI meters are silent until addressed — probe after streaming
        // protocols have had a chance to be detected passively.
        this._scpiProbeTimer = setTimeout(() => this._probeSCPI(), 1800);
      }
      return true;
    } catch (err) {
      this.port = null;
      if (err.name === 'InvalidStateError') {
        this._emit('error', 'Port already open — close other apps using this port');
      } else {
        let msg = 'Failed to open port: ' + err.message;
        if (isLinux) {
          msg += ' — Linux checklist: ' +
            '(1) serial port permission: sudo usermod -aG dialout $USER, then log out/in · ' +
            '(2) keep ModemManager off the meter: create /etc/udev/rules.d/99-boardscope-meter.rules with ' +
            'SUBSYSTEM=="tty", ATTRS{idVendor}=="5345", ATTRS{idProduct}=="1234", ENV{ID_MM_DEVICE_IGNORE}="1" ' +
            '(OWON HDS USB IDs — adjust for other meters), then ' +
            'sudo udevadm control --reload-rules && sudo udevadm trigger';
        }
        this._emit('error', msg);
      }
      return false;
    }
  }

  async disconnect() {
    this._running = false;
    this._resetSCPISession();
    if (this.reader) {
      try { await this.reader.cancel(); } catch (_) { }
      try { await this.reader.releaseLock(); } catch (_) { }
      this.reader = null;
    }
    if (this._writer) {
      try { await this._writer.releaseLock(); } catch (_) { }
      this._writer = null;
    }
    if (this.port) {
      try { await this.port.close(); } catch (_) { }
      this.port = null;
    }
    this.connected = false;
    this._stableReading = null;
    this._history = [];
    this._resetStats();
    this._hold = false;
    this._heldReading = null;
    this._relative = false;
    this._relativeRef = null;
    this._trendHistory = [];
    this._readingLog = [];
    this._emit('status', 'Disconnected');
  }

  async _startReading() {
    this._running = true;
    this._buffer = [];
    this._readingCount = 0;
    if (this._readingTimer) clearInterval(this._readingTimer);
    this._readingTimer = setInterval(() => {
      this._readingsPerSecond = this._readingCount;
      this._readingCount = 0;
    }, 1000);

    while (this._running && this.port && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        while (this._running) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            for (let i = 0; i < value.length; i++) {
              this._buffer.push(value[i]);
            }
            this._processBuffer();
          }
        }
      } catch (err) {
        if (this._running && this._detectedProtocol !== 'owon-hds') {
          this._emit('error', 'Read error: ' + err.message);
        }
      } finally {
        try { this.reader.releaseLock(); } catch (_) { }
        this.reader = null;
      }
    }
    if (this._readingTimer) clearInterval(this._readingTimer);

    // OWON HDS firmware tears its USB port down when the serial line goes idle
    // (or when something like ModemManager pokes it). Try to get it back.
    if (this._running && this._detectedProtocol === 'owon-hds') {
      this._tryReconnectHDS();
    }
  }

  _processBuffer() {
    // Prevent unbounded buffer growth on malformed data
    if (this._buffer.length > 1024) {
      this._buffer = this._buffer.slice(-56); // Keep only last 4 frames
    }

    const proto = this._detectedProtocol || this._protocol;

    // Auto-detect: try to identify protocol from buffered bytes
    if (proto === 'auto' && this._buffer.length >= 11) {
      if (this._tryDetectProtocol()) return; // re-enters with detected protocol
    }

    if (proto === 'owon') { this._processBufferOWON(); return; }
    if (proto === 'owon-hds') { this._processBufferSCPI(); return; }
    if (proto === 'metex') { this._processBufferMetex(); return; }

    // Default / fs9721
    while (this._buffer.length >= 14) {
      let startIdx = -1;
      for (let i = 0; i < this._buffer.length - 13; i++) {
        if (this._buffer[i] <= 0x0F) {
          const frame = this._buffer.slice(i, i + 14);
          if (this._validateFrame(frame)) {
            startIdx = i;
            break;
          }
        }
      }
      if (startIdx < 0) {
        this._buffer = this._buffer.slice(-28);
        return;
      }
      if (startIdx > 0) this._buffer = this._buffer.slice(startIdx);
      const frame = this._buffer.slice(0, 14);
      this._buffer = this._buffer.slice(14);
      const reading = this._parseFS9721(frame);
      if (reading) this._dispatchReading(this._applyCalibration(reading));
    }
  }

  _validateFrame(frame) {
    if (frame.length !== 14) return false;
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += frame[i];
    return (sum & 0x0F) === frame[13];
  }

  /* ── Protocol Auto-Detection ───────────────────────────────────── */

  _tryDetectProtocol() {
    const buf = this._buffer;

    // OWON HDS SCPI: device is silent until addressed, so only its response
    // to our '*IDN?' probe shows up — ASCII text, no binary frame structure.
    // An id string containing owon/hds is decisive on any line ending; a bare
    // value line must be LF-terminated so a CR-only Metex reply can't match.
    if (this._probeSentAt && Date.now() - this._probeSentAt < 6000 && this._detectedProtocol !== 'owon-hds') {
      const text = this._decodeASCII(buf);
      const idn = /owon|hds|ho5|scp/i.test(text);
      if (idn || (text.includes('\n') && /^[A-Za-z]{0,4}=?\s*[+-]?(?:\d+\.?\d*|\.\d+)/.test(text.trim()))) {
        this._detectedProtocol = 'owon-hds';
        this._emit('protocol', 'owon-hds');
        const model = (text.toUpperCase().match(/H[A-Z0-9]{3,6}/) || [])[0];
        this._emit('status', 'Protocol: OWON HDS SCPI' + (model ? ' — ' + model : ''));
        this._buffer = [];
        this._initSCPISession();
        return true;
      }
    }

    // OWON: frames start with 0xAB or 0xAC, end with 0x0D, 11 bytes
    for (let i = 0; i < buf.length - 10; i++) {
      if ((buf[i] === 0xAB || buf[i] === 0xAC) && buf[i + 10] === 0x0D) {
        const frame = buf.slice(i, i + 11);
        const r = this._parseOWON(frame);
        if (r) {
          this._detectedProtocol = 'owon';
          this._emit('protocol', 'owon');
          this._emit('status', 'Protocol: OWON');
          this._buffer = buf.slice(i);
          this._processBufferOWON();
          return true;
        }
      }
    }

    // Metex: 14-byte ASCII frame ending with 0x0D, starts with mode letter
    for (let i = 0; i < buf.length - 13; i++) {
      if (buf[i + 13] === 0x0D && buf[i] >= 0x20 && buf[i] < 0x7F) {
        const frame = buf.slice(i, i + 14);
        const r = this._parseMetex(frame);
        if (r) {
          this._detectedProtocol = 'metex';
          this._emit('protocol', 'metex');
          this._emit('status', 'Protocol: Metex');
          this._buffer = buf.slice(i);
          this._processBufferMetex();
          return true;
        }
      }
    }

    // FS9721: 14-byte binary frames with checksum
    for (let i = 0; i < buf.length - 13; i++) {
      if (buf[i] <= 0x0F) {
        const frame = buf.slice(i, i + 14);
        if (this._validateFrame(frame)) {
          this._detectedProtocol = 'fs9721';
          this._emit('protocol', 'fs9721');
          this._emit('status', 'Protocol: FS9721 (UNI-T / Mastech / Lilliput)');
          this._buffer = buf.slice(i);
          // fall through to normal FS9721 path
          return false;
        }
      }
    }

    // Keep accumulating, discard very old bytes
    if (this._buffer.length > 256) this._buffer = this._buffer.slice(-64);
    return false;
  }

  /* ── OWON Protocol Parser ──────────────────────────────────────── */
  // 11-byte frame: [0xAB|0xAC] [mode] [range] [d3] [d2] [d1] [d0] [sign] [flags] [0x00] [0x0D]

  _processBufferOWON() {
    while (this._buffer.length >= 11) {
      let startIdx = -1;
      for (let i = 0; i < this._buffer.length - 10; i++) {
        if ((this._buffer[i] === 0xAB || this._buffer[i] === 0xAC) && this._buffer[i + 10] === 0x0D) {
          startIdx = i; break;
        }
      }
      if (startIdx < 0) { this._buffer = this._buffer.slice(-22); return; }
      if (startIdx > 0) this._buffer = this._buffer.slice(startIdx);
      const frame = this._buffer.slice(0, 11);
      this._buffer = this._buffer.slice(11);
      const reading = this._parseOWON(frame);
      if (reading) this._dispatchReading(this._applyCalibration(reading));
    }
  }

  _parseOWON(frame) {
    if (frame.length !== 11) return null;
    if (frame[10] !== 0x0D) return null;

    const modeRaw = frame[1];
    const rangeRaw = frame[2];

    // Digits: 4 BCD bytes, each byte = two decimal digits
    let intVal = 0;
    for (let i = 3; i <= 6; i++) {
      const hi = (frame[i] >> 4) & 0x0F;
      const lo = frame[i] & 0x0F;
      if (hi > 9 || lo > 9) return null;
      intVal = intVal * 100 + hi * 10 + lo;
    }

    const negative = (frame[7] & 0x08) !== 0;
    const overload = (frame[7] & 0x01) !== 0;
    const dp = rangeRaw & 0x07; // decimal places (0-4)

    let value = overload ? Infinity : intVal / Math.pow(10, dp);
    if (negative && !overload) value = -value;

    const MODE_MAP = {
      0x00: 'DCV', 0x01: 'ACV', 0x02: 'DCA', 0x03: 'ACA',
      0x04: 'OHM', 0x05: 'DIODE', 0x06: 'CONT', 0x07: 'CAP',
      0x08: 'FREQ', 0x09: 'DUTY', 0x0A: 'TEMP', 0x0B: 'mV',
      0x0C: 'mA',
    };
    const UNIT_MAP = {
      'DCV': 'V', 'ACV': 'V', 'mV': 'mV',
      'DCA': 'A', 'ACA': 'A', 'mA': 'mA',
      'OHM': 'Ω', 'DIODE': 'V', 'CONT': 'Ω',
      'CAP': 'F', 'FREQ': 'Hz', 'DUTY': '%', 'TEMP': '°C',
    };
    const mode = MODE_MAP[modeRaw] || 'DCV';
    const unit = UNIT_MAP[mode] || '';

    return {
      value, mode, unit, ol: overload, negative,
      timestamp: Date.now(), stable: false,
      display: overload ? 'OL' : this._formatDisplay(value, unit, mode),
      protocol: 'owon',
    };
  }

  /* ── OWON HDS SCPI Protocol (HDS200 series: HDS242, HO5xS, …) ──── */
  // USB ID 5345:1234, ASCII SCPI lines over USB serial. The device sends
  // nothing on its own — every reading must be polled with ':READ?'.
  // Session per OWON's HDS200 DMM SCPI document:
  //   *IDN?            → "OWON,HDS242,26190843,V8.5.0"
  //   :SCPI:DISP?      → "scpion"  (activates DMM SCPI; meter must be in DMM mode)
  //   :READ? (poll)    → "V=28.00mV" / "F=60.96kHz" / "R=4.7kΩ" / "OL" / "3.28"

  _resetSCPISession() {
    if (this._scpiPollTimer) { clearInterval(this._scpiPollTimer); this._scpiPollTimer = null; }
    if (this._scpiProbeTimer) { clearTimeout(this._scpiProbeTimer); this._scpiProbeTimer = null; }
    if (this._scpiPending) { const p = this._scpiPending; this._scpiPending = null; p.resolve(null); }
    this._scpiProbeCount = 0;
    this._probeSentAt = 0;
    this._scpiBusy = false;
    this._scpiFails = 0;
    this._scpiHintShown = false;
  }

  _decodeASCII(bytes) {
    try {
      return new TextDecoder().decode(Uint8Array.from(bytes));
    } catch (_) {
      return String.fromCharCode(...bytes);
    }
  }

  async _writeSCPI(cmd) {
    try {
      if (!this.port || !this.port.writable) return false;
      if (!this._writer) this._writer = this.port.writable.getWriter();
      await this._writer.write(new TextEncoder().encode(cmd + '\n'));
      return true;
    } catch (_) {
      this._writer = null; // writer lock dies with the port — recreate on reconnect
      return false;
    }
  }

  async _querySCPI(cmd, timeout = 800) {
    if (this._scpiPending) return null; // previous response still outstanding
    const sent = await this._writeSCPI(cmd);
    if (!sent) return null;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._scpiPending = null;
        resolve(null);
      }, timeout);
      this._scpiPending = {
        resolve: (v) => { clearTimeout(timer); this._scpiPending = null; resolve(v); },
      };
    });
  }

  // Auto-detect probe: SCPI meters stay silent, so after the streaming
  // protocols had their passive window we ask for an id string.
  async _probeSCPI() {
    this._scpiProbeTimer = null;
    if (this._detectedProtocol || !this._running || !this.port) return;
    this._scpiProbeCount++;
    this._probeSentAt = Date.now();
    await this._writeSCPI('*IDN?');
    // The response is matched against this window in _tryDetectProtocol()
    if (this._scpiProbeCount < 5 && !this._detectedProtocol) {
      this._scpiProbeTimer = setTimeout(() => this._probeSCPI(), 3000);
    }
  }

  _initSCPISession() {
    if (this._scpiPollTimer) clearInterval(this._scpiPollTimer);
    this._emit('status', 'OWON HDS — activating DMM SCPI mode');
    (async () => {
      await this._querySCPI(':SCPI:DISP?', 600); // activates DMM SCPI; reply "scpion"
      await new Promise(r => setTimeout(r, 400));
      if (!this._running || this._detectedProtocol !== 'owon-hds' || !this.port) return;
      this._scpiPollTimer = setInterval(() => this._pollREAD(), 500);
      this._pollREAD();
    })();
  }

  async _pollREAD() {
    if (this._scpiBusy || !this._running || !this.port) return;
    this._scpiBusy = true;
    try {
      const line = await this._querySCPI(':READ?', 800);
      const reading = line !== null ? this._parseOWONHDS(line) : null;
      if (reading) {
        this._scpiFails = 0;
        this._dispatchReading(this._applyCalibration(reading));
      } else {
        this._scpiFails++;
        if (this._scpiFails === 6 && !this._scpiHintShown) {
          this._scpiHintShown = true;
          this._emit('status', 'No DMM data — press Mode on the HDS until it shows the Multimeter screen');
        }
      }
    } finally {
      this._scpiBusy = false;
    }
  }

  // The firmware drops the USB serial port on idle — recover by re-opening
  // the (re-enumerated) OWON device without bothering the user again.
  async _tryReconnectHDS() {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      if (!this._running) return;
      try {
        const ports = await navigator.serial.getPorts();
        const owon = ports.find(p => {
          const info = (p.getInfo && p.getInfo()) || {};
          return info.usbVendorId === Multimeter.OWON_USB.vendorId &&
                 info.usbProductId === Multimeter.OWON_USB.productId;
        });
        if (!owon) continue;
        await owon.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
        this.port = owon;
        this._writer = null;
        this._buffer = [];
        this._emit('status', 'OWON HDS reconnected (attempt ' + attempt + ')');
        this._startReading();
        this._initSCPISession();
        return;
      } catch (_) { /* device not back yet — keep trying */ }
    }
    if (this._running) {
      this.connected = false;
      this._emit('error', 'OWON HDS connection lost — unplug/replug the meter, then CONNECT again. ' +
        'On Linux, if this keeps happening, tell ModemManager to leave the port alone ' +
        '(udev rule with ID_MM_DEVICE_IGNORE=1 for 5345:1234).');
    }
  }

  _processBufferSCPI() {
    while (true) {
      const buf = this._buffer;
      let idx = -1;
      for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0A || buf[i] === 0x0D) { idx = i; break; }
      }
      if (idx < 0) return; // no complete line yet
      const lineBytes = buf.slice(0, idx);
      this._buffer = buf.slice(idx + 1);
      if (lineBytes.length) this._handleSCPILine(this._decodeASCII(lineBytes));
    }
  }

  _handleSCPILine(line) {
    const s = line.trim();
    if (!s) return;
    if (this._scpiPending) {
      const p = this._scpiPending;
      this._scpiPending = null;
      p.resolve(s);
      return;
    }
    // Unsolicited line (e.g. a late ':SCPI:DISP?' reply) — parse if it's a reading
    const r = this._parseOWONHDS(s);
    if (r) this._dispatchReading(this._applyCalibration(r));
  }

  // Parse ':READ?' responses: "[label=][sign]number[prefix]unit"
  // e.g. "V=28.00mV" → 0.028 V DCV · "R=4.700kΩ" → 4700 Ω · "I=10.5uA" → 1.05e-5 A
  _parseOWONHDS(s) {
    if (!s) return null;
    // 'Ω'/'µ' as raw UTF-8 bytes surviving a non-decoder path ("Î©"/"Âµ")
    const str = s.trim().replace(/Î©/g, 'Ω').replace(/Âµ/g, 'µ');

    // Overload — keep the last known function so UI/stats stay consistent
    if (!/\d/.test(str) && /ol/i.test(str)) {
      const mode = this._lastSCPIMode || 'DCV';
      this._lastSCPIMode = mode;
      return {
        value: Infinity, mode, unit: this._scpiUnitFor(mode), ol: true, negative: false,
        timestamp: Date.now(), stable: false, display: 'OL', protocol: 'owon-hds',
      };
    }

    let label = '';
    let rest = str;
    const eq = str.indexOf('=');
    if (eq > 0 && eq <= 5) {
      label = str.slice(0, eq).trim().toLowerCase();
      rest = str.slice(eq + 1).trim();
    }

    const m = rest.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([A-Za-zμµ°%Ω]*)/);
    if (!m) return null;
    let value = parseFloat(m[1]);
    if (isNaN(value)) return null;

    // SI prefix + unit decomposition (case matters: mV milli vs MΩ mega)
    const PREFIX = { k: 1e3, K: 1e3, m: 1e-3, M: 1e6, u: 1e-6, µ: 1e-6, μ: 1e-6, n: 1e-9, p: 1e-12, G: 1e9 };
    let unit = m[2] || '';
    if (unit.length >= 2 && PREFIX[unit[0]] !== undefined) {
      const u = unit.slice(1);
      if (/^(V|A|F|Hz|HZ|H[zZ]|ohm|OHM|Ohm|Ω)$/i.test(u)) {
        value *= PREFIX[unit[0]];
        unit = u;
      }
    }
    unit = unit.replace(/ohm/i, 'Ω').replace(/^H[Zz]$/, 'Hz');

    const l = label;
    const isDiode = /^d(io)?$/.test(l);
    let mode;
    if (unit === 'Ω') mode = /bee|con/.test(l) ? 'CONT' : (isDiode ? 'DIODE' : 'OHM');
    else if (unit === 'V') mode = /ac|^va$/.test(l) ? 'ACV' : (isDiode ? 'DIODE' : 'DCV');
    else if (unit === 'A') mode = /ac|^ia$|^aa$/.test(l) ? 'ACA' : 'DCA';
    else if (unit === 'F') mode = 'CAP';
    else if (unit === 'Hz') mode = 'FREQ';
    else if (unit === '°C' || unit === 'C') mode = 'TEMP';
    else if (unit === '%') mode = 'DUTY';
    else mode = this._lastSCPIMode || 'DCV'; // bare number — function unchanged
    this._lastSCPIMode = mode;

    const outUnit = this._scpiUnitFor(mode);
    const negative = value < 0;
    return {
      value, mode, unit: outUnit, ol: false, negative,
      timestamp: Date.now(), stable: false,
      display: this._formatSI(value, outUnit),
      protocol: 'owon-hds',
    };
  }

  _scpiUnitFor(mode) {
    const UNIT_MAP = {
      'DCV': 'V', 'ACV': 'V', 'mV': 'mV',
      'DCA': 'A', 'ACA': 'A', 'mA': 'mA', 'uA': 'uA',
      'OHM': 'Ω', 'DIODE': 'V', 'CONT': 'Ω',
      'CAP': 'F', 'FREQ': 'Hz', 'DUTY': '%', 'TEMP': '°C',
    };
    return UNIT_MAP[mode] || '';
  }

  // SI-prefixed display ("28.0 mV", "4.70 kΩ", "225 nF") — the HDS spans
  // pF…MΩ and _formatDisplay's fixed decimals would swallow the small ends.
  _formatSI(value, unit) {
    if (!isFinite(value)) return 'OL';
    if (unit === '°C' || unit === '%') {
      const str = value.toFixed(1).replace(/\.0$/, '');
      return str + ' ' + unit;
    }
    const abs = Math.abs(value);
    if (abs === 0) return '0 ' + unit;
    const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'u'], [1e-9, 'n'], [1e-12, 'p']];
    let scale = 1, prefix = '';
    for (const [s, p] of steps) {
      if (abs >= s) { scale = s; prefix = p; break; }
    }
    let str = (value / scale).toPrecision(4);
    if (str.includes('.') && !str.includes('e')) str = str.replace(/\.?0+$/, '');
    return str + ' ' + prefix + unit;
  }

  /* ── Metex Protocol Parser ─────────────────────────────────────── */
  // 14-byte ASCII frame: [4 mode chars][4 digit chars][2 range chars][2 unit chars][CR+LF or CR]
  // Used by: Metex M-3860M, Voltcraft M-3860, Conrad ME-32

  _processBufferMetex() {
    while (this._buffer.length >= 14) {
      let startIdx = -1;
      for (let i = 0; i < this._buffer.length - 13; i++) {
        if (this._buffer[i + 13] === 0x0D) { startIdx = i; break; }
      }
      if (startIdx < 0) { this._buffer = this._buffer.slice(-28); return; }
      if (startIdx > 0) this._buffer = this._buffer.slice(startIdx);
      const frame = this._buffer.slice(0, 14);
      this._buffer = this._buffer.slice(14);
      const reading = this._parseMetex(frame);
      if (reading) this._dispatchReading(this._applyCalibration(reading));
    }
  }

  _parseMetex(frame) {
    if (frame.length !== 14 || frame[13] !== 0x0D) return null;
    try {
      // Metex frames are pure printable ASCII — reject anything else so SCPI
      // text (e.g. an "OWON,HDS242,…" id string) can't be misread as a frame
      for (let i = 0; i < 13; i++) {
        if (frame[i] < 0x20 || frame[i] > 0x7E) return null;
      }
      const str = String.fromCharCode(...frame.slice(0, 13)).trim();
      // Format: "MODE NNNNNUNIT" e.g. "DCV  1.234 V  "
      const modeStr = str.slice(0, 4).trim();
      const valStr = str.slice(4, 9).trim();
      const unitStr = str.slice(9, 13).trim();

      const MODE_MAP = {
        'DCV': 'DCV', 'ACV': 'ACV', 'DCM': 'DCA', 'ACM': 'ACA',
        'OHM': 'OHM', 'DIO': 'DIODE', 'CAP': 'CAP', 'FRQ': 'FREQ',
        'mV': 'mV', 'mA': 'mA', 'uA': 'uA',
      };
      if (!MODE_MAP[modeStr]) return null;
      const mode = MODE_MAP[modeStr];
      const ol = valStr === 'OL' || valStr === ' OL ';
      const value = ol ? Infinity : parseFloat(valStr);
      if (!ol && isNaN(value)) return null;

      return {
        value, mode, unit: unitStr, ol, negative: value < 0,
        timestamp: Date.now(), stable: false,
        display: ol ? 'OL' : this._formatDisplay(value, unitStr, mode),
        protocol: 'metex',
      };
    } catch (_) { return null; }
  }

  /* ── Shared Reading Dispatch ───────────────────────────────────── */
  // All protocol parsers funnel through here (same as existing FS9721 path)

  _dispatchReading(calibrated) {
    if (this._hold) {
      this._readingCount++;
      this._emit('reading', this._heldReading || calibrated);
      return;
    }
    if (this._relative && this._relativeRef !== null) {
      // Create a copy before modifying to avoid mutating the original reading
      calibrated = { ...calibrated };
      calibrated.value -= this._relativeRef;
      calibrated.display = this._formatDisplay(calibrated.value, calibrated.unit, calibrated.mode);
      calibrated.relative = true;
    }
    this._lastReading = calibrated;
    this._readingCount++;
    this._updateStats(calibrated);
    this._trendHistory.push({ value: calibrated.value, mode: calibrated.mode, timestamp: calibrated.timestamp });
    if (this._trendHistory.length > this._maxTrendHistory) this._trendHistory.shift();
    this._readingLog.push(calibrated);
    if (this._readingLog.length > this._maxReadingLog) this._readingLog.shift();
    this._emit('reading', calibrated);
    this._updateStable(calibrated);
  }

  /* ── Stable Reading Detection (Debounce) ───────────────────────── */

  _updateStable(reading) {
    const now = Date.now();
    this._history.push(reading);
    if (this._history.length > this._maxHistory) this._history.shift();

    const isSameMode = reading.mode === this._lastStableMode;
    const isSameValue = this._lastStableValue !== null &&
      Math.abs(reading.value - this._lastStableValue) <=
      Math.abs(this._lastStableValue) * this._stableTolerance + 0.001;

    if (isSameMode && isSameValue) {
      if (!this._stableStart) this._stableStart = now;
      const elapsed = now - this._stableStart;
      if (elapsed >= this._stableWindow && !this._stableReading) {
        this._stableReading = { ...reading, stable: true };
        this._emit('stable', this._stableReading);
      }
    } else {
      this._stableStart = null;
      this._stableReading = null;
      this._lastStableValue = reading.value;
      this._lastStableMode = reading.mode;
    }
  }

  /* ── FS9721 Protocol Parser ────────────────────────────────────── */

  _parseFS9721(frame) {
    const flags1 = frame[5];
    const flags2 = frame[6];
    const mode = this._decodeMode(flags1, flags2);
    if (!mode) return null;

    const digits = this._decodeDigits(frame);
    if (digits === null) return null;

    const dp = this._decodeDecimalPoint(frame);
    const value = digits * Math.pow(10, dp);

    const negative = (flags1 & 0x08) !== 0;
    const signedValue = negative ? -value : value;
    const unit = this._decodeUnit(flags1, flags2);

    return {
      value: signedValue,
      display: this._formatDisplay(signedValue, unit, mode),
      unit,
      mode,
      negative,
      ol: digits >= 40000,
      timestamp: Date.now(),
      stable: false,
    };
  }

  _decodeDigits(frame) {
    let value = 0;
    let multiplier = 1;
    for (let i = 4; i >= 1; i--) {
      const digit = frame[i] & 0x0F;
      if (digit > 9) return null;
      value += digit * multiplier;
      multiplier *= 10;
    }
    const tenK = (frame[1] >> 4) & 0x01;
    if (tenK) value += 10000;
    return value;
  }

  _decodeDecimalPoint(frame) {
    // FS9721: DP indicated by bit 4 (0x10) in high nibble of digit bytes
    // Byte 1: 0x10 = DP at 1000s (no decimal)
    // Byte 2: 0x10 = DP at 100s (x.xxx)
    // Byte 3: 0x10 = DP at 10s (xx.xx)
    // Byte 4: 0x10 = DP at 1s (xxx.x)
    for (let i = 1; i <= 4; i++) {
      if ((frame[i] & 0x10) !== 0) {
        return -(4 - i);
      }
    }
    return 0;
  }

  _decodeMode(flags1, flags2) {
    const f = (flags1 & 0xF0) >> 4;
    const modeMap = {
      0x0: 'DCV', 0x1: 'ACV', 0x2: 'mV',
      0x3: 'DCA', 0x4: 'ACA', 0x5: 'mA', 0x6: 'uA',
      0x8: 'OHM', 0x9: 'DIODE', 0xA: 'CONT',
      0xB: 'CAP', 0xC: 'FREQ', 0xD: 'DUTY', 0xE: 'TEMP',
    };
    return modeMap[f] || 'DCV';
  }

  _decodeUnit(flags1, flags2) {
    const mode = this._decodeMode(flags1, flags2);
    const unitMap = {
      'DCV': 'V', 'ACV': 'V', 'mV': 'mV',
      'DCA': 'A', 'ACA': 'A', 'mA': 'mA', 'uA': 'uA',
      'OHM': 'Ω', 'DIODE': 'V', 'CONT': 'Ω',
      'CAP': 'F', 'FREQ': 'Hz', 'DUTY': '%', 'TEMP': '°C',
    };
    return unitMap[mode] || '';
  }

  _formatDisplay(value, unit, mode) {
    if (value >= 40000) return 'OL';
    let str;
    if (Math.abs(value) >= 10000) str = value.toFixed(0);
    else if (Math.abs(value) >= 1000) str = value.toFixed(1);
    else if (Math.abs(value) >= 100) str = value.toFixed(2);
    else if (Math.abs(value) >= 10) str = value.toFixed(3);
    else str = value.toFixed(4);
    if (str.includes('.')) str = str.replace(/\.?0+$/, '');
    return str + ' ' + unit;
  }

  /* ── Getters ───────────────────────────────────────────────────── */

  getLastReading() { return this._lastReading; }
  getStableReading() { return this._stableReading; }
  getReadingsPerSecond() { return this._readingsPerSecond; }
  getHistory() { return [...this._history]; }

  setStableWindow(ms) { this._stableWindow = ms; }
  setStableTolerance(pct) { this._stableTolerance = pct; }

  /* ── Phase 2.1: Min/Max/Avg Statistics ─────────────────────────── */

  _updateStats(reading) {
    if (reading.mode !== this._statsMode || reading.ol) {
      this._resetStats();
      this._statsMode = reading.mode;
    }
    if (reading.ol) return;
    const v = reading.value;
    if (this._minValue === null || v < this._minValue) this._minValue = v;
    if (this._maxValue === null || v > this._maxValue) this._maxValue = v;
    this._sumValue += v;
    this._countValue++;
    this._avgValue = this._sumValue / this._countValue;
  }

  _resetStats() {
    this._minValue = null;
    this._maxValue = null;
    this._sumValue = 0;
    this._countValue = 0;
    this._avgValue = 0;
    this._statsMode = null;
  }

  getStats() {
    return {
      min: this._minValue,
      max: this._maxValue,
      avg: this._avgValue,
      count: this._countValue,
      mode: this._statsMode,
    };
  }

  /* ── Phase 2.1: Hold Mode ──────────────────────────────────────── */

  isHeld() { return this._hold; }
  getHeldReading() { return this._heldReading; }

  toggleHold() {
    this._hold = !this._hold;
    if (this._hold) {
      this._heldReading = this._lastReading ? { ...this._lastReading } : null;
      this._emit('hold', this._heldReading);
    } else {
      this._heldReading = null;
      this._emit('hold', null);
    }
    return this._hold;
  }

  /* ── Phase 2.1: Relative Mode (Δ) ──────────────────────────────── */

  isRelative() { return this._relative; }
  getRelativeRef() { return this._relativeRef; }

  toggleRelative() {
    this._relative = !this._relative;
    if (this._relative) {
      this._relativeRef = this._lastReading ? this._lastReading.value : 0;
    } else {
      this._relativeRef = null;
    }
    this._emit('relative', this._relative);
    return this._relative;
  }

  setRelativeRef(value) {
    this._relativeRef = value;
    this._relative = true;
    this._emit('relative', true);
  }

  /* ── Phase 2.1: Trend History ──────────────────────────────────── */

  getTrendHistory() { return [...this._trendHistory]; }

  /* ── Phase 2.2: Calibration ────────────────────────────────────── */

  setCalibration(mode, offset) {
    this._calibration[mode] = offset;
  }

  getCalibration(mode) {
    return this._calibration[mode] || 0;
  }

  _applyCalibration(reading) {
    const offset = this._calibration[reading.mode] || 0;
    if (offset !== 0 && !reading.ol) {
      reading.value += offset;
      reading.display = this._formatDisplay(reading.value, reading.unit, reading.mode);
      reading.calibrated = true;
    }
    return reading;
  }

  /* ── Phase 2.3: Reading Log & Export ───────────────────────────── */

  getReadingLog() { return [...this._readingLog]; }

  exportCSV() {
    const header = 'Timestamp,Value,Display,Unit,Mode,Negative,OL,Stable\n';
    const rows = this._readingLog.map(r =>
      `${r.timestamp},${r.value},"${(r.display || '').replace(/"/g, '""')}",${r.unit},${r.mode},${r.negative},${r.ol},${r.stable}`
    ).join('\n');
    return header + rows;
  }

  downloadCSV(filename = 'multimeter_readings.csv') {
    const csv = this.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  clearReadingLog() {
    this._readingLog = [];
  }

  /* ── Phase 3.1: Voltage Rail Detection ─────────────────────────── */

  detectVoltageRail(value) {
    if (value === null || value === undefined) return null;
    const v = Math.abs(value);
    let bestMatch = null;
    let bestDiff = Infinity;
    for (const rail of this._voltageRails) {
      const diff = Math.abs(v - rail.expected);
      if (diff <= rail.tolerance && diff < bestDiff) {
        bestMatch = rail;
        bestDiff = diff;
      }
    }
    this._detectedRail = bestMatch;
    return bestMatch;
  }

  getDetectedRail() { return this._detectedRail; }

  getVoltageRails() { return [...this._voltageRails]; }

  /* ── Phase 4.1: Diode Reference Database ───────────────────────── */

  getDiodeStatus(value) {
    if (value === null || value === undefined) return { status: 'unknown' };
    const v = Math.abs(value);

    // Check for short
    if (v < this._shortThreshold) {
      return { status: 'SHORT', severity: 'critical', color: '#ff0000', value: v };
    }

    // Check for open
    if (v > this._openThreshold) {
      return { status: 'OPEN', severity: 'warning', color: '#ff8800', value: v };
    }

    // Find matching reference
    let bestMatch = null;
    let bestDiff = Infinity;
    for (const [name, ref] of Object.entries(this._diodeRefs)) {
      if (name === 'DEFAULT') continue;
      const [min, max] = ref.range;
      if (v >= min && v <= max) {
        const diff = Math.abs(v - ref.expected);
        if (diff < bestDiff) {
          bestMatch = { name, ...ref };
          bestDiff = diff;
        }
      }
    }

    if (bestMatch) {
      const deviation = ((v - bestMatch.expected) / bestMatch.expected) * 100;
      return {
        status: 'NORMAL',
        severity: 'ok',
        color: '#44cc66',
        value: v,
        reference: bestMatch.name,
        expected: bestMatch.expected,
        deviation: deviation,
      };
    }

    // Within normal range but no specific match
    const def = this._diodeRefs['DEFAULT'];
    const [dMin, dMax] = def.range;
    if (v >= dMin && v <= dMax) {
      return { status: 'NORMAL', severity: 'ok', color: '#44cc66', value: v };
    }

    return { status: 'UNKNOWN', severity: 'info', color: '#888888', value: v };
  }

  getDiodeRefs() { return { ...this._diodeRefs }; }

  setShortThreshold(v) { this._shortThreshold = v; }

  setOpenThreshold(v) { this._openThreshold = v; }

  addDiodeRef(name, expected, range) {
    this._diodeRefs[name] = { expected, range };
  }
}

// Export for use in boardview.html
if (typeof window !== 'undefined') {
  window.Multimeter = Multimeter;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Multimeter };
}
