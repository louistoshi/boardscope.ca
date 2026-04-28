# BoardScope — Feature Audit & Roadmap

Last reviewed: 2026-04-18

---

## What We Have (Confirmed in Code)

| Feature | Evidence |
|---|---|
| Net aliases | `netAliases` Map, `aliasOf()`, `#alias-net-in` |
| Component notes | `compNotes` Map, note editing UI |
| Repair log | `#tog-log`, session export includes log |
| Repair templates | `#tog-templates`, `.boardtemplate` import/export |
| Fault tree diagnosis | `#tog-fault`, decision node panel, `buildFaultTree()` |
| Power tree visualization | `#tog-ptree`, `buildPowerTree()` |
| Multi-search (shared nets) | `#tog-ms`, shift+click, `sharedNets` array |
| Short circuit finder | `#tog-short`, shorts analysis |
| Continuity checker | `#tog-cont`, two-point probe mode |
| Test point navigator | `#tog-tp`, TP filtering + navigation |
| Board statistics | Stats panel, component/net counts |
| Board comparison | `#cmp-panel`, side-by-side file diff |
| Session export / import | `sessionExport()`, `btn-session-export/import` |
| Measurement export CSV | `exportMeasurementsCSV()`, meter CSV |
| PDF annotations | Draw/arrow/rect/text/erase, undo/redo |
| Photo overlay | `overlayLoad()`, alignment handles |
| Voltage map | `buildVoltMap()`, `#tog-voltmap` |
| Diode map | `buildDiodeMap()`, `#tog-diodemap` |
| Heat map | `heatMapColor()`, `#tog-heatmap` |
| OpenBoardData integration | OBD import/export, `openboarddata.org` API |
| Live multimeter (FS9721) | Full `Multimeter` class, all modes, stats, sparkline |
| Probe mode (click-to-measure) | Click pads → log V/D/R, auto-capture |

---

## Implemented (this session — 2026-04-18)

| Feature | Where |
|---|---|
| Thermal map import | VIEW dropdown → 🌡 THERMAL MAP — reuses photo overlay engine |
| Capacitor ESR indicator | Component sidebar — auto-shows for C* refs with resistance readings |
| Before/after measurement diff | SNAP button in probe bar + BEFORE/AFTER DIFF in REPAIR dropdown |
| Liquid damage map | REPAIR dropdown → 💧 DAMAGE MAP — click to tag CORROSION/BRIDGE/MISSING/BURNED |
| Known-bad component database | Sidebar — red/amber warning badge for known failing parts per board model |
| Replacement cross-reference | Sidebar — 🔁 SUBSTITUTES section with alternative part numbers |
| Power sequencing timeline | BOARD dropdown → ▶ POWER SEQUENCE — board-specific step-by-step rail timeline |
| Component datasheet lookup | Sidebar — 📄 Datasheet / 🛒 LCSC / 🔍 Octopart links for every component |
| Board revision tracker | Header input field — persists per boardId in localStorage + session export |
| MOSFET guided tester | Sidebar — ⚡ MOSFET TEST GUIDE collapsible panel for Q* components |

---

## Partial — Needs Completion

### 1. Before/After Measurement Diff
**What exists:** `G_snapshot` object is stored in session tabs  
**What's missing:** No UI to compare snapshot A vs snapshot B side by side  
**Plan:** Add a "SNAPSHOT" button to probe mode that saves current measurements as baseline. Add a diff view in MEAS. TABLE that shows Δ value and pass/fail change per component.

### 2. Liquid Damage Map
**What exists:** Liquid damage mentioned in fault tree templates  
**What's missing:** No way to visually mark components as corroded/bridged/missing on the board  
**Plan:** Add a damage-marking mode (like probe mode) where techs tap components to tag them: `CORROSION`, `BRIDGE`, `MISSING`, `BURNED`. Show as colored overlays. Include in repair report export.

### 3. Board Comparison
**What exists:** Drop-overlay for two files  
**What's missing:** Full side-by-side component diff table with MATCH / EXTRA / MISSING / DIFF status (as documented in manual but not fully confirmed in code)  
**Plan:** Verify current state, complete the diff table UI if partial.

---

## Missing — Prioritized Backlog

### Priority 1 — High value, low complexity

#### ~~Schematic Auto-Link~~ ✅ DONE
Implemented as "FIND IN SCHEMATIC" on the net panel (`#np-sch`). Searches PDF text layer for the net name (including alias), jumps to the correct page, and reports all occurrences. Already works.

#### Capacitor ESR Indicator
**What it does:** When a resistance reading is taken in probe mode on a capacitor, flag it as likely-bad if ESR is outside expected range for that cap's value/size.  
**Why it matters:** Bad caps (MLCC cracked, electrolytic dry) are one of the most common Apple board faults. Currently techs have to know the thresholds in their heads.  
**How:** Cross-reference component value (from boardview) with measured R. Show green/amber/red indicator. No external API needed.  
**Complexity:** Low. Pure logic on existing data.

