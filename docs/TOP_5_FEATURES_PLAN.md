# BoardScope - Top 5 High-Impact Features Implementation Plan

**Version:** 6.0 Roadmap  
**Date:** 2026-04-18  
**Status:** Architecture & Planning Phase

---

## Executive Summary

This document outlines the technical architecture and implementation plan for 5 high-impact features that will significantly enhance BoardScope's capabilities for professional board repair technicians:

1. **Oscilloscope Integration** - Real-time waveform capture and analysis
2. **Component Library** - Visual database of ICs with pinouts and failure modes
3. **Team Collaboration** - Real-time session sharing with remote technicians
4. **Macro Recording** - Automated measurement sequences
5. **Post-Repair Testing Suite** - Automated quality verification

---

## 1. Oscilloscope Integration

### Overview
Extend the existing multimeter integration pattern to support USB oscilloscopes, enabling waveform capture, signal analysis, and protocol decoding directly within BoardScope.

### Technical Architecture

#### Hardware Support
- **Primary Target:** Hantek 6022BE/BL (USB, widely available, ~$60)
- **Secondary:** Rigol DS1054Z (LAN/USB, professional grade)
- **Protocol:** Custom USB bulk transfer or SCPI over USB-TMC
- **Fallback:** Screenshot import from external scope software

#### Core Components

**File:** `oscilloscope.js` (new, ~800 lines)
```javascript
class Oscilloscope {
  constructor() {
    this.port = null;
    this.connected = false;
    this.sampleRate = 1000000; // 1 MSa/s
    this.channels = 2;
    this.buffer = [];
    this.triggerLevel = 0;
    this.triggerMode = 'AUTO'; // AUTO, NORMAL, SINGLE
  }
  
  async connect() { /* Web USB connection */ }
  async capture(duration) { /* Capture waveform */ }
  async decode(protocol) { /* I2C, SPI, UART decoder */ }
  exportWaveform(format) { /* CSV, PNG, VCD */ }
}
```

#### UI Components

**Floating Window** (similar to multimeter window)
- Waveform display canvas (800x400px)
- Channel controls (CH1/CH2 enable, voltage scale, offset)
- Timebase control (1µs to 1s per division)
- Trigger controls (level, edge, mode)
- Measurement cursors (voltage, time, frequency)
- Protocol decoder dropdown (I2C, SPI, UART, CAN)
- Export buttons (PNG, CSV, VCD)

**Integration Points**
- Click component on board → auto-probe relevant pins
- Detected signals → highlight on schematic
- Protocol decode → show in sidebar with timestamps
- Waveform annotations → save with repair session

#### Data Model
```javascript
{
  timestamp: Date,
  channel: 1 | 2,
  samples: Float32Array,
  sampleRate: number,
  voltageScale: number,
  timebase: number,
  trigger: { level, edge, mode },
  measurements: {
    vpp: number,
    vrms: number,
    frequency: number,
    dutyCycle: number,
    riseTime: number,
    fallTime: number
  },
  decoded: {
    protocol: 'I2C' | 'SPI' | 'UART',
    data: Array<{timestamp, value, decoded}>
  }
}
```

#### Implementation Steps
1. Create `oscilloscope.js` class based on `multimeter.js` pattern
2. Implement Web USB connection for Hantek 6022BE
3. Build waveform rendering engine (WebGL for performance)
4. Add trigger and capture logic
5. Implement protocol decoders (I2C, SPI, UART)
6. Create floating window UI
7. Integrate with board view (click-to-probe)
8. Add waveform export functionality
9. Save captures with repair session

---

## 2. Component Library

### Overview
A searchable visual database of common ICs, connectors, and components with pinouts, datasheets, common failure modes, and replacement guides.

### Technical Architecture

#### Data Structure

**File:** `component-library.json` (new, ~5MB)
```json
{
  "components": [
    {
      "id": "ISL9240",
      "category": "Charger IC",
      "manufacturer": "Renesas",
      "package": "QFN-40",
      "description": "USB-C PD Controller with Integrated Buck-Boost",
      "pinout": {
        "image": "data:image/svg+xml;base64,...",
        "pins": [
          {"num": 1, "name": "VBUS", "type": "POWER", "description": "USB-C VBUS input"},
          {"num": 2, "name": "GND", "type": "GND", "description": "Ground"}
        ]
      },
      "commonFailures": [
        {
          "symptom": "No charging",
          "cause": "VBUS pin shorted to GND",
          "test": "Measure diode drop on pin 1 to GND",
          "expected": "0.6V",
          "fix": "Replace IC"
        }
      ],
      "replacements": ["ISL9240A", "RAA229001"],
      "datasheetUrl": "https://...",
      "lcscUrl": "https://...",
      "boards": ["820-00165", "820-3437"],
      "tags": ["charger", "usb-c", "pd", "buck-boost"]
    }
  ]
}
```

