/**
 * BoardScope Component Library
 * Visual database of common ICs with pinouts, failure modes, and replacement guides
 * 
 * Usage:
 *   const library = new ComponentLibrary();
 *   await library.init();
 *   const results = library.search('ISL9240');
 *   const component = library.getComponent('ISL9240');
 * 
 * Events:
 *   'loaded' - Library data loaded
 *   'search-results' - Search completed
 *   'component-selected' - Component detail view opened
 */

class ComponentLibrary {
  constructor() {
    this.components = [];
    this.categories = [];
    this.loaded = false;
    this._listeners = {};
    this._searchIndex = null;
  }
  
  // ── INITIALIZATION ──
  async init() {
    console.log('[ComponentLibrary] Initializing...');
    
    // Load component data
    await this._loadComponentData();
    
    // Build search index
    this._buildSearchIndex();
    
    this.loaded = true;
    this.emit('loaded', { count: this.components.length });
    console.log('[ComponentLibrary] Loaded', this.components.length, 'components');
  }
  
  async _loadComponentData() {
    // Try to load from external JSON file first
    try {
      const response = await fetch('data/component-library.json');
      if (response.ok) {
        const data = await response.json();
        this.components = data.components || [];
        this.categories = data.categories || [];
        return;
      }
    } catch (error) {
      console.warn('[ComponentLibrary] External data not found, using built-in');
    }
    
    // Fallback to built-in component data
    this.components = this._getBuiltinComponents();
    this.categories = this._getBuiltinCategories();
  }
  
  // ── SEARCH ──
  search(query, options = {}) {
    if (!query || query.length < 2) {
      return this.components.slice(0, 50); // Return first 50 if no query
    }
    
    const lowerQuery = query.toLowerCase();
    const category = options.category || null;
    const boardModel = options.boardModel || null;
    
    let results = this.components.filter(comp => {
      // Text search
      const matchesText = 
        comp.id.toLowerCase().includes(lowerQuery) ||
        comp.description.toLowerCase().includes(lowerQuery) ||
        comp.manufacturer.toLowerCase().includes(lowerQuery) ||
        comp.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      
      // Category filter
      const matchesCategory = !category || comp.category === category;
      
      // Board model filter
      const matchesBoard = !boardModel || comp.boards.includes(boardModel);
      
      return matchesText && matchesCategory && matchesBoard;
    });
    
    // Sort by relevance (exact match first)
    results.sort((a, b) => {
      const aExact = a.id.toLowerCase() === lowerQuery;
      const bExact = b.id.toLowerCase() === lowerQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });
    
    this.emit('search-results', { query, results });
    return results;
  }
  
  _buildSearchIndex() {
    // Simple index for faster searching
    this._searchIndex = {};
    this.components.forEach(comp => {
      const key = comp.id.toLowerCase();
      this._searchIndex[key] = comp;
    });
  }
  
  // ── COMPONENT ACCESS ──
  getComponent(componentId) {
    return this.components.find(c => c.id === componentId);
  }
  
  getComponentsByCategory(category) {
    return this.components.filter(c => c.category === category);
  }
  
  getComponentsByBoard(boardModel) {
    return this.components.filter(c => c.boards.includes(boardModel));
  }
  
  getCategories() {
    return this.categories;
  }
  
  // ── COMMUNITY CONTRIBUTIONS ──
  addComponent(componentData) {
    // Validate required fields
    if (!componentData.id || !componentData.category) {
      console.error('[ComponentLibrary] Invalid component data');
      return false;
    }
    
    // Check for duplicates
    if (this.getComponent(componentData.id)) {
      console.warn('[ComponentLibrary] Component already exists:', componentData.id);
      return false;
    }
    
    // Add to library
    this.components.push(componentData);
    this._buildSearchIndex();
    this._saveCustomComponents();
    
    console.log('[ComponentLibrary] Component added:', componentData.id);
    return true;
  }
  
  updateComponent(componentId, updates) {
    const component = this.getComponent(componentId);
    if (!component) return false;
    
    Object.assign(component, updates);
    this._saveCustomComponents();
    return true;
  }
  
