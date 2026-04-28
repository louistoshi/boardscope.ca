# BoardScope Multimeter Feature — Master Plan

> **Last Updated:** 2026-04-17
> **Status:** Phases 1-5 COMPLETE. Phase 6 (advanced features) planned for future development.

---

## Current State (What Exists Today)

### Core Multimeter (`multimeter.js`)
- ✅ FS9721 protocol parser (14-byte frames, 2400 baud)
- ✅ Web Serial API connection (Chrome/Edge)
- ✅ Supported meters: UNI-T UT61E/D, Victor VC86/82, Mastech MS8250D, Voltcraft VC-820/840
- ✅ Real-time reading stream (~2-3 readings/sec)
- ✅ Stable reading detection (debounce: 1s window, 1% tolerance)
- ✅ Mode decoding: DCV, ACV, mV, DCA, ACA, mA, uA, OHM, DIODE, CONT, CAP, FREQ, DUTY, TEMP
- ✅ Event bus: `reading`, `stable`, `mode`, `status`, `error`

### UI Integration (`boardview.html`)
- ✅ Multimeter bar (`#mmeter-bar`) — hidden by default, now toggleable via Settings
- ✅ Connect/Disconnect button
- ✅ Live reading display (value, mode, readings/sec)
- ✅ Auto-Fill toggle — fills V/D/R fields in probe mode from meter
- ✅ Capture toggle — auto-captures stable readings to active net
- ✅ Record as OBD — saves stable reading as OpenBoardData reference

### Color Maps (Live Updates from Meter)
- ✅ **VoltMap** — colors components by voltage reading (DCV/ACV/mV modes)
- ✅ **DiodeMap** — colors components by diode drop reading (DIODE/CONT modes)
- ✅ **HeatMap** — colors components by deviation from reference (works with any mode)
- ✅ Live update hooks: `voltMapLiveUpdate()`, `diodeMapLiveUpdate()`, `heatMapLiveUpdate()`

### Probe Mode (`G.measMode`)
- ✅ Click-to-measure on any pad
- ✅ Manual V/D/R entry fields
- ✅ Save to local measurements
- ✅ Compare against OBD reference data

### Continuity Probe (`CONT`)
- ✅ Two-point continuity testing (click A, click B)
- ✅ Shows resistance between two points

---

## Phase 2: Enhanced Multimeter UI & UX

### 2.1 Multimeter Dashboard Panel
**Problem:** The current bar is cramped. A dedicated panel would give more room for features.

**Proposal:** Add a collapsible multimeter dashboard (similar to the settings panel) with:
- **Large numeric display** — big, easy-to-read digits (like a real DMM)
- **Analog bar graph** — visual representation of reading magnitude
- **Mode indicator** — large icon + text (DCV, DIODE, OHM, etc.)
- **Trend sparkline** — mini chart showing last 30 readings
- **Min/Max/Avg** — track statistics during session
- **Relative mode (Δ)** — zero to a reference, show deviation
- **Hold button** — freeze current reading on screen

### 2.2 Meter Settings Dialog
- **Baud rate selector** — 2400 (default), 9600, 19200 (for non-FS9721 meters)
- **Protocol selector** — FS9721 (default), VC871, DT9721, custom
- **Stable window** — adjustable debounce time (500ms–5s)
- **Stable tolerance** — adjustable % tolerance (0.1%–10%)
- **Auto-ranging vs manual range** — if meter supports it
- **Calibration offset** — per-mode calibration correction

### 2.3 Reading History & Export
- **Scrollable history log** — timestamped list of all stable readings
- **Export to CSV** — download readings as `.csv` file
- **Copy to clipboard** — copy last reading as formatted text
- **Screenshot with reading** — capture board view + meter reading overlay

---

## Phase 3: Deep VoltMap Integration

### 3.1 Voltage Rail Detection
- **Auto-detect power rails** — identify 3.3V, 5V, 12V, 1.8V, etc.
- **Color-code by expected voltage** — green = correct, red = wrong
- **Show rail name** — PP3V42_G3H, PPBUS_G3H, etc. (from OBD data)

### 3.2 Voltage Comparison Mode
- **Load known-good board data** — compare your readings vs reference
- **Delta display** — show difference from reference in mV
- **Pass/Fail overlay** — green = within tolerance, red = out of spec
- **Tolerance bands** — configurable (±5%, ±10%, ±50mV, etc.)

