/**
 * BoardScope Oscilloscope Interface
 * WebUSB (Hantek) + WebSerial (OWON/SCPI) oscilloscope drivers
 *
 * Supported hardware:
 *   Hantek 6022BE / 6022BL  — WebUSB, VID 0x04B4 PID 0x6022/0x6023
 *   OWON SDS/XDS series     — WebSerial (USB CDC), VID 0x5345
 *   OWON HDS series         — WebSerial (USB CDC)
 *   Rigol DS1000Z series    — WebSerial (SCPI)
 *   Any SCPI scope          — WebSerial (:WAVeform commands)
 *
 * sigrok note: We implement the same device protocols sigrok uses (Hantek
 * vendor-USB, OWON CDC, SCPI) in JavaScript. libsigrok itself is a native C
 * library and cannot run in a browser. Waveforms can be exported as .sr files
 * (ZIP + metadata) which open in PulseView.
 *
 * Events: connected | disconnected | waveform | trigger | decoded | error
 */

// ── DRIVER: Hantek 6022BE/BL (WebUSB) ────────────────────────────────────
class HantekDriver {
  // VID/PID table
  static DEVICES = [
    { vendorId: 0x04B4, productId: 0x6022, name: 'Hantek 6022BE' },
    { vendorId: 0x04B4, productId: 0x6023, name: 'Hantek 6022BL' },
    { vendorId: 0x04B4, productId: 0x6010, name: 'Hantek 6010BC' },
  ];

  // Voltage range codes (wValue for control transfer 0xE0/0xE1)
  static RANGE_CODE = {
    5.0: 0x01,
    2.5: 0x02,
    1.0: 0x03,
    0.5: 0x04,
    0.2: 0x05,
    0.1: 0x06,
  };

  // Sample rate codes for control transfer 0xE2
  static RATE_CODE = {
    1e3: 0x01,
    10e3: 0x02,
    100e3: 0x04,
    200e3: 0x08,
    500e3: 0x10,
    1e6: 0x20,
    2e6: 0x40,
    4e6: 0x80,
  };

  // Closest valid sample rate
  static nearestRate(rate) {
    const valid = Object.keys(HantekDriver.RATE_CODE).map(Number).sort((a, b) => a - b);
    return valid.reduce((prev, cur) => Math.abs(cur - rate) < Math.abs(prev - rate) ? cur : prev);
  }

  static filters() {
    return HantekDriver.DEVICES.map(d => ({ vendorId: d.vendorId, productId: d.productId }));
  }

  static matches(device) {
    return HantekDriver.DEVICES.some(
      d => d.vendorId === device.vendorId && d.productId === device.productId
    );
  }

  async configure(device, sampleRate, voltageScale) {
    const rateActual = HantekDriver.nearestRate(sampleRate);
    const rateCode = HantekDriver.RATE_CODE[rateActual];

    const ch1Range = HantekDriver._nearestRange(voltageScale[0] * 5);
    const ch2Range = HantekDriver._nearestRange(voltageScale[1] * 5);

    // CH1 voltage range
    await device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request: 0xE0, value: ch1Range, index: 0 },
      new Uint8Array([ch1Range])
    );
    // CH2 voltage range
    await device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request: 0xE1, value: ch2Range, index: 0 },
      new Uint8Array([ch2Range])
    );
    // Sample rate
    await device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request: 0xE2, value: rateCode, index: 0 },
      new Uint8Array([rateCode])
    );

    return rateActual;
  }

  async capture(device, numSamples, channelEnabled) {
    // Trigger capture
    await device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request: 0xE3, value: 0x01, index: 0 },
      new Uint8Array([0x01])
    );

    const chCount = (channelEnabled[0] ? 1 : 0) + (channelEnabled[1] ? 1 : 0);
    const totalBytes = numSamples * Math.max(chCount, 1);

    // Bulk read from endpoint 6 (0x86)
    const result = await device.transferIn(6, totalBytes);
    const raw = new Uint8Array(result.data.buffer);

    const ch1 = new Float32Array(numSamples);
    const ch2 = new Float32Array(numSamples);

    // Data encoding: unsigned byte, 0x80 = 0V, scaled ±1 around mid
    if (channelEnabled[0] && channelEnabled[1]) {
      for (let i = 0; i < numSamples; i++) {
        ch1[i] = ((raw[i * 2] - 128) / 128.0);
        ch2[i] = ((raw[i * 2 + 1] - 128) / 128.0);
      }
    } else if (channelEnabled[0]) {
      for (let i = 0; i < numSamples; i++) ch1[i] = ((raw[i] - 128) / 128.0);
    } else {
      for (let i = 0; i < numSamples; i++) ch2[i] = ((raw[i] - 128) / 128.0);
    }

    return { ch1, ch2 };
  }

  static _nearestRange(vFullScale) {
    const opts = Object.keys(HantekDriver.RANGE_CODE).map(Number).sort((a, b) => a - b);
    for (const r of opts) { if (vFullScale <= r) return HantekDriver.RANGE_CODE[r]; }
    return HantekDriver.RANGE_CODE[opts[opts.length - 1]];
  }
}