  deleteComponent(componentId) {
    const index = this.components.findIndex(c => c.id === componentId);
    if (index !== -1) {
      this.components.splice(index, 1);
      this._buildSearchIndex();
      this._saveCustomComponents();
      return true;
    }
    return false;
  }
  
  // ── EXPORT / IMPORT ──
  exportLibrary() {
    const exported = {
      version: '1.0',
      exported: new Date().toISOString(),
      components: this.components,
      categories: this.categories
    };
    
    const json = JSON.stringify(exported, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'component-library.json';
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  async importLibrary(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.components && Array.isArray(data.components)) {
        // Merge with existing (avoid duplicates)
        data.components.forEach(comp => {
          if (!this.getComponent(comp.id)) {
            this.components.push(comp);
          }
        });
        this._buildSearchIndex();
        this._saveCustomComponents();
        return true;
      }
    } catch (error) {
      console.error('[ComponentLibrary] Import error:', error);
    }
    return false;
  }
  
  // ── STORAGE ──
  _saveCustomComponents() {
    try {
      // Save only user-added components (not built-in)
      const custom = this.components.filter(c => c.custom === true);
      localStorage.setItem('boardscope_custom_components', JSON.stringify(custom));
    } catch (error) {
      console.error('[ComponentLibrary] Save error:', error);
    }
  }
  