#### UI Components

**Library Panel** (full-screen overlay)
- Search bar (by part number, function, board model)
- Category filters (Power, Audio, Display, CPU, etc.)
- Grid view of components with thumbnails
- Detail view with:
  - Interactive pinout diagram (hover for pin info)
  - Common failure modes table
  - Test procedures
  - Replacement parts
  - Boards using this component
  - Quick links (datasheet, LCSC, Octopart)

**Integration Points**
- Click component on board → "View in Library" button in sidebar
- Library search → highlight components on board
- Failure mode → auto-select test points on board
- Replacement part → show compatible components

#### Component Categories
1. **Power Management** - PMICs, charger ICs, buck/boost converters
2. **CPU/SoC** - Apple T2, M1, M2, Intel CPUs
3. **Display** - TCON, backlight drivers, LVDS
4. **Audio** - Codecs, amplifiers
5. **Connectivity** - USB-C, Thunderbolt, WiFi, Bluetooth
6. **Storage** - NAND controllers, SSD controllers
7. **Sensors** - Accelerometer, gyro, ambient light
8. **Passives** - Common resistor/capacitor values and packages

#### Data Sources
- Manual curation (start with top 100 most common ICs)
- Community contributions (import/export format)
- Scrape from datasheets (automated pinout extraction)
- OpenBoardData integration (link OBD data to library entries)

#### Implementation Steps
1. Design JSON schema for component data
2. Create initial database (100 most common Apple board ICs)
3. Build search and filter UI
4. Implement pinout SVG renderer
5. Add failure mode test procedures
6. Integrate with board view (click-to-library)
7. Add community contribution system
8. Implement datasheet scraper for auto-population

---

## 3. Team Collaboration

### Overview
Enable real-time session sharing between technicians using WebRTC for peer-to-peer connections, allowing remote experts to guide repairs, annotate boards, and share measurements.

### Technical Architecture

#### Connection Methods

**Option A: Peer-to-Peer (WebRTC)**
- Direct browser-to-browser connection
- No server required (use public STUN/TURN)
- Low latency, high privacy
- Share via 6-digit room code

**Option B: Server-Mediated (WebSocket)**
- Central server for session state
- Better for 3+ participants
- Persistent sessions
- Requires backend infrastructure

**Recommended:** Start with WebRTC P2P, add server option later

#### Shared State

**Real-time Sync:**
- Board file loaded (auto-download to remote)
- PDF page and zoom level
- Selected component
- Highlighted nets
- Cursor position (show remote cursor)
- Measurements taken
- Annotations drawn
- Chat messages

**File:** `collaboration.js` (new, ~600 lines)
```javascript
class CollaborationSession {
  constructor() {
    this.peer = null;
    this.connection = null;
    this.roomCode = null;
    this.participants = [];
    this.isHost = false;
  }
  
  async createSession() {
    // Generate 6-digit room code
    // Initialize WebRTC peer
    // Return room code for sharing
  }
  
  async joinSession(roomCode) {
    // Connect to existing session
    // Download board files from host
    // Sync current state
  }
  
  syncState(state) {
    // Broadcast state changes to all participants
  }
  
  on(event, callback) {
    // Events: 'participant-joined', 'state-changed', 'message'
  }
}
```

#### UI Components

**Collaboration Panel**
- "Start Session" button → generates room code
- "Join Session" input → enter 6-digit code
- Participant list with avatars
- Chat panel (text messages)
- Remote cursor indicators (colored per user)
- Annotation tools (draw, point, highlight)
- Voice chat toggle (optional)
- Screen share toggle (optional)

**Visual Indicators**
- Remote cursors (colored circles with name labels)
- Remote selections (colored outlines)
- Remote annotations (colored, attributed)
- Participant badges in header

#### Security & Privacy
- End-to-end encryption (WebRTC DTLS)
- No board data stored on servers
- Session expires after 24 hours
- Optional password protection for rooms
- Audit log of all actions