// ── DRIVER: OWON SDS/XDS/HDS + Rigol/Generic SCPI (WebSerial) ────────────
class SCPIDriver {
  // OWON oscilloscopes use USB CDC (serial) with a mix of SCPI and vendor cmds
  static OWON_DEVICES = [
    // OWON SDS series
    { vendorId: 0x5345, productId: 0x1234, name: 'OWON SDS1022I' },
    { vendorId: 0x5345, productId: 0x1235, name: 'OWON SDS1102' },
    { vendorId: 0x5345, productId: 0x1236, name: 'OWON SDS7102' },
    { vendorId: 0x5345, productId: 0x2300, name: 'OWON XDS series' },
    { vendorId: 0x5345, productId: 0x2301, name: 'OWON HDS series' },
    // Lilliput oscilloscopes
    { vendorId: 0x0547, productId: 0x1002, name: 'Lilliput PDS series' },
  ];

  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this._buf = '';
    this.model = 'SCPI';
  }

  static serialFilters() {
    // Returns hints; WebSerial shows all ports so user must pick correct one
    return SCPIDriver.OWON_DEVICES.map(d => ({ usbVendorId: d.vendorId, usbProductId: d.productId }));
  }

  async connect() {
    if (!('serial' in navigator)) throw new Error('WebSerial not supported. Use Chrome or Edge.');
    try {
      this.port = await navigator.serial.requestPort({ filters: SCPIDriver.serialFilters() });
    } catch {
      // Fallback: no filters if browser doesn't support them
      this.port = await navigator.serial.requestPort();
    }
    await this.port.open({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
    this.writer = this.port.writable.getWriter();
    this._startReader();

    // Identify
    try {
      const idn = await this.query('*IDN?');
      this.model = idn.trim();
    } catch (_) { this.model = 'SCPI Scope'; }

    return this.model;
  }

  async disconnect() {
    if (this.reader) {
      try { await this.reader.cancel(); } catch (_) { }
      try { this.reader.releaseLock(); } catch (_) { }
      this.reader = null;
    }
    if (this.writer) { try { this.writer.releaseLock(); } catch (_) { } this.writer = null; }
    if (this.port) { try { await this.port.close(); } catch (_) { } this.port = null; }
  }

  async write(cmd) {
    const enc = new TextEncoder();
    await this.writer.write(enc.encode(cmd + '\n'));
  }

  async query(cmd, timeoutMs = 2000) {
    await this.write(cmd);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SCPI timeout: ' + cmd)), timeoutMs);
      const check = () => {
        const nl = this._buf.indexOf('\n');
        if (nl >= 0) {
          clearTimeout(t);
          const line = this._buf.slice(0, nl).replace(/\r/g, '');
          this._buf = this._buf.slice(nl + 1);
          resolve(line);
        } else {
          setTimeout(check, 20);
        }
      };
      check();
    });
  }

  async configure(sampleRate, numPoints, channelEnabled) {
    if (channelEnabled[0]) await this.write(':CHAN1:DISP ON');
    else await this.write(':CHAN1:DISP OFF');
    if (channelEnabled[1]) await this.write(':CHAN2:DISP ON');
    else await this.write(':CHAN2:DISP OFF');

    await this.write(`:ACQ:SAMP ${sampleRate}`);
    await this.write(`:WAV:POIN ${numPoints}`);
    await this.write(':WAV:FORM ASC');  // ASCII for max compatibility
    await this.write(':SING');          // single trigger
  }

  async captureChannel(ch) {
    await this.write(`:WAV:SOUR CHAN${ch}`);
    const raw = await this.query(':WAV:DATA?', 5000);
    // ASCII format: comma-separated floats
    return new Float32Array(raw.split(',').map(Number));
  }

  _startReader() {
    const go = async () => {
      this.reader = this.port.readable.getReader();
      const dec = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          this._buf += dec.decode(value);
        }
      } catch (_) { }
      try { this.reader.releaseLock(); } catch (_) { }
    };
    go();
  }
}