  _loadCustomComponents() {
    try {
      const stored = localStorage.getItem('boardscope_custom_components');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[ComponentLibrary] Load error:', error);
      return [];
    }
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
  
  // ── BUILT-IN COMPONENT DATABASE ──
  _getBuiltinComponents() {
    return [
      {
        id: 'ISL9240',
        category: 'Charger IC',
        manufacturer: 'Renesas',
        package: 'QFN-40',
        description: 'USB-C PD Controller with Integrated Buck-Boost Charger',
        pinout: {
          pins: [
            { num: 1, name: 'VBUS', type: 'POWER', description: 'USB-C VBUS input (5-20V)' },
            { num: 2, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 3, name: 'ACOK', type: 'OUTPUT', description: 'AC adapter present indicator' },
            { num: 4, name: 'PSYS', type: 'INPUT', description: 'System power monitor' },
            { num: 5, name: 'BATT', type: 'POWER', description: 'Battery connection' },
            { num: 10, name: 'SDA', type: 'I2C', description: 'I2C data line' },
            { num: 11, name: 'SCL', type: 'I2C', description: 'I2C clock line' }
          ]
        },
        commonFailures: [
          {
            symptom: 'No charging, no ACOK',
            cause: 'VBUS pin shorted to GND or IC dead',
            test: 'Measure diode drop on pin 1 (VBUS) to GND',
            expected: '0.6V',
            fix: 'Check for shorts on VBUS line. If clear, replace IC.'
          },
          {
            symptom: 'Charges but slow or stops at 80%',
            cause: 'PSYS sense resistor damaged',
            test: 'Check resistance on PSYS pin to GND',
            expected: '10kΩ',
            fix: 'Replace PSYS sense resistor network'
          }
        ],
        replacements: ['ISL9240A', 'ISL9240IRZLX-T', 'RAA229001'],
        datasheetUrl: 'https://www.renesas.com/us/en/document/dst/isl9240-datasheet',
        lcscUrl: 'https://www.lcsc.com/search?q=ISL9240',
        octpartUrl: 'https://octopart.com/search?q=ISL9240',
        boards: ['820-00165', '820-3437', '820-00850'],
        tags: ['charger', 'usb-c', 'pd', 'buck-boost', 'battery'],
        custom: false
      },
      {
        id: 'ISL6259',
        category: 'Charger IC',
        manufacturer: 'Renesas',
        package: 'QFN-28',
        description: 'Battery Charger Controller with SMBus Interface',
        pinout: {
          pins: [
            { num: 1, name: 'ACIN', type: 'POWER', description: 'AC adapter input' },
            { num: 2, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 3, name: 'BATT', type: 'POWER', description: 'Battery connection' },
            { num: 10, name: 'SMBDAT', type: 'SMBus', description: 'SMBus data' },
            { num: 11, name: 'SMBCLK', type: 'SMBus', description: 'SMBus clock' }
          ]
        },
        commonFailures: [
          {
            symptom: 'No charging',
            cause: 'ACIN pin open or IC dead',
            test: 'Measure voltage on ACIN pin',
            expected: '16.5V (MagSafe)',
            fix: 'Check MagSafe connector and cable. Replace IC if ACIN present but no charging.'
          }
        ],
        replacements: ['ISL6259A', 'ISL6259HRTZ', 'RAA214000'],
        datasheetUrl: 'https://www.renesas.com/us/en/document/dst/isl6259-datasheet',
        lcscUrl: 'https://www.lcsc.com/search?q=ISL6259',
        octpartUrl: 'https://octopart.com/search?q=ISL6259',
        boards: ['820-3437', '820-2915', '820-3115'],
        tags: ['charger', 'magsafe', 'smbus', 'battery'],
        custom: false
      },
      {
        id: 'CD3215',
        category: 'USB-C',
        manufacturer: 'Texas Instruments',
        package: 'QFN-24',
        description: 'USB Type-C Port Controller and Power Switch',
        pinout: {
          pins: [
            { num: 1, name: 'VBUS', type: 'POWER', description: 'USB-C VBUS' },
            { num: 2, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 5, name: 'CC1', type: 'CC', description: 'Configuration Channel 1' },
            { num: 6, name: 'CC2', type: 'CC', description: 'Configuration Channel 2' },
            { num: 10, name: 'SDA', type: 'I2C', description: 'I2C data' },
            { num: 11, name: 'SCL', type: 'I2C', description: 'I2C clock' }
          ]
        },
        commonFailures: [
          {
            symptom: 'USB-C not detected',
            cause: 'CC pins shorted or open',
            test: 'Measure diode drop on CC1 and CC2 to GND',
            expected: '0.6-0.7V',
            fix: 'Check for liquid damage on CC pins. Replace IC if damaged.'
          }
        ],
        replacements: ['CD3215C00', 'TUSB320'],
        datasheetUrl: 'https://www.ti.com/product/CD3215',
        lcscUrl: 'https://www.lcsc.com/search?q=CD3215',
        octpartUrl: 'https://octopart.com/search?q=CD3215',
        boards: ['820-00165', '820-00850', '820-01598'],
        tags: ['usb-c', 'pd', 'port-controller', 'cc'],
        custom: false
      },
      {
        id: 'TPS51980',
        category: 'Power Management',
        manufacturer: 'Texas Instruments',
        package: 'QFN-32',
        description: 'Dual-Output Buck Controller for CPU and GPU',
        pinout: {
          pins: [
            { num: 1, name: 'VIN', type: 'POWER', description: 'Input voltage (5-24V)' },
            { num: 2, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 5, name: 'VOUT1', type: 'OUTPUT', description: 'CPU voltage output' },
            { num: 10, name: 'VOUT2', type: 'OUTPUT', description: 'GPU voltage output' },
            { num: 15, name: 'EN', type: 'INPUT', description: 'Enable pin' }
          ]
        },
        commonFailures: [
          {
            symptom: 'No CPU voltage',
            cause: 'EN pin not asserted or IC dead',
            test: 'Measure voltage on EN pin',
            expected: '3.3V',
            fix: 'Trace EN signal back to PCH. Replace IC if EN present but no output.'
          }
        ],
        replacements: ['TPS51980A', 'TPS51980RGER'],
        datasheetUrl: 'https://www.ti.com/product/TPS51980',
        lcscUrl: 'https://www.lcsc.com/search?q=TPS51980',
        octpartUrl: 'https://octopart.com/search?q=TPS51980',
        boards: ['820-3437', '820-00165'],
        tags: ['buck', 'cpu', 'gpu', 'power', 'dual-output'],
        custom: false
      },
      {
        id: 'LP8550',
        category: 'Display',
        manufacturer: 'Texas Instruments',
        package: 'QFN-24',
        description: 'LED Backlight Driver with I2C Interface',
        pinout: {
          pins: [
            { num: 1, name: 'VIN', type: 'POWER', description: 'Input voltage (2.7-25V)' },
            { num: 2, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 5, name: 'LED+', type: 'OUTPUT', description: 'LED string positive' },
            { num: 6, name: 'LED-', type: 'OUTPUT', description: 'LED string negative' },
            { num: 10, name: 'SDA', type: 'I2C', description: 'I2C data' },
            { num: 11, name: 'SCL', type: 'I2C', description: 'I2C clock' },
            { num: 15, name: 'EN', type: 'INPUT', description: 'Enable pin' }
          ]
        },
        commonFailures: [
          {
            symptom: 'No backlight',
            cause: 'EN pin not asserted or LED string open',
            test: 'Measure voltage on EN pin and LED+ output',
            expected: 'EN: 3.3V, LED+: 12-24V',
            fix: 'Check EN signal. Test LED string continuity. Replace IC if inputs OK but no output.'
          }
        ],
        replacements: ['LP8550TLX-E00', 'LP8551'],
        datasheetUrl: 'https://www.ti.com/product/LP8550',
        lcscUrl: 'https://www.lcsc.com/search?q=LP8550',
        octpartUrl: 'https://octopart.com/search?q=LP8550',
        boards: ['820-3437', '820-00165', '820-3662'],
        tags: ['backlight', 'led-driver', 'display', 'boost'],
        custom: false
      },
      {
        id: 'SN74LVC1G125',
        category: 'Logic',
        manufacturer: 'Texas Instruments',
        package: 'SOT-23-5',
        description: 'Single Bus Buffer Gate with 3-State Output',
        pinout: {
          pins: [
            { num: 1, name: 'OE', type: 'INPUT', description: 'Output enable (active low)' },
            { num: 2, name: 'A', type: 'INPUT', description: 'Input' },
            { num: 3, name: 'GND', type: 'GND', description: 'Ground' },
            { num: 4, name: 'Y', type: 'OUTPUT', description: 'Output' },
            { num: 5, name: 'VCC', type: 'POWER', description: 'Supply voltage (1.65-5.5V)' }
          ]
        },
        commonFailures: [
          {
            symptom: 'Signal not passing through',
            cause: 'IC dead or OE not asserted',
            test: 'Measure voltage on OE pin (should be LOW) and VCC',
            expected: 'OE: 0V, VCC: 3.3V',
            fix: 'Replace IC. Very common failure on liquid damaged boards.'
          }
        ],
        replacements: ['SN74LVC1G125DBVR', 'NC7SZ125'],
        datasheetUrl: 'https://www.ti.com/product/SN74LVC1G125',
        lcscUrl: 'https://www.lcsc.com/search?q=SN74LVC1G125',
        octpartUrl: 'https://octopart.com/search?q=SN74LVC1G125',
        boards: ['820-00165', '820-3437', '820-00850', '820-3662'],
        tags: ['buffer', 'logic', 'level-shifter', 'tristate'],
        custom: false
      }
    ];
  }
  
  _getBuiltinCategories() {
    return [
      { id: 'charger', name: 'Charger IC', icon: '🔌', color: '#00c896' },
      { id: 'power', name: 'Power Management', icon: '⚡', color: '#f0a030' },
      { id: 'cpu', name: 'CPU / SoC', icon: '🧠', color: '#5294f8' },
      { id: 'display', name: 'Display', icon: '🖥️', color: '#c080ff' },
      { id: 'audio', name: 'Audio', icon: '🔊', color: '#ff6b9d' },
      { id: 'usb-c', name: 'USB-C / Thunderbolt', icon: '🔗', color: '#00d9ff' },
      { id: 'storage', name: 'Storage', icon: '💾', color: '#ffaa00' },
      { id: 'logic', name: 'Logic / Buffers', icon: '🔀', color: '#80d080' },
      { id: 'sensor', name: 'Sensors', icon: '📡', color: '#ff8866' },
      { id: 'passive', name: 'Passives', icon: '🔧', color: '#8090a0' }
    ];
  }
}

// Export for use in BoardScope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ComponentLibrary;
}
