# BoardScope v6.0 - boardview.html Integration Guide

This document shows **exactly** what needs to be added to [`boardview.html`](../boardview.html) to integrate the 5 new features.

---

## 📍 Integration Points Overview

```
boardview.html (17,156 lines)
├── <head> section
│   └── Add: Script tags for new modules (Line ~17)
├── <header> section  
│   └── Add: Collaboration and Oscilloscope buttons (Line ~1869)
├── Toolbar dropdowns
│   ├── REPAIR dropdown → Add: Macros, Test Suite buttons (Line ~2040)
│   └── BOARD dropdown → Add: Component Library button (Line ~2070)
├── Main content area
│   ├── Add: Macro panel HTML (after line ~2500)
│   ├── Add: Component Library panel HTML (after line ~2600)
│   ├── Add: Test Suite panel HTML (after line ~2700)
│   ├── Add: Collaboration panel HTML (after line ~2800)
│   └── Add: Oscilloscope window HTML (after line ~2900)
└── <script> section
    └── Add: Initialization and event handlers (Line ~17000+)
```

---

## 1️⃣ Add Script Tags (in `<head>`)

**Location:** After line 17 (after `<script src="multimeter.js?v=3"></script>`)

```html
<!-- v6.0 New Features -->
<script src="macro-recorder.js?v=6"></script>
<script src="component-library.js?v=6"></script>
<script src="test-suite.js?v=6"></script>
<script src="collaboration.js?v=6"></script>
<script src="oscilloscope.js?v=6"></script>
```

---

## 2️⃣ Add Header Buttons

**Location:** In header section, after line 1869 (after the JOBS button)

```html
<!-- Collaboration button -->
<button class="hbtn" id="collab-btn" title="Team Collaboration - share session with remote technician">
  👥 <span>COLLABORATE</span>
</button>

<!-- Oscilloscope button -->
<button class="hbtn" id="scope-btn" title="Oscilloscope - waveform capture and analysis">
  📊 <span>SCOPE</span>
</button>
```

---

## 3️⃣ Add Toolbar Dropdown Items

### A. REPAIR Dropdown

**Location:** In REPAIR dropdown, after line 2061 (after REPAIR LOG button)

```html
<div class="tb-drop-label">AUTOMATION</div>
<button class="tog tb-drop-item" id="tog-macros" title="Macro Recorder - record and replay measurement sequences">
  🎬 MACROS
</button>
<button class="tog tb-drop-item" id="tog-testing" title="Post-Repair Testing - automated test suites">
  ✅ TEST SUITE
</button>
```

### B. BOARD Dropdown

**Location:** In BOARD dropdown, after line 2070 (after BOARD DATABASE button)

```html
<button class="tog tb-drop-item" id="tog-comp-library" title="Component Library - IC database with pinouts and failure modes">
  📚 COMPONENT LIBRARY
</button>
```

---

## 4️⃣ Add CSS Styles

**Location:** In `<style>` section, after line 1816 (after existing panel styles)