// ── OWON Multimeter Protocol ──────────────────────────────────────────────
// For OWON OW16B, OW16C and similar USB serial multimeters.
// Frame: 11 bytes, starts with 0xAB or 0xAC, ends with 0x0D.
class OwonMeterProtocol {
  static FRAME_SIZE = 11;
  static FRAME_START = [0xAB, 0xAC];

  static parse(frame) {
    if (frame.length !== 11) return null;

    const modeRaw = frame[1];
    const rangeRaw = frame[2];
    const flags = frame[3];

    // Digits: BCD in bytes 4–7, sign in byte 8
    let value = 0;
    for (let i = 4; i <= 7; i++) {
      const hi = (frame[i] >> 4) & 0x0F;
      const lo = frame[i] & 0x0F;
      if (hi > 9 || lo > 9) return null;
      value = value * 100 + hi * 10 + lo;
    }

    const negative = (frame[8] & 0x08) !== 0;
    const overload = (frame[8] & 0x01) !== 0;
    const dpPosition = (rangeRaw & 0x07);  // 0=none, 1=x.xxx, 2=xx.xx, 3=xxx.x

    if (!overload && dpPosition > 0) {
      value = value / Math.pow(10, dpPosition);
    }
    if (negative) value = -value;

    const MODE_MAP = {
      0x00: 'DCV', 0x01: 'ACV', 0x02: 'DCA', 0x03: 'ACA',
      0x04: 'OHM', 0x05: 'DIODE', 0x06: 'CONT', 0x07: 'CAP',
      0x08: 'FREQ', 0x09: 'DUTY', 0x0A: 'TEMP', 0x0B: 'mV',
    };
    const UNIT_MAP = {
      'DCV': 'V', 'ACV': 'V', 'mV': 'mV',
      'DCA': 'A', 'ACA': 'A',
      'OHM': 'Ω', 'DIODE': 'V', 'CONT': 'Ω',
      'CAP': 'F', 'FREQ': 'Hz', 'DUTY': '%', 'TEMP': '°C',
    };

    const mode = MODE_MAP[modeRaw] || 'DCV';
    const unit = UNIT_MAP[mode] || '';

    return {
      value, mode, unit, ol: overload, negative, timestamp: Date.now(), stable: false,
      display: overload ? 'OL' : `${value.toFixed(dpPosition > 0 ? dpPosition : 0)} ${unit}`
    };
  }
}

// ── MAIN OSCILLOSCOPE CLASS ───────────────────────────────────────────────
class Oscilloscope {
  constructor() {
    // Connection state
    this.device = null;    // WebUSB device (Hantek)
    this._scpi = null;    // SCPIDriver (OWON/Rigol)
    this._driver = null;    // 'hantek' | 'scpi' | null
    this.connected = false;
    this.capturing = false;
    this.demoMode = false;   // true when no real hardware — shows animated waveform

    // Channel settings
    this.sampleRate = 1e6;          // Sa/s
    this.channels = 2;
    this.channelEnabled = [true, true];
    this.voltageScale = [1.0, 1.0];   // V/div
    this.voltageOffset = [0, 0];
    this.timebase = 1e-3;         // s/div
    this.triggerChannel = 0;
    this.triggerLevel = 0;
    this.triggerEdge = 'RISING';
    this.triggerMode = 'AUTO';

    // Data
    this.waveformData = [new Float32Array(0), new Float32Array(0)];
    this.maxSamples = 10000;

    // Protocol decoder
    this.decoderEnabled = false;
    this.decoderProtocol = null;   // 'I2C' | 'SPI' | 'UART'
    this.decoderConfig = { sclChannel: 1, sdaChannel: 0, baudRate: 9600, clockEdge: 'RISING' };
    this.decodedData = [];

    // Measurements
    this.measurements = {
      ch1: { vpp: 0, vrms: 0, vavg: 0, frequency: 0, period: 0, dutyCycle: 0, riseTime: 0, fallTime: 0 },
      ch2: { vpp: 0, vrms: 0, vavg: 0, frequency: 0, period: 0, dutyCycle: 0, riseTime: 0, fallTime: 0 },
    };

    this._listeners = {};
  }