### 3.3 Voltage Mapping Workflow
1. Connect multimeter
2. Enable VoltMap
3. Touch probe to each test point on the board
4. Auto-capture fills the map in real-time
5. Color gradient shows voltage distribution
6. Export completed voltage map as report

---

## Phase 4: Deep DiodeMap Integration

### 4.1 Diode Drop Reference Database
- **Pre-loaded diode values** — common junctions (CPU, GPU, RAM, etc.)
- **Expected ranges** — 0.300–0.700V typical, OL for open
- **Short detection** — <0.050V = possible short
- **Open detection** — OL = open circuit or wrong polarity

### 4.2 Diode Map Workflow
1. Connect multimeter in diode mode
2. Enable DiodeMap
3. Touch probe to each pad (red probe on test point, black on ground)
4. Auto-capture fills the map
5. Color gradient shows diode drop distribution
6. Red areas = low drop (possible short)
7. Blue areas = normal drop
8. Grey areas = no data / open

### 4.3 Ground Plane Mapping
- **Auto-detect ground** — find the lowest diode drop point
- **Map all grounds** — show which pads connect to ground plane
- **Isolated ground detection** — find grounds that aren't connected to main plane

---

## Phase 5: Deep HeatMap Integration

### 5.1 Deviation Analysis
- **Per-net deviation** — compare each reading to OBD reference
- **Severity levels:**
  - 🟢 Green: within ±5% of reference
  - 🟡 Yellow: ±5–20% deviation
  - 🟠 Orange: ±20–50% deviation
  - 🔴 Red: >±50% deviation or OL vs expected value
- **Worst-first** — highlight the most deviant components first

### 5.2 Before/After Repair Comparison
- **Snapshot before repair** — save current HeatMap state
- **Snapshot after repair** — compare to before
- **Diff view** — show what changed
- **Repair verification** — confirm readings now match reference

### 5.3 Statistical HeatMap
- **Multiple readings per net** — show min, max, avg, stddev
- **Confidence indicator** — more readings = higher confidence
- **Time-based decay** — older readings fade, newer readings are brighter

---

## Phase 6: Advanced Features

### 6.1 Guided Measurement Mode
- **Step-by-step test sequence** — follow a predefined test procedure
- **Checklist** — tick off each measurement as you go
- **Auto-advance** — move to next test point when reading is stable
- **Pass/Fail at each step** — compare to expected value immediately
- **Test plan import** — load from JSON/CSV test plan files

### 6.2 Fault Tree Integration
- **Link measurements to fault tree** — each reading informs a decision node
- **Auto-navigate** — based on reading, follow the fault tree to next step
- **AI-assisted diagnosis** — feed readings to AI for real-time fault analysis
- **Confidence score** — AI shows how confident it is in the diagnosis

### 6.3 Multi-Meter Support
- **Two meters simultaneously** — one for voltage, one for diode
- **Differential measurement** — two probes, show difference
- **Current + voltage** — calculate power (P = V × I)
- **Temperature logging** — track board temperature over time

### 6.4 Automated Test Sequences
- **Sweep mode** — automatically measure all pads on a net
- **Boundary scan** — measure all pins of a specific IC
- **Power rail sweep** — measure all points on a power rail
- **Report generation** — auto-generate PDF report with all readings

### 6.5 Bluetooth/WiFi Meter Support
- **Bluetooth Low Energy (BLE)** — support for wireless meters
- **WiFi-connected meters** — TCP/UDP protocol support
- **Fluke Connect** — integrate with Fluke's cloud API
- **UNI-T UTi series** — thermal camera integration

### 6.6 Data Logging & Trending
- **Long-term logging** — record readings over hours/days
- **Trend charts** — voltage over time, temperature over time
- **Alert thresholds** — notify when reading goes out of range
- **Export to spreadsheet** — CSV, Excel, Google Sheets

### 6.7 Board Comparison Mode
- **Load two boards** — known-good vs under-test
- **Side-by-side readings** — compare each measurement
- **Delta heatmap** — show differences between boards
- **Batch import** — import readings from another technician's session

### 6.8 AI-Powered Analysis
- **Pattern recognition** — AI identifies common fault patterns from readings
- **Predictive diagnosis** — "Based on these 12 readings, the most likely fault is..."
- **Learning from repairs** — AI learns which readings correlate with which fixes
- **Community data** — anonymized readings from many boards improve diagnosis