```css
/* ── MACRO PANEL ── */
#macro-panel {
  position: absolute; top: 8px; right: 8px; z-index: 44;
  background: var(--bg2); border: 1px solid #ff6b9d; border-radius: var(--r);
  display: none; width: 360px; max-height: 80vh; flex-direction: column;
  box-shadow: 0 6px 28px rgba(255,107,157,0.25); overflow: hidden;
}
#macro-panel.open { display: flex; }
#macro-hdr {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  background: var(--bg3); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
#macro-title { font-size: 10px; font-weight: 700; color: #ff6b9d; letter-spacing: 2px; flex: 1; }
#macro-close { color: var(--text3); cursor: pointer; font-size: 12px; }
#macro-close:hover { color: var(--text); }
#macro-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.macro-card {
  background: var(--bg3); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; cursor: pointer; transition: all 0.15s;
}
.macro-card:hover { border-color: #ff6b9d; background: rgba(255,107,157,0.05); }
.macro-card-name { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
.macro-card-desc { font-size: 10px; color: var(--text3); line-height: 1.5; }
.macro-card-meta { font-size: 9px; color: var(--text3); margin-top: 6px; }
.macro-controls { display: flex; gap: 6px; margin-bottom: 12px; }
.macro-btn {
  flex: 1; background: var(--bg3); border: 1px solid var(--border2);
  color: var(--text2); font-family: var(--mono); font-size: 9px;
  padding: 6px; border-radius: 4px; cursor: pointer; transition: all 0.15s;
}
.macro-btn:hover { border-color: #ff6b9d; color: #ff6b9d; }
.macro-btn.recording { background: #2a0000; border-color: #ff3333; color: #ff3333; }
.macro-progress {
  background: var(--bg3); border-radius: 10px; height: 6px; overflow: hidden; margin-top: 8px;
}
.macro-progress-fill {
  background: linear-gradient(90deg, #ff6b9d, #ff3333); height: 100%;
  transition: width 0.3s ease;
}

/* ── COMPONENT LIBRARY PANEL ── */
#complib-panel {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 50;
  background: var(--bg); display: none; flex-direction: column; overflow: hidden;
}
#complib-panel.open { display: flex; }
#complib-hdr {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px;
  background: var(--bg3); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
#complib-title { font-size: 10px; font-weight: 700; color: #c0a0ff; letter-spacing: 2px; flex: 1; }
#complib-search {
  flex: 1; max-width: 400px; background: var(--bg2); border: 1px solid var(--border2);
  color: var(--text); font-family: var(--mono); font-size: 11px;
  padding: 5px 10px; border-radius: 4px; outline: none;
}
#complib-search:focus { border-color: #c0a0ff; }
#complib-close { color: var(--text3); cursor: pointer; font-size: 13px; }
#complib-close:hover { color: var(--text); }
#complib-body { flex: 1; overflow-y: auto; padding: 16px; }
.complib-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.complib-card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r);
  padding: 16px; cursor: pointer; transition: all 0.15s;
}
.complib-card:hover { border-color: #c0a0ff; box-shadow: 0 4px 16px rgba(192,160,255,0.2); }
.complib-card-title { font-size: 14px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
.complib-card-desc { font-size: 11px; color: var(--text2); line-height: 1.5; margin-bottom: 8px; }
.complib-card-meta { font-size: 9px; color: var(--text3); }

/* ── TEST SUITE PANEL ── */
#testing-panel {
  position: absolute; top: 8px; right: 8px; z-index: 44;
  background: var(--bg2); border: 1px solid #44cc66; border-radius: var(--r);
  display: none; width: 380px; max-height: 80vh; flex-direction: column;
  box-shadow: 0 6px 28px rgba(68,204,102,0.25); overflow: hidden;
}
#testing-panel.open { display: flex; }
#testing-hdr {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  background: var(--bg3); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
#testing-title { font-size: 10px; font-weight: 700; color: #44cc66; letter-spacing: 2px; flex: 1; }
#testing-close { color: var(--text3); cursor: pointer; font-size: 12px; }
#testing-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.test-suite-select {
  width: 100%; background: var(--bg3); border: 1px solid var(--border2);
  color: var(--text); font-family: var(--mono); font-size: 11px;
  padding: 6px 10px; border-radius: 4px; outline: none;
}
.test-suite-select:focus { border-color: #44cc66; }
.test-run-btn {
  background: #0a2010; border: 1px solid #44cc66; color: #44cc66;
  font-family: var(--mono); font-size: 10px; padding: 8px 14px;
  border-radius: 4px; cursor: pointer; letter-spacing: 0.5px;
}
.test-run-btn:hover { background: #143a20; }
.test-progress {
  background: var(--bg3); border-radius: 10px; height: 6px; overflow: hidden;
}
.test-progress-fill {
  background: linear-gradient(90deg, #44cc66, #00d9a6); height: 100%;
  transition: width 0.3s ease;
}
.test-result-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  background: var(--bg3); border-radius: 4px; font-size: 10px;
}
.test-status-pass { color: #44cc66; font-weight: 700; }
.test-status-fail { color: #ff5533; font-weight: 700; }
.test-status-skip { color: var(--text3); }

/* ── COLLABORATION PANEL ── */
#collab-panel {
  position: absolute; top: 8px; left: 8px; z-index: 44;
  background: var(--bg2); border: 1px solid #00d9ff; border-radius: var(--r);
  display: none; width: 320px; max-height: 70vh; flex-direction: column;
  box-shadow: 0 6px 28px rgba(0,217,255,0.25); overflow: hidden;
}
#collab-panel.open { display: flex; }
#collab-hdr {
  display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  background: var(--bg3); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
#collab-title { font-size: 10px; font-weight: 700; color: #00d9ff; letter-spacing: 2px; flex: 1; }
#collab-close { color: var(--text3); cursor: pointer; font-size: 12px; }
#collab-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.collab-room-code {
  background: var(--bg3); border: 1px solid #00d9ff; border-radius: 6px;
  padding: 12px; text-align: center; font-family: var(--mono);
  font-size: 24px; font-weight: 700; color: #00d9ff; letter-spacing: 4px;
}
.collab-participant {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  background: var(--bg3); border-radius: 4px;
}
.collab-avatar {
  width: 24px; height: 24px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; color: #000;
}
.collab-chat {
  max-height: 200px; overflow-y: auto; background: var(--bg3);
  border-radius: 4px; padding: 8px;
}
.collab-message {
  font-size: 11px; color: var(--text2); margin-bottom: 6px; line-height: 1.5;
}
.collab-message-name { color: var(--accent); font-weight: 700; }

/* ── OSCILLOSCOPE WINDOW ── */
#scope-win {
  display: none; position: fixed; right: 16px; top: 80px; width: 820px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.4); z-index: 150;
  font-family: var(--mono); flex-direction: column; overflow: hidden;
}
#scope-win.show { display: flex; }
#scope-win-hdr {
  display: flex; align-items: center; gap: 6px; padding: 7px 10px;
  background: var(--bg2); border-bottom: 1px solid var(--border);
  cursor: move; user-select: none; flex-shrink: 0;
}
#scope-win-title { font-size: 10px; color: var(--text3); letter-spacing: 1.5px; flex: 1; font-weight: 700; }
#scope-win-connect {
  background: var(--bg3); border: 1px solid var(--border2); color: var(--text2);
  font-family: var(--mono); font-size: 9px; padding: 3px 10px;
  border-radius: 4px; cursor: pointer; transition: all 0.12s;
}
#scope-win-connect:hover { background: var(--bg2); color: var(--text); }
#scope-win-connect.active { background: var(--bg); border-color: var(--accent); color: var(--accent); }
#scope-win-close {
  color: var(--text3); cursor: pointer; font-size: 13px; padding: 1px 5px;
  border-radius: 3px; flex-shrink: 0;
}
#scope-win-close:hover { color: #ff6655; background: rgba(255,80,60,0.1); }
#scope-win-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
#scope-canvas {
  width: 800px; height: 400px; background: var(--bg2);
  border: 1px solid var(--border); border-radius: 6px;
}
.scope-controls { display: flex; gap: 6px; flex-wrap: wrap; }
.scope-btn {
  background: var(--bg2); border: 1px solid var(--border); color: var(--text3);
  font-family: var(--mono); font-size: 9px; padding: 5px 10px;
  border-radius: 4px; cursor: pointer; transition: all 0.1s;
}
.scope-btn:hover { background: var(--bg3); color: var(--text2); }
.scope-btn.on { background: var(--bg); border-color: var(--accent); color: var(--accent); }
.scope-measurements {
  display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.scope-meas-card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: 4px;
  padding: 8px; font-size: 10px;
}
.scope-meas-label { color: var(--text3); font-size: 8px; letter-spacing: 1px; }
.scope-meas-value { color: var(--accent); font-size: 14px; font-weight: 700; }
```