#### Implementation Steps
1. Research WebRTC libraries (PeerJS, simple-peer)
2. Implement room code generation and signaling
3. Build state synchronization engine
4. Create collaboration UI panel
5. Add remote cursor rendering
6. Implement chat system
7. Add annotation attribution
8. Test with 2-4 simultaneous users
9. Add voice chat (optional)
10. Document security and privacy features

---

## 4. Macro Recording

### Overview
Record sequences of measurements, searches, and actions, then replay them automatically. Speeds up repetitive diagnostic workflows like power rail checks or component testing.

### Technical Architecture

#### Macro System

**File:** `macro-recorder.js` (new, ~400 lines)
```javascript
class MacroRecorder {
  constructor() {
    this.recording = false;
    this.actions = [];
    this.macros = [];
  }
  
  startRecording(name) {
    // Begin capturing user actions
  }
  
  stopRecording() {
    // Save macro to library
  }
  
  async playMacro(macroId) {
    // Execute actions sequentially
    // Show progress indicator
    // Handle errors gracefully
  }
  
  exportMacro(macroId) {
    // Export as JSON for sharing
  }
}
```

#### Recordable Actions

**Measurements:**
- Search for component
- Select component
- Click pad/pin
- Take measurement (V/D/R)
- Wait for stable reading
- Save measurement
- Move to next component

**Navigation:**
- Zoom to component
- Switch PDF page
- Toggle top/bottom side
- Rotate board

**Analysis:**
- Open power tree
- Run continuity check
- Scan for shorts
- Compare measurements

#### Macro Types

**Built-in Macros:**
1. **Power Rail Check** - Measure all major rails in sequence
2. **USB-C Port Test** - Check all USB-C pins for shorts/opens
3. **Display Connector Test** - Verify all display signals
4. **Audio Path Test** - Trace audio codec to speaker
5. **Charging Circuit Test** - Full charger IC diagnostic

**Custom Macros:**
- User-recorded sequences
- Editable action list
- Conditional logic (if voltage < 3V, then...)
- Loop support (repeat N times)

#### Data Model
```javascript
{
  id: 'macro-001',
  name: 'Power Rail Check',
  description: 'Measure all major power rails',
  builtin: true,
  actions: [
    {
      type: 'search',
      target: 'PP3V42_G3H',
      wait: 500
    },
    {
      type: 'measure',
      mode: 'DCV',
      waitForStable: true,
      timeout: 5000
    },
    {
      type: 'save',
      field: 'voltage'
    },
    {
      type: 'search',
      target: 'PPBUS_G3H',
      wait: 500
    }
  ],
  created: Date,
  lastRun: Date,
  runCount: number
}
```

#### UI Components

**Macro Panel**
- Library of saved macros (built-in + custom)
- Record button (red dot, starts recording)
- Stop button (saves macro with name)
- Play button (executes macro)
- Edit button (modify action sequence)
- Progress indicator during playback
- Results summary after completion

**Macro Editor**
- Action list (drag to reorder)
- Add action dropdown
- Edit action parameters
- Delete action button
- Test macro button
- Save/cancel buttons

#### Implementation Steps
1. Create action capture system (event listeners)
2. Build macro storage (localStorage + export)
3. Implement playback engine with error handling
4. Create macro library UI
5. Add built-in macros (5 common sequences)
6. Build macro editor for custom sequences
7. Add conditional logic support
8. Implement loop/repeat functionality
9. Create progress indicator
10. Add macro sharing (import/export JSON)

---

## 5. Post-Repair Testing Suite

### Overview
Automated test sequences to verify repairs before returning devices to customers. Checks power rails, signals, and functionality to ensure quality and reduce callbacks.

### Technical Architecture

#### Test Suite System

**File:** `test-suite.js` (new, ~500 lines)
```javascript
class TestSuite {
  constructor() {
    this.tests = [];
    this.results = [];
    this.running = false;
  }
  
  async runSuite(suiteId) {
    // Execute all tests in sequence
    // Log results
    // Generate pass/fail report
  }
  
  async runTest(testId) {
    // Execute single test
    // Return result
  }
  
  generateReport() {
    // HTML report with pass/fail summary
  }
}
```

#### Test Categories

**1. Power Rail Tests**
- Measure all major rails
- Compare to OBD reference
- Check for shorts between rails
- Verify sequencing order
- Test under load (if possible)

**2. Signal Integrity Tests**
- Check critical signals (I2C, SPI, UART)
- Verify clock signals present
- Test USB data lines
- Check display signals (LVDS, eDP)

**3. Component Tests**
- Verify replaced components installed correctly
- Check solder joints (visual + electrical)
- Test MOSFET switching
- Verify capacitor ESR

