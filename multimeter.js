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
 *              Raw USB bulk device (OUT 0x01, IN 0x81) — NOT a CDC serial
 *              port. Reached via WebUSB when available (works on stock
 *              Linux; the .deb ships the udev uaccess rule), falling back
 *              to Web Serial where the OS has a serial driver bound.
 *              Session: '*IDN?' → ':SCPI:DISP?' (activates DMM SCPI) → poll
 *              ':READ?' (some firmware only answers ':DMM:MEAS?' — probed
 *              automatically). Responses are ASCII lines: 'V=28.00mV',
 *              'F=60.96kHz', 'R=4.7kΩ', 'OL', or bare scientific notation
 *              ('5.02E-5', base units, keeps last mode).
 *              The meter must be in Multimeter mode on its front panel.
 *              Firmware drops the USB link when idle, so the driver keeps
 *              a 500 ms poll running and auto-reconnects (matching VID:PID)
 *              if the link is torn down.
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

    // OWON HDS transport: 'serial' (Web Serial) or 'usb' (WebUSB bulk).
    // The HDS200 family is a raw USB bulk device — it never enumerates as a
    // serial port on stock Linux, so Web Serial alone can't reach it there.
    this._transport = 'serial';
    this._usbDev = null;              // navigator.usb device when _transport === 'usb'
    this._scpiReadCmd = null;         // ':DMM:MEAS?' or ':READ?' — firmware-dependent
    this._scpiConfTicks = 0;          // mode-sync cadence on the ':DMM:MEAS?' dialect
    this._reconnecting = false;       // guards the HDS reconnect loop
    this._pollIntervalMs = 500;       // SCPI poll cadence — RATE presets in the meter window
    this._lastGoodPollAt = 0;         // timestamp of last successful poll reading
    this._scpiGarbage = 0;            // consecutive unparseable SCPI replies (dialect rotation)
    this._detectTimer = null;         // "connected but nothing answers" deadline (serial auto-detect)
    this._detectTimeoutMs = 16000;    // generous: the *IDN? probe itself runs ~15 s
    this._reconnectAttempts = 5;      // HDS reconnect loop (test-tunable)
    this._reconnectDelayMs = 2000;
    this._usbReadActive = false;      // persistent USB bulk-IN read loop
    this._handshakeFirstMs = 3000;    // first SCPI query after claim — V11 firmware needs ~3 s
    this._handshakeNextMs = 1200;     // subsequent handshake queries
    this._reconnectHandshakeFirstMs = 2000;  // reconnect probe budgets (device just re-enumerated)
    this._reconnectHandshakeNextMs = 800;
    this._debugLog = [];              // connection diagnostics ring buffer (LOG button copies it)
    this._dbgHadReading = false;      // "first reading" diagnostic logged this session

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

    // Self-healing: the HDS firmware tears its USB link down without notice
    // (idle, mode switch, auto-off sleep). Chromium re-enumerates the device
    // on replug, and these events fire — revive the session automatically
    // instead of asking the user to hit CONNECT again.
    if (typeof navigator !== 'undefined') {
      const owonReplug = () => {
        if (this._running && !this.connected && !this._reconnecting) this._tryReconnectHDS();
      };
      if (navigator.usb && navigator.usb.addEventListener) {
        navigator.usb.addEventListener('connect', (e) => {
          if (e.device && e.device.vendorId === Multimeter.OWON_USB.vendorId &&
            e.device.productId === Multimeter.OWON_USB.productId) owonReplug();
        });
      }
      if (navigator.serial && navigator.serial.addEventListener) {
        // Web Serial connect events carry no port — enumerate the granted
        // ports instead. Chromium's internal usbserial driver can omit the
        // USB IDs from getInfo(), so a lone granted port counts as ours.
        navigator.serial.addEventListener('connect', () => {
          navigator.serial.getPorts().then((ports) => {
            const hit = ports.find(p => {
              const info = (p.getInfo && p.getInfo()) || {};
              return info.usbVendorId === Multimeter.OWON_USB.vendorId &&
                info.usbProductId === Multimeter.OWON_USB.productId;
            });
            if (hit || ports.length === 1) owonReplug();
          }).catch(() => { });
        });
      }
    }
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

  /* ── Connection diagnostics ────────────────────────────────────── */
  // Every connect/reconnect/poll step lands here: renderer console, an IPC
  // bridge to the terminal (desktop), and a ring buffer the meter window's
  // LOG button copies to the clipboard. Beta testers can paste the trail
  // into a bug report without opening DevTools.
  _dbg(msg) {
    const line = new Date().toTimeString().slice(0, 8) + '.' +
      String(Date.now() % 1000).padStart(3, '0') + ' ' + msg;
    this._debugLog.push(line);
    if (this._debugLog.length > 100) this._debugLog.shift();
    try { console.log('[METER] ' + msg); } catch (_) { }
    try { this._emit('debug', msg); } catch (_) { }
  }

  getDebugLog() { return this._debugLog.slice(); }

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
    this._transport = 'serial'; // a prior session's give-up may have left 'usb' set
    this._dbg('CONNECT requested (protocol ' + protocol + ')');

    // Baud rate: explicit arg > protocol default > 2400
    const baud = baudRate || Multimeter.PROTOCOLS[protocol]?.baud || 2400;

    // In the desktop app, probe the OWON raw-USB transport before showing
    // any port picker: the HDS is a bulk device that never appears as a
    // serial port, so serial-first meant every CONNECT popped a wall of
    // unrelated system tty devices (keyboards, receivers, rfcomm junk) —
    // and picking one of those made the meter never connect, because the
    // WebUSB fallback only ran after a cancel. Electron's select-usb-device
    // handler resolves the filtered request silently; if nothing answers
    // SCPI (serial-only OWON gear shares the same VID:PID) we fall through
    // to the serial picker below. The web build keeps serial-first —
    // Chrome's chooser is filtered and most meters are serial there.
    const inDesktop = typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron;
    if (inDesktop && 'usb' in navigator && (protocol === 'auto' || protocol === 'owon-hds')) {
      if (await this._probeOWONUSB()) return true;
    }

    try {
      this.port = await navigator.serial.requestPort();
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // No serial port picked — user cancelled, or (the common Linux
        // case for OWON HDS gear) the device is raw USB bulk and never
        // appears as a serial port at all. Try WebUSB before giving up.
        if (await this._openOWONUSB()) return true;
        this._emit('status', 'No port selected — cancelled, or no serial / OWON USB device found');
        return false;
      }
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
        // Deadline for auto-detect: if the port stays silent (meter asleep
        // / auto-off, wrong port, wedged firmware) the read loop never
        // exits and the button showed DISCONNECT forever with no data and
        // no name (tester, v6.0.20). Fail loudly instead.
        this._detectTimer = setTimeout(() => {
          this._detectTimer = null;
          if (this._running && !this._detectedProtocol && !this._reconnecting) {
            this._dbg('detect deadline hit — port never answered');
            this._fullResetSession('No response from the meter — it may be asleep or powered off ' +
              '(check the meter\'s AUTO-OFF setting and press Mode until the Multimeter screen shows). ' +
              'Then CONNECT again.');
          }
        }, this._detectTimeoutMs);
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
    if (this._usbDev) {
      try { await this._usbDev.close(); } catch (_) { }
      this._usbDev = null;
    }
    this._transport = 'serial';
    this._reconnecting = false;
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

  /* ── OWON HDS over WebUSB (bulk) ────────────────────────────────
     The HDS200 series (HDS242, HO5xS, …) is a raw USB bulk device —
     OUT endpoint 0x01, IN endpoint 0x81 — not a CDC serial port. On a
     stock Linux (or any OS) install it never shows up in
     navigator.serial, so CONNECT could not reach it no matter what the
     picker did. WebUSB talks to the bulk endpoints directly; the deb's
     udev rule (uaccess for 5345:1234) already grants the logged-in user
     the device node. Endpoint/command map verified against a user's
     working pyusb implementation on Linux. */
  // Claim + SCPI-verify an OWON raw-USB device. Commits the transport only
  // when the meter answers the handshake; a silent device (asleep, wedged,
  // or the wrong unit behind the shared 5345:1234 VID:PID) is closed and
  // released immediately — holding the claim detaches the kernel usbserial
  // driver and hides the meter from the serial port picker (v6.0.20).
  // emitOpenErrors: the user-facing path reports claim failures, the
  // pre-probe path stays silent and falls through to the serial transport.
  async _claimOWONUSB(dev, emitOpenErrors = false) {
    try {
      await dev.open();
      if (!dev.configuration) await dev.selectConfiguration(1);
      await dev.claimInterface(0);
    } catch (err) {
      this._dbg('USB open/claim failed: ' + err.message);
      if (emitOpenErrors) {
        this._emit('error', 'OWON USB open failed: ' + err.message +
          (/Linux/.test(navigator.userAgent) && !/Android|CrOS/.test(navigator.userAgent)
            ? ' — if you previously bound usbserial to the meter, remove it: sudo modprobe -r usbserial'
            : ''));
      }
      return null;
    }
    this._usbDev = dev;
    this._transport = 'usb';
    this._buffer = [];
    this._running = true;
    // Route received lines straight into the SCPI assembler while the
    // handshake runs (reset when the handshake fails — the caller then
    // falls through to the serial transport).
    this._detectedProtocol = 'owon-hds';
    this._startUSBReadLoop();
    this._dbg('USB claimed (cfg 1, iface 0) — SCPI handshake…');
    if (!(await this._scpiHandshake())) {
      this._dbg('handshake failed — releasing the device');
      this._running = false;
      this._transport = 'serial';
      this._detectedProtocol = null;
      this._usbDev = null;
      try { await dev.close(); } catch (_) { }
      return null;
    }
    this._dbg('handshake OK — committing USB transport');
    return dev;
  }

  _finishOWONUSBConnect() {
    this.connected = true;
    this._detectedProtocol = 'owon-hds';
    this._startRateTimer();
    this._emit('status', 'Connected — OWON HDS over USB');
    this._initSCPISession();
  }

  async _openOWONUSB() {
    if (!('usb' in navigator)) return false;
    let dev;
    try {
      dev = await navigator.usb.requestDevice({ filters: [Multimeter.OWON_USB] });
      this._dbg('requestDevice granted: ' + (dev.productName || 'OWON device'));
    } catch (_) {
      this._dbg('requestDevice: no OWON USB device / user cancelled');
      return false; // no OWON USB device present, or user cancelled
    }
    if (!(await this._claimOWONUSB(dev, true))) return false;
    this._finishOWONUSBConnect();
    return true;
  }

  // SCPI liveness probe used before committing to a connection: the HDS
  // answers '*IDN?' (verified working over raw bulk USB on a V11.0.0 HDS242
  // by a tester running Lab1717/owon-hds-usb_streamer), ':SCPI:DISP?' when
  // it's on its DMM screen, otherwise one of the two read dialects.
  // Silence on all of them means the meter is asleep, powered off, or
  // wedged — the caller must NOT keep the device claimed.
  // The FIRST query gets the long window: a freshly-claimed meter can take
  // ~3 s to spin its SCPI engine up (pyusb reference uses 3000 ms). After a
  // first reply (or a first timeout), subsequent queries use the short
  // window — if the meter is silent it stays silent.
  async _scpiHandshake(firstMs = this._handshakeFirstMs, nextMs = this._handshakeNextMs) {
    const probes = ['*IDN?', ':SCPI:DISP?', ':READ?', ':DMM:MEAS?'];
    for (let i = 0; i < probes.length; i++) {
      const t0 = Date.now();
      const r = await this._querySCPI(probes[i], i === 0 ? firstMs : nextMs);
      this._dbg('handshake ' + probes[i] + ' → ' +
        (r === null ? 'timeout after ' + (Date.now() - t0) + 'ms' : JSON.stringify(r.slice(0, 48))));
      if (r !== null) return true;
    }
    return false;
  }

  // Full teardown after a reconnect cycle or detection deadline gives up:
  // everything back to the pre-CONNECT state so the replug listeners go
  // dormant and the user's next CONNECT click starts clean. v6.0.20 left
  // _running=true here, so every USB re-enumeration re-grabbed the device —
  // while a WebUSB claim is held, the kernel usbserial driver is detached
  // and the meter VANISHES from the serial port picker (tester, v6.0.20).
  async _fullResetSession(msg) {
    this._dbg('full session reset' + (msg ? ' — ' + msg.slice(0, 80) : ''));
    this._resetSCPISession();
    this._running = false;
    this._reconnecting = false;
    this.connected = false;
    this._transport = 'serial';
    if (this.reader) {
      try { await this.reader.cancel(); } catch (_) { }
      try { await this.reader.releaseLock(); } catch (_) { }
      this.reader = null;
    }
    if (this._writer) {
      try { await this._writer.releaseLock(); } catch (_) { }
      this._writer = null;
    }
    if (this.port) { try { await this.port.close(); } catch (_) { } this.port = null; }
    if (this._usbDev) { try { await this._usbDev.close(); } catch (_) { } this._usbDev = null; }
    if (msg) this._emit('error', msg);
  }

  // Desktop pre-probe: claim the OWON raw-USB device and verify it speaks
  // SCPI before committing. Returns true only when the meter answers, so
  // serial-only OWON gear (which shares the generic 5345:1234 VID:PID)
  // falls through to the serial transport. Every failure path is silent —
  // the caller continues with navigator.serial.requestPort().
  async _probeOWONUSB() {
    if (!('usb' in navigator)) return false;
    let dev;
    try {
      const granted = (await navigator.usb.getDevices()).find(d =>
        d.vendorId === Multimeter.OWON_USB.vendorId &&
        d.productId === Multimeter.OWON_USB.productId);
      // No chooser UI flashes here: in the desktop app select-usb-device
      // auto-picks the OWON, or rejects silently when none is plugged in.
      dev = granted || await navigator.usb.requestDevice({ filters: [Multimeter.OWON_USB] });
      this._dbg('USB probe: device ' + (dev.productName || 'OWON device') +
        (granted ? ' (pre-granted)' : ' (newly granted)'));
    } catch (_) {
      this._dbg('USB probe: no OWON present or OS refused access');
      return false; // no OWON present, or the OS refuses access (udev/uaccess)
    }
    if (!(await this._claimOWONUSB(dev))) return false;
    this._finishOWONUSBConnect();
    return true;
  }

  // Is the data link (serial port or USB device) currently usable?
  _linkUp() {
    return this._transport === 'usb'
      ? !!(this._usbDev && this._usbDev.opened)
      : !!this.port;
  }

  _startRateTimer() {
    this._readingCount = 0;
    if (this._readingTimer) clearInterval(this._readingTimer);
    this._readingTimer = setInterval(() => {
      this._readingsPerSecond = this._readingCount;
      this._readingCount = 0;
    }, 1000);
  }

  async _startReading() {
    this._running = true;
    this._buffer = [];
    this._startRateTimer();

    while (this._running && this.port && this.port.readable) {
      this.reader = this.port.readable.getReader();
      // done:true per the Web Serial spec means the port was closed or hit a
      // fatal error — reading is OVER. The outer loop must exit too: re-entering
      // while readable is still truthy spin-loops on instantly-resolved reads
      // and starves every timer in the app (found via the v6.0.21 mock suite).
      let linkDown = false;
      try {
        while (this._running) {
          const { value, done } = await this.reader.read();
          if (done) { linkDown = true; break; }
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
      if (linkDown) break;
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
  // nothing on its own — every reading must be polled (':DMM:MEAS?' fast
  // dialect, ':READ?' slow fallback).
  // Session per OWON's HDS200 DMM SCPI document:
  //   *IDN?            → "OWON,HDS242,26190843,V8.5.0"
  //   :SCPI:DISP?      → "scpion"  (activates DMM SCPI; meter must be in DMM mode)
  //   :READ? (poll)    → "V=28.00mV" / "F=60.96kHz" / "R=4.7kΩ" / "OL" / "3.28"
  //   :DMM:MEAS? (alt) → bare number — some firmware answers only this one

  _resetSCPISession() {
    if (this._scpiPollTimer) { clearInterval(this._scpiPollTimer); this._scpiPollTimer = null; }
    if (this._scpiProbeTimer) { clearTimeout(this._scpiProbeTimer); this._scpiProbeTimer = null; }
    if (this._detectTimer) { clearTimeout(this._detectTimer); this._detectTimer = null; }
    if (this._scpiPending) { const p = this._scpiPending; this._scpiPending = null; p.resolve(null); }
    this._scpiProbeCount = 0;
    this._probeSentAt = 0;
    this._scpiBusy = false;
    this._scpiFails = 0;
    this._scpiHintShown = false;
    this._scpiReadCmd = null;
    this._scpiGarbage = 0;
    this._scpiConfTicks = 0;
    this._lastGoodPollAt = 0;
  }

  // Map a ':DMM:CONFigure?' reply (e.g. 'VOLTage DC', 'RESistance') to a
  // mode. Unknown replies are ignored rather than guessed.
  _syncModeFromConfig(text) {
    const t = String(text).toLowerCase();
    let mode = null;
    if (/cont|bee/.test(t)) mode = 'CONT';
    else if (/dio/.test(t)) mode = 'DIODE';
    else if (/cap/.test(t)) mode = 'CAP';
    else if (/res|ohm/.test(t)) mode = 'OHM';
    else if (/curr/.test(t)) mode = /ac/.test(t) ? 'ACA' : 'DCA';
    else if (/volt/.test(t)) mode = /ac/.test(t) ? 'ACV' : 'DCV';
    else if (/duty/.test(t)) mode = 'DUTY';
    else if (/freq/.test(t)) mode = 'FREQ';
    else if (/temp/.test(t)) mode = 'TEMP';
    if (mode) this._lastSCPIMode = mode;
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
      const data = new TextEncoder().encode(cmd + '\n');
      if (this._transport === 'usb') {
        if (!this._usbDev || !this._usbDev.opened) return false;
        await this._usbDev.transferOut(1, data);  // bulk OUT endpoint 0x01
        return true;
      }
      if (!this.port || !this.port.writable) return false;
      if (!this._writer) this._writer = this.port.writable.getWriter();
      await this._writer.write(data);
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

  // Persistent bulk-IN read loop (endpoint 0x81, 64-byte packets). One
  // continuous transferIn per session feeds the shared line assembler, so
  // BOTH transports (serial and USB) run the same request/response path:
  // queries resolve via the _scpiPending slot, late replies arrive as
  // pending resolutions or unsolicited readings, and stale/unsolicited
  // packets are consumed as ordinary lines instead of desyncing a
  // write→read pairing (the pyusb reference flushes stale IN packets
  // before every query for exactly this reason — Lab1717/owon-hds-usb_streamer).
  // The old per-query Promise.race design abandoned timed-out transferIns
  // in Chromium's queue; against V11 firmware's slower/stalier replies that
  // pairing drifted and the connect handshake never succeeded.
  _startUSBReadLoop() {
    if (this._usbReadActive) return;
    this._usbReadActive = true;
    this._dbg('USB read loop started (bulk IN 0x81, 64B packets)');
    (async () => {
      while (this._running && this._transport === 'usb' && this._usbDev) {
        try {
          const res = await this._usbDev.transferIn(1, 64);
          if (res.status === 'ok' && res.data && res.data.byteLength) {
            const bytes = new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
            for (let i = 0; i < bytes.length; i++) this._buffer.push(bytes[i]);
            this._processBuffer();
          } else {
            // Empty/stall result — a real device rarely sends these; brief
            // pause keeps a pathological device from spinning the loop.
            await new Promise(r => setTimeout(r, 10));
          }
        } catch (_) {
          break; // device closed or re-enumerated — poll idle detection takes over
        }
      }
      this._usbReadActive = false;
      this._dbg('USB read loop stopped');
    })();
  }

  // Auto-detect probe: SCPI meters stay silent, so after the streaming
  // protocols had their passive window we ask for an id string.
  async _probeSCPI() {
    this._scpiProbeTimer = null;
    if (this._detectedProtocol || !this._running || !this._linkUp()) return;
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
    if (this._detectTimer) { clearTimeout(this._detectTimer); this._detectTimer = null; }
    // Fresh dialect probe every session: a previous session may have locked
    // onto a dialect the current meter state doesn't answer.
    this._scpiReadCmd = null;
    this._scpiGarbage = 0;
    this._emit('status', 'OWON HDS — activating DMM SCPI mode');
    this._dbg('SCPI session init — probing :SCPI:DISP? and *IDN?');
    (async () => {
      const disp = await this._querySCPI(':SCPI:DISP?', 600); // activates DMM SCPI; reply "scpion"
      this._dbg(':SCPI:DISP? → ' + (disp === null ? 'timeout' : JSON.stringify(disp)));
      await new Promise(r => setTimeout(r, 400));
      // _linkUp() covers both transports — this.port is null on the USB
      // transport, and a plain port check silently killed the poll timer
      // there: the meter reported "Connected" over WebUSB but never read.
      if (!this._running || this._detectedProtocol !== 'owon-hds' || !this._linkUp()) return;
      // Model ID — best effort, same as the pyusb reference's identify():
      // *IDN? names the exact model (HDS242, HO5xS, …). Silence just keeps
      // the generic label; the reading poll is not gated on it.
      const idn = await this._querySCPI('*IDN?', 800);
      if (idn) {
        const model = (idn.toUpperCase().match(/\b[A-Z]{2,4}\d{2,4}[A-Z]{0,2}\b/) || [])[0];
        this._dbg('*IDN? → ' + JSON.stringify(idn));
        if (model) this._emit('status', 'OWON ' + model + ' — SCPI active');
      }
      this._dbg('poll timer started at ' + this._pollIntervalMs + 'ms');
      this._dbgHadReading = false;
      this._lastGoodPollAt = Date.now();
      this._scpiPollTimer = setInterval(() => this._pollREAD(), this._pollIntervalMs);
      this._pollREAD();
    })();
  }

  async _pollREAD() {
    if (this._scpiBusy || this._reconnecting || !this._running || !this._linkUp()) return;
    this._scpiBusy = true;
    try {
      // ':READ?' is OWON's documented poll command, but it blocks until the
      // meter's NEXT conversion completes (~1 s at 1 Hz — the tester's HDS242
      // crawled at 1 reading/s because of this). ':DMM:MEAS?' replies
      // instantly with the last conversion and is supported by the same
      // firmware family (some units answer ONLY that one), so probe the fast
      // dialect first and lock onto whichever replies.
      const FAST = ':DMM:MEAS?', SLOW = ':READ?';
      const cmd = this._scpiReadCmd || FAST;
      let line = await this._querySCPI(cmd, this._transport === 'usb' ? 1000 : 800);
      if (line === null && !this._scpiReadCmd) {
        this._scpiReadCmd = SLOW;
        line = await this._querySCPI(this._scpiReadCmd, 1000);
        if (line === null) this._scpiReadCmd = null; // neither dialect — keep probing
      }
      const reading = line !== null ? this._parseOWONHDS(line) : null;
      if (reading) {
        if (!this._dbgHadReading) {
          this._dbgHadReading = true;
          this._dbg('first reading: ' + reading.display + ' ' + reading.mode +
            (this._scpiReadCmd ? ' (dialect ' + this._scpiReadCmd + ')' : ''));
        }
        this._scpiFails = 0;
        this._scpiGarbage = 0;
        this._lastGoodPollAt = Date.now();
        this._dispatchReading(this._applyCalibration(reading));
        // ':DMM:MEAS?' replies are bare numbers with no unit — sync the
        // active function from ':DMM:CONFigure?' roughly every 5 s so mode
        // tracking survives knob turns on that firmware (cadence scales
        // with the poll rate instead of a fixed tick count).
        const confEvery = Math.max(10, Math.round(5000 / this._pollIntervalMs));
        if (this._scpiReadCmd === ':DMM:MEAS?' && ++this._scpiConfTicks >= confEvery) {
          this._scpiConfTicks = 0;
          const conf = await this._querySCPI(':DMM:CONFigure?', 600);
          if (conf) this._syncModeFromConfig(conf);
        }
      } else if (line !== null) {
        // Non-null but unparseable — the locked dialect answers with
        // something this firmware state doesn't describe as a reading
        // (e.g. a CSV-style reply). Switch to the other dialect; a locked
        // dialect that goes fully silent (null) is handled by the idle
        // timer below. Resetting to null here would NOT re-probe: the
        // null-reply fallback only fires when unlocked.
        if (++this._scpiGarbage >= 5) {
          this._scpiGarbage = 0;
          this._scpiReadCmd = (this._scpiReadCmd === SLOW) ? FAST : SLOW;
          this._dbg('unparseable replies — rotating dialect to ' + this._scpiReadCmd +
            ' (sample: ' + JSON.stringify(String(line).slice(0, 40)) + ')');
        }
      } else {
        this._scpiFails++;
        // Judge the link by time since the last good reading, not by poll
        // count — at a 100 ms poll rate a slow-but-alive meter would rack
        // up 10 "fails" in one second and trip a bogus reconnect.
        const idleMs = Date.now() - (this._lastGoodPollAt || Date.now());
        if (idleMs > 5000 && !this._scpiHintShown) {
          this._scpiHintShown = true;
          this._emit('status', 'No DMM data — press Mode on the HDS until it shows the Multimeter screen');
        }
        // USB transport has no read-loop to notice the teardown — detect it
        // here and hand off to the reconnect loop.
        if (this._transport === 'usb' && idleMs >= 10000 && !this._reconnecting) {
          this._dbg('no reading for ' + Math.round(idleMs / 1000) + 's — trying to reconnect');
          this._tryReconnectHDS();
        }
      }
    } finally {
      this._scpiBusy = false;
    }
  }

  // The firmware drops the USB link on idle — recover by re-opening the
  // (re-enumerated) OWON device without bothering the user again. Also
  // invoked from the navigator.usb/serial 'connect' listeners on replug.
  // Every attempt PROBES before committing: a claimed-but-silent device is
  // released again immediately, because holding the raw-USB claim detaches
  // the kernel usbserial driver and makes the meter vanish from the serial
  // port picker (exactly what v6.0.20's blind claim did — tester report).
  async _tryReconnectHDS() {
    if (this._reconnecting || !this._running) return;
    this._reconnecting = true;
    this._dbg('reconnect loop start (transport ' + this._transport + ')');
    for (let attempt = 1; attempt <= this._reconnectAttempts; attempt++) {
      await new Promise(r => setTimeout(r, this._reconnectDelayMs));
      if (!this._running) { this._reconnecting = false; return; }
      try {
        if (this._transport === 'usb') {
          const devices = await navigator.usb.getDevices();
          const owon = devices.find(d =>
            d.vendorId === Multimeter.OWON_USB.vendorId &&
            d.productId === Multimeter.OWON_USB.productId);
          if (!owon) { this._dbg('reconnect #' + attempt + ': meter not on the bus yet'); continue; }
          // The dropped session's handle may still be open (the link died,
          // we never closed it) — open() on it would reject and burn an
          // attempt. Close the stale handle first, deterministically.
          if (this._usbDev) { try { await this._usbDev.close(); } catch (_) { } this._usbDev = null; }
          await owon.open();
          if (!owon.configuration) await owon.selectConfiguration(1);
          await owon.claimInterface(0);
          if (!this._running) { // disconnect() ran while we were opening
            try { await owon.close(); } catch (_) { }
            this._reconnecting = false;
            return;
          }
          this._usbDev = owon;
          this._transport = 'usb';
          this._buffer = [];
          this._running = true;
          // Probe before committing — never hold a silent (asleep/wedged)
          // meter hostage. Shorter budget than a fresh CONNECT: the device
          // just re-enumerated, either it answers quickly or it's asleep.
          if (!(await this._scpiHandshake(this._reconnectHandshakeFirstMs, this._reconnectHandshakeNextMs))) {
            throw new Error('silent');
          }
          this._buffer = [];
          this._scpiFails = 0;
          this._lastGoodPollAt = Date.now();
          this._reconnecting = false;
          this.connected = true;
          this._emit('status', 'OWON HDS reconnected over USB (attempt ' + attempt + ')');
          this._initSCPISession();
          return;
        }
        const ports = await navigator.serial.getPorts();
        const byVid = ports.find(p => {
          const info = (p.getInfo && p.getInfo()) || {};
          return info.usbVendorId === Multimeter.OWON_USB.vendorId &&
            info.usbProductId === Multimeter.OWON_USB.productId;
        });
        // Chromium's internal usbserial driver can omit the USB IDs from
        // getInfo() — fall back to a lone granted port rather than giving up
        // on a port we demonstrably own.
        const owon = byVid || (ports.length === 1 ? ports[0] : null);
        if (!owon) continue;
        // Same stale-handle treatment as the USB branch: the dropped port
        // is still open — open() would reject with InvalidStateError.
        if (this.port) { try { await this.port.close(); } catch (_) { } this.port = null; }
        await owon.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
        if (!this._running) { // disconnect() ran while we were opening
          try { await owon.close(); } catch (_) { }
          this._reconnecting = false;
          return;
        }
        this.port = owon;
        this._writer = null;
        this._buffer = [];
        this._scpiFails = 0;
        this._lastGoodPollAt = Date.now();
        this._reconnecting = false;
        this.connected = true;
        this._emit('status', 'OWON HDS reconnected (attempt ' + attempt + ')');
        this._startReading();
        this._initSCPISession();
        return;
      } catch (_) {
        // Probe failed or device not back yet — release whatever we grabbed
        // so the OS/driver keeps the port visible, and try again later.
        if (this._usbDev && this._transport === 'usb') {
          try { await this._usbDev.close(); } catch (_) { }
          this._usbDev = null;
        }
        if (this.port) {
          try { await this.port.close(); } catch (_) { }
          this.port = null;
        }
      }
    }
    this._reconnecting = false;
    if (this._running) {
      // Full reset: replug listeners must go dormant — otherwise every USB
      // re-enumeration re-grabs the meter and it never shows up in the
      // picker again (v6.0.20 regression). The user presses CONNECT.
      await this._fullResetSession(
        'Lost the meter and it stopped answering (its AUTO-OFF may have powered it down — ' +
        'turn the meter on, then CONNECT again.)');
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

    // Numeric overload — some firmware replies with a huge value (≥ 9.9e37)
    // instead of the string 'OL' (threshold per Lab1717/owon-hds-usb_streamer,
    // verified against an HDS242)
    if (Math.abs(value) >= 9.9e37) {
      return {
        value: Infinity, mode, unit: this._scpiUnitFor(mode), ol: true, negative: false,
        timestamp: Date.now(), stable: false, display: 'OL', protocol: 'owon-hds',
      };
    }

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

  /* ── SCPI poll rate (RATE presets in the meter window) ─────────── */
  getPollInterval() { return this._pollIntervalMs; }

  // Re-arms the live poll timer so a rate change lands without a reconnect.
  // Clamped to a sane window: below 50 ms the transfers just queue up, above
  // 2 s the keepalive gets too lazy for the idle-dropping HDS firmware.
  setPollInterval(ms) {
    const v = Math.max(50, Math.min(2000, Math.round(Number(ms)) || 500));
    this._pollIntervalMs = v;
    if (this._scpiPollTimer) {
      clearInterval(this._scpiPollTimer);
      this._scpiPollTimer = setInterval(() => this._pollREAD(), v);
    }
    return v;
  }

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
