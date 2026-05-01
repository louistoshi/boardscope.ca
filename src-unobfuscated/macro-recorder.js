/**
 * BoardScope Macro Recorder
 * Record and replay sequences of measurements, searches, and actions
 * 
 * Usage:
 *   const recorder = new MacroRecorder();
 *   recorder.startRecording('Power Rail Check');
 *   // ... user performs actions ...
 *   recorder.stopRecording();
 *   await recorder.playMacro('macro-001');
 * 
 * Events:
 *   'recording-started' - Recording began
 *   'recording-stopped' - Recording ended, macro saved
 *   'playback-started' - Macro playback began
 *   'playback-progress' - Action completed (progress update)
 *   'playback-completed' - All actions completed
 *   'playback-error' - Error during playback
 */

class MacroRecorder {
  constructor() {
    this.recording = false;
    this.playing = false;
    this.currentMacro = null;
    this.actions = [];
    this.macros = this._loadMacros();
    this._listeners = {};
    this._actionIndex = 0;
    
    // Built-in macros
    this._initBuiltinMacros();
  }
  
  // ── EVENT BUS ──
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }
  
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => cb(data));
  }
  
  // ── RECORDING ──
  startRecording(name, description = '') {
    if (this.recording) return;
    
    this.recording = true;
    this.actions = [];
    this.currentMacro = {
      id: 'macro-' + Date.now(),
      name: name,
      description: description,
      builtin: false,
      actions: [],
      created: new Date().toISOString(),
      lastRun: null,
      runCount: 0
    };
    
    this.emit('recording-started', { name });
    console.log('[MacroRecorder] Recording started:', name);
  }
  
  recordAction(type, params = {}) {
    if (!this.recording) return;
    
    const action = {
      type: type,
      params: params,
      timestamp: Date.now()
    };
    
    this.actions.push(action);
    console.log('[MacroRecorder] Action recorded:', action);
  }
  
  stopRecording() {
    if (!this.recording) return;
    
    this.recording = false;
    this.currentMacro.actions = this.actions;
    this.macros.push(this.currentMacro);
    this._saveMacros();
    
    this.emit('recording-stopped', { macro: this.currentMacro });
    console.log('[MacroRecorder] Recording stopped. Actions:', this.actions.length);
    
    const saved = this.currentMacro;
    this.currentMacro = null;
    this.actions = [];
    
    return saved;
  }
  
  cancelRecording() {
    this.recording = false;
    this.currentMacro = null;
    this.actions = [];
    console.log('[MacroRecorder] Recording cancelled');
  }
  
  // ── PLAYBACK ──
  async playMacro(macroId) {
    const macro = this.macros.find(m => m.id === macroId);
    if (!macro) {
      console.error('[MacroRecorder] Macro not found:', macroId);
      return { success: false, error: 'Macro not found' };
    }
    
    if (this.playing) {
      console.warn('[MacroRecorder] Already playing a macro');
      return { success: false, error: 'Already playing' };
    }
    
    this.playing = true;
    this._actionIndex = 0;
    
    this.emit('playback-started', { macro });
    console.log('[MacroRecorder] Playing macro:', macro.name);
    
    const results = [];
    
    try {
      for (let i = 0; i < macro.actions.length; i++) {
        if (!this.playing) break; // User stopped playback
        
        this._actionIndex = i;
        const action = macro.actions[i];
        
        console.log(`[MacroRecorder] Executing action ${i + 1}/${macro.actions.length}:`, action.type);
        
        const result = await this._executeAction(action);
        results.push(result);
        
        this.emit('playback-progress', {
          action: action,
          index: i,
          total: macro.actions.length,
          result: result
        });
        
        // Small delay between actions for stability
        await this._delay(action.params.wait || 300);
      }
      
      // Update macro stats
      macro.lastRun = new Date().toISOString();
      macro.runCount++;
      this._saveMacros();
      
      this.playing = false;
      this.emit('playback-completed', { macro, results });
      console.log('[MacroRecorder] Playback completed');
      
      return { success: true, results };
      
    } catch (error) {
      this.playing = false;
      this.emit('playback-error', { macro, error: error.message });
      console.error('[MacroRecorder] Playback error:', error);
      return { success: false, error: error.message };
    }
  }
  
  stopPlayback() {
    this.playing = false;
    console.log('[MacroRecorder] Playback stopped by user');
  }
  
  async _executeAction(action) {
    switch (action.type) {
      case 'search':
        return await this._actionSearch(action.params);
      case 'select-component':
        return await this._actionSelectComponent(action.params);
      case 'click-pad':
        return await this._actionClickPad(action.params);
      case 'measure':
        return await this._actionMeasure(action.params);
      case 'save-measurement':
        return await this._actionSaveMeasurement(action.params);
      case 'zoom':
        return await this._actionZoom(action.params);
      case 'pdf-page':
        return await this._actionPdfPage(action.params);
      case 'toggle-side':
        return await this._actionToggleSide(action.params);
      case 'wait':
        return await this._actionWait(action.params);
      default:
        console.warn('[MacroRecorder] Unknown action type:', action.type);
        return { success: false, error: 'Unknown action type' };
    }
  }
  
  // ── ACTION EXECUTORS ──
  async _actionSearch(params) {
    // Trigger search in BoardScope
    const searchInput = document.getElementById('comp-search');
    if (!searchInput) return { success: false, error: 'Search input not found' };
    
    searchInput.value = params.query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    
    return { success: true, query: params.query };
  }
  
  async _actionSelectComponent(params) {
    // Select component by reference
    // This would integrate with BoardScope's component selection system
    if (window.selectComponentByRef) {
      window.selectComponentByRef(params.ref);
      return { success: true, ref: params.ref };
    }
    return { success: false, error: 'Component selection not available' };
  }
  
  async _actionClickPad(params) {
    // Click a specific pad/pin
    // This would integrate with BoardScope's pad click system
    if (window.clickPadByNet) {
      window.clickPadByNet(params.net, params.pin);
      return { success: true, net: params.net, pin: params.pin };
    }
    return { success: false, error: 'Pad click not available' };
  }
  
  async _actionMeasure(params) {
    // Wait for meter reading
    if (!window.meter || !window.meter.connected) {
      return { success: false, error: 'Multimeter not connected' };
    }
    
    // Wait for stable reading if requested
    if (params.waitForStable) {
      const timeout = params.timeout || 5000;
      const reading = await this._waitForStableReading(timeout);
      if (reading) {
        return { success: true, reading: reading };
      } else {
        return { success: false, error: 'Timeout waiting for stable reading' };
      }
    }
    
    // Just return current reading
    const reading = window.meter.getLastReading();
    return { success: true, reading: reading };
  }
  
  async _actionSaveMeasurement(params) {
    // Save measurement to current net
    // This would integrate with BoardScope's measurement system
    if (window.saveMeasurement) {
      window.saveMeasurement(params.field, params.value);
      return { success: true };
    }
    return { success: false, error: 'Save measurement not available' };
  }
  
  async _actionZoom(params) {
    // Zoom to component or fit view
    if (params.target === 'fit') {
      document.getElementById('btn-fit-sel')?.click();
    } else if (params.target) {
      // Zoom to specific component
      if (window.zoomToComponent) {
        window.zoomToComponent(params.target);
      }
    }
    return { success: true };
  }
  
  async _actionPdfPage(params) {
    // Navigate to PDF page
    const pageInput = document.getElementById('pg-jump');
    if (pageInput) {
      pageInput.value = params.page;
      pageInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, page: params.page };
    }
    return { success: false, error: 'PDF navigation not available' };
  }
  
  async _actionToggleSide(params) {
    // Toggle top/bottom side
    const button = params.side === 'top' ? document.getElementById('tog-t') : document.getElementById('tog-b');
    if (button) {
      button.click();
      return { success: true, side: params.side };
    }
    return { success: false, error: 'Side toggle not available' };
  }
  
  async _actionWait(params) {
    // Simple delay
    await this._delay(params.duration || 1000);
    return { success: true, duration: params.duration };
  }
  
  async _waitForStableReading(timeout) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkStable = () => {
        if (Date.now() - startTime > timeout) {
          resolve(null);
          return;
        }
        
        if (window.meter && window.meter._stableReading) {
          resolve(window.meter._stableReading);
        } else {
          setTimeout(checkStable, 100);
        }
      };
      
      checkStable();
    });
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ── MACRO MANAGEMENT ──
  getMacros() {
    return this.macros;
  }
  
  getMacro(macroId) {
    return this.macros.find(m => m.id === macroId);
  }
  
  deleteMacro(macroId) {
    const index = this.macros.findIndex(m => m.id === macroId);
    if (index !== -1) {
      this.macros.splice(index, 1);
      this._saveMacros();
      return true;
    }
    return false;
  }
  
  updateMacro(macroId, updates) {
    const macro = this.getMacro(macroId);
    if (macro) {
      Object.assign(macro, updates);
      this._saveMacros();
      return true;
    }
    return false;
  }
  
  exportMacro(macroId) {
    const macro = this.getMacro(macroId);
    if (!macro) return null;
    
    const exported = JSON.stringify(macro, null, 2);
    const blob = new Blob([exported], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${macro.name.replace(/\s+/g, '-')}.macro.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    return macro;
  }
  
  importMacro(jsonString) {
    try {
      const macro = JSON.parse(jsonString);
      macro.id = 'macro-' + Date.now(); // New ID to avoid conflicts
      macro.builtin = false;
      this.macros.push(macro);
      this._saveMacros();
      return macro;
    } catch (error) {
      console.error('[MacroRecorder] Import error:', error);
      return null;
    }
  }
  
  // ── STORAGE ──
  _loadMacros() {
    try {
      const stored = localStorage.getItem('boardscope_macros');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[MacroRecorder] Load error:', error);
      return [];
    }
  }
  
  _saveMacros() {
    try {
      // Only save non-builtin macros
      const toSave = this.macros.filter(m => !m.builtin);
      localStorage.setItem('boardscope_macros', JSON.stringify(toSave));
    } catch (error) {
      console.error('[MacroRecorder] Save error:', error);
    }
  }
  
  // ── BUILT-IN MACROS ──
  _initBuiltinMacros() {
    const builtins = [
      {
        id: 'builtin-power-rails',
        name: 'Power Rail Check',
        description: 'Measure all major power rails in sequence',
        builtin: true,
        actions: [
          { type: 'search', params: { query: 'PPBUS_G3H', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'PP3V42_G3H', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'PP5V_G3H', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'PP3V3_S5', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'PP1V8_S0', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } }
        ],
        created: '2026-04-18T00:00:00.000Z',
        lastRun: null,
        runCount: 0
      },
      {
        id: 'builtin-usbc-test',
        name: 'USB-C Port Test',
        description: 'Check all USB-C pins for shorts and opens',
        builtin: true,
        actions: [
          { type: 'search', params: { query: 'USB_VBUS', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'USB_DP', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'USB_DN', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'USB_CC1', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'USB_CC2', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } }
        ],
        created: '2026-04-18T00:00:00.000Z',
        lastRun: null,
        runCount: 0
      },
      {
        id: 'builtin-display-test',
        name: 'Display Connector Test',
        description: 'Verify all display signals present',
        builtin: true,
        actions: [
          { type: 'search', params: { query: 'LCD_VDD', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'LCD_BKLT', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'LVDS_CLK', wait: 500 } },
          { type: 'measure', params: { mode: 'DIODE', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'diode' } }
        ],
        created: '2026-04-18T00:00:00.000Z',
        lastRun: null,
        runCount: 0
      },
      {
        id: 'builtin-audio-test',
        name: 'Audio Path Test',
        description: 'Trace audio codec to speaker output',
        builtin: true,
        actions: [
          { type: 'search', params: { query: 'AUDIO_CODEC', wait: 500 } },
          { type: 'select-component', params: { ref: 'U4900' } },
          { type: 'wait', params: { duration: 500 } },
          
          { type: 'search', params: { query: 'SPK_L', wait: 500 } },
          { type: 'measure', params: { mode: 'OHM', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'resistance' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'SPK_R', wait: 500 } },
          { type: 'measure', params: { mode: 'OHM', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'resistance' } }
        ],
        created: '2026-04-18T00:00:00.000Z',
        lastRun: null,
        runCount: 0
      },
      {
        id: 'builtin-charging-test',
        name: 'Charging Circuit Test',
        description: 'Full charger IC diagnostic sequence',
        builtin: true,
        actions: [
          { type: 'search', params: { query: 'CHGR_VBUS', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'CHGR_ACOK', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'CHGR_BATT', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } },
          { type: 'wait', params: { duration: 300 } },
          
          { type: 'search', params: { query: 'CHGR_EN', wait: 500 } },
          { type: 'measure', params: { mode: 'DCV', waitForStable: true, timeout: 5000 } },
          { type: 'save-measurement', params: { field: 'voltage' } }
        ],
        created: '2026-04-18T00:00:00.000Z',
        lastRun: null,
        runCount: 0
      }
    ];
    
    // Add built-in macros if not already present
    builtins.forEach(builtin => {
      if (!this.macros.find(m => m.id === builtin.id)) {
        this.macros.push(builtin);
      }
    });
  }
  
  // ── UTILITY ──
  getRecordingStatus() {
    return {
      recording: this.recording,
      actionCount: this.actions.length,
      macroName: this.currentMacro?.name
    };
  }
  
  getPlaybackStatus() {
    return {
      playing: this.playing,
      currentAction: this._actionIndex,
      totalActions: this.currentMacro?.actions.length || 0
    };
  }
}

// Export for use in BoardScope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MacroRecorder;
}