---

## Implementation Priority

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| 2.1 Dashboard Panel | High | Medium | High |
| 2.2 Meter Settings | Medium | Low | Medium |
| 2.3 History & Export | Medium | Low | Medium |
| 3.1 Voltage Rail Detection | High | Medium | High |
| 3.2 Voltage Comparison | High | Medium | High |
| 4.1 Diode Reference DB | High | Medium | High |
| 4.2 Diode Workflow | High | Low | High |
| 5.1 Deviation Analysis | High | Medium | High |
| 5.2 Before/After | Medium | Medium | Medium |
| 6.1 Guided Measurement | Medium | High | High |
| 6.2 Fault Tree Integration | Medium | High | High |
| 6.3 Multi-Meter | Low | High | Medium |
| 6.4 Automated Tests | Low | High | Medium |
| 6.5 Bluetooth/WiFi | Low | High | Medium |
| 6.6 Data Logging | Medium | Medium | Medium |
| 6.7 Board Comparison | Medium | High | High |
| 6.8 AI Analysis | Low | High | High |

---

## Technical Architecture

### Data Flow
```
Multimeter (USB/BLE/WiFi)
    ↓
FS9721 Parser (multimeter.js)
    ↓
Reading Object: { value, display, unit, mode, negative, ol, timestamp, stable }
    ↓
Event Bus → 'reading' / 'stable' events
    ↓
┌─────────────────┬──────────────────┬──────────────────┐
│  VoltMap        │  DiodeMap        │  HeatMap         │
│  (DCV/ACV/mV)   │  (DIODE/CONT)    │  (any mode)      │
│  buildVoltMap() │  buildDiodeMap() │  heatMapColor()  │
└─────────────────┴──────────────────┴──────────────────┘
    ↓
Canvas Render (drawBRD())
    ↓
Color-coded components on screen
```

### Key Files
- `multimeter.js` — Multimeter class, FS9721 parser
- `boardview.html` — UI, event handlers, map rendering
- `server.js` — Backend (if needed for data storage)
- `data/` — Board files, OBD data, reference data

### State Variables
- `G_meter` — Multimeter instance
- `G_meterAutoFill` — Auto-fill toggle state
- `G_meterAutoCapture` — Auto-capture toggle state
- `G.voltMap` — VoltMap enabled flag
- `G.diodeMap` — DiodeMap enabled flag
- `G_heatMap` — HeatMap enabled flag
- `G.measMode` — Probe mode enabled flag
- `G.localMeas` — Map of net → measurements
- `G.obd` — OpenBoardData reference data

---

## Crash Recovery Checklist

If the app crashes while working on the multimeter feature:

1. **Check `multimeter.js`** — this is the standalone multimeter class (should be untouched)
2. **Check `boardview.html` lines ~2371-2381** — multimeter bar HTML
3. **Check `boardview.html` lines ~12051-12065** — multimeter toggle handler
4. **Check `boardview.html` lines ~11985-11995** — `applySettingsToUI()` multimeter section
5. **Check `boardview.html` lines ~11929** — `V_DEFAULTS.showMeterBar`
6. **Check `boardview.html` lines ~14115-14320** — `mmeterInit()` and all meter functions
7. **Verify CSS** — `#mmeter-bar` styles around line 1200-1245
8. **Test:** Open Settings → check "Show multimeter bar" → bar should appear at bottom

---

## Notes & Ideas

### Quick Wins
- [x] Add multimeter toggle to Settings panel (DONE)
- [ ] Add keyboard shortcut `M` to toggle multimeter bar
- [ ] Add meter connection status to status bar
- [ ] Show meter icon in toolbar when connected

### Future Considerations
- Support for non-FS9721 meters (Fluke, Keysight, etc.)
- Meter calibration wizard
- Virtual COM port support for Electron app
- Offline mode — cache readings when no network
- Multi-language support for meter UI strings
- Accessibility — screen reader support for readings
- Dark mode optimization for meter display
- Print-friendly report output

### Known Limitations
- Web Serial only works in Chrome/Edge (not Firefox/Safari)
- Electron app may need serialport npm package instead of Web Serial
- FS9721 protocol is one-way (meter sends, we receive) — can't change meter settings remotely
- No support for meter features like relative mode, min/max, hold (these are meter-side features)