  // ── CONNECTION ────────────────────────────────────────────────────────
  async connect() {
    // Try WebUSB first (Hantek)
    if ('usb' in navigator) {
      try {
        const filters = [
          ...HantekDriver.filters(),
          { vendorId: 0x1AB1 }, // Rigol (WebUSB fallback)
        ];
        const dev = await navigator.usb.requestDevice({ filters });
        await dev.open();
        await dev.selectConfiguration(1);
        await dev.claimInterface(0);

        this.device = dev;
        this._driver = 'hantek';
        this._hantek = new HantekDriver();
        this.connected = true;
        this.demoMode = false;
        this.emit('connected', { device: dev.productName, driver: 'hantek' });
        console.log('[Scope] Hantek connected:', dev.productName);
        return true;
      } catch (err) {
        if (err.name !== 'NotFoundError' && !err.message?.includes('cancelled')) {
          // User may have picked an OWON/SCPI scope — fall through to serial
          console.log('[Scope] WebUSB failed, trying WebSerial:', err.message);
        }
      }
    }

    // Try WebSerial (OWON / Rigol / generic SCPI)
    if ('serial' in navigator) {
      try {
        this._scpi = new SCPIDriver();
        const model = await this._scpi.connect();
        this._driver = 'scpi';
        this.connected = true;
        this.demoMode = false;
        this.emit('connected', { device: model, driver: 'scpi' });
        console.log('[Scope] SCPI connected:', model);
        return true;
      } catch (err) {
        if (err.name !== 'NotFoundError') {
          console.error('[Scope] Serial connect error:', err.message);
          this.emit('error', { message: 'Connection failed: ' + err.message, error: err });
        }
        this._scpi = null;
      }
    }

    this.emit('error', { message: 'No scope found. Check WebUSB/WebSerial support (Chrome/Edge required).' });
    return false;
  }

  async connectDemo() {
    this.connected = true;
    this.demoMode = true;
    this._driver = 'demo';
    this.emit('connected', { device: 'Demo Mode', driver: 'demo' });
    return true;
  }

  async disconnect() {
    this.capturing = false;

    if (this._driver === 'hantek' && this.device) {
      try { await this.device.close(); } catch (_) { }
      this.device = null;
    }
    if (this._driver === 'scpi' && this._scpi) {
      await this._scpi.disconnect();
      this._scpi = null;
    }

    this._driver = null;
    this.connected = false;
    this.demoMode = false;
    this.emit('disconnected');
  }

  // ── CAPTURE ───────────────────────────────────────────────────────────
  async capture(duration = 0.01) {
    if (!this.connected) { console.error('[Scope] Not connected'); return null; }
    if (this.capturing) { console.warn('[Scope] Already capturing'); return null; }

    this.capturing = true;
    const numSamples = Math.min(Math.floor(this.sampleRate * duration), this.maxSamples);

    try {
      let ch1, ch2;

      if (this._driver === 'hantek') {
        const actualRate = await this._hantek.configure(this.device, this.sampleRate, this.voltageScale);
        this.sampleRate = actualRate;
        const raw = await this._hantek.capture(this.device, numSamples, this.channelEnabled);
        // Scale raw normalised values to volts
        ch1 = raw.ch1.map(v => v * this.voltageScale[0] * 5 + this.voltageOffset[0]);
        ch2 = raw.ch2.map(v => v * this.voltageScale[1] * 5 + this.voltageOffset[1]);
        ch1 = new Float32Array(ch1);
        ch2 = new Float32Array(ch2);

      } else if (this._driver === 'scpi') {
        await this._scpi.configure(this.sampleRate, numSamples, this.channelEnabled);
        ch1 = this.channelEnabled[0] ? await this._scpi.captureChannel(1) : new Float32Array(numSamples);
        ch2 = this.channelEnabled[1] ? await this._scpi.captureChannel(2) : new Float32Array(numSamples);

      } else {
        // Demo mode — generate waveforms
        ({ ch1, ch2 } = this._demoWaveform(numSamples));
      }

      this.waveformData[0] = ch1;
      this.waveformData[1] = ch2;

      this._calculateMeasurements();
      if (this.decoderEnabled && this.decoderProtocol) this._decodeProtocol();

      this.capturing = false;

      const waveform = {
        timestamp: Date.now(),
        sampleRate: this.sampleRate,
        numSamples,
        duration,
        ch1,
        ch2,
        measurements: this.measurements,
        decoded: this.decodedData,
        driver: this._driver,
      };

      this.emit('waveform', waveform);
      return waveform;

    } catch (err) {
      this.capturing = false;
      console.error('[Scope] Capture error:', err);
      this.emit('error', { message: 'Capture failed: ' + err.message, error: err });
      return null;
    }
  }