---

## 5️⃣ Add HTML Panels

### A. Macro Panel

**Location:** After line ~2500 (in the main board view area, after other panels)

```html
<!-- Macro Recorder Panel -->
<div id="macro-panel">
  <div id="macro-hdr">
    <span id="macro-title">🎬 MACRO RECORDER</span>
    <span id="macro-close">✕</span>
  </div>
  <div id="macro-body">
    <div id="macro-hint" style="font-size:9px;color:var(--text3);line-height:1.5;margin-bottom:8px">
      Record measurement sequences and replay them automatically. Perfect for repetitive diagnostics.
    </div>
    
    <div class="macro-controls">
      <button class="macro-btn" id="macro-record-btn">⏺ RECORD</button>
      <button class="macro-btn" id="macro-stop-btn" style="display:none">⏹ STOP</button>
      <button class="macro-btn" id="macro-play-btn" disabled>▶ PLAY</button>
    </div>
    
    <div id="macro-recording-status" style="display:none;font-size:10px;color:#ff3333;padding:6px;background:rgba(255,51,51,0.1);border-radius:4px;margin-bottom:8px">
      ⏺ Recording... <span id="macro-action-count">0</span> actions
    </div>
    
    <div id="macro-progress-wrap" style="display:none">
      <div style="font-size:9px;color:var(--text3);margin-bottom:4px">
        Playing: <span id="macro-current-name"></span>
      </div>
      <div class="macro-progress">
        <div class="macro-progress-fill" id="macro-progress-fill" style="width:0%"></div>
      </div>
      <div style="font-size:9px;color:var(--text3);margin-top:4px">
        Step <span id="macro-step-current">0</span> of <span id="macro-step-total">0</span>
      </div>
    </div>
    
    <div style="font-size:9px;color:var(--text3);letter-spacing:1.5px;margin:12px 0 6px;font-weight:700">
      MACRO LIBRARY
    </div>
    <div id="macro-list"></div>
  </div>
</div>
```