**4. Functional Tests**
- Power-on test (does it boot?)
- Display test (backlight, image)
- USB test (device enumeration)
- Audio test (speaker output)
- Charging test (current draw)

#### Test Definitions

**Built-in Test Suites:**
1. **MacBook Power-On Test** - 15 tests, ~3 minutes
2. **iPhone Charging Test** - 8 tests, ~2 minutes
3. **iPad Display Test** - 12 tests, ~4 minutes
4. **Quick Power Check** - 5 tests, ~1 minute
5. **Full Diagnostic** - 30+ tests, ~10 minutes

**Custom Test Suites:**
- User-defined test sequences
- Conditional tests (if X fails, skip Y)
- Configurable pass/fail thresholds
- Notes and photos per test

#### Data Model
```javascript
{
  suiteId: 'macbook-power-on',
  name: 'MacBook Power-On Test',
  description: 'Verify all power rails and boot sequence',
  boardModels: ['820-00165', '820-3437'],
  tests: [
    {
      id: 'test-001',
      name: 'PPBUS_G3H Voltage',
      type: 'measurement',
      target: 'PPBUS_G3H',
      mode: 'DCV',
      expected: 12.6,
      tolerance: 0.5,
      unit: 'V',
      critical: true,
      timeout: 5000
    },
    {
      id: 'test-002',
      name: 'PP3V42_G3H Voltage',
      type: 'measurement',
      target: 'PP3V42_G3H',
      mode: 'DCV',
      expected: 3.42,
      tolerance: 0.1,
      unit: 'V',
      critical: true,
      dependsOn: 'test-001'
    }
  ],
  estimatedDuration: 180000, // ms
  created: Date,
  lastRun: Date
}
```

#### Test Results
```javascript
{
  suiteId: 'macbook-power-on',
  runDate: Date,
  boardId: '820-00165',
  jobTicket: 'JOB-001',
  technician: 'John Doe',
  duration: 185000, // ms
  results: [
    {
      testId: 'test-001',
      status: 'PASS',
      measured: 12.58,
      expected: 12.6,
      tolerance: 0.5,
      timestamp: Date
    },
    {
      testId: 'test-002',
      status: 'FAIL',
      measured: 0.0,
      expected: 3.42,
      tolerance: 0.1,
      timestamp: Date,
      notes: 'No voltage present - check U7800'
    }
  ],
  overallStatus: 'FAIL',
  passCount: 14,
  failCount: 1,
  skipCount: 0
}
```

#### UI Components

**Test Suite Panel**
- Suite selector dropdown
- "Run Suite" button
- Progress bar with current test
- Real-time results list (pass/fail indicators)
- Pause/Resume/Stop buttons
- Results summary (X/Y tests passed)
- Export report button

**Test Results View**
- Pass/fail summary with percentages
- Failed tests highlighted in red
- Measured vs expected values
- Timestamp for each test
- Notes field for failures
- Retest button for failed tests
- Print/PDF export

**Test Editor**
- Create custom test suite
- Add/remove/reorder tests
- Configure thresholds
- Set dependencies
- Test the test (dry run)

#### Implementation Steps
1. Design test suite JSON schema
2. Create built-in test suites (5 common scenarios)
3. Build test execution engine
4. Implement progress tracking
5. Create test suite UI panel
6. Add results visualization
7. Build test editor for custom suites
8. Implement report generation (HTML/PDF)
9. Add test suite sharing (import/export)
10. Integrate with job tickets (auto-run on completion)

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Set up new file structure
- [ ] Create base classes for each feature
- [ ] Design UI mockups
- [ ] Define data models and APIs

### Phase 2: Oscilloscope (Weeks 3-4)
- [ ] Implement Web USB connection
- [ ] Build waveform capture engine
- [ ] Create oscilloscope window UI
- [ ] Add protocol decoders
- [ ] Integrate with board view

### Phase 3: Component Library (Weeks 5-6)
- [ ] Create component database schema
- [ ] Populate initial 100 components
- [ ] Build search and filter UI
- [ ] Implement pinout renderer
- [ ] Add failure mode guides

### Phase 4: Team Collaboration (Weeks 7-8)
- [ ] Implement WebRTC connection
- [ ] Build state synchronization
- [ ] Create collaboration UI
- [ ] Add remote cursors and annotations
- [ ] Test with multiple users

### Phase 5: Macro Recording (Week 9)
- [ ] Build action capture system
- [ ] Implement playback engine
- [ ] Create macro library UI
- [ ] Add built-in macros
- [ ] Build macro editor