  // Demo waveform: sine on CH1, square on CH2
  _demoWaveform(numSamples) {
    const ch1 = new Float32Array(numSamples);
    const ch2 = new Float32Array(numSamples);
    const freq = 1000; // 1 kHz
    for (let i = 0; i < numSamples; i++) {
      const t = i / this.sampleRate;
      ch1[i] = Math.sin(2 * Math.PI * freq * t) * this.voltageScale[0];
      ch2[i] = (Math.sin(2 * Math.PI * freq * 0.5 * t) > 0 ? 1 : -1) * this.voltageScale[1] * 0.8;
    }
    return { ch1, ch2 };
  }

  // ── MEASUREMENTS ─────────────────────────────────────────────────────
  _calculateMeasurements() {
    for (let ch = 0; ch < 2; ch++) {
      if (!this.channelEnabled[ch]) continue;
      const data = this.waveformData[ch];
      if (!data || data.length === 0) continue;
      const key = `ch${ch + 1}`;
      const m = this.measurements[key];

      let min = Infinity, max = -Infinity, sum = 0, sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
        sumSq += v * v;
      }
      m.vpp = max - min;
      m.vrms = Math.sqrt(sumSq / data.length);
      m.vavg = sum / data.length;

      // Frequency via zero crossings (rising edge count)
      const mid = (min + max) / 2;
      let crossings = 0;
      for (let i = 1; i < data.length; i++) {
        if (data[i - 1] < mid && data[i] >= mid) crossings++;
      }
      const dur = data.length / this.sampleRate;
      m.frequency = crossings > 0 ? crossings / dur : 0;
      m.period = m.frequency > 0 ? 1 / m.frequency : 0;

      // Duty cycle
      const highCount = data.filter(v => v >= mid).length;
      m.dutyCycle = (highCount / data.length) * 100;

      // Rise / fall time
      m.riseTime = this._edgeTime(data, true, min, max);
      m.fallTime = this._edgeTime(data, false, min, max);
    }
  }

  _edgeTime(data, rising, min, max) {
    const lo = min + (max - min) * 0.1;
    const hi = min + (max - min) * 0.9;
    for (let i = 1; i < data.length - 1; i++) {
      if (rising ? (data[i - 1] < lo && data[i] >= lo) : (data[i - 1] > hi && data[i] <= hi)) {
        for (let j = i; j < data.length - 1; j++) {
          if (rising ? (data[j] >= hi) : (data[j] <= lo)) {
            return ((j - i) / this.sampleRate) * 1e9; // ns
          }
        }
      }
    }
    return 0;
  }

  // ── PROTOCOL DECODERS ────────────────────────────────────────────────
  enableDecoder(protocol, config = {}) {
    this.decoderEnabled = true;
    this.decoderProtocol = protocol;
    Object.assign(this.decoderConfig, config);
  }

  disableDecoder() {
    this.decoderEnabled = false;
    this.decoderProtocol = null;
    this.decodedData = [];
  }

  _decodeProtocol() {
    this.decodedData = [];
    try {
      switch (this.decoderProtocol) {
        case 'I2C': this._decodeI2C(); break;
        case 'SPI': this._decodeSPI(); break;
        case 'UART': this._decodeUART(); break;
      }
    } catch (e) { console.warn('[Scope] Decoder error:', e); }
    if (this.decodedData.length) {
      this.emit('decoded', { protocol: this.decoderProtocol, data: this.decodedData });
    }
  }

  _decodeI2C() {
    // CH0 = SDA, CH1 = SCL (or per decoderConfig)
    const cfg = this.decoderConfig;
    const sda = this.waveformData[cfg.sdaChannel || 0];
    const scl = this.waveformData[cfg.sclChannel || 1];
    if (!sda || !scl || sda.length < 10) return;

    const MID = 0;
    const high = (v) => v > MID;

    let state = 'idle', bits = [], byteVal = 0, bitCount = 0;
    let lastSCL = high(scl[0]), lastSDA = high(sda[0]);

    for (let i = 1; i < scl.length; i++) {
      const curSCL = high(scl[i]);
      const curSDA = high(sda[i]);

      // START: SDA falls while SCL high
      if (lastSCL && curSCL && lastSDA && !curSDA) {
        this.decodedData.push({ idx: i, type: 'START' });
        state = 'addr'; bits = []; bitCount = 0; byteVal = 0;
      }
      // STOP: SDA rises while SCL high
      else if (lastSCL && curSCL && !lastSDA && curSDA) {
        this.decodedData.push({ idx: i, type: 'STOP' });
        state = 'idle';
      }
      // Rising SCL: sample SDA
      else if (!lastSCL && curSCL) {
        byteVal = (byteVal << 1) | (curSDA ? 1 : 0);
        bitCount++;
        if (bitCount === 8) {
          // Next bit (9th) is ACK
          const isAddr = state === 'addr';
          this.decodedData.push({
            idx: i, type: isAddr ? 'ADDRESS' : 'DATA',
            value: isAddr ? (byteVal >> 1) : byteVal,
            rw: isAddr ? (byteVal & 1 ? 'R' : 'W') : undefined,
          });
          state = 'data'; byteVal = 0; bitCount = 0;
        }
      }

      lastSCL = curSCL; lastSDA = curSDA;
    }
  }

  _decodeSPI() {
    // CH0 = MOSI, CH1 = SCK
    const cfg = this.decoderConfig;
    const mosi = this.waveformData[0];
    const sck = this.waveformData[1];
    if (!mosi || !sck || mosi.length < 10) return;

    const MID = 0;
    const high = (v) => v > MID;
    const rising = cfg.clockEdge !== 'FALLING';

    let byteVal = 0, bitCount = 0;
    let lastSCK = high(sck[0]);

    for (let i = 1; i < sck.length; i++) {
      const curSCK = high(sck[i]);
      const sample = rising ? (!lastSCK && curSCK) : (lastSCK && !curSCK);
      if (sample) {
        byteVal = (byteVal << 1) | (high(mosi[i]) ? 1 : 0);
        bitCount++;
        if (bitCount === 8) {
          this.decodedData.push({ idx: i, type: 'BYTE', value: byteVal });
          byteVal = 0; bitCount = 0;
        }
      }
      lastSCK = curSCK;
    }
  }

  _decodeUART() {
    // CH0 = TX, idle high
    const data = this.waveformData[0];
    if (!data || data.length < 10) return;

    const cfg = this.decoderConfig;
    const baudRate = cfg.baudRate || 9600;
    const samplesPerBit = Math.round(this.sampleRate / baudRate);
    const MID = 0;
    const high = (v) => v > MID;

    let i = 0;
    while (i < data.length - samplesPerBit) {
      // Look for start bit (high→low)
      if (high(data[i]) && !high(data[i + 1])) {
        // Skip start bit, sample 8 data bits at centre of each bit cell
        let byteVal = 0;
        const start = i + samplesPerBit;
        for (let b = 0; b < 8; b++) {
          const si = start + Math.round((b + 0.5) * samplesPerBit);
          if (si < data.length && high(data[si])) byteVal |= (1 << b);
        }
        const ch = byteVal >= 32 && byteVal < 127 ? String.fromCharCode(byteVal) : null;
        this.decodedData.push({ idx: i, type: 'BYTE', value: byteVal, char: ch });
        i += samplesPerBit * 10; // start + 8 data + stop
      } else {
        i++;
      }
    }

    // Summarise as string if printable
    const chars = this.decodedData.filter(d => d.char).map(d => d.char).join('');
    if (chars.length > 0) {
      this.decodedData.push({ type: 'STRING', value: chars });
    }
  }

  // ── EXPORT ────────────────────────────────────────────────────────────
  exportWaveform(format = 'CSV') {
    if (!this.waveformData[0].length && !this.waveformData[1].length) {
      console.warn('[Scope] No data to export'); return;
    }
    switch (format.toUpperCase()) {
      case 'CSV': this._exportCSV(); break;
      case 'PNG': this._exportPNG(); break;
      case 'VCD': this._exportVCD(); break;
      case 'SR': this._exportSR(); break;
      default: console.warn('[Scope] Unknown format:', format);
    }
  }

  _exportCSV() {
    const n = Math.min(this.waveformData[0].length, this.waveformData[1].length);
    let csv = 'Time (s),CH1 (V),CH2 (V)\n';
    for (let i = 0; i < n; i++) {
      csv += `${(i / this.sampleRate).toExponential(6)},${this.waveformData[0][i].toFixed(6)},${this.waveformData[1][i].toFixed(6)}\n`;
    }
    this._download(csv, `waveform-${Date.now()}.csv`, 'text/csv');
  }

  _exportVCD() {
    // Value Change Dump — opens in PulseView, GTKWave, etc.
    const period_fs = Math.round(1e15 / this.sampleRate);
    let vcd = `$timescale 1 fs $end\n$scope module boardscope $end\n`;
    vcd += `$var real 1 ! CH1 $end\n$var real 1 # CH2 $end\n$upscope $end\n$enddefinitions $end\n#0\n`;
    const n = Math.min(this.waveformData[0].length, this.waveformData[1].length);
    for (let i = 0; i < n; i++) {
      vcd += `#${i * period_fs}\nr${this.waveformData[0][i].toFixed(6)} !\nr${this.waveformData[1][i].toFixed(6)} #\n`;
    }
    this._download(vcd, `waveform-${Date.now()}.vcd`, 'text/plain');
  }

  async _exportSR() {
    // sigrok .sr format: ZIP containing "version" + "metadata" + channel data files
    // Opens in PulseView / sigrok-cli
    const n = Math.min(this.waveformData[0].length, this.waveformData[1].length);

    const meta = [
      '[global]',
      'sigrok version=0.3.0',
      '',
      '[device 1]',
      'capturefile=logic-1',
      `total probes=${this.channelEnabled.filter(Boolean).length}`,
      `samplerate=${this.sampleRate} Hz`,
      `total analog=${this.channelEnabled.filter(Boolean).length}`,
      'analog1=CH1',
      'analog2=CH2',
    ].join('\n');

    // Pack CH1 and CH2 as 32-bit IEEE 754 little-endian floats
    const ch1Buf = new Float32Array(this.waveformData[0].slice(0, n));
    const ch2Buf = new Float32Array(this.waveformData[1].slice(0, n));

    try {
      // Use browser's built-in CompressionStream to create ZIP (Chrome 80+)
      // We build a minimal ZIP manually for maximum compatibility
      const zip = this._buildZip({
        'version': new TextEncoder().encode('2'),
        'metadata': new TextEncoder().encode(meta),
        'analog-1-1': new Uint8Array(ch1Buf.buffer),
        'analog-1-2': new Uint8Array(ch2Buf.buffer),
      });
      this._downloadBytes(zip, `capture-${Date.now()}.sr`, 'application/zip');
    } catch (e) {
      console.warn('[Scope] SR export: ZIP build failed, falling back to CSV');
      this._exportCSV();
    }
  }

  _buildZip(files) {
    // Minimal uncompressed ZIP (store method, no compression)
    const enc = new TextEncoder();
    const parts = [];
    const centralDir = [];
    let offset = 0;

    for (const [name, data] of Object.entries(files)) {
      const nameBytes = enc.encode(name);
      const crc = this._crc32(data);

      // Local file header
      const lhSize = 30 + nameBytes.length;
      const lh = new Uint8Array(lhSize);
      const lhv = new DataView(lh.buffer);
      lhv.setUint32(0, 0x04034b50, true);  // signature
      lhv.setUint16(4, 20, true);  // version needed
      lhv.setUint16(6, 0, true);  // flags
      lhv.setUint16(8, 0, true);  // compression: store
      lhv.setUint16(10, 0, true);  // mod time
      lhv.setUint16(12, 0, true);  // mod date
      lhv.setUint32(14, crc, true);  // crc32
      lhv.setUint32(18, data.length, true);  // compressed size
      lhv.setUint32(22, data.length, true);  // uncompressed size
      lhv.setUint16(26, nameBytes.length, true); // filename length
      lhv.setUint16(28, 0, true);  // extra length
      lh.set(nameBytes, 30);

      parts.push(lh);
      parts.push(data);

      // Central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);  // signature
      cdv.setUint16(4, 20, true);  // version made by
      cdv.setUint16(6, 20, true);  // version needed
      cdv.setUint16(8, 0, true);  // flags
      cdv.setUint16(10, 0, true);  // compression
      cdv.setUint16(12, 0, true);  // mod time
      cdv.setUint16(14, 0, true);  // mod date
      cdv.setUint32(16, crc, true);  // crc32
      cdv.setUint32(20, data.length, true);  // compressed size
      cdv.setUint32(24, data.length, true);  // uncompressed size
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);  // extra length
      cdv.setUint16(32, 0, true);  // comment length
      cdv.setUint16(34, 0, true);  // disk number start
      cdv.setUint16(36, 0, true);  // int file attrs
      cdv.setUint32(38, 0, true);  // ext file attrs
      cdv.setUint32(42, offset, true);  // local header offset
      cd.set(nameBytes, 46);
      centralDir.push(cd);

      offset += lhSize + data.length;
    }

    const cdStart = offset;
    const cdData = this._concat(centralDir);

    // End of central directory
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); // signature
    ev.setUint16(4, 0, true); // disk number
    ev.setUint16(6, 0, true); // disk with start
    ev.setUint16(8, centralDir.length, true); // entries on disk
    ev.setUint16(10, centralDir.length, true); // total entries
    ev.setUint32(12, cdData.length, true); // central dir size
    ev.setUint32(16, cdStart, true); // central dir offset
    ev.setUint16(20, 0, true); // comment length

    return this._concat([...parts, cdData, eocd]);
  }

  _concat(arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
  }

  _crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = Oscilloscope._crc32Table || (Oscilloscope._crc32Table = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })());
    for (let i = 0; i < data.length; i++) crc = (table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8));
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  _exportPNG() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 500;
    const ctx = canvas.getContext('2d');
    this._renderWaveform(ctx, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `waveform-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    });
  }

  _download(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  _downloadBytes(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── RENDERING ─────────────────────────────────────────────────────────
  _renderWaveform(ctx, width, height) {
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const x = (i / 10) * width; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let i = 0; i <= 8; i++) { const y = (i / 8) * height; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    // Centre line
    ctx.strokeStyle = '#2e3348'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();

    const colors = ['#00d9a6', '#5294f8'];
    for (let ch = 0; ch < 2; ch++) {
      if (!this.channelEnabled[ch] || !this.waveformData[ch].length) continue;
      const data = this.waveformData[ch];
      const scale = this.voltageScale[ch] || 1;
      ctx.strokeStyle = colors[ch]; ctx.lineWidth = 2; ctx.beginPath();
      const step = Math.max(1, Math.floor(data.length / width));
      for (let i = 0; i < data.length; i += step) {
        const x = (i / data.length) * width;
        const y = height / 2 - (data[i] / scale) * (height / 8 / 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Measurements overlay
    ctx.fillStyle = '#f0f3fa'; ctx.font = '13px monospace';
    const m1 = this.measurements.ch1, m2 = this.measurements.ch2;
    ctx.fillStyle = colors[0];
    ctx.fillText(`CH1  ${m1.vpp.toFixed(3)}Vpp  ${m1.vrms.toFixed(3)}Vrms  ${_fmtFreq(m1.frequency)}  ${m1.dutyCycle.toFixed(1)}%DC`, 12, 20);
    ctx.fillStyle = colors[1];
    ctx.fillText(`CH2  ${m2.vpp.toFixed(3)}Vpp  ${m2.vrms.toFixed(3)}Vrms  ${_fmtFreq(m2.frequency)}  ${m2.dutyCycle.toFixed(1)}%DC`, 12, 40);

    function _fmtFreq(f) {
      if (f <= 0) return '— Hz';
      if (f >= 1e6) return (f / 1e6).toFixed(3) + ' MHz';
      if (f >= 1e3) return (f / 1e3).toFixed(3) + ' kHz';
      return f.toFixed(1) + ' Hz';
    }

    // Driver badge
    if (this.demoMode) {
      ctx.fillStyle = 'rgba(255,200,0,0.2)';
      ctx.fillRect(width - 90, 0, 90, 26);
      ctx.fillStyle = '#ffc800'; ctx.font = 'bold 11px monospace';
      ctx.fillText('DEMO MODE', width - 85, 17);
    }
  }

  // ── SETTINGS ──────────────────────────────────────────────────────────
  setChannelEnabled(ch, enabled) { this.channelEnabled[ch] = enabled; }
  setVoltageScale(ch, scale) { this.voltageScale[ch] = scale; }
  setTimebase(tb) { this.timebase = tb; }
  setSampleRate(rate) { this.sampleRate = rate; }
  setTrigger(ch, level, edge, mode) {
    this.triggerChannel = ch; this.triggerLevel = level;
    this.triggerEdge = edge; this.triggerMode = mode;
  }

  // ── EVENT BUS ─────────────────────────────────────────────────────────
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return this;
  }
  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== cb);
  }
  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => { try { cb(data); } catch (_) { } });
  }

  getStatus() {
    return {
      connected: this.connected, demoMode: this.demoMode, driver: this._driver,
      capturing: this.capturing, sampleRate: this.sampleRate,
      channelEnabled: this.channelEnabled, voltageScale: this.voltageScale,
      timebase: this.timebase, decoderEnabled: this.decoderEnabled,
      decoderProtocol: this.decoderProtocol,
    };
  }
  getMeasurements() { return this.measurements; }
}

// ── OWON MULTIMETER PROTOCOL (export for multimeter.js) ──────────────────
// Available globally for multimeter.js to use if needed
if (typeof window !== 'undefined') {
  window.OwonMeterProtocol = OwonMeterProtocol;
  window.Oscilloscope = Oscilloscope;
  window.SCPIDriver = SCPIDriver;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Oscilloscope, HantekDriver, SCPIDriver, OwonMeterProtocol };
}