### B. Component Library Panel

**Location:** After Macro Panel

```html
<!-- Component Library Panel -->
<div id="complib-panel">
  <div id="complib-hdr">
    <span id="complib-title">📚 COMPONENT LIBRARY</span>
    <input id="complib-search" type="text" placeholder="Search by part number, function, or board model..." autocomplete="off">
    <span id="complib-close">✕</span>
  </div>
  <div id="complib-body">
    <div id="complib-categories" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <!-- Category filter buttons will be inserted here -->
    </div>
    <div class="complib-grid" id="complib-grid">
      <!-- Component cards will be inserted here -->
    </div>
  </div>
</div>
```

### C. Test Suite Panel

**Location:** After Component Library Panel

```html
<!-- Test Suite Panel -->
<div id="testing-panel">
  <div id="testing-hdr">
    <span id="testing-title">✅ POST-REPAIR TESTING</span>
    <span id="testing-close">✕</span>
  </div>
  <div id="testing-body">
    <div style="font-size:9px;color:var(--text3);line-height:1.5;margin-bottom:8px">
      Automated test sequences to verify repairs before returning to customers.
    </div>
    
    <select class="test-suite-select" id="test-suite-select">
      <option value="">— Select Test Suite —</option>
    </select>
    
    <div id="test-suite-info" style="display:none;font-size:10px;color:var(--text2);padding:8px;background:var(--bg3);border-radius:4px;margin-top:8px">
      <div id="test-suite-desc"></div>
      <div style="margin-top:6px;font-size:9px;color:var(--text3)">
        <span id="test-suite-count"></span> tests · Est. <span id="test-suite-duration"></span>
      </div>
    </div>
    
    <button class="test-run-btn" id="test-run-btn" disabled>▶ RUN TEST SUITE</button>
    
    <div id="test-progress-wrap" style="display:none;margin-top:12px">
      <div style="font-size:9px;color:var(--text3);margin-bottom:4px">
        Running: <span id="test-current-name"></span>
      </div>
      <div class="test-progress">
        <div class="test-progress-fill" id="test-progress-fill" style="width:0%"></div>
      </div>
      <div style="font-size:9px;color:var(--text3);margin-top:4px">
        Test <span id="test-step-current">0</span> of <span id="test-step-total">0</span>
      </div>
    </div>
    
    <div id="test-results" style="display:none;margin-top:12px">
      <div style="font-size:9px;color:var(--text3);letter-spacing:1.5px;margin-bottom:6px;font-weight:700">
        RESULTS
      </div>
      <div id="test-results-list"></div>
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="macro-btn" id="test-export-html-btn">📄 EXPORT HTML</button>
        <button class="macro-btn" id="test-export-pdf-btn">📑 EXPORT PDF</button>
      </div>
    </div>
  </div>
</div>
```

### D. Collaboration Panel

**Location:** After Test Suite Panel