### Phase 6: Testing Suite (Week 10)
- [ ] Design test suite schema
- [ ] Create built-in test suites
- [ ] Build test execution engine
- [ ] Implement results UI
- [ ] Add report generation

### Phase 7: Integration & Polish (Weeks 11-12)
- [ ] Cross-feature integration
- [ ] Performance optimization
- [ ] User testing and feedback
- [ ] Documentation and tutorials
- [ ] Release v6.0

---

## File Structure

```
boardscope_6/
├── oscilloscope.js          (new, ~800 lines)
├── component-library.js     (new, ~600 lines)
├── collaboration.js         (new, ~600 lines)
├── macro-recorder.js        (new, ~400 lines)
├── test-suite.js           (new, ~500 lines)
├── data/
│   ├── component-library.json    (new, ~5MB)
│   ├── test-suites.json         (new, ~500KB)
│   └── macros.json              (new, ~100KB)
├── docs/
│   ├── OSCILLOSCOPE_GUIDE.md    (new)
│   ├── COMPONENT_LIBRARY.md     (new)
│   ├── COLLABORATION_GUIDE.md   (new)
│   ├── MACRO_GUIDE.md          (new)
│   └── TESTING_GUIDE.md        (new)
└── boardview.html          (updated, add UI panels)
```

---

## Technical Dependencies

### New Libraries Required
- **PeerJS** or **simple-peer** - WebRTC abstraction (~50KB)
- **Chart.js** or **Plotly.js** - Waveform rendering (~200KB)
- **Fuse.js** - Fuzzy search for component library (~20KB)

### Browser APIs Used
- **Web USB** - Oscilloscope connection
- **WebRTC** - Team collaboration
- **IndexedDB** - Component library storage
- **Web Workers** - Waveform processing

### Performance Considerations
- Oscilloscope waveform rendering: Use WebGL or OffscreenCanvas
- Component library: Lazy-load images, index search
- Collaboration: Throttle state updates to 10Hz
- Macro playback: Add delays between actions for stability

---

## Success Metrics

### Oscilloscope Integration
- ✓ Connect to Hantek 6022BE successfully
- ✓ Capture waveforms at 1 MSa/s
- ✓ Decode I2C/SPI/UART protocols
- ✓ Export waveforms in 3 formats

### Component Library
- ✓ 100+ components in initial database
- ✓ Search returns results in <100ms
- ✓ Interactive pinout diagrams
- ✓ Community contributions enabled

### Team Collaboration
- ✓ Connect 2 users with <500ms latency
- ✓ Sync state updates in real-time
- ✓ Remote cursor visible and smooth
- ✓ Chat messages delivered instantly

### Macro Recording
- ✓ Record 10-step macro successfully
- ✓ Playback completes without errors
- ✓ 5 built-in macros included
- ✓ Custom macros editable

### Post-Repair Testing
- ✓ 5 built-in test suites
- ✓ Run 15-test suite in <5 minutes
- ✓ Generate PDF report
- ✓ 95%+ test reliability

---

## Risk Assessment

### High Risk
- **Oscilloscope hardware compatibility** - Limited USB scope options
  - *Mitigation:* Start with screenshot import, add USB later
- **WebRTC connection reliability** - NAT/firewall issues
  - *Mitigation:* Provide TURN server fallback

### Medium Risk
- **Component library data quality** - Manual curation is slow
  - *Mitigation:* Start with top 100, crowdsource rest
- **Macro playback timing** - Actions may fail if too fast
  - *Mitigation:* Add configurable delays and retry logic

### Low Risk
- **Test suite accuracy** - Thresholds may need tuning
  - *Mitigation:* Make thresholds user-configurable
- **Performance with all features** - May slow down on older hardware
  - *Mitigation:* Lazy-load features, optimize rendering

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize features** if timeline is tight
3. **Set up development environment** for new features
4. **Create UI mockups** for each feature
5. **Begin Phase 1** (Foundation) implementation

---

## Questions for Discussion

1. Should oscilloscope support be USB-only or also support network scopes?
2. Component library: Manual curation or automated scraping?
3. Collaboration: P2P only or also server-mediated?
4. Macro recording: Simple playback or full programming language?
5. Testing suite: Auto-run on job completion or manual trigger?

---

**This plan provides a solid foundation for implementing these 5 high-impact features. Each feature is designed to integrate seamlessly with BoardScope's existing architecture while providing significant value to professional repair technicians.**