#### Known-Bad Components Database
**What it does:** Flag components on the board that are known to fail on specific models (e.g. U7100 on 820-3437, backlight coils, specific MOSFETs).  
**Why it matters:** Community knowledge is currently in forum posts. Surfacing it at the point of repair saves significant time.  
**How:** A bundled JSON database keyed by board ID + component ref. Overlay a warning icon on flagged parts. Community can contribute via a shared format.  
**Complexity:** Low (static data) to Medium (if community-sync is added).

---

### Priority 2 — High value, medium complexity

#### Power Sequencing Timeline
**What it does:** Visual horizontal timeline showing which rails power up in what order, with expected timing. Lets tech see at a glance which rail in the sequence is missing.  
**Why it matters:** Apple boards have strict power-on sequences. A dead PP3V3_S5 before PP5V_S0 means you look in completely different places. No other tool visualizes this.  
**How:** Static sequence data per board model (JSON). Live meter readings overlay on the timeline nodes as colored dots (present/missing/wrong voltage).  
**Complexity:** Medium. Sequence data needs to be authored per board model.

#### Component Datasheet Lookup
**What it does:** Click any component → see its datasheet inline (PDF embed) or open in browser. Pull from Octopart API or local cache.  
**Why it matters:** Techs alt-tab to browser to search datasheets constantly.  
**How:** On component select, query Octopart free API with part number. Show datasheet PDF link or embed in a side panel. Cache results locally.  
**Complexity:** Medium. Requires API key (Octopart free tier is sufficient).

#### Replacement / Cross-Reference Lookup
**What it does:** For NLA or unobtanium parts, suggest known substitutes.  
**Why it matters:** Many Apple-specific ICs have documented drop-in replacements (e.g. specific gate drivers, PMICs). Community lists exist but aren't surfaced at repair time.  
**How:** Bundled cross-ref JSON + optional community API. Show in component sidebar as "SUBSTITUTES" section.  
**Complexity:** Low-Medium. Mostly a data problem, not an engineering problem.

---

### Priority 3 — Useful but specialized

#### Thermal Map Import
**What it does:** Import a FLIR or thermal photo and align it over the boardview (same mechanism as photo overlay). Hot spots map to component names.  
**Why it matters:** Thermal cameras are increasingly common in repair shops. Knowing "this hot spot is U3100" without manually comparing two images is valuable.  
**How:** Reuse the existing photo overlay alignment system. Add a "thermal mode" color interpretation (no changes to core logic needed).  
**Complexity:** Low. Mostly reusing existing overlay infrastructure.

#### Board Revision Tracker
**What it does:** Tag a loaded board as a specific revision (e.g. "820-00165 Rev 4"). Store revision-specific notes and known differences.  
**Why it matters:** Same schematic covers multiple PCB revisions with different component placements or values. OBD data and known-bad lists need to be revision-aware.  
**How:** Revision field in session metadata. Filter OBD and known-bad data by revision tag.  
**Complexity:** Low (metadata only) to Medium (if revision-aware data filtering is added).

#### Mosfet / Gate Driver Guided Tester
**What it does:** For a selected MOSFET or gate driver, show a guided test sequence: check gate voltage, source, drain, expected behavior.  
**Why it matters:** MOSFETs are one of the most probed component types in Apple board repair. A guided workflow prevents mistakes.  
**How:** Component-type detection (already done for color coding). If type = MOSFET, show guided panel with pin diagram and expected readings.  
**Complexity:** Medium. Needs per-package pin mapping.

---

### Priority 4 — Nice to have / lower frequency

| Feature | Notes |
|---|---|
| Client repair ticket / job tracking | Out of scope for a board analysis tool — use a separate job management app |
| BGA reballing checklist | Very specialized; better as a repair template than a built-in feature |
| Stencil / BGA ball map viewer | Needs external data source; low ROI vs complexity |
| Logic analyzer integration | Web Serial sampling too slow for real signals; only viable with a dedicated sigrok device |

---

## Implementation Order

```
Phase 1 (Quick wins)
├── Schematic auto-link          ← highest daily friction
├── Capacitor ESR indicator      ← pure logic, no new UI
├── Thermal map (reuse overlay)  ← almost free with existing overlay
└── Before/after diff UI         ← snapshot data already exists

Phase 2 (Data features)
├── Known-bad component DB       ← needs JSON data authored
├── Replacement cross-reference  ← needs JSON data authored
└── Liquid damage map            ← new marking mode

Phase 3 (Richer integrations)
├── Power sequencing timeline    ← needs per-board sequence data
├── Component datasheet lookup   ← needs Octopart API key
└── Board revision tracker       ← depends on OBD/known-bad being revision-aware

Phase 4 (Specialized)
├── Mosfet guided tester
└── Board comparison (complete partial)
```

---

## Do Not Duplicate

These are already implemented — do not rebuild:

- Net highlighting → already on click
- Component search → `#comp-search` with full syntax
- Measurement logging → probe mode + auto-capture
- Voltage/diode reference → meter window hint line + OBD
- Schematic PDF search → PDF search input (text search, not page-jump)
- Photo alignment → `overlayLoad()` with drag handles
- Community measurements → OpenBoardData import/export