```html
<!-- Collaboration Panel -->
<div id="collab-panel">
  <div id="collab-hdr">
    <span id="collab-title">👥 TEAM COLLABORATION</span>
    <span id="collab-close">✕</span>
  </div>
  <div id="collab-body">
    <div style="font-size:9px;color:var(--text3);line-height:1.5;margin-bottom:12px">
      Share your repair session in real-time with remote technicians. End-to-end encrypted.
    </div>
    
    <div id="collab-create-section">
      <button class="macro-btn" id="collab-create-btn" style="width:100%">
        🚀 START SESSION
      </button>
    </div>
    
    <div id="collab-room-section" style="display:none">
      <div style="font-size:9px;color:var(--text3);margin-bottom:6px;text-align:center">
        ROOM CODE
      </div>
      <div class="collab-room-code" id="collab-room-code">------</div>
      <div style="font-size:9px;color:var(--text3);margin-top:6px;text-align:center">
        Share this code with your team
      </div>
    </div>
    
    <div style="margin:16px 0;border-top:1px solid var(--border);padding-top:16px">
      <div style="font-size:9px;color:var(--text3);margin-bottom:6px">
        OR JOIN EXISTING SESSION
      </div>
      <input id="collab-join-input" type="text" placeholder="Enter 6-digit room code..."
        style="width:100%;background:var(--bg3);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:14px;padding:8px;border-radius:4px;text-align:center;letter-spacing:2px">
      <button class="macro-btn" id="collab-join-btn" style="width:100%;margin-top:6px">
        🔗 JOIN SESSION
      </button>
    </div>
    
    <div id="collab-participants" style="display:none;margin-top:16px">
      <div style="font-size:9px;color:var(--text3);letter-spacing:1.5px;margin-bottom:6px;font-weight:700">
        PARTICIPANTS
      </div>
      <div id="collab-participants-list"></div>
    </div>
    
    <div id="collab-chat-section" style="display:none;margin-top:16px">
      <div style="font-size:9px;color:var(--text3);letter-spacing:1.5px;margin-bottom:6px;font-weight:700">
        CHAT
      </div>
      <div class="collab-chat" id="collab-chat"></div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="collab-chat-input" type="text" placeholder="Type message..."
          style="flex:1;background:var(--bg3);border:1px solid var(--border2);color:var(--text);font-size:10px;padding:4px 8px;border-radius:4px">
        <button class="macro-btn" id="collab-send-btn">SEND</button>
      </div>
    </div>
  </div>
</div>
```

### E. Oscilloscope Window

**Location:** After Collaboration Panel

```html
<!-- Oscilloscope Window -->
<div id="scope-win">
  <div id="scope-win-hdr">
    <span id="scope-win-title">📊 OSCILLOSCOPE</span>
    <button id="scope-win-connect" class="scope-btn">CONNECT</button>
    <span id="scope-win-close">✕</span>
  </div>
  <div id="scope-win-body">
    <canvas id="scope-canvas" width="800" height="400"></canvas>
    
    <div class="scope-controls">
      <button class="scope-btn on" id="scope-ch1-btn">CH1</button>
      <button class="scope-btn on" id="scope-ch2-btn">CH2</button>
      <select id="scope-timebase" class="scope-btn" style="width:auto">
        <option value="0.000001">1µs/div</option>
        <option value="0.00001">10µs/div</option>
        <option value="0.0001">100µs/div</option>
        <option value="0.001" selected>1ms/div</option>
        <option value="0.01">10ms/div</option>
      </select>
      <select id="scope-ch1-scale" class="scope-btn" style="width:auto">
        <option value="0.1">100mV/div</option>
        <option value="0.5">500mV/div</option>
        <option value="1" selected>1V/div</option>
        <option value="2">2V/div</option>
        <option value="5">5V/div</option>
      </select>
      <button class="scope-btn" id="scope-capture-btn">📸 CAPTURE</button>
      <button class="scope-btn" id="scope-single-btn">SINGLE</button>
      <select id="scope-decoder" class="scope-btn" style="width:auto">
        <option value="">No Decoder</option>
        <option value="I2C">I2C</option>
        <option value="SPI">SPI</option>
        <option value="UART">UART</option>
      </select>
      <button class="scope-btn" id="scope-export-btn">💾 EXPORT</button>
    </div>
    
    <div class="scope-measurements">
      <div class="scope-meas-card">
        <div class="scope-meas-label">CH1 Vpp</div>
        <div class="scope-meas-value" id="scope-ch1-vpp">—</div>
      </div>
      <div class="scope-meas-card">
        <div class="scope-meas-label">CH1 Freq</div>
        <div class="scope-meas-value" id="scope-ch1-freq">—</div>
      </div>
      <div class="scope-meas-card">
        <div class="scope-meas-label">CH2 Vpp</div>
        <div class="scope-meas-value" id="scope-ch2-vpp">—</div>
      </div>
      <div class="scope-meas-card">
        <div class="scope-meas-label">CH2 Freq</div>
        <div class="scope-meas-value" id="scope