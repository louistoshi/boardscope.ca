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
      const response = await fetch('data/component-library.json?v=' + Date.now());
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
      return this.components.slice(0, 1000); // Return first 50 if no query
    }

    const lowerQuery = query.toLowerCase();
    const category = options.category || null;
    const boardModel = options.boardModel || null;

    let results = this.components.filter(comp => {
      // Text search
      const matchesText =
        (comp.id || '').toLowerCase().includes(lowerQuery) ||
        (comp.description || '').toLowerCase().includes(lowerQuery) ||
        (comp.manufacturer || '').toLowerCase().includes(lowerQuery) ||
        (comp.tags || []).some(tag => tag.toLowerCase().includes(lowerQuery));

      // Category filter
      const matchesCategory = !category || comp.category === category;

      // Board model filter
      const matchesBoard = !boardModel || (comp.boards || []).includes(boardModel);

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
                "id": "ISL9240",
                "category": "Charger IC",
                "manufacturer": "Renesas",
                "package": "QFN-40",
                "description": "USB-C PD Controller with Integrated Buck-Boost Charger",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB-C VBUS input (5-20V)"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "ACOK",
                                        "type": "OUTPUT",
                                        "description": "AC adapter present indicator"
                                },
                                {
                                        "num": 4,
                                        "name": "PSYS",
                                        "type": "INPUT",
                                        "description": "System power monitor"
                                },
                                {
                                        "num": 5,
                                        "name": "BATT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data line"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock line"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging, no ACOK",
                                "cause": "VBUS pin shorted to GND or IC dead",
                                "test": "Measure diode drop on pin 1 (VBUS) to GND",
                                "expected": "0.6V",
                                "fix": "Check for shorts on VBUS line. If clear, replace IC."
                        },
                        {
                                "symptom": "Charges but slow or stops at 80%",
                                "cause": "PSYS sense resistor damaged",
                                "test": "Check resistance on PSYS pin to GND",
                                "expected": "10kΩ",
                                "fix": "Replace PSYS sense resistor network"
                        }
                ],
                "replacements": [
                        "ISL9240A",
                        "ISL9240IRZLX-T",
                        "RAA229001"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl9240-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL9240",
                "octpartUrl": "https://octopart.com/search?q=ISL9240",
                "boards": [
                        "820-00165",
                        "820-3437",
                        "820-00850"
                ],
                "tags": [
                        "charger",
                        "usb-c",
                        "pd",
                        "buck-boost",
                        "battery"
                ],
                "custom": false
        },
        {
                "id": "ISL6259",
                "category": "Charger IC",
                "manufacturer": "Renesas",
                "package": "QFN-28",
                "description": "Battery Charger Controller with SMBus Interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "ACIN",
                                        "type": "POWER",
                                        "description": "AC adapter input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "BATT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SMBDAT",
                                        "type": "SMBus",
                                        "description": "SMBus data"
                                },
                                {
                                        "num": 11,
                                        "name": "SMBCLK",
                                        "type": "SMBus",
                                        "description": "SMBus clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging",
                                "cause": "ACIN pin open or IC dead",
                                "test": "Measure voltage on ACIN pin",
                                "expected": "16.5V (MagSafe)",
                                "fix": "Check MagSafe connector and cable. Replace IC if ACIN present but no charging."
                        }
                ],
                "replacements": [
                        "ISL6259A",
                        "ISL6259HRTZ",
                        "RAA214000"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl6259-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL6259",
                "octpartUrl": "https://octopart.com/search?q=ISL6259",
                "boards": [
                        "820-3437",
                        "820-2915",
                        "820-3115"
                ],
                "tags": [
                        "charger",
                        "magsafe",
                        "smbus",
                        "battery"
                ],
                "custom": false
        },
        {
                "id": "BQ24780S",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "QFN-32",
                "description": "SMBus-Controlled Li-Ion/Li-Polymer Battery Charger",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "ACN",
                                        "type": "POWER",
                                        "description": "AC adapter negative"
                                },
                                {
                                        "num": 2,
                                        "name": "ACP",
                                        "type": "POWER",
                                        "description": "AC adapter positive"
                                },
                                {
                                        "num": 3,
                                        "name": "BTST",
                                        "type": "POWER",
                                        "description": "Bootstrap for high-side FET"
                                },
                                {
                                        "num": 10,
                                        "name": "SMBDAT",
                                        "type": "SMBus",
                                        "description": "SMBus data"
                                },
                                {
                                        "num": 11,
                                        "name": "SMBCLK",
                                        "type": "SMBus",
                                        "description": "SMBus clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charge, AC adapter not detected",
                                "cause": "AC sense pins damaged or FET failure",
                                "test": "Measure ACOK pin voltage",
                                "expected": "3.3V when adapter present",
                                "fix": "Replace BQ24780S"
                        }
                ],
                "replacements": [
                        "BQ24780S",
                        "BQ24725"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ24780S",
                "lcscUrl": "https://www.lcsc.com/search?q=BQ24780S",
                "octpartUrl": "https://octopart.com/search?q=BQ24780S",
                "boards": [
                        "LA-H381P",
                        "LA-J191P"
                ],
                "tags": [
                        "charger",
                        "ti",
                        "smbus",
                        "battery",
                        "dell"
                ],
                "custom": false
        },
        {
                "id": "BQ25895",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "QFN-24",
                "description": "I2C-Controlled 4.5A Switch-Mode Battery Charger (Smartphones)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Phone not charging",
                                "cause": "VBUS shorted or IC dead",
                                "test": "Measure diode drop on VBUS to GND",
                                "expected": "0.4-0.6V",
                                "fix": "Replace BQ25895"
                        }
                ],
                "replacements": [
                        "BQ25895M",
                        "BQ25890"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ25895",
                "lcscUrl": "https://www.lcsc.com/search?q=BQ25895",
                "octpartUrl": "https://octopart.com/search?q=BQ25895",
                "boards": [
                        "iPhone 11",
                        "iPhone 12",
                        "Samsung S21"
                ],
                "tags": [
                        "charger",
                        "ti",
                        "smartphone",
                        "usb",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "CD3215",
                "category": "USB-C",
                "manufacturer": "Texas Instruments",
                "package": "QFN-24",
                "description": "USB Type-C Port Controller and Power Switch",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB-C VBUS"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "CC1",
                                        "type": "CC",
                                        "description": "Configuration Channel 1"
                                },
                                {
                                        "num": 6,
                                        "name": "CC2",
                                        "type": "CC",
                                        "description": "Configuration Channel 2"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB-C not detected",
                                "cause": "CC pins shorted or open",
                                "test": "Measure diode drop on CC1 and CC2 to GND",
                                "expected": "0.6-0.7V",
                                "fix": "Check for liquid damage on CC pins. Replace IC if damaged."
                        }
                ],
                "replacements": [
                        "CD3215C00",
                        "TUSB320"
                ],
                "datasheetUrl": "https://www.ti.com/product/CD3215",
                "lcscUrl": "https://www.lcsc.com/search?q=CD3215",
                "octpartUrl": "https://octopart.com/search?q=CD3215",
                "boards": [
                        "820-00165",
                        "820-00850",
                        "820-01598"
                ],
                "tags": [
                        "usb-c",
                        "pd",
                        "port-controller",
                        "cc"
                ],
                "custom": false
        },
        {
                "id": "TPS65083",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "BGA-168",
                "description": "Power Management Unit for Intel Core Processors (Dell XPS/Latitude)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Main power input"
                                },
                                {
                                        "num": "B1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": "C1",
                                        "name": "LDO_3V3",
                                        "type": "OUTPUT",
                                        "description": "3.3V LDO output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Board dead, 0.00A draw",
                                "cause": "Main VIN rail shorted inside IC",
                                "test": "Measure diode drop on VIN pin",
                                "expected": "0.45V",
                                "fix": "Replace IC. Common on Dell XPS 9500 series."
                        }
                ],
                "replacements": [
                        "TPS650830"
                ],
                "boards": [
                        "LA-J191P",
                        "LA-K001P"
                ],
                "tags": [
                        "pmu",
                        "dell",
                        "intel",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "MAX77812",
                "category": "Power Management",
                "manufacturer": "Maxim Integrated",
                "package": "WLP-64",
                "description": "20A Multi-Phase Buck Converter (Asus ROG/Mobile)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 5,
                                        "name": "OUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 10,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU power, fans spin but no boot",
                                "cause": "Output inductor cracked or IC faulty",
                                "test": "Check for output voltage on inductors",
                                "expected": "0.8V - 1.2V",
                                "fix": "Re-solder inductors or replace MAX77812"
                        }
                ],
                "replacements": [
                        "MAX77812"
                ],
                "boards": [
                        "G513QY",
                        "G713QY"
                ],
                "tags": [
                        "asus",
                        "buck",
                        "cpu-power",
                        "rog"
                ],
                "custom": false
        },
        {
                "id": "338S00736",
                "category": "Power Management",
                "manufacturer": "Apple",
                "package": "BGA",
                "description": "Main PMIC for iPhone 16 Pro / Pro Max",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDD_MAIN",
                                        "type": "POWER",
                                        "description": "Main system rail"
                                },
                                {
                                        "num": "B1",
                                        "name": "PP_CPU",
                                        "type": "POWER",
                                        "description": "CPU core power"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Device dead after liquid damage",
                                "cause": "Corrosion under BGA balls on VDD_MAIN",
                                "test": "Measure current draw on DC power supply",
                                "expected": "0mA off, 50mA+ on pulse",
                                "fix": "Reball or replace PMIC"
                        }
                ],
                "boards": [
                        "820-02200",
                        "820-02150"
                ],
                "tags": [
                        "apple",
                        "iphone",
                        "pmic",
                        "a18-pro"
                ],
                "custom": false
        },
        {
                "id": "RT809F",
                "category": "Power Management",
                "manufacturer": "Richtek",
                "package": "QFN-20",
                "description": "3A Synchronous Step-Down Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage (4.5-18V)"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable pin"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 6,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback pin"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No 3.3V or 5V rail",
                                "cause": "IC dead or feedback resistor open",
                                "test": "Measure EN pin voltage and FB pin",
                                "expected": "EN > 1.2V, FB = 0.8V",
                                "fix": "Replace RT809F or feedback network"
                        }
                ],
                "replacements": [
                        "RT809F",
                        "RT809G"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT809F.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT809F",
                "octpartUrl": "https://octopart.com/search?q=RT809F",
                "boards": [
                        "LA-H381P",
                        "LA-J191P",
                        "820-00165"
                ],
                "tags": [
                        "buck",
                        "step-down",
                        "richtek",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "MP2955",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-40",
                "description": "Digital Multi-Phase PWM Controller (GPU/CPU VRM)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "SVID",
                                        "type": "SVID",
                                        "description": "SVID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU/GPU core voltage",
                                "cause": "PWM controller dead or SVID communication failure",
                                "test": "Check VCC and SVID lines",
                                "expected": "VCC = 3.3V, SVID activity present",
                                "fix": "Replace MP2955"
                        }
                ],
                "replacements": [
                        "MP2955",
                        "MP2956"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2955/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2955",
                "octpartUrl": "https://octopart.com/search?q=MP2955",
                "boards": [
                        "LA-J191P",
                        "G513QY"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "mps",
                        "cpu",
                        "gpu"
                ],
                "custom": false
        },
        {
                "id": "ISL95839",
                "category": "Power Management",
                "manufacturer": "Renesas",
                "package": "BGA-56",
                "description": "4+1 Phase IMVP-8 CPU Core Controller (MacBook Pro)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No boot, CPU core voltage missing",
                                "cause": "Controller dead or gate driver failure",
                                "test": "Measure PWM output with scope",
                                "expected": "Switching waveform present",
                                "fix": "Replace ISL95839"
                        }
                ],
                "replacements": [
                        "ISL95839",
                        "ISL95839HRTZ"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl95839-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL95839",
                "octpartUrl": "https://octopart.com/search?q=ISL95839",
                "boards": [
                        "820-00165",
                        "820-00850"
                ],
                "tags": [
                        "imvp",
                        "cpu",
                        "vrm",
                        "renesas",
                        "macbook"
                ],
                "custom": false
        },
        {
                "id": "Apple T2 (338S00381)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA",
                "description": "Security Chip and System Controller for Mac (Intel era)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "1",
                                        "name": "PVCC",
                                        "type": "POWER",
                                        "description": "Main Core Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Mac won't turn on, stays at 5V 0.00A",
                                "cause": "T2 firmware corruption or dead T2",
                                "test": "Check for DFU mode",
                                "expected": "Appears as Apple Controller in System Report",
                                "fix": "Revive or Restore in Apple Configurator 2"
                        }
                ],
                "boards": [
                        "820-00840",
                        "820-01521",
                        "820-01700"
                ],
                "tags": [
                        "apple",
                        "t2",
                        "security",
                        "dfu"
                ],
                "custom": false
        },
        {
                "id": "Intel Core i7-10750H",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "BGA-1440",
                "description": "10th Gen Intel Core Processor (Comet Lake-H)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC_CORE",
                                        "type": "POWER",
                                        "description": "CPU core voltage"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC_SA",
                                        "type": "POWER",
                                        "description": "System agent voltage"
                                },
                                {
                                        "num": "C1",
                                        "name": "VCCIO",
                                        "type": "POWER",
                                        "description": "I/O voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No boot, CPU not detected",
                                "cause": "CPU dead or BGA solder joints cracked",
                                "test": "Check all CPU power rails present",
                                "expected": "VCC_CORE ~1.0V, VCC_SA ~1.05V, VCCIO ~1.05V",
                                "fix": "Reball or replace CPU"
                        }
                ],
                "replacements": [
                        "i7-10750H",
                        "i7-10850H"
                ],
                "boards": [
                        "LA-J191P",
                        "LA-K001P"
                ],
                "tags": [
                        "intel",
                        "cpu",
                        "comet-lake",
                        "bga"
                ],
                "custom": false
        },
        {
                "id": "Apple M1 (APL1101)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA",
                "description": "Apple Silicon M1 System on Chip",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDD_CORE",
                                        "type": "POWER",
                                        "description": "Core voltage"
                                },
                                {
                                        "num": "B1",
                                        "name": "VDD_CPU",
                                        "type": "POWER",
                                        "description": "CPU cluster voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Mac dead, no response",
                                "cause": "SoC failure or power rail issue",
                                "test": "Check all M1 power rails",
                                "expected": "Multiple rails present (0.8V, 1.0V, 1.8V)",
                                "fix": "Replace logic board (M1 not user-replaceable)"
                        }
                ],
                "boards": [
                        "820-02150",
                        "820-02200"
                ],
                "tags": [
                        "apple",
                        "m1",
                        "silicon",
                        "arm"
                ],
                "custom": false
        },
        {
                "id": "RTD2171",
                "category": "Display",
                "manufacturer": "Realtek",
                "package": "QFN-64",
                "description": "Display Timing Controller (TCON) for LCD panels",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "LVDS_IN",
                                        "type": "INPUT",
                                        "description": "LVDS input from GPU"
                                },
                                {
                                        "num": 10,
                                        "name": "VGH",
                                        "type": "OUTPUT",
                                        "description": "Gate high voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No display, backlight works",
                                "cause": "TCON dead or LVDS signal missing",
                                "test": "Check LVDS signal with scope",
                                "expected": "Differential signal present",
                                "fix": "Replace RTD2171"
                        }
                ],
                "replacements": [
                        "RTD2171",
                        "RTD2172"
                ],
                "datasheetUrl": "https://www.realtek.com/en/products/display-controllers",
                "lcscUrl": "https://www.lcsc.com/search?q=RTD2171",
                "octpartUrl": "https://octopart.com/search?q=RTD2171",
                "boards": [
                        "LA-H381P",
                        "LA-J191P"
                ],
                "tags": [
                        "display",
                        "tcon",
                        "lcd",
                        "realtek"
                ],
                "custom": false
        },
        {
                "id": "TPS61170",
                "category": "Display",
                "manufacturer": "Texas Instruments",
                "package": "QFN-16",
                "description": "High Voltage Boost Converter for LED Backlight",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 5,
                                        "name": "COMP",
                                        "type": "INPUT",
                                        "description": "Compensation"
                                },
                                {
                                        "num": 6,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No backlight, display dark",
                                "cause": "Boost IC dead or inductor open",
                                "test": "Measure SW pin with scope",
                                "expected": "Switching waveform at ~600kHz",
                                "fix": "Replace TPS61170 or inductor"
                        }
                ],
                "replacements": [
                        "TPS61170",
                        "TPS61175"
                ],
                "datasheetUrl": "https://www.ti.com/product/TPS61170",
                "lcscUrl": "https://www.lcsc.com/search?q=TPS61170",
                "octpartUrl": "https://octopart.com/search?q=TPS61170",
                "boards": [
                        "820-00165",
                        "LA-H381P"
                ],
                "tags": [
                        "backlight",
                        "boost",
                        "led",
                        "ti"
                ],
                "custom": false
        },
        {
                "id": "LP8556",
                "category": "Display",
                "manufacturer": "Texas Instruments",
                "package": "WQFN-20",
                "description": "LED Backlight Driver with I2C Interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 5,
                                        "name": "LED1-6",
                                        "type": "OUTPUT",
                                        "description": "LED string outputs"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Dim or no backlight",
                                "cause": "LED driver IC failure",
                                "test": "Check I2C communication and LED output",
                                "expected": "I2C ACK present, LED current flowing",
                                "fix": "Replace LP8556"
                        }
                ],
                "replacements": [
                        "LP8556",
                        "LP8557"
                ],
                "datasheetUrl": "https://www.ti.com/product/LP8556",
                "lcscUrl": "https://www.lcsc.com/search?q=LP8556",
                "octpartUrl": "https://octopart.com/search?q=LP8556",
                "boards": [
                        "820-00850",
                        "820-01598"
                ],
                "tags": [
                        "backlight",
                        "led",
                        "i2c",
                        "ti"
                ],
                "custom": false
        },
        {
                "id": "CS42L83",
                "category": "Audio",
                "manufacturer": "Cirrus Logic",
                "package": "WLCSP-49",
                "description": "Audio Codec with Headphone Amplifier (MacBook)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDDA",
                                        "type": "POWER",
                                        "description": "Analog supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "HP_OUT",
                                        "type": "OUTPUT",
                                        "description": "Headphone output"
                                },
                                {
                                        "num": "C1",
                                        "name": "I2S",
                                        "type": "I2S",
                                        "description": "I2S interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No audio from speakers or headphone jack",
                                "cause": "Codec dead or I2S communication failure",
                                "test": "Check I2S signals with scope",
                                "expected": "I2S clock and data present",
                                "fix": "Replace CS42L83"
                        }
                ],
                "replacements": [
                        "CS42L83"
                ],
                "datasheetUrl": "https://www.cirrus.com/products/cs42l83/",
                "lcscUrl": "https://www.lcsc.com/search?q=CS42L83",
                "octpartUrl": "https://octopart.com/search?q=CS42L83",
                "boards": [
                        "820-00165",
                        "820-00850"
                ],
                "tags": [
                        "audio",
                        "codec",
                        "cirrus",
                        "macbook"
                ],
                "custom": false
        },
        {
                "id": "MAX98357A",
                "category": "Audio",
                "manufacturer": "Maxim Integrated",
                "package": "WLP-12",
                "description": "PCM Class D Audio Amplifier with I2S Interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "SPK+",
                                        "type": "OUTPUT",
                                        "description": "Speaker positive"
                                },
                                {
                                        "num": 3,
                                        "name": "SPK-",
                                        "type": "OUTPUT",
                                        "description": "Speaker negative"
                                },
                                {
                                        "num": 5,
                                        "name": "BCLK",
                                        "type": "I2S",
                                        "description": "Bit clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No sound from internal speaker",
                                "cause": "Amplifier IC dead",
                                "test": "Check I2S signals and speaker output",
                                "expected": "I2S present, speaker impedance ~4-8Ω",
                                "fix": "Replace MAX98357A"
                        }
                ],
                "replacements": [
                        "MAX98357A"
                ],
                "datasheetUrl": "https://www.maximintegrated.com/en/products/analog/audio/MAX98357A.html",
                "lcscUrl": "https://www.lcsc.com/search?q=MAX98357A",
                "octpartUrl": "https://octopart.com/search?q=MAX98357A",
                "boards": [
                        "820-00165",
                        "iPhone 11"
                ],
                "tags": [
                        "audio",
                        "amplifier",
                        "class-d",
                        "maxim"
                ],
                "custom": false
        },
        {
                "id": "Intel JHL7540",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Intel",
                "package": "BGA-289",
                "description": "Thunderbolt 3 Controller (Titan Ridge)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "TB3_TX",
                                        "type": "OUTPUT",
                                        "description": "Thunderbolt TX"
                                },
                                {
                                        "num": "C1",
                                        "name": "USB3_TX",
                                        "type": "OUTPUT",
                                        "description": "USB3 TX"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Thunderbolt port not working",
                                "cause": "Controller dead or firmware issue",
                                "test": "Check PCIe enumeration and power rails",
                                "expected": "All rails present, device enumerated",
                                "fix": "Replace JHL7540"
                        }
                ],
                "replacements": [
                        "JHL7540",
                        "JHL6540"
                ],
                "boards": [
                        "820-00850",
                        "820-01598"
                ],
                "tags": [
                        "thunderbolt",
                        "intel",
                        "usb-c",
                        "pcie"
                ],
                "custom": false
        },
        {
                "id": "TUSB320",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Texas Instruments",
                "package": "WQFN-12",
                "description": "USB Type-C Port Controller with I2C",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Supply"
                                },
                                {
                                        "num": 2,
                                        "name": "CC1",
                                        "type": "CC",
                                        "description": "CC line 1"
                                },
                                {
                                        "num": 3,
                                        "name": "CC2",
                                        "type": "CC",
                                        "description": "CC line 2"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB-C not detected or wrong role",
                                "cause": "CC detection failure",
                                "test": "Measure CC pin voltage",
                                "expected": "0.66V (Rp) or 0.2V (Rd)",
                                "fix": "Replace TUSB320"
                        }
                ],
                "replacements": [
                        "TUSB320",
                        "TUSB321"
                ],
                "datasheetUrl": "https://www.ti.com/product/TUSB320",
                "lcscUrl": "https://www.lcsc.com/search?q=TUSB320",
                "octpartUrl": "https://octopart.com/search?q=TUSB320",
                "boards": [
                        "LA-H381P",
                        "LA-J191P"
                ],
                "tags": [
                        "usb-c",
                        "cc",
                        "ti",
                        "port-controller"
                ],
                "custom": false
        },
        {
                "id": "SM2263XT",
                "category": "Storage",
                "manufacturer": "Silicon Motion",
                "package": "QFN-88",
                "description": "NVMe SSD Controller (PCIe Gen3 x4)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PCIE_TX",
                                        "type": "OUTPUT",
                                        "description": "PCIe TX lanes"
                                },
                                {
                                        "num": 10,
                                        "name": "NAND",
                                        "type": "NAND",
                                        "description": "NAND interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "SSD not detected",
                                "cause": "Controller dead or NAND failure",
                                "test": "Check PCIe enumeration and power",
                                "expected": "3.3V present, device enumerated",
                                "fix": "Replace SSD or controller"
                        }
                ],
                "replacements": [
                        "SM2263XT",
                        "SM2262EN"
                ],
                "boards": [
                        "820-00850",
                        "LA-J191P"
                ],
                "tags": [
                        "ssd",
                        "nvme",
                        "silicon-motion",
                        "storage"
                ],
                "custom": false
        },
        {
                "id": "Kioxia THGAF8G9T43BAIR",
                "category": "Storage",
                "manufacturer": "Kioxia",
                "package": "BGA-153",
                "description": "UFS 3.1 NAND Flash (256GB)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCCQ",
                                        "type": "POWER",
                                        "description": "I/O supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "CMD",
                                        "type": "UFS",
                                        "description": "Command line"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Phone stuck on boot logo",
                                "cause": "NAND corruption or physical damage",
                                "test": "Check NAND communication",
                                "expected": "UFS commands acknowledged",
                                "fix": "Replace NAND chip (requires reprogramming)"
                        }
                ],
                "boards": [
                        "Samsung S21",
                        "iPhone 12"
                ],
                "tags": [
                        "nand",
                        "ufs",
                        "kioxia",
                        "storage",
                        "smartphone"
                ],
                "custom": false
        },
        {
                "id": "U2 Tristar (1610A3)",
                "category": "Logic / Buffers",
                "manufacturer": "NXP",
                "package": "BGA",
                "description": "USB Authentication and Charging Logic IC (iPhone 6S/7)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Main Power"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Phone won't charge when battery is dead, fast battery drain",
                                "cause": "Damage from non-MFi cables",
                                "test": "Tristar tester or measure current draw on CC lines",
                                "expected": "Low current on CC",
                                "fix": "Replace Tristar IC"
                        }
                ],
                "boards": [
                        "iPhone 6S",
                        "iPhone 7"
                ],
                "tags": [
                        "iphone",
                        "charging",
                        "tristar"
                ],
                "custom": false
        },
        {
                "id": "SN74LVC1G125",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOT-23-5",
                "description": "Single Bus Buffer Gate with 3-State Output",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "OE",
                                        "type": "INPUT",
                                        "description": "Output enable"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal not passing through",
                                "cause": "Buffer IC dead",
                                "test": "Check input signal and OE pin",
                                "expected": "Input present, OE low, output should follow input",
                                "fix": "Replace SN74LVC1G125"
                        }
                ],
                "replacements": [
                        "SN74LVC1G125",
                        "NC7SZ125"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G125",
                "lcscUrl": "https://www.lcsc.com/search?q=SN74LVC1G125",
                "octpartUrl": "https://octopart.com/search?q=SN74LVC1G125",
                "boards": [
                        "820-00165",
                        "LA-H381P"
                ],
                "tags": [
                        "buffer",
                        "logic",
                        "ti",
                        "3-state"
                ],
                "custom": false
        },
        {
                "id": "BMP280",
                "category": "Sensors",
                "manufacturer": "Bosch",
                "package": "LGA-8",
                "description": "Digital Barometric Pressure Sensor",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 4,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Altitude/pressure readings wrong",
                                "cause": "Sensor damaged or I2C failure",
                                "test": "Check I2C communication",
                                "expected": "I2C ACK present, valid data",
                                "fix": "Replace BMP280"
                        }
                ],
                "replacements": [
                        "BMP280",
                        "BME280"
                ],
                "datasheetUrl": "https://www.bosch-sensortec.com/products/environmental-sensors/pressure-sensors/bmp280/",
                "lcscUrl": "https://www.lcsc.com/search?q=BMP280",
                "octpartUrl": "https://octopart.com/search?q=BMP280",
                "boards": [
                        "Various IoT boards"
                ],
                "tags": [
                        "sensor",
                        "pressure",
                        "bosch",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "MPU6050",
                "category": "Sensors",
                "manufacturer": "InvenSense",
                "package": "QFN-24",
                "description": "6-Axis Motion Tracking (Gyro + Accelerometer)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 4,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Gyro/accelerometer not responding",
                                "cause": "Sensor dead or I2C failure",
                                "test": "Check I2C communication",
                                "expected": "I2C ACK present, valid motion data",
                                "fix": "Replace MPU6050"
                        }
                ],
                "replacements": [
                        "MPU6050",
                        "MPU6500"
                ],
                "datasheetUrl": "https://www.invensense.com/products/motion-tracking/6-axis/mpu-6050/",
                "lcscUrl": "https://www.lcsc.com/search?q=MPU6050",
                "octpartUrl": "https://octopart.com/search?q=MPU6050",
                "boards": [
                        "Various IoT boards",
                        "Arduino"
                ],
                "tags": [
                        "sensor",
                        "gyro",
                        "accelerometer",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "Resistor 10kΩ 0402",
                "category": "Passives",
                "manufacturer": "Generic",
                "package": "0402",
                "description": "10kΩ Surface Mount Resistor (Pull-up/Pull-down)",
                "pinout": {
                        "pins": []
                },
                "commonFailures": [
                        {
                                "symptom": "Signal floating or wrong voltage",
                                "cause": "Resistor open or wrong value",
                                "test": "Measure resistance in-circuit",
                                "expected": "~10kΩ",
                                "fix": "Replace resistor"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "resistor",
                        "passive",
                        "pull-up",
                        "0402"
                ],
                "custom": false
        },
        {
                "id": "Capacitor 100nF 0402",
                "category": "Passives",
                "manufacturer": "Generic",
                "package": "0402",
                "description": "100nF (0.1µF) Ceramic Decoupling Capacitor",
                "pinout": {
                        "pins": []
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail noise or instability",
                                "cause": "Decoupling capacitor shorted or open",
                                "test": "Measure capacitance or diode drop",
                                "expected": "No short to ground, ~100nF",
                                "fix": "Replace capacitor"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "capacitor",
                        "passive",
                        "decoupling",
                        "0402"
                ],
                "custom": false
        },
        {
                "id": "Inductor 2.2µH",
                "category": "Passives",
                "manufacturer": "Generic",
                "package": "0603",
                "description": "2.2µH Power Inductor (Buck converter output)",
                "pinout": {
                        "pins": []
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage from buck converter",
                                "cause": "Inductor open or cracked",
                                "test": "Measure continuity across inductor",
                                "expected": "< 1Ω resistance",
                                "fix": "Replace inductor"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "inductor",
                        "passive",
                        "buck",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "Fuse 3A 0603",
                "category": "Passives",
                "manufacturer": "Generic",
                "package": "0603",
                "description": "3A Surface Mount Resettable Fuse",
                "pinout": {
                        "pins": []
                },
                "commonFailures": [
                        {
                                "symptom": "No power to subsystem",
                                "cause": "Fuse blown from overcurrent",
                                "test": "Measure continuity across fuse",
                                "expected": "< 0.1Ω (good), OL (blown)",
                                "fix": "Replace fuse and find root cause of overcurrent"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "fuse",
                        "passive",
                        "protection",
                        "0603"
                ],
                "custom": false
        },
        {
                "id": "AO3400A",
                "category": "MOSFET",
                "manufacturer": "Alpha & Omega",
                "package": "SOT-23",
                "description": "N-Channel Enhancement Mode MOSFET (30V, 5.7A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail shorted to ground",
                                "cause": "MOSFET shorted D-S",
                                "test": "Measure diode drop D to S",
                                "expected": "0.4-0.6V (good), 0.0V (shorted)",
                                "fix": "Replace AO3400A"
                        }
                ],
                "replacements": [
                        "AO3400A",
                        "SI2302"
                ],
                "datasheetUrl": "https://www.aosmd.com/pdfs/datasheet/AO3400A.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=AO3400A",
                "octpartUrl": "https://octopart.com/search?q=AO3400A",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "switch",
                        "sot-23"
                ],
                "custom": false
        },
        {
                "id": "AO3401A",
                "category": "MOSFET",
                "manufacturer": "Alpha & Omega",
                "package": "SOT-23",
                "description": "P-Channel Enhancement Mode MOSFET (-30V, -4A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail not present",
                                "cause": "P-MOSFET not turning on",
                                "test": "Check gate voltage",
                                "expected": "Gate < Source for ON state",
                                "fix": "Replace AO3401A"
                        }
                ],
                "replacements": [
                        "AO3401A",
                        "SI2301"
                ],
                "datasheetUrl": "https://www.aosmd.com/pdfs/datasheet/AO3401A.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=AO3401A",
                "octpartUrl": "https://octopart.com/search?q=AO3401A",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "p-channel",
                        "switch",
                        "sot-23"
                ],
                "custom": false
        },
        {
                "id": "SS14 (Schottky)",
                "category": "Diode",
                "manufacturer": "Generic",
                "package": "SMA",
                "description": "1A 40V Schottky Barrier Rectifier",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                },
                                {
                                        "num": 2,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail shorted",
                                "cause": "Schottky diode shorted",
                                "test": "Measure diode drop A to K",
                                "expected": "0.2-0.4V (good), 0.0V (shorted)",
                                "fix": "Replace SS14"
                        }
                ],
                "replacements": [
                        "SS14",
                        "SS16",
                        "1N5819"
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "diode",
                        "schottky",
                        "rectifier",
                        "sma"
                ],
                "custom": false
        },
        {
                "id": "ESD9M5V (TVS)",
                "category": "Diode",
                "manufacturer": "ON Semiconductor",
                "package": "SOD-923",
                "description": "ESD Protection Diode (5V)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                },
                                {
                                        "num": 2,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB/data line not working",
                                "cause": "TVS diode shorted from ESD event",
                                "test": "Measure diode drop on protected line",
                                "expected": "0.6V (good), 0.0V (shorted)",
                                "fix": "Replace ESD9M5V"
                        }
                ],
                "replacements": [
                        "ESD9M5V",
                        "PESD5V0"
                ],
                "datasheetUrl": "https://www.onsemi.com/products/protection/esd-protection-diodes/esd9m5v",
                "lcscUrl": "https://www.lcsc.com/search?q=ESD9M5V",
                "octpartUrl": "https://octopart.com/search?q=ESD9M5V",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "diode",
                        "tvs",
                        "esd",
                        "protection"
                ],
                "custom": false
        },
        {
                "id": "32.768kHz Crystal",
                "category": "Oscillator",
                "manufacturer": "Generic",
                "package": "SMD-2",
                "description": "32.768kHz Watch Crystal (RTC)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "XIN",
                                        "type": "INPUT",
                                        "description": "Crystal input"
                                },
                                {
                                        "num": 2,
                                        "name": "XOUT",
                                        "type": "OUTPUT",
                                        "description": "Crystal output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "RTC not keeping time",
                                "cause": "Crystal damaged or load caps wrong",
                                "test": "Check crystal frequency with scope",
                                "expected": "32.768kHz sine wave",
                                "fix": "Replace crystal and verify load capacitors"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "crystal",
                        "oscillator",
                        "rtc",
                        "32khz"
                ],
                "custom": false
        },
        {
                "id": "25MHz Oscillator",
                "category": "Oscillator",
                "manufacturer": "Generic",
                "package": "SMD-4",
                "description": "25MHz CMOS Oscillator (Ethernet/USB reference)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "OUT",
                                        "type": "OUTPUT",
                                        "description": "Clock output"
                                },
                                {
                                        "num": 4,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Ethernet/USB not working",
                                "cause": "Reference clock missing",
                                "test": "Check clock output with scope",
                                "expected": "25MHz square wave, ~1.6Vpp",
                                "fix": "Replace oscillator"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "oscillator",
                        "clock",
                        "25mhz",
                        "cmos"
                ],
                "custom": false
        },
        {
                "id": "USB-C Connector (16-pin)",
                "category": "Connector",
                "manufacturer": "Generic",
                "package": "SMD",
                "description": "USB Type-C Receptacle (16-pin simplified)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1/B12",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": "A4/B9",
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "Power"
                                },
                                {
                                        "num": "A5",
                                        "name": "CC1",
                                        "type": "CC",
                                        "description": "Configuration Channel 1"
                                },
                                {
                                        "num": "B5",
                                        "name": "CC2",
                                        "type": "CC",
                                        "description": "Configuration Channel 2"
                                },
                                {
                                        "num": "A6/A7",
                                        "name": "D+/D-",
                                        "type": "USB2",
                                        "description": "USB 2.0 differential pair"
                                },
                                {
                                        "num": "A8/B8",
                                        "name": "SBU1/SBU2",
                                        "type": "SBU",
                                        "description": "Sideband use"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB-C not working",
                                "cause": "Connector damaged or pins bent",
                                "test": "Visual inspection and continuity check",
                                "expected": "All pins making contact",
                                "fix": "Replace USB-C connector"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "connector",
                        "usb-c",
                        "type-c",
                        "receptacle"
                ],
                "custom": false
        },
        {
                "id": "Battery Connector (4-pin)",
                "category": "Connector",
                "manufacturer": "Generic",
                "package": "SMD",
                "description": "Li-Polymer Battery Connector (B+/B-/T/ID)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "B+",
                                        "type": "POWER",
                                        "description": "Battery positive"
                                },
                                {
                                        "num": 2,
                                        "name": "B-",
                                        "type": "GND",
                                        "description": "Battery negative"
                                },
                                {
                                        "num": 3,
                                        "name": "T",
                                        "type": "INPUT",
                                        "description": "Thermistor"
                                },
                                {
                                        "num": 4,
                                        "name": "ID",
                                        "type": "INPUT",
                                        "description": "Battery ID"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Battery not detected",
                                "cause": "Connector pins damaged or corroded",
                                "test": "Check continuity from connector to board",
                                "expected": "All pins continuous",
                                "fix": "Replace battery connector"
                        }
                ],
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "connector",
                        "battery",
                        "li-polymer"
                ],
                "custom": false
        },
        {
                "id": "SN2501",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "QFN",
                "description": "USB-C PD / Charger Controller (iPhone 11/12 series)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "iPhone dead, no charge",
                                "cause": "Liquid damage or surge",
                                "test": "Check VCC_MAIN for shorts",
                                "expected": "0.3V-0.4V diode drop",
                                "fix": "Replace SN2501"
                        }
                ],
                "boards": [
                        "iPhone 11",
                        "iPhone 12"
                ],
                "tags": [
                        "iphone",
                        "charger",
                        "sn2501"
                ],
                "custom": false
        },
        {
                "id": "CD3217",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Texas Instruments",
                "package": "QFN",
                "description": "USB-C Port Controller (MacBook Air/Pro 2018-2020)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "1",
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "Input"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No 20V on USB-C, stuck at 5V",
                                "cause": "CD3217 internal short or LDO failure",
                                "test": "Measure LDO_3V3 and LDO_1V8 on surrounding caps",
                                "expected": "3.3V and 1.8V",
                                "fix": "Replace CD3217 (Note: Needs specific firmware version for model)"
                        }
                ],
                "boards": [
                        "820-01521",
                        "820-01949",
                        "820-01598"
                ],
                "tags": [
                        "apple",
                        "usb-c",
                        "pd",
                        "cd3217"
                ],
                "custom": false
        },
        {
                "id": "ISL9239",
                "category": "Charger IC",
                "manufacturer": "Renesas",
                "package": "QFN-32",
                "description": "USB-C Buck-Boost Battery Charger (MacBook Pro 2016-2017)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "1",
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB-C Input"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging, 5V on USB-C",
                                "cause": "VBUS input shorted or IC failure",
                                "test": "Measure diode drop on VBUS",
                                "expected": "0.45V",
                                "fix": "Replace ISL9239"
                        }
                ],
                "boards": [
                        "820-00239",
                        "820-00923",
                        "820-00850"
                ],
                "tags": [
                        "charger",
                        "isl9239",
                        "usb-c"
                ],
                "custom": false
        },
        {
                "id": "TPS65982",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Texas Instruments",
                "package": "QFN-48",
                "description": "USB Type-C and USB PD Controller",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB-C VBUS input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "CC1",
                                        "type": "CC",
                                        "description": "Configuration Channel 1"
                                },
                                {
                                        "num": 6,
                                        "name": "CC2",
                                        "type": "CC",
                                        "description": "Configuration Channel 2"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB-C not detected",
                                "cause": "CC pins shorted or IC dead",
                                "test": "Measure diode drop on CC1 and CC2 to GND",
                                "expected": "0.6-0.7V",
                                "fix": "Replace TPS65982"
                        }
                ],
                "replacements": [
                        "TPS65983",
                        "TPS65986"
                ],
                "datasheetUrl": "https://www.ti.com/product/TPS65982",
                "lcscUrl": "https://www.lcsc.com/search?q=TPS65982",
                "octpartUrl": "https://octopart.com/search?q=TPS65982",
                "boards": [
                        "820-00138",
                        "820-00239"
                ],
                "tags": [
                        "usb-c",
                        "pd",
                        "ti",
                        "port-controller"
                ],
                "custom": false
        },
        {
                "id": "TPS51980",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "QFN-32",
                "description": "Synchronous Buck Controller for CPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM",
                                        "type": "OUTPUT",
                                        "description": "PWM output"
                                },
                                {
                                        "num": 10,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "Controller dead or gate driver failure",
                                "test": "Check PWM output with scope",
                                "expected": "Switching waveform present",
                                "fix": "Replace TPS51980"
                        }
                ],
                "replacements": [
                        "TPS51980A"
                ],
                "datasheetUrl": "https://www.ti.com/product/TPS51980",
                "lcscUrl": "https://www.lcsc.com/search?q=TPS51980",
                "octpartUrl": "https://octopart.com/search?q=TPS51980",
                "boards": [
                        "820-3437",
                        "820-00165"
                ],
                "tags": [
                        "buck",
                        "cpu",
                        "vrm",
                        "ti"
                ],
                "custom": false
        },
        {
                "id": "RT8059",
                "category": "Power Management",
                "manufacturer": "Richtek",
                "package": "DFN-10",
                "description": "1A Synchronous Step-Down Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage (2.5-5.5V)"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable pin"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 6,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback pin"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No 1.05V or 1.8V rail",
                                "cause": "IC dead or feedback resistor open",
                                "test": "Measure EN pin voltage and FB pin",
                                "expected": "EN > 1.2V, FB = 0.6V",
                                "fix": "Replace RT8059 or feedback network"
                        }
                ],
                "replacements": [
                        "RT8059",
                        "RT8060"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT8059.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT8059",
                "octpartUrl": "https://octopart.com/search?q=RT8059",
                "boards": [
                        "820-00165",
                        "820-3437",
                        "820-00850"
                ],
                "tags": [
                        "buck",
                        "step-down",
                        "richtek",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "APW7159",
                "category": "Power Management",
                "manufacturer": "Anpec",
                "package": "SOP-8",
                "description": "Synchronous Buck Converter (DDR Memory Power)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 6,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No DDR voltage",
                                "cause": "IC dead or output shorted",
                                "test": "Measure output voltage",
                                "expected": "1.35V or 1.5V",
                                "fix": "Replace APW7159"
                        }
                ],
                "replacements": [
                        "APW7159",
                        "APW7160"
                ],
                "datasheetUrl": "https://www.anpec.com.tw/product/APW7159",
                "lcscUrl": "https://www.lcsc.com/search?q=APW7159",
                "octpartUrl": "https://octopart.com/search?q=APW7159",
                "boards": [
                        "820-3437",
                        "820-00165"
                ],
                "tags": [
                        "buck",
                        "ddr",
                        "memory",
                        "anpec"
                ],
                "custom": false
        },
        {
                "id": "NCP3710",
                "category": "Power Management",
                "manufacturer": "ON Semiconductor",
                "package": "DFN-6",
                "description": "Overvoltage Protection Load Switch",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "OUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 4,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No power to subsystem",
                                "cause": "OVP triggered or IC dead",
                                "test": "Measure input vs output voltage",
                                "expected": "Vout = Vin when enabled",
                                "fix": "Replace NCP3710"
                        }
                ],
                "replacements": [
                        "NCP3710",
                        "NCP3720"
                ],
                "datasheetUrl": "https://www.onsemi.com/products/power-management/load-switches/ncp3710",
                "lcscUrl": "https://www.lcsc.com/search?q=NCP3710",
                "octpartUrl": "https://octopart.com/search?q=NCP3710",
                "boards": [
                        "820-00165",
                        "iPhone 11",
                        "iPhone 12"
                ],
                "tags": [
                        "ovp",
                        "load-switch",
                        "protection",
                        "on-semi"
                ],
                "custom": false
        },
        {
                "id": "LTC4088",
                "category": "Charger IC",
                "manufacturer": "Analog Devices / Linear",
                "package": "QFN-24",
                "description": "High Efficiency USB Battery Charger with PowerPath",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "USB input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "PROG",
                                        "type": "INPUT",
                                        "description": "Charge current program"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging from USB",
                                "cause": "VIN pin shorted or IC dead",
                                "test": "Measure diode drop on VIN to GND",
                                "expected": "0.5-0.7V",
                                "fix": "Replace LTC4088"
                        }
                ],
                "replacements": [
                        "LTC4088",
                        "LTC4089"
                ],
                "datasheetUrl": "https://www.analog.com/en/products/ltc4088.html",
                "lcscUrl": "https://www.lcsc.com/search?q=LTC4088",
                "octpartUrl": "https://octopart.com/search?q=LTC4088",
                "boards": [
                        "Various tablets",
                        "IoT devices"
                ],
                "tags": [
                        "charger",
                        "usb",
                        "linear",
                        "powerpath"
                ],
                "custom": false
        },
        {
                "id": "BQ24193",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "QFN-24",
                "description": "2.3A Single Cell USB OTG Battery Charger with I2C",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Phone not charging",
                                "cause": "VBUS shorted or IC dead",
                                "test": "Measure diode drop on VBUS to GND",
                                "expected": "0.4-0.6V",
                                "fix": "Replace BQ24193"
                        }
                ],
                "replacements": [
                        "BQ24193",
                        "BQ24195",
                        "BQ24296"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ24193",
                "lcscUrl": "https://www.lcsc.com/search?q=BQ24193",
                "octpartUrl": "https://octopart.com/search?q=BQ24193",
                "boards": [
                        "Various smartphones",
                        "Tablets"
                ],
                "tags": [
                        "charger",
                        "ti",
                        "smartphone",
                        "usb",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "BQ25890",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "QFN-24",
                "description": "I2C-Controlled 4.5A Switch-Mode Battery Charger",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Phone not charging",
                                "cause": "VBUS shorted or IC dead",
                                "test": "Measure diode drop on VBUS to GND",
                                "expected": "0.4-0.6V",
                                "fix": "Replace BQ25890"
                        }
                ],
                "replacements": [
                        "BQ25890",
                        "BQ25895",
                        "BQ25896"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ25890",
                "lcscUrl": "https://www.lcsc.com/search?q=BQ25890",
                "octpartUrl": "https://octopart.com/search?q=BQ25890",
                "boards": [
                        "Samsung S20",
                        "Samsung S21",
                        "Various smartphones"
                ],
                "tags": [
                        "charger",
                        "ti",
                        "smartphone",
                        "usb",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "ISL9237",
                "category": "Charger IC",
                "manufacturer": "Renesas",
                "package": "QFN-32",
                "description": "USB-C Buck-Boost Battery Charger (MacBook Pro 2016)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB-C Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "BATT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C data"
                                },
                                {
                                        "num": 11,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging, 5V on USB-C",
                                "cause": "VBUS input shorted or IC failure",
                                "test": "Measure diode drop on VBUS",
                                "expected": "0.45V",
                                "fix": "Replace ISL9237"
                        }
                ],
                "replacements": [
                        "ISL9237",
                        "ISL9239",
                        "ISL9240"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl9237-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL9237",
                "octpartUrl": "https://octopart.com/search?q=ISL9237",
                "boards": [
                        "820-00239",
                        "820-00923"
                ],
                "tags": [
                        "charger",
                        "isl9237",
                        "usb-c",
                        "macbook"
                ],
                "custom": false
        },
        {
                "id": "ISL6259A",
                "category": "Charger IC",
                "manufacturer": "Renesas",
                "package": "QFN-28",
                "description": "Battery Charger Controller with SMBus Interface (MagSafe 2)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "ACIN",
                                        "type": "POWER",
                                        "description": "AC adapter input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "BATT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 10,
                                        "name": "SMBDAT",
                                        "type": "SMBus",
                                        "description": "SMBus data"
                                },
                                {
                                        "num": 11,
                                        "name": "SMBCLK",
                                        "type": "SMBus",
                                        "description": "SMBus clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging",
                                "cause": "ACIN pin open or IC dead",
                                "test": "Measure voltage on ACIN pin",
                                "expected": "16.5V (MagSafe)",
                                "fix": "Check MagSafe connector and cable. Replace IC if ACIN present but no charging."
                        }
                ],
                "replacements": [
                        "ISL6259A",
                        "RAA214000"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl6259a-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL6259A",
                "octpartUrl": "https://octopart.com/search?q=ISL6259A",
                "boards": [
                        "820-3437",
                        "820-2915",
                        "820-3115"
                ],
                "tags": [
                        "charger",
                        "magsafe",
                        "smbus",
                        "battery"
                ],
                "custom": false
        },
        {
                "id": "ISL95839B",
                "category": "Power Management",
                "manufacturer": "Renesas",
                "package": "BGA-56",
                "description": "4+1 Phase IMVP-8 CPU Core Controller (MacBook Pro)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No boot, CPU core voltage missing",
                                "cause": "Controller dead or gate driver failure",
                                "test": "Measure PWM output with scope",
                                "expected": "Switching waveform present",
                                "fix": "Replace ISL95839B"
                        }
                ],
                "replacements": [
                        "ISL95839B",
                        "ISL95839C"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl95839b-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL95839B",
                "octpartUrl": "https://octopart.com/search?q=ISL95839B",
                "boards": [
                        "820-00165",
                        "820-00850"
                ],
                "tags": [
                        "imvp",
                        "cpu",
                        "vrm",
                        "renesas",
                        "macbook"
                ],
                "custom": false
        },
        {
                "id": "ISL6236",
                "category": "Power Management",
                "manufacturer": "Renesas",
                "package": "QFN-32",
                "description": "Dual Output Core/GPU IMVP-7+ Controller",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "CPU PWM output"
                                },
                                {
                                        "num": 10,
                                        "name": "PWM2",
                                        "type": "OUTPUT",
                                        "description": "GPU PWM output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU or GPU power",
                                "cause": "Controller dead",
                                "test": "Check PWM outputs with scope",
                                "expected": "Switching waveforms present",
                                "fix": "Replace ISL6236"
                        }
                ],
                "replacements": [
                        "ISL6236",
                        "ISL6237"
                ],
                "datasheetUrl": "https://www.renesas.com/us/en/document/dst/isl6236-datasheet",
                "lcscUrl": "https://www.lcsc.com/search?q=ISL6236",
                "octpartUrl": "https://octopart.com/search?q=ISL6236",
                "boards": [
                        "820-3437",
                        "820-2915"
                ],
                "tags": [
                        "imvp",
                        "cpu",
                        "gpu",
                        "vrm",
                        "renesas"
                ],
                "custom": false
        },
        {
                "id": "SMC (338S0001)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA",
                "description": "System Management Controller (Intel MacBooks pre-T2)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Main supply"
                                },
                                {
                                        "num": "2",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Mac won't turn on, no MagSafe LED",
                                "cause": "SMC firmware corruption or dead SMC",
                                "test": "Check SMC reset, check PP3V42_G3H",
                                "expected": "PP3V42_G3H = 3.42V",
                                "fix": "SMC reset or replace logic board"
                        }
                ],
                "boards": [
                        "820-3437",
                        "820-2915",
                        "820-3115"
                ],
                "tags": [
                        "apple",
                        "smc",
                        "management",
                        "intel"
                ],
                "custom": false
        },
        {
                "id": "PCH (Intel Z490)",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "BGA",
                "description": "Platform Controller Hub (Chipset)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "PCIE",
                                        "type": "PCIE",
                                        "description": "PCIe lanes"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No USB, no SATA, no boot",
                                "cause": "PCH dead or BGA cracked",
                                "test": "Check PCH core voltage",
                                "expected": "~1.05V",
                                "fix": "Reball or replace motherboard"
                        }
                ],
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "intel",
                        "pch",
                        "chipset",
                        "pcie"
                ],
                "custom": false
        },
        {
                "id": "Intel I211-AT",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Intel",
                "package": "QFN-48",
                "description": "Gigabit Ethernet Controller (PCIe)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PCIE_TX",
                                        "type": "OUTPUT",
                                        "description": "PCIe TX lanes"
                                },
                                {
                                        "num": 10,
                                        "name": "RGMII",
                                        "type": "RGMII",
                                        "description": "Ethernet interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Ethernet port dead",
                                "cause": "Controller dead or magnetics issue",
                                "test": "Check PCIe enumeration and power",
                                "expected": "3.3V present, device enumerated",
                                "fix": "Replace I211-AT"
                        }
                ],
                "replacements": [
                        "I211-AT",
                        "I210-AT"
                ],
                "datasheetUrl": "https://www.intel.com/content/www/us/en/products/details/ethernet/i211-ethernet-controller.html",
                "lcscUrl": "https://www.lcsc.com/search?q=I211-AT",
                "octpartUrl": "https://octopart.com/search?q=I211-AT",
                "boards": [
                        "Desktop motherboards",
                        "Servers"
                ],
                "tags": [
                        "ethernet",
                        "intel",
                        "pcie",
                        "network"
                ],
                "custom": false
        },
        {
                "id": "Realtek ALC892",
                "category": "Audio",
                "manufacturer": "Realtek",
                "package": "QFN-48",
                "description": "High Definition Audio Codec (7.1 Channel)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "LINE_OUT",
                                        "type": "OUTPUT",
                                        "description": "Line output"
                                },
                                {
                                        "num": 10,
                                        "name": "MIC_IN",
                                        "type": "INPUT",
                                        "description": "Microphone input"
                                },
                                {
                                        "num": 15,
                                        "name": "SDI",
                                        "type": "HDA",
                                        "description": "HDA serial data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No audio output",
                                "cause": "Codec dead or HDA communication failure",
                                "test": "Check HDA signals with scope",
                                "expected": "HDA clock and data present",
                                "fix": "Replace ALC892"
                        }
                ],
                "replacements": [
                        "ALC892",
                        "ALC897",
                        "ALC1220"
                ],
                "datasheetUrl": "https://www.realtek.com/en/products/communications-network-ics/item/alc892",
                "lcscUrl": "https://www.lcsc.com/search?q=ALC892",
                "octpartUrl": "https://octopart.com/search?q=ALC892",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "audio",
                        "codec",
                        "realtek",
                        "hda"
                ],
                "custom": false
        },
        {
                "id": "Realtek ALC283",
                "category": "Audio",
                "manufacturer": "Realtek",
                "package": "QFN-48",
                "description": "High Definition Audio Codec (Laptop)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "HP_OUT",
                                        "type": "OUTPUT",
                                        "description": "Headphone output"
                                },
                                {
                                        "num": 10,
                                        "name": "SPK_OUT",
                                        "type": "OUTPUT",
                                        "description": "Speaker output"
                                },
                                {
                                        "num": 15,
                                        "name": "SDI",
                                        "type": "HDA",
                                        "description": "HDA serial data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No audio from speakers or headphone jack",
                                "cause": "Codec dead or HDA communication failure",
                                "test": "Check HDA signals with scope",
                                "expected": "HDA clock and data present",
                                "fix": "Replace ALC283"
                        }
                ],
                "replacements": [
                        "ALC283",
                        "ALC285",
                        "ALC295"
                ],
                "datasheetUrl": "https://www.realtek.com/en/products/communications-network-ics/item/alc283",
                "lcscUrl": "https://www.lcsc.com/search?q=ALC283",
                "octpartUrl": "https://octopart.com/search?q=ALC283",
                "boards": [
                        "Laptop motherboards"
                ],
                "tags": [
                        "audio",
                        "codec",
                        "realtek",
                        "hda",
                        "laptop"
                ],
                "custom": false
        },
        {
                "id": "ITE IT8586",
                "category": "Logic / Buffers",
                "manufacturer": "ITE",
                "package": "QFP-128",
                "description": "Super I/O Controller (Keyboard, Mouse, Serial)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "KBC",
                                        "type": "KBC",
                                        "description": "Keyboard controller"
                                },
                                {
                                        "num": 10,
                                        "name": "SERIAL",
                                        "type": "SERIAL",
                                        "description": "Serial port"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Keyboard not working",
                                "cause": "Super I/O dead",
                                "test": "Check KBC signals",
                                "expected": "KBC clock and data present",
                                "fix": "Replace IT8586"
                        }
                ],
                "replacements": [
                        "IT8586",
                        "IT8587",
                        "IT8686"
                ],
                "datasheetUrl": "https://www.ite.com.tw/en/product/IT8586",
                "lcscUrl": "https://www.lcsc.com/search?q=IT8586",
                "octpartUrl": "https://octopart.com/search?q=IT8586",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "super-io",
                        "keyboard",
                        "mouse",
                        "serial",
                        "ite"
                ],
                "custom": false
        },
        {
                "id": "Nuvoton NCT6795",
                "category": "Logic / Buffers",
                "manufacturer": "Nuvoton",
                "package": "QFP-128",
                "description": "Super I/O Controller with Hardware Monitor",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "KBC",
                                        "type": "KBC",
                                        "description": "Keyboard controller"
                                },
                                {
                                        "num": 10,
                                        "name": "HWM",
                                        "type": "HWM",
                                        "description": "Hardware monitor"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Fan not spinning, no temperature readings",
                                "cause": "Super I/O dead",
                                "test": "Check HWM signals",
                                "expected": "HWM clock and data present",
                                "fix": "Replace NCT6795"
                        }
                ],
                "replacements": [
                        "NCT6795",
                        "NCT6796",
                        "NCT6798"
                ],
                "datasheetUrl": "https://www.nuvoton.com/products/pc-io/super-i-o/nct6795/",
                "lcscUrl": "https://www.lcsc.com/search?q=NCT6795",
                "octpartUrl": "https://octopart.com/search?q=NCT6795",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "super-io",
                        "hardware-monitor",
                        "fan",
                        "nuvoton"
                ],
                "custom": false
        },
        {
                "id": "Winbond W25Q64",
                "category": "Storage",
                "manufacturer": "Winbond",
                "package": "SOP-8",
                "description": "64M-bit SPI Serial Flash (BIOS Chip)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "/CS",
                                        "type": "INPUT",
                                        "description": "Chip select"
                                },
                                {
                                        "num": 2,
                                        "name": "DO",
                                        "type": "OUTPUT",
                                        "description": "Data output"
                                },
                                {
                                        "num": 3,
                                        "name": "/WP",
                                        "type": "INPUT",
                                        "description": "Write protect"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "DI",
                                        "type": "INPUT",
                                        "description": "Data input"
                                },
                                {
                                        "num": 6,
                                        "name": "CLK",
                                        "type": "INPUT",
                                        "description": "Clock"
                                },
                                {
                                        "num": 7,
                                        "name": "/HOLD",
                                        "type": "INPUT",
                                        "description": "Hold"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No boot, BIOS corrupted",
                                "cause": "Flash chip dead or corrupted firmware",
                                "test": "Read chip with programmer",
                                "expected": "Valid BIOS data",
                                "fix": "Reprogram or replace W25Q64"
                        }
                ],
                "replacements": [
                        "W25Q64",
                        "W25Q128",
                        "MX25L6405"
                ],
                "datasheetUrl": "https://www.winbond.com/products/nor-flash/spi-nor-flash/serial-nor-flash/2.5v-serial-nor-flash/W25Q64/",
                "lcscUrl": "https://www.lcsc.com/search?q=W25Q64",
                "octpartUrl": "https://octopart.com/search?q=W25Q64",
                "boards": [
                        "Desktop motherboards",
                        "Laptop motherboards"
                ],
                "tags": [
                        "flash",
                        "bios",
                        "spi",
                        "winbond"
                ],
                "custom": false
        },
        {
                "id": "ASMedia ASM1142",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "ASMedia",
                "package": "QFN-64",
                "description": "USB 3.1 Gen 2 Controller (10Gbps)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PCIE_TX",
                                        "type": "OUTPUT",
                                        "description": "PCIe TX lanes"
                                },
                                {
                                        "num": 10,
                                        "name": "USB3_TX",
                                        "type": "OUTPUT",
                                        "description": "USB3 TX lanes"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB 3.1 port not working",
                                "cause": "Controller dead or firmware issue",
                                "test": "Check PCIe enumeration and power rails",
                                "expected": "All rails present, device enumerated",
                                "fix": "Replace ASM1142"
                        }
                ],
                "replacements": [
                        "ASM1142",
                        "ASM2142"
                ],
                "datasheetUrl": "https://www.asmedia.com.tw/eng/e_products_show/item/ASM1142/",
                "lcscUrl": "https://www.lcsc.com/search?q=ASM1142",
                "octpartUrl": "https://octopart.com/search?q=ASM1142",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "usb",
                        "usb3.1",
                        "pcie",
                        "asmedia"
                ],
                "custom": false
        },
        {
                "id": "ASMedia ASM1061",
                "category": "Storage",
                "manufacturer": "ASMedia",
                "package": "QFN-48",
                "description": "SATA III Controller (2 Port)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Core supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PCIE_TX",
                                        "type": "OUTPUT",
                                        "description": "PCIe TX lanes"
                                },
                                {
                                        "num": 10,
                                        "name": "SATA_TX",
                                        "type": "OUTPUT",
                                        "description": "SATA TX lanes"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "SATA ports not working",
                                "cause": "Controller dead",
                                "test": "Check PCIe enumeration and power",
                                "expected": "3.3V present, device enumerated",
                                "fix": "Replace ASM1061"
                        }
                ],
                "replacements": [
                        "ASM1061",
                        "ASM1062"
                ],
                "datasheetUrl": "https://www.asmedia.com.tw/eng/e_products_show/item/ASM1061/",
                "lcscUrl": "https://www.lcsc.com/search?q=ASM1061",
                "octpartUrl": "https://octopart.com/search?q=ASM1061",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "sata",
                        "pcie",
                        "asmedia",
                        "storage"
                ],
                "custom": false
        },
        {
                "id": "NCT3933",
                "category": "Power Management",
                "manufacturer": "Nuvoton",
                "package": "QFN-32",
                "description": "Dual PWM Fan Controller with SMBus",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "FAN1",
                                        "type": "OUTPUT",
                                        "description": "Fan 1 PWM output"
                                },
                                {
                                        "num": 10,
                                        "name": "FAN2",
                                        "type": "OUTPUT",
                                        "description": "Fan 2 PWM output"
                                },
                                {
                                        "num": 15,
                                        "name": "SMBDAT",
                                        "type": "SMBus",
                                        "description": "SMBus data"
                                },
                                {
                                        "num": 16,
                                        "name": "SMBCLK",
                                        "type": "SMBus",
                                        "description": "SMBus clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Fans not spinning or running at full speed",
                                "cause": "Fan controller dead",
                                "test": "Check PWM output with scope",
                                "expected": "PWM signal present",
                                "fix": "Replace NCT3933"
                        }
                ],
                "replacements": [
                        "NCT3933",
                        "NCT3935"
                ],
                "datasheetUrl": "https://www.nuvoton.com/products/thermal-management/fan-controllers/nct3933/",
                "lcscUrl": "https://www.lcsc.com/search?q=NCT3933",
                "octpartUrl": "https://octopart.com/search?q=NCT3933",
                "boards": [
                        "Desktop motherboards",
                        "Servers"
                ],
                "tags": [
                        "fan",
                        "pwm",
                        "thermal",
                        "nuvoton"
                ],
                "custom": false
        },
        {
                "id": "Fintek F71869AD",
                "category": "Logic / Buffers",
                "manufacturer": "Fintek",
                "package": "QFP-128",
                "description": "Super I/O with Hardware Monitor and Fan Control",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "KBC",
                                        "type": "KBC",
                                        "description": "Keyboard controller"
                                },
                                {
                                        "num": 10,
                                        "name": "HWM",
                                        "type": "HWM",
                                        "description": "Hardware monitor"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Keyboard not working, no fan control",
                                "cause": "Super I/O dead",
                                "test": "Check KBC and HWM signals",
                                "expected": "KBC and HWM clock and data present",
                                "fix": "Replace F71869AD"
                        }
                ],
                "replacements": [
                        "F71869AD",
                        "F71889AD"
                ],
                "datasheetUrl": "https://www.fintek.com.tw/products/pc-peripheral/super-io-controller/f71869ad/",
                "lcscUrl": "https://www.lcsc.com/search?q=F71869AD",
                "octpartUrl": "https://octopart.com/search?q=F71869AD",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "super-io",
                        "keyboard",
                        "hardware-monitor",
                        "fintek"
                ],
                "custom": false
        },
        {
                "id": "uP1968",
                "category": "Power Management",
                "manufacturer": "uPI Semiconductor",
                "package": "QFN-32",
                "description": "Dual Output Synchronous Buck Controller",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output 1"
                                },
                                {
                                        "num": 10,
                                        "name": "PWM2",
                                        "type": "OUTPUT",
                                        "description": "PWM output 2"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No power to subsystem",
                                "cause": "Controller dead",
                                "test": "Check PWM outputs with scope",
                                "expected": "Switching waveforms present",
                                "fix": "Replace uP1968"
                        }
                ],
                "replacements": [
                        "uP1968",
                        "uP1969"
                ],
                "datasheetUrl": "https://www.upi-semi.com/products/power-management/dc-dc-controllers/up1968/",
                "lcscUrl": "https://www.lcsc.com/search?q=uP1968",
                "octpartUrl": "https://octopart.com/search?q=uP1968",
                "boards": [
                        "Desktop motherboards",
                        "Servers"
                ],
                "tags": [
                        "buck",
                        "dual",
                        "vrm",
                        "upi"
                ],
                "custom": false
        },
        {
                "id": "uP1668",
                "category": "Power Management",
                "manufacturer": "uPI Semiconductor",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for CPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "VID",
                                        "type": "VID",
                                        "description": "VID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "PWM controller dead or VID communication failure",
                                "test": "Check VCC and VID lines",
                                "expected": "VCC = 3.3V, VID activity present",
                                "fix": "Replace uP1668"
                        }
                ],
                "replacements": [
                        "uP1668",
                        "uP1669"
                ],
                "datasheetUrl": "https://www.upi-semi.com/products/power-management/dc-dc-controllers/up1668/",
                "lcscUrl": "https://www.lcsc.com/search?q=uP1668",
                "octpartUrl": "https://octopart.com/search?q=uP1668",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "cpu",
                        "upi"
                ],
                "custom": false
        },
        {
                "id": "RT8894A",
                "category": "Power Management",
                "manufacturer": "Richtek",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for CPU/GPU VRM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "SVID",
                                        "type": "SVID",
                                        "description": "SVID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU/GPU core voltage",
                                "cause": "PWM controller dead or SVID communication failure",
                                "test": "Check VCC and SVID lines",
                                "expected": "VCC = 3.3V, SVID activity present",
                                "fix": "Replace RT8894A"
                        }
                ],
                "replacements": [
                        "RT8894A",
                        "RT8895A"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT8894A.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT8894A",
                "octpartUrl": "https://octopart.com/search?q=RT8894A",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "cpu",
                        "gpu",
                        "richtek"
                ],
                "custom": false
        },
        {
                "id": "RT8889A",
                "category": "Power Management",
                "manufacturer": "Richtek",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for CPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "IMVP",
                                        "type": "IMVP",
                                        "description": "IMVP bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "PWM controller dead or IMVP communication failure",
                                "test": "Check VCC and IMVP lines",
                                "expected": "VCC = 3.3V, IMVP activity present",
                                "fix": "Replace RT8889A"
                        }
                ],
                "replacements": [
                        "RT8889A",
                        "RT8890A"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT8889A.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT8889A",
                "octpartUrl": "https://octopart.com/search?q=RT8889A",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "cpu",
                        "richtek"
                ],
                "custom": false
        },
        {
                "id": "NCP81239",
                "category": "Power Management",
                "manufacturer": "ON Semiconductor",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for CPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "SVID",
                                        "type": "SVID",
                                        "description": "SVID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "PWM controller dead or SVID communication failure",
                                "test": "Check VCC and SVID lines",
                                "expected": "VCC = 3.3V, SVID activity present",
                                "fix": "Replace NCP81239"
                        }
                ],
                "replacements": [
                        "NCP81239",
                        "NCP81240"
                ],
                "datasheetUrl": "https://www.onsemi.com/products/power-management/dc-dc-controllers/ncp81239",
                "lcscUrl": "https://www.lcsc.com/search?q=NCP81239",
                "octpartUrl": "https://octopart.com/search?q=NCP81239",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "cpu",
                        "on-semi"
                ],
                "custom": false
        },
        {
                "id": "NCP81151",
                "category": "Power Management",
                "manufacturer": "ON Semiconductor",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for GPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "SVID",
                                        "type": "SVID",
                                        "description": "SVID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No GPU core voltage",
                                "cause": "PWM controller dead or SVID communication failure",
                                "test": "Check VCC and SVID lines",
                                "expected": "VCC = 3.3V, SVID activity present",
                                "fix": "Replace NCP81151"
                        }
                ],
                "replacements": [
                        "NCP81151",
                        "NCP81152"
                ],
                "datasheetUrl": "https://www.onsemi.com/products/power-management/dc-dc-controllers/ncp81151",
                "lcscUrl": "https://www.lcsc.com/search?q=NCP81151",
                "octpartUrl": "https://octopart.com/search?q=NCP81151",
                "boards": [
                        "Desktop motherboards",
                        "Graphics cards"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "gpu",
                        "on-semi"
                ],
                "custom": false
        },
        {
                "id": "IR35201",
                "category": "Power Management",
                "manufacturer": "Infineon / IR",
                "package": "QFN-40",
                "description": "Multi-Phase PWM Controller for CPU Core Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "IC supply"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output phase 1"
                                },
                                {
                                        "num": 10,
                                        "name": "SVID",
                                        "type": "SVID",
                                        "description": "SVID bus interface"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "PWM controller dead or SVID communication failure",
                                "test": "Check VCC and SVID lines",
                                "expected": "VCC = 3.3V, SVID activity present",
                                "fix": "Replace IR35201"
                        }
                ],
                "replacements": [
                        "IR35201",
                        "IR35204"
                ],
                "datasheetUrl": "https://www.infineon.com/cms/en/product/power/dc-dc-converters/ir35201/",
                "lcscUrl": "https://www.lcsc.com/search?q=IR35201",
                "octpartUrl": "https://octopart.com/search?q=IR35201",
                "boards": [
                        "Desktop motherboards",
                        "Servers"
                ],
                "tags": [
                        "pwm",
                        "vrm",
                        "cpu",
                        "infineon"
                ],
                "custom": false
        },
        {
                "id": "IR3555",
                "category": "Power Management",
                "manufacturer": "Infineon / IR",
                "package": "QFN-32",
                "description": "Integrated Power Stage (DrMOS) for VRM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "PWM",
                                        "type": "INPUT",
                                        "description": "PWM input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 10,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "DrMOS dead",
                                "test": "Check PWM input and output",
                                "expected": "PWM present, output switching",
                                "fix": "Replace IR3555"
                        }
                ],
                "replacements": [
                        "IR3555",
                        "IR3553"
                ],
                "datasheetUrl": "https://www.infineon.com/cms/en/product/power/dc-dc-converters/ir3555/",
                "lcscUrl": "https://www.lcsc.com/search?q=IR3555",
                "octpartUrl": "https://octopart.com/search?q=IR3555",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "drmos",
                        "vrm",
                        "power-stage",
                        "infineon"
                ],
                "custom": false
        },
        {
                "id": "SiC632",
                "category": "Power Management",
                "manufacturer": "Vishay",
                "package": "PowerPAK",
                "description": "Integrated Power Stage (DrMOS) for VRM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "PWM",
                                        "type": "INPUT",
                                        "description": "PWM input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 10,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "DrMOS dead",
                                "test": "Check PWM input and output",
                                "expected": "PWM present, output switching",
                                "fix": "Replace SiC632"
                        }
                ],
                "replacements": [
                        "SiC632",
                        "SiC634"
                ],
                "datasheetUrl": "https://www.vishay.com/docs/63301/sic632.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=SiC632",
                "octpartUrl": "https://octopart.com/search?q=SiC632",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "drmos",
                        "vrm",
                        "power-stage",
                        "vishay"
                ],
                "custom": false
        },
        {
                "id": "NCP302045",
                "category": "Power Management",
                "manufacturer": "ON Semiconductor",
                "package": "PQFN",
                "description": "Integrated Power Stage (DrMOS) for VRM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "PWM",
                                        "type": "INPUT",
                                        "description": "PWM input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 10,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No CPU core voltage",
                                "cause": "DrMOS dead",
                                "test": "Check PWM input and output",
                                "expected": "PWM present, output switching",
                                "fix": "Replace NCP302045"
                        }
                ],
                "replacements": [
                        "NCP302045",
                        "NCP302040"
                ],
                "datasheetUrl": "https://www.onsemi.com/products/power-management/mosfets/ncp302045",
                "lcscUrl": "https://www.lcsc.com/search?q=NCP302045",
                "octpartUrl": "https://octopart.com/search?q=NCP302045",
                "boards": [
                        "Desktop motherboards"
                ],
                "tags": [
                        "drmos",
                        "vrm",
                        "power-stage",
                        "on-semi"
                ],
                "custom": false
        },
        {
                "id": "TPS40322",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "QFN-32",
                "description": "Synchronous Buck Controller with Dual Edge Clock",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM",
                                        "type": "OUTPUT",
                                        "description": "PWM output"
                                },
                                {
                                        "num": 10,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No power rail",
                                "cause": "Controller dead",
                                "test": "Check PWM output with scope",
                                "expected": "Switching waveform present",
                                "fix": "Replace TPS40322"
                        }
                ],
                "replacements": [
                        "TPS40322",
                        "TPS40323"
                ],
                "datasheetUrl": "https://www.ti.com/product/TPS40322",
                "lcscUrl": "https://www.lcsc.com/search?q=TPS40322",
                "octpartUrl": "https://octopart.com/search?q=TPS40322",
                "boards": [
                        "Desktop motherboards",
                        "Servers"
                ],
                "tags": [
                        "buck",
                        "vrm",
                        "ti"
                ],
                "custom": false
        },
        {
                "id": "TPS51375",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "QFN-32",
                "description": "Synchronous Buck Controller for Notebook Power",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PWM",
                                        "type": "OUTPUT",
                                        "description": "PWM output"
                                },
                                {
                                        "num": 10,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No power rail",
                                "cause": "Controller dead",
                                "test": "Check PWM output with scope",
                                "expected": "Switching waveform present",
                                "fix": "Replace TPS51375"
                        }
                ],
                "replacements": [
                        "TPS51375",
                        "TPS51376"
                ],
                "datasheetUrl": "https://www.ti.com/product/TPS51375",
                "lcscUrl": "https://www.lcsc.com/search?q=TPS51375",
                "octpartUrl": "https://octopart.com/search?q=TPS51375",
                "boards": [
                        "Laptop motherboards"
                ],
                "tags": [
                        "buck",
                        "vrm",
                        "ti",
                        "laptop"
                ],
                "custom": false
        },
        {
                "id": "RT8205A",
                "category": "MOSFET",
                "manufacturer": "Richtek",
                "package": "SOP-8",
                "description": "Dual N-Channel Enhancement Mode MOSFET (30V, 6A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "S1",
                                        "type": "POWER",
                                        "description": "Source 1"
                                },
                                {
                                        "num": 2,
                                        "name": "G1",
                                        "type": "INPUT",
                                        "description": "Gate 1"
                                },
                                {
                                        "num": 3,
                                        "name": "S2",
                                        "type": "POWER",
                                        "description": "Source 2"
                                },
                                {
                                        "num": 4,
                                        "name": "G2",
                                        "type": "INPUT",
                                        "description": "Gate 2"
                                },
                                {
                                        "num": 5,
                                        "name": "D2",
                                        "type": "POWER",
                                        "description": "Drain 2"
                                },
                                {
                                        "num": 6,
                                        "name": "D1",
                                        "type": "POWER",
                                        "description": "Drain 1"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail shorted to ground",
                                "cause": "MOSFET shorted D-S",
                                "test": "Measure diode drop D to S",
                                "expected": "0.4-0.6V (good), 0.0V (shorted)",
                                "fix": "Replace RT8205A"
                        }
                ],
                "replacements": [
                        "RT8205A",
                        "AP4435"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT8205A.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT8205A",
                "octpartUrl": "https://octopart.com/search?q=RT8205A",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "switch",
                        "richtek"
                ],
                "custom": false
        },
        {
                "id": "AP4435",
                "category": "MOSFET",
                "manufacturer": "APEC",
                "package": "SOP-8",
                "description": "P-Channel Enhancement Mode MOSFET (-30V, -6A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail not present",
                                "cause": "P-MOSFET not turning on",
                                "test": "Check gate voltage",
                                "expected": "Gate < Source for ON state",
                                "fix": "Replace AP4435"
                        }
                ],
                "replacements": [
                        "AP4435",
                        "SI4435"
                ],
                "datasheetUrl": "https://www.apec.com.tw/product/AP4435",
                "lcscUrl": "https://www.lcsc.com/search?q=AP4435",
                "octpartUrl": "https://octopart.com/search?q=AP4435",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "p-channel",
                        "switch",
                        "apec"
                ],
                "custom": false
        },
        {
                "id": "SI4410",
                "category": "MOSFET",
                "manufacturer": "Vishay",
                "package": "SOP-8",
                "description": "N-Channel Enhancement Mode MOSFET (30V, 12A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail shorted to ground",
                                "cause": "MOSFET shorted D-S",
                                "test": "Measure diode drop D to S",
                                "expected": "0.4-0.6V (good), 0.0V (shorted)",
                                "fix": "Replace SI4410"
                        }
                ],
                "replacements": [
                        "SI4410",
                        "SI4420"
                ],
                "datasheetUrl": "https://www.vishay.com/docs/63301/si4410.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=SI4410",
                "octpartUrl": "https://octopart.com/search?q=SI4410",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "switch",
                        "vishay"
                ],
                "custom": false
        },
        {
                "id": "SI4407",
                "category": "MOSFET",
                "manufacturer": "Vishay",
                "package": "SOP-8",
                "description": "P-Channel Enhancement Mode MOSFET (-30V, -12A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail not present",
                                "cause": "P-MOSFET not turning on",
                                "test": "Check gate voltage",
                                "expected": "Gate < Source for ON state",
                                "fix": "Replace SI4407"
                        }
                ],
                "replacements": [
                        "SI4407",
                        "SI4411"
                ],
                "datasheetUrl": "https://www.vishay.com/docs/63301/si4407.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=SI4407",
                "octpartUrl": "https://octopart.com/search?q=SI4407",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "p-channel",
                        "switch",
                        "vishay"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G125",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single Bus Buffer Gate with 3-State Output",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "OE",
                                        "type": "INPUT",
                                        "description": "Output enable"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal not passing through",
                                "cause": "Buffer IC dead",
                                "test": "Check input signal and OE pin",
                                "expected": "Input present, OE low, output should follow input",
                                "fix": "Replace 74LVC1G125"
                        }
                ],
                "replacements": [
                        "74LVC1G125",
                        "NC7SZ125",
                        "SN74LVC1G125"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G125",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G125",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G125",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buffer",
                        "logic",
                        "3-state"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G04",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single Inverter Gate",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connect"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (inverted)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal not inverting",
                                "cause": "Inverter IC dead",
                                "test": "Check input signal and output",
                                "expected": "Input high, output low and vice versa",
                                "fix": "Replace 74LVC1G04"
                        }
                ],
                "replacements": [
                        "74LVC1G04",
                        "NC7SZ04",
                        "SN74LVC1G04"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G04",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G04",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G04",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "inverter",
                        "logic"
                ],
                "custom": false
        },
        {
                "id": "74LVC2G04",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-8",
                "description": "Dual Inverter Gate",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "1A",
                                        "type": "INPUT",
                                        "description": "Data input 1"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "2A",
                                        "type": "INPUT",
                                        "description": "Data input 2"
                                },
                                {
                                        "num": 4,
                                        "name": "2Y",
                                        "type": "OUTPUT",
                                        "description": "Data output 2 (inverted)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                },
                                {
                                        "num": 6,
                                        "name": "1Y",
                                        "type": "OUTPUT",
                                        "description": "Data output 1 (inverted)"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal not inverting",
                                "cause": "Inverter IC dead",
                                "test": "Check input signal and output",
                                "expected": "Input high, output low and vice versa",
                                "fix": "Replace 74LVC2G04"
                        }
                ],
                "replacements": [
                        "74LVC2G04",
                        "NC7SZ2G04",
                        "SN74LVC2G04"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC2G04",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC2G04",
                "octpartUrl": "https://octopart.com/search?q=74LVC2G04",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "inverter",
                        "logic",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G08",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single 2-Input AND Gate",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input A"
                                },
                                {
                                        "num": 2,
                                        "name": "B",
                                        "type": "INPUT",
                                        "description": "Data input B"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (AND)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic not working",
                                "cause": "AND gate IC dead",
                                "test": "Check input signals and output",
                                "expected": "Output high only when both inputs high",
                                "fix": "Replace 74LVC1G08"
                        }
                ],
                "replacements": [
                        "74LVC1G08",
                        "NC7SZ08",
                        "SN74LVC1G08"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G08",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G08",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G08",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "and",
                        "logic",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G32",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single 2-Input OR Gate",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input A"
                                },
                                {
                                        "num": 2,
                                        "name": "B",
                                        "type": "INPUT",
                                        "description": "Data input B"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (OR)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic not working",
                                "cause": "OR gate IC dead",
                                "test": "Check input signals and output",
                                "expected": "Output high when either input high",
                                "fix": "Replace 74LVC1G32"
                        }
                ],
                "replacements": [
                        "74LVC1G32",
                        "NC7SZ32",
                        "SN74LVC1G32"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G32",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G32",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G32",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "or",
                        "logic",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G00",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single 2-Input NAND Gate",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input A"
                                },
                                {
                                        "num": 2,
                                        "name": "B",
                                        "type": "INPUT",
                                        "description": "Data input B"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (NAND)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic not working",
                                "cause": "NAND gate IC dead",
                                "test": "Check input signals and output",
                                "expected": "Output low only when both inputs high",
                                "fix": "Replace 74LVC1G00"
                        }
                ],
                "replacements": [
                        "74LVC1G00",
                        "NC7SZ00",
                        "SN74LVC1G00"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G00",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G00",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G00",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "nand",
                        "logic",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G132",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single 2-Input NAND Schmitt Trigger",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input A"
                                },
                                {
                                        "num": 2,
                                        "name": "B",
                                        "type": "INPUT",
                                        "description": "Data input B"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (NAND Schmitt)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic not working",
                                "cause": "NAND Schmitt IC dead",
                                "test": "Check input signals and output",
                                "expected": "Output low only when both inputs high",
                                "fix": "Replace 74LVC1G132"
                        }
                ],
                "replacements": [
                        "74LVC1G132",
                        "NC7SZ132",
                        "SN74LVC1G132"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G132",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G132",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G132",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "nand",
                        "schmitt",
                        "logic",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74LVC1G14",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23-5",
                "description": "Single Schmitt Trigger Inverter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A",
                                        "type": "INPUT",
                                        "description": "Data input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connect"
                                },
                                {
                                        "num": 4,
                                        "name": "Y",
                                        "type": "OUTPUT",
                                        "description": "Data output (inverted Schmitt)"
                                },
                                {
                                        "num": 5,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal not inverting",
                                "cause": "Schmitt inverter IC dead",
                                "test": "Check input signal and output",
                                "expected": "Input high, output low and vice versa",
                                "fix": "Replace 74LVC1G14"
                        }
                ],
                "replacements": [
                        "74LVC1G14",
                        "NC7SZ14",
                        "SN74LVC1G14"
                ],
                "datasheetUrl": "https://www.ti.com/product/SN74LVC1G14",
                "lcscUrl": "https://www.lcsc.com/search?q=74LVC1G14",
                "octpartUrl": "https://octopart.com/search?q=74LVC1G14",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "inverter",
                        "schmitt",
                        "logic"
                ],
                "custom": false
        },
        {
                "id": "LM358",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOP-8",
                "description": "Dual Operational Amplifier",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Output 1"
                                },
                                {
                                        "num": 2,
                                        "name": "IN1-",
                                        "type": "INPUT",
                                        "description": "Inverting input 1"
                                },
                                {
                                        "num": 3,
                                        "name": "IN1+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input 1"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "IN2+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN2-",
                                        "type": "INPUT",
                                        "description": "Inverting input 2"
                                },
                                {
                                        "num": 7,
                                        "name": "OUT2",
                                        "type": "OUTPUT",
                                        "description": "Output 2"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output signal",
                                "cause": "Op-amp dead",
                                "test": "Check input signals and output",
                                "expected": "Output follows input differential",
                                "fix": "Replace LM358"
                        }
                ],
                "replacements": [
                        "LM358",
                        "LM358A",
                        "LM2904"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM358",
                "lcscUrl": "https://www.lcsc.com/search?q=LM358",
                "octpartUrl": "https://octopart.com/search?q=LM358",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "op-amp",
                        "dual",
                        "amplifier"
                ],
                "custom": false
        },
        {
                "id": "LM393",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOP-8",
                "description": "Dual Voltage Comparator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Output 1"
                                },
                                {
                                        "num": 2,
                                        "name": "IN1-",
                                        "type": "INPUT",
                                        "description": "Inverting input 1"
                                },
                                {
                                        "num": 3,
                                        "name": "IN1+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input 1"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "IN2+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN2-",
                                        "type": "INPUT",
                                        "description": "Inverting input 2"
                                },
                                {
                                        "num": 7,
                                        "name": "OUT2",
                                        "type": "OUTPUT",
                                        "description": "Output 2"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output signal",
                                "cause": "Comparator dead",
                                "test": "Check input signals and output",
                                "expected": "Output high when IN+ > IN-",
                                "fix": "Replace LM393"
                        }
                ],
                "replacements": [
                        "LM393",
                        "LM393A",
                        "LM2903"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM393",
                "lcscUrl": "https://www.lcsc.com/search?q=LM393",
                "octpartUrl": "https://octopart.com/search?q=LM393",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "comparator",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "TL431",
                "category": "Logic / Buffers",
                "manufacturer": "Various",
                "package": "SOT-23",
                "description": "Adjustable Precision Shunt Regulator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "REF",
                                        "type": "INPUT",
                                        "description": "Reference input"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                },
                                {
                                        "num": 3,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Voltage reference wrong",
                                "cause": "Shunt regulator dead",
                                "test": "Check reference voltage",
                                "expected": "2.5V reference",
                                "fix": "Replace TL431"
                        }
                ],
                "replacements": [
                        "TL431",
                        "TL431A",
                        "KA431"
                ],
                "datasheetUrl": "https://www.ti.com/product/TL431",
                "lcscUrl": "https://www.lcsc.com/search?q=TL431",
                "octpartUrl": "https://octopart.com/search?q=TL431",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "reference",
                        "shunt",
                        "regulator"
                ],
                "custom": false
        },
        {
                "id": "AMS1117-3.3",
                "category": "Power Management",
                "manufacturer": "Various",
                "package": "SOT-223",
                "description": "1A Low Dropout Regulator (3.3V)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage (3.3V)"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No 3.3V output",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 4.5V, VOUT = 3.3V",
                                "fix": "Replace AMS1117-3.3"
                        }
                ],
                "replacements": [
                        "AMS1117-3.3",
                        "LD1117S33",
                        "LM1117-3.3"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM1117",
                "lcscUrl": "https://www.lcsc.com/search?q=AMS1117-3.3",
                "octpartUrl": "https://octopart.com/search?q=AMS1117-3.3",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "3.3v"
                ],
                "custom": false
        },
        {
                "id": "AMS1117-1.8",
                "category": "Power Management",
                "manufacturer": "Various",
                "package": "SOT-223",
                "description": "1A Low Dropout Regulator (1.8V)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage (1.8V)"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No 1.8V output",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 3V, VOUT = 1.8V",
                                "fix": "Replace AMS1117-1.8"
                        }
                ],
                "replacements": [
                        "AMS1117-1.8",
                        "LD1117S18",
                        "LM1117-1.8"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM1117",
                "lcscUrl": "https://www.lcsc.com/search?q=AMS1117-1.8",
                "octpartUrl": "https://octopart.com/search?q=AMS1117-1.8",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "1.8v"
                ],
                "custom": false
        },
        {
                "id": "RT9013",
                "category": "Power Management",
                "manufacturer": "Richtek",
                "package": "SOT-23-5",
                "description": "300mA Low Dropout Regulator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 4,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connect"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace RT9013"
                        }
                ],
                "replacements": [
                        "RT9013",
                        "RT9018"
                ],
                "datasheetUrl": "https://www.richtek.com/assets/product_file/RT9013.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RT9013",
                "octpartUrl": "https://octopart.com/search?q=RT9013",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "richtek"
                ],
                "custom": false
        },
        {
                "id": "ME6211",
                "category": "Power Management",
                "manufacturer": "Microne",
                "package": "SOT-23-5",
                "description": "300mA Low Dropout Regulator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 4,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connect"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace ME6211"
                        }
                ],
                "replacements": [
                        "ME6211",
                        "ME6212"
                ],
                "datasheetUrl": "https://www.microne.com.cn/product/ME6211",
                "lcscUrl": "https://www.lcsc.com/search?q=ME6211",
                "octpartUrl": "https://octopart.com/search?q=ME6211",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "microne"
                ],
                "custom": false
        },
        {
                "id": "XC6206",
                "category": "Power Management",
                "manufacturer": "Torex",
                "package": "SOT-23",
                "description": "150mA Low Dropout Regulator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace XC6206"
                        }
                ],
                "replacements": [
                        "XC6206",
                        "XC6209"
                ],
                "datasheetUrl": "https://www.torexsemi.com/products/xc6206",
                "lcscUrl": "https://www.lcsc.com/search?q=XC6206",
                "octpartUrl": "https://octopart.com/search?q=XC6206",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "torex"
                ],
                "custom": false
        },
        {
                "id": "SPX3819",
                "category": "Power Management",
                "manufacturer": "MaxLinear",
                "package": "SOT-23-5",
                "description": "500mA Low Dropout Regulator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 4,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connect"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "LDO dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace SPX3819"
                        }
                ],
                "replacements": [
                        "SPX3819",
                        "SPX3820"
                ],
                "datasheetUrl": "https://www.maxlinear.com/product/power-management/low-dropout-ldo-regulators/spx3819",
                "lcscUrl": "https://www.lcsc.com/search?q=SPX3819",
                "octpartUrl": "https://octopart.com/search?q=SPX3819",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "maxlinear"
                ],
                "custom": false
        },
        {
                "id": "SY8089",
                "category": "Power Management",
                "manufacturer": "Silergy",
                "package": "SOT-23-5",
                "description": "2A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 4,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace SY8089"
                        }
                ],
                "replacements": [
                        "SY8089",
                        "SY8090"
                ],
                "datasheetUrl": "https://www.silergy.com/products/sy8089",
                "lcscUrl": "https://www.lcsc.com/search?q=SY8089",
                "octpartUrl": "https://octopart.com/search?q=SY8089",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "silergy"
                ],
                "custom": false
        },
        {
                "id": "SY8088",
                "category": "Power Management",
                "manufacturer": "Silergy",
                "package": "SOT-23-5",
                "description": "1.5A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 4,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace SY8088"
                        }
                ],
                "replacements": [
                        "SY8088",
                        "SY8089"
                ],
                "datasheetUrl": "https://www.silergy.com/products/sy8088",
                "lcscUrl": "https://www.lcsc.com/search?q=SY8088",
                "octpartUrl": "https://octopart.com/search?q=SY8088",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "silergy"
                ],
                "custom": false
        },
        {
                "id": "SY8205",
                "category": "MOSFET",
                "manufacturer": "Silergy",
                "package": "SOP-8",
                "description": "Dual N-Channel Enhancement Mode MOSFET (30V, 8A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "S1",
                                        "type": "POWER",
                                        "description": "Source 1"
                                },
                                {
                                        "num": 2,
                                        "name": "G1",
                                        "type": "INPUT",
                                        "description": "Gate 1"
                                },
                                {
                                        "num": 3,
                                        "name": "S2",
                                        "type": "POWER",
                                        "description": "Source 2"
                                },
                                {
                                        "num": 4,
                                        "name": "G2",
                                        "type": "INPUT",
                                        "description": "Gate 2"
                                },
                                {
                                        "num": 5,
                                        "name": "D2",
                                        "type": "POWER",
                                        "description": "Drain 2"
                                },
                                {
                                        "num": 6,
                                        "name": "D1",
                                        "type": "POWER",
                                        "description": "Drain 1"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power rail shorted to ground",
                                "cause": "MOSFET shorted D-S",
                                "test": "Measure diode drop D to S",
                                "expected": "0.4-0.6V (good), 0.0V (shorted)",
                                "fix": "Replace SY8205"
                        }
                ],
                "replacements": [
                        "SY8205",
                        "SY8206"
                ],
                "datasheetUrl": "https://www.silergy.com/products/sy8205",
                "lcscUrl": "https://www.lcsc.com/search?q=SY8205",
                "octpartUrl": "https://octopart.com/search?q=SY8205",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "switch",
                        "silergy"
                ],
                "custom": false
        },
        {
                "id": "AP63200",
                "category": "Power Management",
                "manufacturer": "Diodes Inc",
                "package": "SOT-23-6",
                "description": "2A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 4,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 5,
                                        "name": "BST",
                                        "type": "POWER",
                                        "description": "Bootstrap"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 3.8V, VOUT = expected",
                                "fix": "Replace AP63200"
                        }
                ],
                "replacements": [
                        "AP63200",
                        "AP63201"
                ],
                "datasheetUrl": "https://www.diodes.com/products/power-management/dc-dc-switching-regulators/buck-converters/ap63200",
                "lcscUrl": "https://www.lcsc.com/search?q=AP63200",
                "octpartUrl": "https://octopart.com/search?q=AP63200",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "diodes"
                ],
                "custom": false
        },
        {
                "id": "AP63203",
                "category": "Power Management",
                "manufacturer": "Diodes Inc",
                "package": "SOT-23-6",
                "description": "2A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 4,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 5,
                                        "name": "BST",
                                        "type": "POWER",
                                        "description": "Bootstrap"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 3.8V, VOUT = expected",
                                "fix": "Replace AP63203"
                        }
                ],
                "replacements": [
                        "AP63203",
                        "AP63205"
                ],
                "datasheetUrl": "https://www.diodes.com/products/power-management/dc-dc-switching-regulators/buck-converters/ap63203",
                "lcscUrl": "https://www.lcsc.com/search?q=AP63203",
                "octpartUrl": "https://octopart.com/search?q=AP63203",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "diodes"
                ],
                "custom": false
        },
        {
                "id": "MP1482",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "SOT-23-6",
                "description": "2A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "BST",
                                        "type": "POWER",
                                        "description": "Bootstrap"
                                },
                                {
                                        "num": 2,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 5,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 4.5V, VOUT = expected",
                                "fix": "Replace MP1482"
                        }
                ],
                "replacements": [
                        "MP1482",
                        "MP1484"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP1482/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP1482",
                "octpartUrl": "https://octopart.com/search?q=MP1482",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps"
                ],
                "custom": false
        },
        {
                "id": "MP2315",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "SOT-23-6",
                "description": "3A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "BST",
                                        "type": "POWER",
                                        "description": "Bootstrap"
                                },
                                {
                                        "num": 2,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 5,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 4.5V, VOUT = expected",
                                "fix": "Replace MP2315"
                        }
                ],
                "replacements": [
                        "MP2315",
                        "MP2316"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2315/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2315",
                "octpartUrl": "https://octopart.com/search?q=MP2315",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps"
                ],
                "custom": false
        },
        {
                "id": "MP2451",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "SOT-23-6",
                "description": "0.5A Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "BST",
                                        "type": "POWER",
                                        "description": "Bootstrap"
                                },
                                {
                                        "num": 2,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switch node"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB",
                                        "type": "INPUT",
                                        "description": "Feedback"
                                },
                                {
                                        "num": 5,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 4.5V, VOUT = expected",
                                "fix": "Replace MP2451"
                        }
                ],
                "replacements": [
                        "MP2451",
                        "MP2452"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2451/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2451",
                "octpartUrl": "https://octopart.com/search?q=MP2451",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps"
                ],
                "custom": false
        },
        {
                "id": "MP2149",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2.5A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2149"
                        }
                ],
                "replacements": [
                        "MP2149",
                        "MP2150"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2149/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2149",
                "octpartUrl": "https://octopart.com/search?q=MP2149",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2143",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2143"
                        }
                ],
                "replacements": [
                        "MP2143",
                        "MP2144"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2143/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2143",
                "octpartUrl": "https://octopart.com/search?q=MP2143",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2145",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2145"
                        }
                ],
                "replacements": [
                        "MP2145",
                        "MP2146"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2145/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2145",
                "octpartUrl": "https://octopart.com/search?q=MP2145",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2147",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2147"
                        }
                ],
                "replacements": [
                        "MP2147",
                        "MP2148"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2147/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2147",
                "octpartUrl": "https://octopart.com/search?q=MP2147",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2144",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2144"
                        }
                ],
                "replacements": [
                        "MP2144",
                        "MP2145"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2144/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2144",
                "octpartUrl": "https://octopart.com/search?q=MP2144",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2148",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2148"
                        }
                ],
                "replacements": [
                        "MP2148",
                        "MP2149"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2148/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2148",
                "octpartUrl": "https://octopart.com/search?q=MP2148",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2146",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2146"
                        }
                ],
                "replacements": [
                        "MP2146",
                        "MP2147"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2146/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2146",
                "octpartUrl": "https://octopart.com/search?q=MP2146",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2142",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2142"
                        }
                ],
                "replacements": [
                        "MP2142",
                        "MP2143"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2142/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2142",
                "octpartUrl": "https://octopart.com/search?q=MP2142",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2141",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2141"
                        }
                ],
                "replacements": [
                        "MP2141",
                        "MP2142"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2141/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2141",
                "octpartUrl": "https://octopart.com/search?q=MP2141",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "MP2140",
                "category": "Power Management",
                "manufacturer": "Monolithic Power Systems",
                "package": "QFN-10",
                "description": "2A Dual Synchronous Buck Converter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "EN1",
                                        "type": "INPUT",
                                        "description": "Enable 1"
                                },
                                {
                                        "num": 2,
                                        "name": "EN2",
                                        "type": "INPUT",
                                        "description": "Enable 2"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "FB1",
                                        "type": "INPUT",
                                        "description": "Feedback 1"
                                },
                                {
                                        "num": 5,
                                        "name": "FB2",
                                        "type": "INPUT",
                                        "description": "Feedback 2"
                                },
                                {
                                        "num": 6,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No output voltage",
                                "cause": "Buck converter dead",
                                "test": "Check input voltage and output",
                                "expected": "VIN > 2.5V, VOUT = expected",
                                "fix": "Replace MP2140"
                        }
                ],
                "replacements": [
                        "MP2140",
                        "MP2141"
                ],
                "datasheetUrl": "https://www.monolithicpower.com/en/documentview/productdocument/index/document_name/datasheet/lang/en/sku/MP2140/",
                "lcscUrl": "https://www.lcsc.com/search?q=MP2140",
                "octpartUrl": "https://octopart.com/search?q=MP2140",
                "boards": [
                        "Universal"
                ],
                "tags": [
                        "buck",
                        "regulator",
                        "mps",
                        "dual"
                ],
                "custom": false
        },
        {
                "id": "M92T36",
                "category": "Power Management",
                "manufacturer": "ROHM Semiconductor",
                "package": "QFN-40",
                "description": "Power Management and Charging Control IC for Nintendo Switch",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Main power input from USB-C / Battery"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Output voltage system rail"
                                },
                                {
                                        "num": 18,
                                        "name": "SDA",
                                        "type": "I2C",
                                        "description": "I2C serial data line"
                                },
                                {
                                        "num": 19,
                                        "name": "SCL",
                                        "type": "I2C",
                                        "description": "I2C serial clock line"
                                },
                                {
                                        "num": 36,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Nintendo Switch won't turn on, won't charge, draws 0.00A or 0.41A frozen on charger",
                                "cause": "M92T36 IC shorted internally (very common due to non-compliant 3rd party USB-C chargers)",
                                "test": "Measure diode drop on capacitors surrounding M92T36 (connected to pin 5/VOUT line) to ground",
                                "expected": "0.38V - 0.50V (good), 0.00V - 0.02V (shorted)",
                                "fix": "Replace M92T36 IC with a new one. Ensure USB-C port is not physically damaged before powering."
                        }
                ],
                "replacements": [
                        "M92T36"
                ],
                "datasheetUrl": "https://www.rohm.com/products/power-management",
                "lcscUrl": "https://www.lcsc.com/search?q=M92T36",
                "octpartUrl": "https://octopart.com/search?q=M92T36",
                "boards": [
                        "Nintendo Switch HAC-001",
                        "Nintendo Switch Lite HDH-001"
                ],
                "tags": [
                        "gaming",
                        "charging",
                        "pmic",
                        "nintendo",
                        "switch"
                ],
                "custom": false
        },
        {
                "id": "PI3USB30532",
                "category": "USB-C / Thunderbolt",
                "manufacturer": "Diodes Incorporated",
                "package": "TQFN-40",
                "description": "USB 3.0 / DisplayPort Matrix Switch for USB-C MUXing",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Supply input voltage (3.3V)"
                                },
                                {
                                        "num": 10,
                                        "name": "DP_TX1+",
                                        "type": "OUTPUT",
                                        "description": "DisplayPort transmit channel 1 positive"
                                },
                                {
                                        "num": 11,
                                        "name": "DP_TX1-",
                                        "type": "OUTPUT",
                                        "description": "DisplayPort transmit channel 1 negative"
                                },
                                {
                                        "num": 20,
                                        "name": "AUX+",
                                        "type": "INPUT",
                                        "description": "Auxiliary channel positive"
                                },
                                {
                                        "num": 21,
                                        "name": "AUX-",
                                        "type": "INPUT",
                                        "description": "Auxiliary channel negative"
                                },
                                {
                                        "num": 30,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Nintendo Switch charges but will not display output to TV via Dock, or fast-charges in only one orientation",
                                "cause": "PI3USB30532 matrix switch damaged by voltage surge from non-compliant third-party docks",
                                "test": "Measure diode drop on DP lines connected to the IC pins",
                                "expected": "0.45V - 0.60V (good), OL or 0.0V (faulty)",
                                "fix": "Replace PI3USB30532 IC with hot air."
                        }
                ],
                "replacements": [
                        "PI3USB30532",
                        "PI3USB30532ZLE"
                ],
                "lcscUrl": "https://www.lcsc.com/search?q=PI3USB30532",
                "octpartUrl": "https://octopart.com/search?q=PI3USB30532",
                "boards": [
                        "Nintendo Switch HAC-001",
                        "Nintendo Switch Lite HDH-001"
                ],
                "tags": [
                        "nintendo",
                        "hdmi",
                        "dock",
                        "usb-c",
                        "switch",
                        "mux"
                ],
                "custom": false
        },
        {
                "id": "uP9512R",
                "category": "Power Management",
                "manufacturer": "uPI Semiconductor",
                "package": "QFN-52",
                "description": "8/7/6/5/4/3/2/1-Phase Synchronous Buck Controller (NVIDIA RTX GPU VRM)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Analog supply voltage (5V)"
                                },
                                {
                                        "num": 12,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable input pin"
                                },
                                {
                                        "num": 24,
                                        "name": "PWM1",
                                        "type": "OUTPUT",
                                        "description": "PWM output channel 1"
                                },
                                {
                                        "num": 25,
                                        "name": "PWM2",
                                        "type": "OUTPUT",
                                        "description": "PWM output channel 2"
                                },
                                {
                                        "num": 32,
                                        "name": "REFIN",
                                        "type": "INPUT",
                                        "description": "Reference voltage input"
                                },
                                {
                                        "num": 52,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Graphics card draws 12V but fans spin at 100% with black screen; no VCORE voltage detected on inductors",
                                "cause": "PWM controller failure, often secondary to a shorted DrMOS power stage that blew the PWM drive line",
                                "test": "Measure voltage on VCC pin 1 and EN pin 12 of uP9512R",
                                "expected": "VCC = 5V, EN >= 2.0V",
                                "fix": "First probe all DrMOS power stages for shorts. Replace shorted DrMOS stages, then replace the uP9512R controller."
                        }
                ],
                "replacements": [
                        "uP9512R",
                        "uP9512P",
                        "uP9512S"
                ],
                "boards": [
                        "NVIDIA RTX 3080 Founders Edition",
                        "ASUS ROG Strix RTX 3070",
                        "MSI Gaming X Trio RTX 4080"
                ],
                "tags": [
                        "gpu",
                        "nvidia",
                        "pwm",
                        "vrm",
                        "rtx"
                ],
                "custom": false
        },
        {
                "id": "STM32F103C8T6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "LQFP-48",
                "description": "ARM Cortex-M3 32-bit Microcontroller with 64KB Flash, 72MHz (Blue Pill)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBAT",
                                        "type": "POWER",
                                        "description": "Backup battery voltage input"
                                },
                                {
                                        "num": 8,
                                        "name": "VSSA",
                                        "type": "GND",
                                        "description": "Analog ground reference"
                                },
                                {
                                        "num": 9,
                                        "name": "VDDA",
                                        "type": "POWER",
                                        "description": "Analog supply voltage (3.3V)"
                                },
                                {
                                        "num": 23,
                                        "name": "VSS_1",
                                        "type": "GND",
                                        "description": "Digital ground"
                                },
                                {
                                        "num": 24,
                                        "name": "VDD_1",
                                        "type": "POWER",
                                        "description": "Digital supply voltage (3.3V)"
                                },
                                {
                                        "num": 34,
                                        "name": "SWDIO",
                                        "type": "INPUT",
                                        "description": "Serial Wire Debug I/O"
                                },
                                {
                                        "num": 37,
                                        "name": "SWCLK",
                                        "type": "INPUT",
                                        "description": "Serial Wire Debug Clock"
                                },
                                {
                                        "num": 44,
                                        "name": "BOOT0",
                                        "type": "INPUT",
                                        "description": "Boot mode selection pin"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Board dead, drawing full current from USB, STM32 chip gets extremely hot immediately on plug-in",
                                "cause": "Overvoltage or ESD spike on GPIO pins, destroying internal ESD protection diodes and shorting the 3.3V rail to ground",
                                "test": "Measure resistance between 3.3V (VDD_1) and GND (VSS_1)",
                                "expected": "Multi-kilohms or megaohms (good), less than 10 ohms (shorted)",
                                "fix": "Replace the STM32F103C8T6 IC with hot air, then flash original firmware using ST-Link via SWD pins."
                        }
                ],
                "replacements": [
                        "STM32F103C8T6",
                        "GD32F103C8T6",
                        "CH32F103C8T6"
                ],
                "datasheetUrl": "https://www.st.com/resource/en/datasheet/stm32f103c8.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=STM32F103C8T6",
                "octpartUrl": "https://octopart.com/search?q=STM32F103C8T6",
                "boards": [
                        "SKR Mini E3 3D Printer Mainboard",
                        "Blue Pill Development Board",
                        "Custom Mechanical Keyboard PCBs"
                ],
                "tags": [
                        "mcu",
                        "st",
                        "arm",
                        "cortex-m3",
                        "embedded",
                        "3d-printing"
                ],
                "custom": false
        },
        {
                "id": "ESP32-WROOM-32E",
                "category": "CPU / SoC",
                "manufacturer": "Espressif Systems",
                "package": "SMD Module (38-pin)",
                "description": "High-performance Wi-Fi + Bluetooth + BLE MCU module using ESP32-D0WD-V3",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "3V3",
                                        "type": "POWER",
                                        "description": "3.3V power supply input"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Chip enable / hardware reset pin"
                                },
                                {
                                        "num": 34,
                                        "name": "RXD0",
                                        "type": "INPUT",
                                        "description": "UART0 receive pin (for flashing)"
                                },
                                {
                                        "num": 35,
                                        "name": "TXD0",
                                        "type": "OUTPUT",
                                        "description": "UART0 transmit pin (for flashing)"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Module does not respond to serial, fails to boot; 3.3V power rail is heavily loaded or shorted",
                                "cause": "GPIO pin short to high voltage or liquid corrosion bridging under the module SMD pads",
                                "test": "Check resistance from 3V3 (pin 2) to GND (pin 1)",
                                "expected": "Greater than 10kΩ",
                                "fix": "Replace ESP32-WROOM-32E module with hot air, clean pads, and flash firmware over serial bootloader."
                        }
                ],
                "replacements": [
                        "ESP32-WROOM-32D",
                        "ESP32-WROOM-32UE"
                ],
                "datasheetUrl": "https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=ESP32-WROOM-32E",
                "octpartUrl": "https://octopart.com/search?q=ESP32-WROOM-32E",
                "boards": [
                        "NodeMCU ESP32 DevKit",
                        "WLED Pixel Controller Board",
                        "Smart Home Automation Plugs"
                ],
                "tags": [
                        "mcu",
                        "wifi",
                        "bluetooth",
                        "espressif",
                        "iot",
                        "wireless"
                ],
                "custom": false
        },
        {
                "id": "W25Q128JVSSIG",
                "category": "Storage",
                "manufacturer": "Winbond Electronics",
                "package": "SOIC-8 (208-mil)",
                "description": "128Mb Serial SPI Flash Memory with Dual/Quad SPI",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "/CS",
                                        "type": "INPUT",
                                        "description": "Chip Select active-low input"
                                },
                                {
                                        "num": 2,
                                        "name": "DO",
                                        "type": "OUTPUT",
                                        "description": "Data Output (SPI IO1)"
                                },
                                {
                                        "num": 3,
                                        "name": "/WP",
                                        "type": "INPUT",
                                        "description": "Write Protect active-low input"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "DI",
                                        "type": "INPUT",
                                        "description": "Data Input (SPI IO0)"
                                },
                                {
                                        "num": 6,
                                        "name": "CLK",
                                        "type": "INPUT",
                                        "description": "Serial Clock input"
                                },
                                {
                                        "num": 7,
                                        "name": "/HOLD",
                                        "type": "INPUT",
                                        "description": "Hold / Reset active-low input"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Laptop/PC turns on, fans spin, but system black screens and power loops (No POST / BIOS corruption)",
                                "cause": "Corrupted BIOS firmware image or worn-out SPI flash sectors that prevent reading core boot variables",
                                "test": "Attempt to read the chip JEDEC ID using an SPI programmer (CH341A, RT809F, or RT809H)",
                                "expected": "VCC = 3.3V on pin 8; chip responds with JEDEC manufacturer ID 0xEF4018",
                                "fix": "De-solder, program the chip with a clean BIOS bin dump (including cleared Intel ME/CSME region if on a laptop), and re-solder or replace the physical SPI chip if it fails verification."
                        }
                ],
                "replacements": [
                        "W25Q128JV",
                        "MX25L12835F",
                        "GD25Q128C"
                ],
                "datasheetUrl": "https://www.winbond.com/hq/support/documentation/levelone.jsp?__locale=en&DocNo=DA00-W25Q128JV",
                "lcscUrl": "https://www.lcsc.com/search?q=W25Q128JVSSIG",
                "octpartUrl": "https://octopart.com/search?q=W25Q128JVSSIG",
                "boards": [
                        "ASUS Prime B550M-A Motherboard",
                        "Dell Latitude 5490 Laptop",
                        "Lenovo ThinkPad T480 Laptop",
                        "Gigabyte RTX 3060 Graphics Card"
                ],
                "tags": [
                        "bios",
                        "flash",
                        "spi",
                        "eeprom",
                        "storage"
                ],
                "custom": false
        },
        {
                "id": "KB9022Q",
                "category": "Power Management",
                "manufacturer": "ENE Technology",
                "package": "LQFP-128",
                "description": "Embedded Controller (EC) with Integrated Keyboard Controller and SPI Flash",
                "pinout": {
                        "pins": [
                                {
                                        "num": 9,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V digital core power supply"
                                },
                                {
                                        "num": 33,
                                        "name": "KBRST#",
                                        "type": "OUTPUT",
                                        "description": "Keyboard controller reset output"
                                },
                                {
                                        "num": 42,
                                        "name": "EC_ON",
                                        "type": "OUTPUT",
                                        "description": "EC power-on enable signal sent to main power regulators"
                                },
                                {
                                        "num": 112,
                                        "name": "LID_SW#",
                                        "type": "INPUT",
                                        "description": "Lid switch magnetic sensor input"
                                },
                                {
                                        "num": 115,
                                        "name": "ACIN",
                                        "type": "INPUT",
                                        "description": "AC adapter present input signal from charging circuit"
                                },
                                {
                                        "num": 128,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Laptop is completely dead with 0.00A draw; standby 3.3V/5V rails are present but power button is ignored and EC_ON is 0V",
                                "cause": "Embedded Controller firmware corruption, or internal silicon short caused by keyboard liquid spill shorting GPIO lines",
                                "test": "Measure voltage on pin 42 (EC_ON) and pin 115 (ACIN) when adapter is connected",
                                "expected": "ACIN = 3.3V, EC_ON = 3.3V (after pressing power button)",
                                "fix": "Replace the ENE KB9022Q IC and program its internal 128KB flash using a dedicated keyboard-port programmer (e.g., SVOD, RT809H)."
                        }
                ],
                "replacements": [
                        "KB9022Q D",
                        "KB9012QF",
                        "KB9028Q"
                ],
                "boards": [
                        "Compal LA-C701P Laptop Motherboard",
                        "Compal LA-D801P Laptop Motherboard",
                        "Acer Aspire 5 A515"
                ],
                "tags": [
                        "ec",
                        "super-io",
                        "embedded-controller",
                        "keyboard",
                        "laptop"
                ],
                "custom": false
        },
        {
                "id": "IT8987E",
                "category": "Power Management",
                "manufacturer": "ITE Tech",
                "package": "LQFP-128",
                "description": "Embedded Controller (EC) with Keyboard Controller and SPI Flash Interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 11,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V standby power supply"
                                },
                                {
                                        "num": 21,
                                        "name": "WRST#",
                                        "type": "INPUT",
                                        "description": "Hardware reset input"
                                },
                                {
                                        "num": 85,
                                        "name": "NBSWON#",
                                        "type": "INPUT",
                                        "description": "Notebook power button input signal from keyboard"
                                },
                                {
                                        "num": 107,
                                        "name": "SUSB#",
                                        "type": "OUTPUT",
                                        "description": "Intel S3 power state control output"
                                },
                                {
                                        "num": 108,
                                        "name": "SUSC#",
                                        "type": "OUTPUT",
                                        "description": "Intel S4/S5 power state control output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Laptop does not power on, or turns on briefly for 1 second before instantly turning off",
                                "cause": "ITE EC failed internally or lost physical pad contact due to solder corrosion from liquid ingress",
                                "test": "Measure voltage on pin 85 (NBSWON#) before and after pressing the power button",
                                "expected": "3.3V (idle), drops to 0V (pressed), and returns to 3.3V",
                                "fix": "Replace the IT8987E chip. On many motherboard models, it self-programming on first boot by copying firmware from the main BIOS chip; otherwise, program it manually."
                        }
                ],
                "replacements": [
                        "IT8987E-CXA",
                        "IT8987E-BXA"
                ],
                "boards": [
                        "ASUS UX331U ZenBook",
                        "Lenovo Legion 5 Laptop Motherboard",
                        "HP Pavilion 15-cs"
                ],
                "tags": [
                        "ec",
                        "super-io",
                        "ite",
                        "laptop",
                        "keyboard"
                ],
                "custom": false
        },
        {
                "id": "AP2112K-3.3TRG1",
                "category": "Power Management",
                "manufacturer": "Diodes Incorporated",
                "package": "SOT-23-5",
                "description": "High-speed, low-dropout CMOS linear regulator with enable (3.3V, 600mA)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Power supply input (up to 6V)"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Active-high enable input"
                                },
                                {
                                        "num": 4,
                                        "name": "BYP",
                                        "type": "INPUT",
                                        "description": "Bypass capacitor connection for noise reduction"
                                },
                                {
                                        "num": 5,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated 3.3V output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Microcontroller board is dead; 3.3V rail measures 0V, but 5V USB power is present. LDO chip gets hot to the touch.",
                                "cause": "AP2112K regulator blown by overvoltage transient, or short circuit on the 3.3V system load",
                                "test": "Verify resistance from VOUT (pin 5) to GND. If high, check voltage on VIN (pin 1) and VOUT (pin 5).",
                                "expected": "VIN = 5.0V, EN >= 1.5V, VOUT = 3.3V",
                                "fix": "Replace the AP2112K-3.3 LDO regulator. Confirm the short on the 3.3V line is cleared before installing a new LDO."
                        }
                ],
                "replacements": [
                        "AP2112K-3.3",
                        "XC6206P332MR",
                        "RT9013-33GB"
                ],
                "datasheetUrl": "https://www.diodes.com/assets/Datasheets/AP2112.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=AP2112K-3.3TRG1",
                "octpartUrl": "https://octopart.com/search?q=AP2112K-3.3TRG1",
                "boards": [
                        "Adafruit Feather Boards",
                        "SparkFun RedBoard",
                        "ESP32 DevKitC Development Boards"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "3.3v",
                        "sot-23-5"
                ],
                "custom": false
        },
        {
                "id": "AON6512",
                "category": "MOSFET",
                "manufacturer": "Alpha & Omega Semiconductor",
                "package": "DFN-8 (5x6)",
                "description": "N-Channel AlphaMOS Trench Technology (30V, 150A, RDS(ON) < 1.4mΩ)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source (pins 1, 2, 3 tied internally)"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 4,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 5,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain (pins 5, 6, 7, 8 tied to thermal pad)"
                                },
                                {
                                        "num": 6,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                },
                                {
                                        "num": 7,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                },
                                {
                                        "num": 8,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Main charger/adapter cuts off instantly when plugged into the laptop (adapter short-circuit trip)",
                                "cause": "High-side or low-side MOSFET shorted Drain-to-Source in a buck regulator or system input selector",
                                "test": "Measure diode drop or resistance between Drain (pins 5-8) and Source (pins 1-3)",
                                "expected": "Diode drop of ~0.50V (good), or resistance > 100kΩ. Shorted MOSFET will show 0.00V (under 1Ω).",
                                "fix": "Replace the shorted AON6512 MOSFET. Check the connected gate driver or PWM IC, as a shorted gate can propagate and damage the driver."
                        }
                ],
                "replacements": [
                        "AON6512",
                        "AON6516",
                        "SIRA12DP"
                ],
                "datasheetUrl": "https://www.aosmd.com/pdfs/datasheet/AON6512.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=AON6512",
                "octpartUrl": "https://octopart.com/search?q=AON6512",
                "boards": [
                        "ASUS TUF Gaming FX506",
                        "Dell G3 3579 Laptop Motherboard",
                        "Lenovo Legion Y540 Motherboard",
                        "RTX 3060 Ti GPU VRM"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "dfn-8",
                        "vrm",
                        "power-switch"
                ],
                "custom": false
        },
        {
                "id": "TDP158RSBR",
                "category": "Display",
                "manufacturer": "Texas Instruments",
                "package": "WQFN-40",
                "description": "6Gbps HDMI 2.0 AC-Coupled to DC-Coupled Level Shifter and Redriver",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V power supply input"
                                },
                                {
                                        "num": 10,
                                        "name": "HDMI_RX0+",
                                        "type": "INPUT",
                                        "description": "HDMI receive TMDS channel 0 positive"
                                },
                                {
                                        "num": 11,
                                        "name": "HDMI_RX0-",
                                        "type": "INPUT",
                                        "description": "HDMI receive TMDS channel 0 negative"
                                },
                                {
                                        "num": 20,
                                        "name": "HDMI_TX0+",
                                        "type": "OUTPUT",
                                        "description": "HDMI transmit TMDS channel 0 positive"
                                },
                                {
                                        "num": 21,
                                        "name": "HDMI_TX0-",
                                        "type": "OUTPUT",
                                        "description": "HDMI transmit TMDS channel 0 negative"
                                },
                                {
                                        "num": 30,
                                        "name": "SCL_SRC",
                                        "type": "I2C",
                                        "description": "Source I2C clock line"
                                },
                                {
                                        "num": 31,
                                        "name": "SDA_SRC",
                                        "type": "I2C",
                                        "description": "Source I2C data line"
                                },
                                {
                                        "num": 40,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Xbox One X / Series S powers on with white light but no display output (Black Screen of Death)",
                                "cause": "HDMI Redriver/Retimer chip damaged by ESD surge through the HDMI cable during hot-plugging",
                                "test": "Measure diode drop values on HDMI port TMDS data lines and compare them",
                                "expected": "Diode drop of ~0.55V (good). Damaged lines will show OL (open) or 0.00V (shorted).",
                                "fix": "Replace the TDP158 HDMI Retimer IC with hot air."
                        }
                ],
                "replacements": [
                        "TDP158",
                        "SN75DP159",
                        "TDP158RSBT"
                ],
                "datasheetUrl": "https://www.ti.com/product/TDP158",
                "lcscUrl": "https://www.lcsc.com/search?q=TDP158RSBR",
                "octpartUrl": "https://octopart.com/search?q=TDP158RSBR",
                "boards": [
                        "Xbox One X Game Console",
                        "Xbox Series S Game Console",
                        "HP Omen 15 Laptop",
                        "ASUS ROG Zephyrus Laptop"
                ],
                "tags": [
                        "hdmi",
                        "redriver",
                        "retimer",
                        "display",
                        "xbox",
                        "gaming"
                ],
                "custom": false
        },
        {
                "id": "MN864739",
                "category": "Display",
                "manufacturer": "Panasonic",
                "package": "QFN-64",
                "description": "Custom Ultra High-Speed HDMI 2.1 Encoder/Transmitter for PlayStation 5",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Core digital power supply 1.1V"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "I/O power supply 3.3V"
                                },
                                {
                                        "num": 16,
                                        "name": "HDMI_D0+",
                                        "type": "OUTPUT",
                                        "description": "HDMI Data 0 positive transmitter output"
                                },
                                {
                                        "num": 17,
                                        "name": "HDMI_D0-",
                                        "type": "OUTPUT",
                                        "description": "HDMI Data 0 negative transmitter output"
                                },
                                {
                                        "num": 40,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "PlayStation 5 powers on with white light but has no display output, or is stuck in low 480p resolution",
                                "cause": "Panasonic HDMI Encoder IC blown by ESD or short circuit from a physically damaged HDMI port",
                                "test": "Measure resistance to ground on the 1.1V and 3.3V rail decoupling capacitors located near the IC.",
                                "expected": "1.1V rail capacitor resistance > 500Ω; HDMI lines diode drop ~0.5V.",
                                "fix": "Replace the MN864739 HDMI encoder IC using hot air."
                        }
                ],
                "replacements": [
                        "MN864739"
                ],
                "boards": [
                        "PlayStation 5 EDM-010 Motherboard",
                        "PlayStation 5 EDM-020 Motherboard",
                        "PlayStation 5 CFI-1015A"
                ],
                "tags": [
                        "gaming",
                        "playstation",
                        "ps5",
                        "hdmi",
                        "encoder",
                        "display"
                ],
                "custom": false
        },
        {
                "id": "Intel AX211NGW",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "M.2 2230 / Soldered CNVio2",
                "description": "Wi-Fi 6E AX211 Gig+ Wireless Network Adapter",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "3.3V",
                                        "type": "POWER",
                                        "description": "3.3V main power input"
                                },
                                {
                                        "num": 12,
                                        "name": "PCIE_TX_P",
                                        "type": "OUTPUT",
                                        "description": "PCIe transmit data positive"
                                },
                                {
                                        "num": 13,
                                        "name": "PCIE_TX_N",
                                        "type": "OUTPUT",
                                        "description": "PCIe transmit data negative"
                                },
                                {
                                        "num": 22,
                                        "name": "CNV_CLK_P",
                                        "type": "INPUT",
                                        "description": "CNVio interface clock positive"
                                },
                                {
                                        "num": 23,
                                        "name": "CNV_CLK_N",
                                        "type": "INPUT",
                                        "description": "CNVio interface clock negative"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Wi-Fi adapter disappears from Device Manager (Error Code 10 or 43), Bluetooth is non-functional",
                                "cause": "CNVio high-speed lines or the 3.3V power regulator on the motherboard failed, or the module itself died",
                                "test": "Measure 3.3V supply voltage at the card decoupling capacitors or nearby test points on the motherboard.",
                                "expected": "3.3V present on power rails",
                                "fix": "Replace the M.2 card. If soldered, replace the AX211 IC; if power is missing, repair the 3.3V standby LDO on the motherboard."
                        }
                ],
                "replacements": [
                        "AX211NGW",
                        "AX210NGW",
                        "AX201NGW"
                ],
                "datasheetUrl": "https://www.intel.com/content/www/us/en/products/sku/204837/intel-wifi-6e-ax211/specifications.html",
                "boards": [
                        "ASUS ROG Maximus Z690",
                        "Dell XPS 13 9315 Laptop",
                        "Lenovo ThinkPad T14 Gen 3"
                ],
                "tags": [
                        "wifi",
                        "bluetooth",
                        "intel",
                        "m.2",
                        "wireless"
                ],
                "custom": false
        },
        {
                "id": "RP2040",
                "category": "CPU / SoC",
                "manufacturer": "Raspberry Pi",
                "package": "QFN-56",
                "description": "Dual-core ARM Cortex-M0+ microcontroller with 264KB internal SRAM and QSPI interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "IOVDD",
                                        "type": "POWER",
                                        "description": "Digital I/O supply voltage (1.8V - 3.3V)"
                                },
                                {
                                        "num": 19,
                                        "name": "TESTEN",
                                        "type": "INPUT",
                                        "description": "Test enable pin, must be tied to GND"
                                },
                                {
                                        "num": 43,
                                        "name": "ADC_AVDD",
                                        "type": "POWER",
                                        "description": "Analog power supply for internal ADC (3.3V)"
                                },
                                {
                                        "num": 44,
                                        "name": "VREG_VIN",
                                        "type": "POWER",
                                        "description": "Voltage regulator input (1.8V - 5.5V)"
                                },
                                {
                                        "num": 45,
                                        "name": "VREG_VOUT",
                                        "type": "POWER",
                                        "description": "Voltage regulator output (1.1V nominal core voltage)"
                                },
                                {
                                        "num": 56,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground paddle"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "RP2040 board does not boot, gets extremely hot on plug-in, or fails to mount as RP2-BOOT USB drive",
                                "cause": "Overvoltage spike on input pin or VREG_VIN, which destroys the internal 1.1V regulator or shorts GPIO ESD protection",
                                "test": "Verify voltage on pin 45 (VREG_VOUT, should be 1.1V) and check resistance of 3.3V and 1.1V lines to ground.",
                                "expected": "VREG_VOUT = 1.1V, resistance to GND on 1.1V rail > 1kΩ.",
                                "fix": "Replace the RP2040 IC. If the internal LDO is failed but core is fine, an external 1.1V supply can be used as a bypass."
                        }
                ],
                "replacements": [
                        "RP2040"
                ],
                "datasheetUrl": "https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf",
                "lcscUrl": "https://www.lcsc.com/search?q=RP2040",
                "octpartUrl": "https://octopart.com/search?q=RP2040",
                "boards": [
                        "Raspberry Pi Pico Development Board",
                        "Raspberry Pi Pico W",
                        "Keychron Q1 Mechanical Keyboard",
                        "Custom RP2040 Macro Pads"
                ],
                "tags": [
                        "mcu",
                        "raspberry-pi",
                        "cortex-m0",
                        "usb",
                        "keyboard"
                ],
                "custom": false
        },
        {
                "id": "TP4056",
                "category": "Charger IC",
                "manufacturer": "Nanjing Shideng Microelec",
                "package": "SOP-8-PP",
                "description": "1A Standalone Linear Li-Ion Battery Charger with Thermal Regulation",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "TEMP",
                                        "type": "INPUT",
                                        "description": "Temperature sense input"
                                },
                                {
                                        "num": 2,
                                        "name": "PROG",
                                        "type": "INPUT",
                                        "description": "Charge current program and monitor pin"
                                },
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Positive input supply voltage"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Charge current output pin connected to battery"
                                },
                                {
                                        "num": 6,
                                        "name": "STDBY",
                                        "type": "OUTPUT",
                                        "description": "Charge complete open-drain status pin"
                                },
                                {
                                        "num": 7,
                                        "name": "CHRG",
                                        "type": "OUTPUT",
                                        "description": "Charging indication open-drain status pin"
                                },
                                {
                                        "num": 8,
                                        "name": "CE",
                                        "type": "INPUT",
                                        "description": "Chip enable input (Active High)"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Does not charge battery, CHRG and STDBY LEDs always off, chip gets hot or has burn hole",
                                "cause": "Overvoltage spike on VCC input, or battery reverse-polarity connection",
                                "test": "Measure diode drop from VCC (pin 4) to GND (pin 3)",
                                "expected": "0.5V - 0.7V (good), under 0.1V (shorted)",
                                "fix": "Replace TP4056 IC and check input protection resistor."
                        }
                ],
                "replacements": [
                        "TP4056",
                        "TC4056A",
                        "ME4056"
                ],
                "datasheetUrl": "https://www.alldatasheet.com/datasheet-pdf/pdf/1131747/SHIDENG/TP4056.html",
                "lcscUrl": "https://www.lcsc.com/search?q=TP4056",
                "boards": [
                        "TP4056 Charger Modules",
                        "Portable Power Banks",
                        "Small Li-Po battery toys"
                ],
                "tags": [
                        "charger",
                        "li-ion",
                        "linear",
                        "tp4056",
                        "battery"
                ],
                "custom": false
        },
        {
                "id": "BQ25606",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "WQFN-24",
                "description": "Standalone 3.0A Single-Cell Buck Battery Charger with OTG Boost",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB charger input"
                                },
                                {
                                        "num": 6,
                                        "name": "SW",
                                        "type": "POWER",
                                        "description": "Switching node of buck converter"
                                },
                                {
                                        "num": 11,
                                        "name": "SYS",
                                        "type": "POWER",
                                        "description": "System voltage output rail"
                                },
                                {
                                        "num": 15,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 20,
                                        "name": "STAT",
                                        "type": "OUTPUT",
                                        "description": "Status indication pin"
                                },
                                {
                                        "num": 24,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No charging, no system power, power rail shorted",
                                "cause": "High voltage transient on VBUS, or high-side buck MOSFET failure",
                                "test": "Measure diode drop on VBUS (pin 1) and SW (pin 6) to ground",
                                "expected": "0.45V - 0.6V (good), 0.0V (shorted)",
                                "fix": "Replace BQ25606 charger IC."
                        }
                ],
                "replacements": [
                        "BQ25606",
                        "BQ25601"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ25606",
                "boards": [
                        "Smartphones",
                        "Bluetooth Speakers",
                        "Handheld Consoles"
                ],
                "tags": [
                        "charger",
                        "buck",
                        "ti",
                        "battery",
                        "fast-charging"
                ],
                "custom": false
        },
        {
                "id": "BQ24075",
                "category": "Charger IC",
                "manufacturer": "Texas Instruments",
                "package": "VQFN-16",
                "description": "1.5A Single-Cell Li-Ion Battery Charger with Dynamic Power Path Management",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "TS",
                                        "type": "INPUT",
                                        "description": "Temperature sense input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN",
                                        "type": "POWER",
                                        "description": "Input supply voltage"
                                },
                                {
                                        "num": 10,
                                        "name": "OUT",
                                        "type": "POWER",
                                        "description": "System voltage output"
                                },
                                {
                                        "num": 13,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery connection"
                                },
                                {
                                        "num": 16,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Power path fails to switch to battery when USB is removed, or device fails to charge",
                                "cause": "Power path internal FET damaged by overcurrent",
                                "test": "Verify voltage on OUT (pin 10) with USB disconnected and battery connected",
                                "expected": "Equal to battery voltage (typically 3.7V - 4.2V)",
                                "fix": "Replace BQ24075 IC."
                        }
                ],
                "replacements": [
                        "BQ24075",
                        "BQ24079",
                        "BQ24072"
                ],
                "datasheetUrl": "https://www.ti.com/product/BQ24075",
                "boards": [
                        "Smartwatches",
                        "GPS Trackers",
                        "IoT Nodes"
                ],
                "tags": [
                        "charger",
                        "ti",
                        "power-path",
                        "battery",
                        "linear"
                ],
                "custom": false
        },
        {
                "id": "CN3791",
                "category": "Charger IC",
                "manufacturer": "Consonance Electronics",
                "package": "SOP-10",
                "description": "4A MPPT Solar Panel Battery Charging Controller for Single-Cell Li-Ion",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Solar panel input supply"
                                },
                                {
                                        "num": 3,
                                        "name": "MPPT",
                                        "type": "INPUT",
                                        "description": "Maximum Power Point Tracking input"
                                },
                                {
                                        "num": 5,
                                        "name": "BAT",
                                        "type": "POWER",
                                        "description": "Battery charging output"
                                },
                                {
                                        "num": 8,
                                        "name": "DRV",
                                        "type": "OUTPUT",
                                        "description": "Gate drive for external P-channel MOSFET"
                                },
                                {
                                        "num": 10,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Solar charger fails to charge battery even in full sunlight, battery gets no current",
                                "cause": "External P-channel MOSFET shorted, or CN3791 driver output blown",
                                "test": "Measure switching wave on external gate, or diode drop from DRV pin to ground",
                                "expected": "Diode drop of ~0.6V (good)",
                                "fix": "Replace the P-channel MOSFET or replace CN3791 controller."
                        }
                ],
                "replacements": [
                        "CN3791",
                        "CN3722"
                ],
                "boards": [
                        "Solar Charging Boards",
                        "Outdoor IoT Stations"
                ],
                "tags": [
                        "charger",
                        "solar",
                        "mppt",
                        "buck",
                        "battery"
                ],
                "custom": false
        },
        {
                "id": "ATmega328P-AU",
                "category": "CPU / SoC",
                "manufacturer": "Microchip / Atmel",
                "package": "TQFP-32",
                "description": "8-bit AVR Microcontroller with 32KB Flash, 2KB SRAM, 16MHz",
                "pinout": {
                        "pins": [
                                {
                                        "num": 3,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 4,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Digital supply voltage (5V/3.3V)"
                                },
                                {
                                        "num": 18,
                                        "name": "AVCC",
                                        "type": "POWER",
                                        "description": "Analog supply voltage for ADC"
                                },
                                {
                                        "num": 29,
                                        "name": "RESET",
                                        "type": "INPUT",
                                        "description": "Active-low reset pin"
                                },
                                {
                                        "num": 30,
                                        "name": "PD0 (RXD)",
                                        "type": "I/O",
                                        "description": "USART RX pin"
                                },
                                {
                                        "num": 31,
                                        "name": "PD1 (TXD)",
                                        "type": "I/O",
                                        "description": "USART TX pin"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Arduino Uno/Nano board dead; cannot upload sketch (avrdude sync error), ATmega chip gets hot",
                                "cause": "Shorted I/O pin due to direct short to 12V or excessive current draw on GPIO pin",
                                "test": "Check resistance from VCC (pin 4) and RESET (pin 29) to GND (pin 3)",
                                "expected": "VCC to GND > 10kΩ, RESET = 5V when powered",
                                "fix": "Replace ATmega328P IC and reprogram bootloader via ICSP."
                        }
                ],
                "replacements": [
                        "ATmega328P-AU",
                        "ATmega328PB",
                        "LGT8F328P"
                ],
                "datasheetUrl": "https://www.microchip.com/wwwproducts/en/ATmega328P",
                "boards": [
                        "Arduino Nano V3",
                        "Arduino Uno",
                        "Custom smart home controllers"
                ],
                "tags": [
                        "mcu",
                        "avr",
                        "atmel",
                        "arduino",
                        "8-bit"
                ],
                "custom": false
        },
        {
                "id": "ATTiny85-20SU",
                "category": "CPU / SoC",
                "manufacturer": "Microchip / Atmel",
                "package": "SOIC-8",
                "description": "8-bit AVR Microcontroller with 8KB Flash, 512B SRAM, 20MHz",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "PB5 (RESET)",
                                        "type": "INPUT",
                                        "description": "Reset pin / I/O"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "PB0 (SDA)",
                                        "type": "I/O",
                                        "description": "I/O pin / I2C data"
                                },
                                {
                                        "num": 7,
                                        "name": "PB2 (SCL)",
                                        "type": "I/O",
                                        "description": "I/O pin / I2C clock"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Tiny AVR board fails to power on; 5V standby rail is heavily loaded",
                                "cause": "GPIO pin overvoltage from external sensors",
                                "test": "Measure diode drop on pin 8 to pin 4",
                                "expected": "0.6V (good), under 0.1V (shorted)",
                                "fix": "Replace ATTiny85 IC."
                        }
                ],
                "replacements": [
                        "ATTiny85-20SU",
                        "ATTiny45",
                        "ATTiny25"
                ],
                "datasheetUrl": "https://www.microchip.com/wwwproducts/en/ATtiny85",
                "boards": [
                        "Digispark USB",
                        "Miniature consumer remotes",
                        "Wearable keychains"
                ],
                "tags": [
                        "mcu",
                        "avr",
                        "tiny",
                        "8-bit",
                        "atmel"
                ],
                "custom": false
        },
        {
                "id": "STM32F411CEU6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "UFQFPN-48",
                "description": "ARM Cortex-M4 32-bit Microcontroller with 512KB Flash, 128KB RAM, 100MHz (Black Pill)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VBAT",
                                        "type": "POWER",
                                        "description": "Backup power"
                                },
                                {
                                        "num": 9,
                                        "name": "VDDA",
                                        "type": "POWER",
                                        "description": "Analog power"
                                },
                                {
                                        "num": 23,
                                        "name": "VSS",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 24,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V digital power"
                                },
                                {
                                        "num": 37,
                                        "name": "PA14 (SWCLK)",
                                        "type": "INPUT",
                                        "description": "Debug Clock"
                                },
                                {
                                        "num": 38,
                                        "name": "PA13 (SWDIO)",
                                        "type": "I/O",
                                        "description": "Debug Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU gets hot, SWD debugger reports 'cannot connect to target'",
                                "cause": "3.3V rail voltage spike or static discharge on GPIO pins",
                                "test": "Measure resistance from VDD (pin 24) to VSS (pin 23)",
                                "expected": "> 10kΩ",
                                "fix": "Replace STM32F411 MCU using hot air."
                        }
                ],
                "replacements": [
                        "STM32F411CEU6",
                        "STM32F401CEU6"
                ],
                "datasheetUrl": "https://www.st.com/resource/en/datasheet/stm32f411ce.pdf",
                "boards": [
                        "STM32 Black Pill Board",
                        "Drone Flight Controllers (Betaflight)",
                        "Core keyboard modules"
                ],
                "tags": [
                        "mcu",
                        "st",
                        "arm",
                        "cortex-m4",
                        "black-pill"
                ],
                "custom": false
        },
        {
                "id": "ESP8266-12F",
                "category": "CPU / SoC",
                "manufacturer": "Espressif Systems",
                "package": "SMD Module (22-pin)",
                "description": "Wi-Fi enabled 32-bit RISC Microcontroller Module",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "RST",
                                        "type": "INPUT",
                                        "description": "Reset pin"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Chip enable"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V power"
                                },
                                {
                                        "num": 15,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 21,
                                        "name": "TXD0",
                                        "type": "OUTPUT",
                                        "description": "Serial TX"
                                },
                                {
                                        "num": 22,
                                        "name": "RXD0",
                                        "type": "INPUT",
                                        "description": "Serial RX"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Wi-Fi signal weak or absent, bootloops on serial",
                                "cause": "Unstable 3.3V power supply rail (needs 300mA+ spikes), or internal flash worn out",
                                "test": "Check voltage on pin 8 (VCC) with an oscilloscope during boot",
                                "expected": "3.3V steady without dropping below 3.0V",
                                "fix": "Replace the 3.3V LDO regulator, or replace ESP-12F module."
                        }
                ],
                "replacements": [
                        "ESP8266-12F",
                        "ESP8266-12E"
                ],
                "datasheetUrl": "https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf",
                "boards": [
                        "NodeMCU V2",
                        "Wemos D1 Mini",
                        "Smart Switches (Sonoff)"
                ],
                "tags": [
                        "mcu",
                        "wifi",
                        "espressif",
                        "iot",
                        "32-bit"
                ],
                "custom": false
        },
        {
                "id": "ESP32-S3-WROOM-1",
                "category": "CPU / SoC",
                "manufacturer": "Espressif Systems",
                "package": "SMD Module (41-pin)",
                "description": "Wi-Fi + Bluetooth BLE 5.0 MCU Module with Dual-Core Xtensa LX7",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "3V3",
                                        "type": "POWER",
                                        "description": "3.3V power input"
                                },
                                {
                                        "num": 3,
                                        "name": "EN",
                                        "type": "INPUT",
                                        "description": "Enable / Reset"
                                },
                                {
                                        "num": 39,
                                        "name": "IO19 (USB_D-)",
                                        "type": "I/O",
                                        "description": "USB D- pin"
                                },
                                {
                                        "num": 40,
                                        "name": "IO20 (USB_D+)",
                                        "type": "I/O",
                                        "description": "USB D+ pin"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "USB interface not recognized; chip gets extremely hot when plugged in",
                                "cause": "Overvoltage or ESD on USB data lines (IO19/IO20)",
                                "test": "Measure diode drop on USB D+ and D- pins to ground",
                                "expected": "0.6V - 0.7V (good), under 0.1V (shorted)",
                                "fix": "Replace the ESP32-S3-WROOM module."
                        }
                ],
                "replacements": [
                        "ESP32-S3-WROOM-1",
                        "ESP32-S3-WROOM-1U"
                ],
                "datasheetUrl": "https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf",
                "boards": [
                        "Freenove ESP32-S3",
                        "LilyGO T-Display",
                        "Smart Cameras"
                ],
                "tags": [
                        "mcu",
                        "wifi",
                        "bluetooth",
                        "espressif",
                        "dual-core"
                ],
                "custom": false
        },
        {
                "id": "nRF52840-QIAA",
                "category": "CPU / SoC",
                "manufacturer": "Nordic Semiconductor",
                "package": "aQFN-73",
                "description": "Multi-protocol Bluetooth 5.4, Zigbee, Thread SoC with ARM Cortex-M4",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Digital supply voltage"
                                },
                                {
                                        "num": "B1",
                                        "name": "VDDH",
                                        "type": "POWER",
                                        "description": "High voltage supply input (up to 5.5V)"
                                },
                                {
                                        "num": "H2",
                                        "name": "ANT",
                                        "type": "RF",
                                        "description": "Antenna interface"
                                },
                                {
                                        "num": "Y2",
                                        "name": "VSS",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Bluetooth signal completely drops or module will not advertise, but MCU runs code",
                                "cause": "Impedance mismatch or ESD damage on the ANT pin or external antenna matching circuit",
                                "test": "Inspect antenna matching inductors and capacitors under microscope for cracks",
                                "expected": "All components intact and soldered",
                                "fix": "Re-solder or replace the 0201 antenna matching components, or replace nRF52840 SoC."
                        }
                ],
                "replacements": [
                        "nRF52840"
                ],
                "datasheetUrl": "https://infocenter.nordicsemi.com/pdf/nRF52840_PS_v1.7.pdf",
                "boards": [
                        "Adafruit Feather nRF52840",
                        "Bluetooth Trackers (Tile, SmartTag)",
                        "Wireless Gaming Mice"
                ],
                "tags": [
                        "mcu",
                        "bluetooth",
                        "nordic",
                        "wireless",
                        "zigbee"
                ],
                "custom": false
        },
        {
                "id": "W25Q64JVSSIG",
                "category": "Storage",
                "manufacturer": "Winbond Electronics",
                "package": "SOIC-8 (208-mil)",
                "description": "64Mb Serial SPI Flash Memory with Dual/Quad SPI",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "/CS",
                                        "type": "INPUT",
                                        "description": "Chip Select"
                                },
                                {
                                        "num": 2,
                                        "name": "DO(IO1)",
                                        "type": "OUTPUT",
                                        "description": "Data Output"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "DI(IO0)",
                                        "type": "INPUT",
                                        "description": "Data Input"
                                },
                                {
                                        "num": 6,
                                        "name": "CLK",
                                        "type": "INPUT",
                                        "description": "Clock"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "3.3V Power"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "System turns on, fan runs high, black screen, post loop (BIOS corrupt)",
                                "cause": "Flash memory cell decay or write cycle limit reached",
                                "test": "Verify supply voltage on pin 8 and read JEDEC ID via programmer",
                                "expected": "VCC = 3.3V, ID = 0xEF4017",
                                "fix": "Re-flash BIOS firmware, or replace physical SPI flash chip."
                        }
                ],
                "replacements": [
                        "W25Q64JVSSIG",
                        "MX25L6433F",
                        "GD25Q64C"
                ],
                "datasheetUrl": "https://www.winbond.com/hq/support/documentation/levelone.jsp?__locale=en&DocNo=DA00-W25Q64JV",
                "boards": [
                        "PC Motherboards",
                        "Wi-Fi Routers",
                        "Graphics Cards BIOS"
                ],
                "tags": [
                        "bios",
                        "flash",
                        "spi",
                        "eeprom",
                        "storage"
                ],
                "custom": false
        },
        {
                "id": "AT24C256C-SSHL-T",
                "category": "Storage",
                "manufacturer": "Microchip / Atmel",
                "package": "SOIC-8 (150-mil)",
                "description": "256Kb Serial I2C EEPROM (32,768 words x 8 bits)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A0",
                                        "type": "INPUT",
                                        "description": "Address input 0"
                                },
                                {
                                        "num": 2,
                                        "name": "A1",
                                        "type": "INPUT",
                                        "description": "Address input 1"
                                },
                                {
                                        "num": 3,
                                        "name": "A2",
                                        "type": "INPUT",
                                        "description": "Address input 2"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Serial Data"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Serial Clock"
                                },
                                {
                                        "num": 7,
                                        "name": "WP",
                                        "type": "INPUT",
                                        "description": "Write Protect"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Device boots but fails to remember saved settings, calibration, or serial numbers upon reboot",
                                "cause": "EEPROM write wear, or SDA/SCL lines shorted due to liquid damage",
                                "test": "Measure voltage on SDA (pin 5) and SCL (pin 6) during boot with oscilloscope",
                                "expected": "3.3V/5V pull-up with rapid switching transitions",
                                "fix": "Replace the EEPROM chip and restore configuration/calibration data."
                        }
                ],
                "replacements": [
                        "AT24C256",
                        "CAT24C256",
                        "M24C256"
                ],
                "datasheetUrl": "https://www.microchip.com/wwwproducts/en/AT24C256",
                "boards": [
                        "Industrial Control Panels",
                        "3D Printer LCD Screens",
                        "Smart TVs"
                ],
                "tags": [
                        "eeprom",
                        "i2c",
                        "storage",
                        "microchip",
                        "atmel"
                ],
                "custom": false
        },
        {
                "id": "LM358DR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Dual Low-Power Operational Amplifier",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier 1 output"
                                },
                                {
                                        "num": 2,
                                        "name": "1IN-",
                                        "type": "INPUT",
                                        "description": "Amplifier 1 inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "1IN+",
                                        "type": "INPUT",
                                        "description": "Amplifier 1 non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Negative supply / Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "2IN+",
                                        "type": "INPUT",
                                        "description": "Amplifier 2 non-inverting input"
                                },
                                {
                                        "num": 6,
                                        "name": "2IN-",
                                        "type": "INPUT",
                                        "description": "Amplifier 2 inverting input"
                                },
                                {
                                        "num": 7,
                                        "name": "OUT2",
                                        "type": "OUTPUT",
                                        "description": "Amplifier 2 output"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Positive supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Analog input signal clipped, heavily distorted, or flatlines to GND / VCC",
                                "cause": "Op-amp input stage blown by overvoltage transient beyond rails",
                                "test": "Measure voltage at pin 8 (VCC) and check output signals on pins 1 and 7",
                                "expected": "VCC = 5V - 30V; Outputs should follow gain formula without clipping",
                                "fix": "Replace the LM358 op-amp."
                        }
                ],
                "replacements": [
                        "LM358DR",
                        "NE5532",
                        "TLV2372",
                        "OP290"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM358",
                "boards": [
                        "Current Sensing Modules",
                        "PIR Motion Sensors",
                        "Pre-Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "ti",
                        "dual",
                        "amplifier"
                ],
                "custom": false
        },
        {
                "id": "LM393DR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Dual Independent Precision Voltage Comparators",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Comparator 1 open-collector output"
                                },
                                {
                                        "num": 2,
                                        "name": "1IN-",
                                        "type": "INPUT",
                                        "description": "Comparator 1 inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "1IN+",
                                        "type": "INPUT",
                                        "description": "Comparator 1 non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Output pin 1 or 7 remains permanently high or low regardless of input differential",
                                "cause": "Open-collector output transistor shorted to ground or input stage failed",
                                "test": "Check voltage on pin 1 while driving 1IN+ (pin 3) higher and lower than 1IN- (pin 2)",
                                "expected": "Switches between 0V and pull-up voltage",
                                "fix": "Replace the LM393 IC."
                        }
                ],
                "replacements": [
                        "LM393",
                        "LM2903",
                        "TLV3201"
                ],
                "datasheetUrl": "https://www.ti.com/product/LM393",
                "boards": [
                        "Zero-crossing detectors",
                        "Battery low-voltage indicators",
                        "PWM generators"
                ],
                "tags": [
                        "comparator",
                        "analog",
                        "ti",
                        "voltage-monitor"
                ],
                "custom": false
        },
        {
                "id": "LM7805CT",
                "category": "Power Management",
                "manufacturer": "ON Semiconductor / Fairchild",
                "package": "TO-220",
                "description": "Three-Terminal 1.5A Positive Voltage Regulator (5V Fixed Output)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "INPUT",
                                        "type": "POWER",
                                        "description": "Input supply voltage"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground / Heat sink tab"
                                },
                                {
                                        "num": 3,
                                        "name": "OUTPUT",
                                        "type": "POWER",
                                        "description": "Regulated 5V output"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Output voltage reads equal to input voltage (blowing down-rail 5V chips), or outputs 0V",
                                "cause": "Internal pass transistor shorted input-to-output due to thermal overload or lack of heatsink",
                                "test": "Measure voltage on pin 3 (OUTPUT) with an input of >7.5V on pin 1",
                                "expected": "4.9V - 5.1V",
                                "fix": "Replace the LM7805 and attach a proper heatsink if necessary."
                        }
                ],
                "replacements": [
                        "LM7805",
                        "MC7805CT",
                        "L7805CV"
                ],
                "datasheetUrl": "https://www.onsemi.com/pdf/datasheet/mc7800-d.pdf",
                "boards": [
                        "Arcade Machine Cabinets",
                        "Power supply kits",
                        "Old gaming consoles (Sega, SNES)"
                ],
                "tags": [
                        "linear-regulator",
                        "5v",
                        "power",
                        "to-220"
                ],
                "custom": false
        },
        {
                "id": "74HC595D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "8-bit Serial-In / Serial or Parallel-Out Shift Register with 3-State Output Register",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 9,
                                        "name": "Q7S",
                                        "type": "OUTPUT",
                                        "description": "Serial data output (cascade pin)"
                                },
                                {
                                        "num": 10,
                                        "name": "/MR",
                                        "type": "INPUT",
                                        "description": "Master Reset (Active Low)"
                                },
                                {
                                        "num": 11,
                                        "name": "SHCP",
                                        "type": "INPUT",
                                        "description": "Shift register clock input"
                                },
                                {
                                        "num": 12,
                                        "name": "STCP",
                                        "type": "INPUT",
                                        "description": "Storage register clock (Latch)"
                                },
                                {
                                        "num": 13,
                                        "name": "/OE",
                                        "type": "INPUT",
                                        "description": "Output Enable (Active Low)"
                                },
                                {
                                        "num": 14,
                                        "name": "DS",
                                        "type": "INPUT",
                                        "description": "Serial data input"
                                },
                                {
                                        "num": 15,
                                        "name": "Q0",
                                        "type": "OUTPUT",
                                        "description": "Parallel output 0"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage (2V - 6V)"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "LED display matrix flickering, corrupted characters, or some segments fail to light",
                                "cause": "GPIO clock ringing, or ESD strike on output lines",
                                "test": "Measure switching signals on SHCP (pin 11) and STCP (pin 12)",
                                "expected": "Sharp logic high/low transitions up to VCC level",
                                "fix": "Replace the 74HC595 shift register."
                        }
                ],
                "replacements": [
                        "74HC595D",
                        "SN74HC595N",
                        "74HCT595"
                ],
                "datasheetUrl": "https://www.nexperia.com/products/analog-logic-ics/asynchronous-interface-logic/shift-registers/series/74HC595-74HCT595.html",
                "boards": [
                        "LED Matrix Displays",
                        "Pinball machines",
                        "Expansion board I/O shields"
                ],
                "tags": [
                        "logic",
                        "shift-register",
                        "io-expander",
                        "74hc"
                ],
                "custom": false
        },
        {
                "id": "74HC138D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "3-to-8 Line Decoder / Demultiplexer (Inverting)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A0",
                                        "type": "INPUT",
                                        "description": "Address input 0"
                                },
                                {
                                        "num": 2,
                                        "name": "A1",
                                        "type": "INPUT",
                                        "description": "Address input 1"
                                },
                                {
                                        "num": 3,
                                        "name": "A2",
                                        "type": "INPUT",
                                        "description": "Address input 2"
                                },
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 15,
                                        "name": "/Y0",
                                        "type": "OUTPUT",
                                        "description": "Inverted output 0"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Memory address lines or multiplexed displays select multiple outputs simultaneously",
                                "cause": "Logic gate inputs floating or blown internally",
                                "test": "Verify state of select pins A0, A1, A2 and outputs /Y0 - /Y7",
                                "expected": "Only one selected output is LOW, all others are HIGH",
                                "fix": "Replace the 74HC138 decoder."
                        }
                ],
                "replacements": [
                        "74HC138",
                        "74HCT138",
                        "CD74HC138"
                ],
                "datasheetUrl": "https://www.nexperia.com/products/analog-logic-ics/asynchronous-interface-logic/decoders-demultiplexers/series/74HC138-74HCT138.html",
                "boards": [
                        "Classic Computer Motherboards",
                        "RAM/ROM addressing selectors"
                ],
                "tags": [
                        "logic",
                        "decoder",
                        "multiplexer",
                        "74hc"
                ],
                "custom": false
        },
        {
                "id": "DHT22",
                "category": "Sensors",
                "manufacturer": "Aosong Electronics",
                "package": "4-pin Single-Row Plastic Package",
                "description": "Digital Relative Humidity and Temperature Sensor (AM2302)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply (3.3V - 5.5V)"
                                },
                                {
                                        "num": 2,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "Single-bus serial data"
                                },
                                {
                                        "num": 3,
                                        "name": "NC",
                                        "type": "NC",
                                        "description": "No connection"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor reads 'NaN' or reports timeout errors, fails to initiate communication",
                                "cause": "Sensor element degraded by high humidity environments or lack of external 4.7k-10k pull-up resistor",
                                "test": "Measure voltage on pin 2 (SDA) with a multimeter",
                                "expected": "Should be pulled up to VDD level; brief logic pulses during read requests",
                                "fix": "Add a 10k pull-up resistor from SDA to VDD, or replace the DHT22 sensor module."
                        }
                ],
                "replacements": [
                        "DHT22",
                        "AM2302",
                        "DHT11 (lower precision)"
                ],
                "datasheetUrl": "https://www.sparkfun.com/datasheets/Sensors/DHT22.pdf",
                "boards": [
                        "Smart Thermostats",
                        "Weather Stations",
                        "Greenhouse controllers"
                ],
                "tags": [
                        "sensor",
                        "temperature",
                        "humidity",
                        "1-wire"
                ],
                "custom": false
        },
        {
                "id": "DS18B20",
                "category": "Sensors",
                "manufacturer": "Maxim Integrated",
                "package": "TO-92",
                "description": "1-Wire Programmable Resolution Digital Thermometer (-55°C to +125°C)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "DQ",
                                        "type": "I/O",
                                        "description": "1-Wire data I/O pin"
                                },
                                {
                                        "num": 3,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Optional external power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "1-Wire bus scans but returns 'No devices found', or reads static -127°C",
                                "cause": "Shorted DQ data line due to cable wear/water ingress on probe models",
                                "test": "Check resistance from DQ (pin 2) to GND (pin 1)",
                                "expected": "> 10kΩ. If under 100Ω, the line is shorted.",
                                "fix": "Replace the DS18B20 sensor."
                        }
                ],
                "replacements": [
                        "DS18B20",
                        "DS18S20",
                        "MAX31820"
                ],
                "datasheetUrl": "https://datasheets.maximintegrated.com/en/ds/DS18B20.pdf",
                "boards": [
                        "Water temperature probes",
                        "PC cooling loops",
                        "Brewing controllers"
                ],
                "tags": [
                        "sensor",
                        "temperature",
                        "1-wire",
                        "maxim"
                ],
                "custom": false
        },
        {
                "id": "ADXL345",
                "category": "Sensors",
                "manufacturer": "Analog Devices",
                "package": "LGA-14",
                "description": "3-Axis Digital Accelerometer with I2C/SPI Interface",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD_I/O",
                                        "type": "POWER",
                                        "description": "I/O power"
                                },
                                {
                                        "num": 6,
                                        "name": "VS",
                                        "type": "POWER",
                                        "description": "Main supply voltage"
                                },
                                {
                                        "num": 12,
                                        "name": "SDO",
                                        "type": "OUTPUT",
                                        "description": "SPI Serial Data Out / Address select"
                                },
                                {
                                        "num": 13,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C data / SPI data in"
                                },
                                {
                                        "num": 14,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C clock / SPI clock"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No accelerometer response, I2C bus locked up / SDA pulled low permanently",
                                "cause": "ESD discharge on sensor casing or excessive vibration shock cracking LGA solder joints",
                                "test": "Reflow LGA pins, or measure diode drop on SDA/SCL lines",
                                "expected": "0.55V - 0.65V",
                                "fix": "Replace the ADXL345 accelerometer chip."
                        }
                ],
                "replacements": [
                        "ADXL345",
                        "LIS3DH",
                        "MPU6050"
                ],
                "datasheetUrl": "https://www.analog.com/media/en/technical-documentation/data-sheets/ADXL345.pdf",
                "boards": [
                        "3D Printer Toolheads (Input Shaping)",
                        "Hard drive drop detectors",
                        "RC Drones"
                ],
                "tags": [
                        "sensor",
                        "accelerometer",
                        "i2c",
                        "spi",
                        "analog-devices"
                ],
                "custom": false
        },
        {
                "id": "IRFZ44N",
                "category": "MOSFET",
                "manufacturer": "Infineon / International Rectifier",
                "package": "TO-220AB",
                "description": "N-Channel Power MOSFET (55V, 49A, RDS(ON) = 17.5mΩ)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain / Heat sink tab"
                                },
                                {
                                        "num": 3,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Connected DC motor or high-power LED remains permanently fully on, ignoring gate trigger",
                                "cause": "Overcurrent or thermal overload shorted Drain-to-Source internally",
                                "test": "Measure resistance from Drain (pin 2) to Source (pin 3)",
                                "expected": "> 100kΩ when Gate is discharged. A shorted FET reads under 1Ω.",
                                "fix": "Replace the IRFZ44N MOSFET."
                        }
                ],
                "replacements": [
                        "IRFZ44N",
                        "IRF540N",
                        "AOT240L"
                ],
                "datasheetUrl": "https://www.infineon.com/dgdl/irfz44npbf.pdf?fileId=5546d4625336dd3f015356ec8533375a",
                "boards": [
                        "Motor Speed Controllers",
                        "DIY Power Inverters",
                        "Solenoid Drivers"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "to-220",
                        "power-switch"
                ],
                "custom": false
        },
        {
                "id": "2N7002LT1G",
                "category": "MOSFET",
                "manufacturer": "ON Semiconductor",
                "package": "SOT-23",
                "description": "N-Channel Small Signal MOSFET (60V, 115mA, RDS(ON) = 7.5Ω)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Level shifter or small signal switch fails to pull line low",
                                "cause": "Gate oxide breakdown from static discharge (ESD)",
                                "test": "Measure resistance from Gate (pin 1) to Source (pin 2)",
                                "expected": "Megaohms (good). A short reads under 1kΩ.",
                                "fix": "Replace 2N7002 MOSFET."
                        }
                ],
                "replacements": [
                        "2N7002",
                        "BSS138",
                        "BSN20"
                ],
                "datasheetUrl": "https://www.onsemi.com/pdf/datasheet/2n7002l-d.pdf",
                "boards": [
                        "Logic level shifter circuits",
                        "Reset controllers",
                        "LED indicators"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "sot-23",
                        "small-signal"
                ],
                "custom": false
        },
        {
                "id": "BSS138",
                "category": "MOSFET",
                "manufacturer": "ON Semiconductor",
                "package": "SOT-23",
                "description": "N-Channel Logic Level Enhancement Mode MOSFET (50V, 220mA)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Level shifter fails to transmit data correctly; signals distorted",
                                "cause": "Overvoltage on signal line blew small gate",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.65V",
                                "fix": "Replace BSS138 MOSFET."
                        }
                ],
                "replacements": [
                        "BSS138",
                        "2N7002",
                        "BSS123"
                ],
                "datasheetUrl": "https://www.onsemi.com/pdf/datasheet/bss138-d.pdf",
                "boards": [
                        "I2C Level Shifters",
                        "Development Board Shields"
                ],
                "tags": [
                        "mosfet",
                        "n-channel",
                        "sot-23",
                        "logic-level"
                ],
                "custom": false
        },
        {
                "id": "1N4148W",
                "category": "Diode",
                "manufacturer": "Diodes Incorporated",
                "package": "SOD-123",
                "description": "High-Speed Fast Switching Diode (100V, 300mA)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode (indicated by stripe)"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line feedback, or completely open circuit",
                                "cause": "Reverse voltage peak exceeded, or overcurrent fused the diode open",
                                "test": "Measure diode drop from Anode (pin 2) to Cathode (pin 1)",
                                "expected": "0.6V - 0.72V in forward bias, OL in reverse bias",
                                "fix": "Replace 1N4148 diode."
                        }
                ],
                "replacements": [
                        "1N4148W",
                        "1N4448W",
                        "MMSD4148"
                ],
                "datasheetUrl": "https://www.diodes.com/assets/Datasheets/ds30097.pdf",
                "boards": [
                        "Keyboard matrix boards",
                        "Signal clippers",
                        "Protection circuits"
                ],
                "tags": [
                        "diode",
                        "switching",
                        "sod-123",
                        "fast-switching"
                ],
                "custom": false
        },
        {
                "id": "1N4007FL",
                "category": "Diode",
                "manufacturer": "ON Semiconductor",
                "package": "SOD-123F",
                "description": "General Purpose Rectifier Diode (1000V, 1A)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode (stripe)"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "AC-to-DC rectification fails, circuit breaker trips or fuses blow",
                                "cause": "High current surge shorted diode internally",
                                "test": "Measure diode drop forward and reverse",
                                "expected": "0.6V forward, OL reverse. Shorted diode reads under 10Ω both ways.",
                                "fix": "Replace 1N4007 diode and check fuse."
                        }
                ],
                "replacements": [
                        "1N4007",
                        "M7 (SMD)",
                        "S1M"
                ],
                "datasheetUrl": "https://www.onsemi.com/pdf/datasheet/1n4001-d.pdf",
                "boards": [
                        "AC adapters",
                        "Linear power supplies",
                        "Flyback protection on relays"
                ],
                "tags": [
                        "diode",
                        "rectifier",
                        "power-supply",
                        "sod-123f"
                ],
                "custom": false
        },
        {
                "id": "BAT54S-7-F",
                "category": "Diode",
                "manufacturer": "Diodes Incorporated",
                "package": "SOT-23",
                "description": "Dual Series Connected Schottky Barrier Diodes (ESD Protection)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "A1",
                                        "type": "POWER",
                                        "description": "Anode 1"
                                },
                                {
                                        "num": 2,
                                        "name": "K2",
                                        "type": "POWER",
                                        "description": "Cathode 2"
                                },
                                {
                                        "num": 3,
                                        "name": "K1 / A2",
                                        "type": "POWER",
                                        "description": "Cathode 1 / Anode 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Microcontroller reset pin or I/O pin stuck low or high; serial communications fail",
                                "cause": "ESD spike hit the signal line and burned the protective Schottky diode shorted",
                                "test": "Measure diode drop from pin 1 to pin 3, and pin 3 to pin 2",
                                "expected": "0.22V - 0.35V (forward bias, low drop schottky)",
                                "fix": "Replace the BAT54S package."
                        }
                ],
                "replacements": [
                        "BAT54S",
                        "BAT54",
                        "BAS40-04"
                ],
                "datasheetUrl": "https://www.diodes.com/assets/Datasheets/ds11010.pdf",
                "boards": [
                        "Arduino Nano USB input protection",
                        "SPI Bus Clamping",
                        "Sensor input interfaces"
                ],
                "tags": [
                        "diode",
                        "schottky",
                        "esd",
                        "sot-23",
                        "dual-diode"
                ],
                "custom": false
        },
        {
                "id": "16.000MHz-SMD-Crystal",
                "category": "Oscillator",
                "manufacturer": "TXC Corporation",
                "package": "SMD 3.2x2.5mm",
                "description": "16.000MHz Quartz Crystal Resonator (8pF Load)",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "XTAL_IN",
                                        "type": "PASSIVE",
                                        "description": "Crystal Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Metal lid Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "XTAL_OUT",
                                        "type": "PASSIVE",
                                        "description": "Crystal Output"
                                },
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Metal lid Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Microcontroller powers on (VCC present) but code fails to execute; serial upload times out",
                                "cause": "Quartz element fractured inside metal casing due to physical impact/drop",
                                "test": "Measure clock waveform on XTAL_IN/OUT using an oscilloscope with low-capacity probe",
                                "expected": "16MHz sinusoidal/square oscillation active",
                                "fix": "Replace the 16MHz crystal and check load capacitors."
                        }
                ],
                "replacements": [
                        "16.000MHz Crystal",
                        "HC-49S (if through-hole)"
                ],
                "boards": [
                        "Arduino Uno R3",
                        "3D Printer Control boards",
                        "USB-to-Serial Converters"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator",
                        "16mhz",
                        "quartz"
                ],
                "custom": false
        },
        {
                "id": "USB-C-24P-SMD",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "USB-C Female 24-Pin SMD",
                "description": "Full-Featured USB Type-C Receptacle (Dual Row)",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1/B12",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": "A4/B9",
                                        "name": "VBUS",
                                        "type": "POWER",
                                        "description": "USB power line"
                                },
                                {
                                        "num": "A5",
                                        "name": "CC1",
                                        "type": "INPUT",
                                        "description": "Configuration Channel 1"
                                },
                                {
                                        "num": "B5",
                                        "name": "CC2",
                                        "type": "INPUT",
                                        "description": "Configuration Channel 2"
                                },
                                {
                                        "num": "A6",
                                        "name": "DP1",
                                        "type": "I/O",
                                        "description": "USB 2.0 Data Positive 1"
                                },
                                {
                                        "num": "A7",
                                        "name": "DN1",
                                        "type": "I/O",
                                        "description": "USB 2.0 Data Negative 1"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "No fast charging (only 5V 0.5A), no data sync, or visual burning on pins",
                                "cause": "Liquid entry causing short circuit between VBUS and CC pins, or physical pins lifted off PCB pad",
                                "test": "Check diode drops on CC1/CC2 and DP1/DN1 pins under magnifying glass",
                                "expected": "CC drops ~0.65V, DP/DN drops ~0.6V",
                                "fix": "Clean charging port with isopropyl alcohol or replace USB-C connector."
                        }
                ],
                "replacements": [
                        "Standard 24-pin USB-C Connector"
                ],
                "boards": [
                        "Smartphones",
                        "Modern Laptops",
                        "Power Banks"
                ],
                "tags": [
                        "connector",
                        "usb-c",
                        "port",
                        "charging",
                        "smd"
                ],
                "custom": false
        },
        {
                "id": "STM32F030F4P6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "TSSOP-20",
                "description": "Microcontroller SoC series - STM32F030F4P6",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU STM32F030F4P6 dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical STM32F030F4P6 controller chip."
                        }
                ],
                "replacements": [
                        "STM32F030F4P6"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "STM32F405RGT6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "LQFP-64",
                "description": "Microcontroller SoC series - STM32F405RGT6",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU STM32F405RGT6 dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical STM32F405RGT6 controller chip."
                        }
                ],
                "replacements": [
                        "STM32F405RGT6"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "STM32G030F6P6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "QFN-32",
                "description": "Microcontroller SoC series - STM32G030F6P6",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU STM32G030F6P6 dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical STM32G030F6P6 controller chip."
                        }
                ],
                "replacements": [
                        "STM32G030F6P6"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "STM32L031K6T6",
                "category": "CPU / SoC",
                "manufacturer": "STMicroelectronics",
                "package": "QFN-32",
                "description": "Microcontroller SoC series - STM32L031K6T6",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU STM32L031K6T6 dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical STM32L031K6T6 controller chip."
                        }
                ],
                "replacements": [
                        "STM32L031K6T6"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "ATmega16U2-AU",
                "category": "CPU / SoC",
                "manufacturer": "Microchip",
                "package": "QFN-32",
                "description": "Microcontroller SoC series - ATmega16U2-AU",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU ATmega16U2-AU dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical ATmega16U2-AU controller chip."
                        }
                ],
                "replacements": [
                        "ATmega16U2-AU"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "ATTiny13A-SU",
                "category": "CPU / SoC",
                "manufacturer": "Microchip",
                "package": "SOIC-8",
                "description": "Microcontroller SoC series - ATTiny13A-SU",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU ATTiny13A-SU dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical ATTiny13A-SU controller chip."
                        }
                ],
                "replacements": [
                        "ATTiny13A-SU"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "ESP32-C3-WROOM-02",
                "category": "CPU / SoC",
                "manufacturer": "Espressif",
                "package": "QFN-32",
                "description": "Microcontroller SoC series - ESP32-C3-WROOM-02",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU ESP32-C3-WROOM-02 dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical ESP32-C3-WROOM-02 controller chip."
                        }
                ],
                "replacements": [
                        "ESP32-C3-WROOM-02"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "nRF51822-QFAA",
                "category": "CPU / SoC",
                "manufacturer": "Nordic",
                "package": "QFN-32",
                "description": "Microcontroller SoC series - nRF51822-QFAA",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "3.3V System Supply"
                                },
                                {
                                        "num": 5,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 10,
                                        "name": "RXD",
                                        "type": "INPUT",
                                        "description": "Serial Receive"
                                },
                                {
                                        "num": 11,
                                        "name": "TXD",
                                        "type": "OUTPUT",
                                        "description": "Serial Transmit"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MCU nRF51822-QFAA dead; standby rail shorted to ground",
                                "cause": "Overvoltage spike or electrostatic shock on GPIO lines",
                                "test": "Measure diode drop on VDD rail to GND",
                                "expected": "0.55V (good), under 0.1V (shorted)",
                                "fix": "Replace the physical nRF51822-QFAA controller chip."
                        }
                ],
                "replacements": [
                        "nRF51822-QFAA"
                ],
                "boards": [
                        "Development Boards",
                        "Custom Controller PCBs"
                ],
                "tags": [
                        "mcu",
                        "cpu",
                        "soc",
                        "embedded"
                ],
                "custom": false
        },
        {
                "id": "CAT24C512WI-G",
                "category": "Storage",
                "manufacturer": "Microchip",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - CAT24C512WI-G",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; CAT24C512WI-G JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new CAT24C512WI-G chip and replace it."
                        }
                ],
                "replacements": [
                        "CAT24C512WI-G"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "24LC512-I/SN",
                "category": "Storage",
                "manufacturer": "Microchip",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - 24LC512-I/SN",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; 24LC512-I/SN JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new 24LC512-I/SN chip and replace it."
                        }
                ],
                "replacements": [
                        "24LC512-I/SN"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "AT24C02D-SSHM-T",
                "category": "Storage",
                "manufacturer": "Microchip",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - AT24C02D-SSHM-T",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; AT24C02D-SSHM-T JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new AT24C02D-SSHM-T chip and replace it."
                        }
                ],
                "replacements": [
                        "AT24C02D-SSHM-T"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "W25Q32JVSSIG",
                "category": "Storage",
                "manufacturer": "Winbond",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - W25Q32JVSSIG",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; W25Q32JVSSIG JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new W25Q32JVSSIG chip and replace it."
                        }
                ],
                "replacements": [
                        "W25Q32JVSSIG"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "W25Q256FVEIG",
                "category": "Storage",
                "manufacturer": "Winbond",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - W25Q256FVEIG",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; W25Q256FVEIG JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new W25Q256FVEIG chip and replace it."
                        }
                ],
                "replacements": [
                        "W25Q256FVEIG"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "MX25L25645GM2I-10G",
                "category": "Storage",
                "manufacturer": "Macronix",
                "package": "SOIC-8",
                "description": "Serial SPI/I2C Memory Chip - MX25L25645GM2I-10G",
                "pinout": {
                        "pins": [
                                {
                                        "num": 4,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 5,
                                        "name": "SDA / DI",
                                        "type": "I/O",
                                        "description": "Data I/O line"
                                },
                                {
                                        "num": 6,
                                        "name": "SCL / CLK",
                                        "type": "INPUT",
                                        "description": "Clock line"
                                },
                                {
                                        "num": 8,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Supply voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Settings or firmware data fail to read; MX25L25645GM2I-10G JEDEC ID reads as all 0x00 or 0xFF",
                                "cause": "Flash write wear or voltage spikes on supply line",
                                "test": "Probe VCC voltage and verify serial signals",
                                "expected": "3.3V or 5V present on VCC",
                                "fix": "Program a new MX25L25645GM2I-10G chip and replace it."
                        }
                ],
                "replacements": [
                        "MX25L25645GM2I-10G"
                ],
                "boards": [
                        "System Motherboards",
                        "BIOS modules"
                ],
                "tags": [
                        "storage",
                        "flash",
                        "eeprom",
                        "spi",
                        "i2c"
                ],
                "custom": false
        },
        {
                "id": "NE5532DR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - NE5532DR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace NE5532DR operational amplifier."
                        }
                ],
                "replacements": [
                        "NE5532DR"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "TL072CDR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - TL072CDR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace TL072CDR operational amplifier."
                        }
                ],
                "replacements": [
                        "TL072CDR"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "LM324DR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - LM324DR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace LM324DR operational amplifier."
                        }
                ],
                "replacements": [
                        "LM324DR"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "LM339DR",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - LM339DR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace LM339DR operational amplifier."
                        }
                ],
                "replacements": [
                        "LM339DR"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "MCP6002-I/SN",
                "category": "Logic / Buffers",
                "manufacturer": "National Semiconductor",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - MCP6002-I/SN",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace MCP6002-I/SN operational amplifier."
                        }
                ],
                "replacements": [
                        "MCP6002-I/SN"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "OPA2134UA",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - OPA2134UA",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace OPA2134UA operational amplifier."
                        }
                ],
                "replacements": [
                        "OPA2134UA"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "LM386M-1",
                "category": "Logic / Buffers",
                "manufacturer": "National Semiconductor",
                "package": "SOIC-8",
                "description": "Analog Operational Amplifier / Audio Amplifier - LM386M-1",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "OUT1",
                                        "type": "OUTPUT",
                                        "description": "Amplifier output"
                                },
                                {
                                        "num": 2,
                                        "name": "IN-",
                                        "type": "INPUT",
                                        "description": "Inverting input"
                                },
                                {
                                        "num": 3,
                                        "name": "IN+",
                                        "type": "INPUT",
                                        "description": "Non-inverting input"
                                },
                                {
                                        "num": 4,
                                        "name": "V-",
                                        "type": "GND",
                                        "description": "Negative supply / GND"
                                },
                                {
                                        "num": 8,
                                        "name": "V+",
                                        "type": "POWER",
                                        "description": "Positive supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal output distorted or permanently flat to rails",
                                "cause": "Input overvoltage spike destroyed the internal silicon junction",
                                "test": "Verify output on pin 1 matches signal gain formula",
                                "expected": "No clipping or signal leakage",
                                "fix": "Replace LM386M-1 operational amplifier."
                        }
                ],
                "replacements": [
                        "LM386M-1"
                ],
                "boards": [
                        "Audio Pre-Amps",
                        "Analog Sensor Amplifiers"
                ],
                "tags": [
                        "op-amp",
                        "analog",
                        "amplifier",
                        "audio"
                ],
                "custom": false
        },
        {
                "id": "AP63200WU-7",
                "category": "Power Management",
                "manufacturer": "Diodes Inc",
                "package": "SOT-89",
                "description": "Linear Regulator / LDO power circuit - AP63200WU-7",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator AP63200WU-7 fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the AP63200WU-7 regulator."
                        }
                ],
                "replacements": [
                        "AP63200WU-7"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "ME6211C33M5G",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "SOT-23",
                "description": "Linear Regulator / LDO power circuit - ME6211C33M5G",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator ME6211C33M5G fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the ME6211C33M5G regulator."
                        }
                ],
                "replacements": [
                        "ME6211C33M5G"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "XC6206P332MR",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "SOT-23",
                "description": "Linear Regulator / LDO power circuit - XC6206P332MR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator XC6206P332MR fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the XC6206P332MR regulator."
                        }
                ],
                "replacements": [
                        "XC6206P332MR"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "HT7333-A",
                "category": "Power Management",
                "manufacturer": "Holtek",
                "package": "SOT-89",
                "description": "Linear Regulator / LDO power circuit - HT7333-A",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator HT7333-A fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the HT7333-A regulator."
                        }
                ],
                "replacements": [
                        "HT7333-A"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "SPX3819M5-L-3-3",
                "category": "Power Management",
                "manufacturer": "Sipex",
                "package": "SOT-89",
                "description": "Linear Regulator / LDO power circuit - SPX3819M5-L-3-3",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator SPX3819M5-L-3-3 fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the SPX3819M5-L-3-3 regulator."
                        }
                ],
                "replacements": [
                        "SPX3819M5-L-3-3"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "TLV1117-33CDCY",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "SOT-89",
                "description": "Linear Regulator / LDO power circuit - TLV1117-33CDCY",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator TLV1117-33CDCY fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the TLV1117-33CDCY regulator."
                        }
                ],
                "replacements": [
                        "TLV1117-33CDCY"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "TL431AIDBZR",
                "category": "Power Management",
                "manufacturer": "Texas Instruments",
                "package": "SOT-23",
                "description": "Linear Regulator / LDO power circuit - TL431AIDBZR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 2,
                                        "name": "VOUT",
                                        "type": "POWER",
                                        "description": "Regulated Output"
                                },
                                {
                                        "num": 3,
                                        "name": "VIN",
                                        "type": "POWER",
                                        "description": "Input Voltage"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Regulator TL431AIDBZR fails to output voltage, or outputs equal to input (blowing down-rail chips)",
                                "cause": "Overheating due to high load, or input voltage spike",
                                "test": "Measure voltage on VOUT (pin 2)",
                                "expected": "Stable rated voltage (e.g., 3.3V)",
                                "fix": "Replace the TL431AIDBZR regulator."
                        }
                ],
                "replacements": [
                        "TL431AIDBZR"
                ],
                "boards": [
                        "Maker Boards",
                        "Power Modules"
                ],
                "tags": [
                        "ldo",
                        "regulator",
                        "linear",
                        "power"
                ],
                "custom": false
        },
        {
                "id": "74HC4051D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC4051D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC4051D logic IC."
                        }
                ],
                "replacements": [
                        "74HC4051D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC74D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC74D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC74D logic IC."
                        }
                ],
                "replacements": [
                        "74HC74D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "CD4017BM",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - CD4017BM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the CD4017BM logic IC."
                        }
                ],
                "replacements": [
                        "CD4017BM"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "CD4066BM",
                "category": "Logic / Buffers",
                "manufacturer": "Texas Instruments",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - CD4066BM",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the CD4066BM logic IC."
                        }
                ],
                "replacements": [
                        "CD4066BM"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC14D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC14D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC14D logic IC."
                        }
                ],
                "replacements": [
                        "74HC14D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC245D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC245D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC245D logic IC."
                        }
                ],
                "replacements": [
                        "74HC245D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC00D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC00D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC00D logic IC."
                        }
                ],
                "replacements": [
                        "74HC00D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC04D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC04D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC04D logic IC."
                        }
                ],
                "replacements": [
                        "74HC04D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "74HC08D",
                "category": "Logic / Buffers",
                "manufacturer": "Nexperia",
                "package": "SOIC-16",
                "description": "Standard Logic / Shift / Decoder Series IC - 74HC08D",
                "pinout": {
                        "pins": [
                                {
                                        "num": 8,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 16,
                                        "name": "VCC",
                                        "type": "POWER",
                                        "description": "Power supply"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Logic states fail to transition or latch correctly",
                                "cause": "ESD gate damage or overvoltage",
                                "test": "Verify states of input and output lines",
                                "expected": "Follows standard truth table for logic family",
                                "fix": "Replace the 74HC08D logic IC."
                        }
                ],
                "replacements": [
                        "74HC08D"
                ],
                "boards": [
                        "Control Interfaces",
                        "Vintage Computers"
                ],
                "tags": [
                        "logic",
                        "74series",
                        "buffer",
                        "gate"
                ],
                "custom": false
        },
        {
                "id": "IRF540N",
                "category": "MOSFET",
                "manufacturer": "Infineon",
                "package": "TO-220",
                "description": "Switching MOSFET Transistor - IRF540N",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET IRF540N shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace IRF540N MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "IRF540N"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "IRF3205",
                "category": "MOSFET",
                "manufacturer": "Infineon",
                "package": "TO-220",
                "description": "Switching MOSFET Transistor - IRF3205",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET IRF3205 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace IRF3205 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "IRF3205"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "BSS84",
                "category": "MOSFET",
                "manufacturer": "Infineon",
                "package": "TO-220",
                "description": "Switching MOSFET Transistor - BSS84",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET BSS84 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace BSS84 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "BSS84"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "AO3415A",
                "category": "MOSFET",
                "manufacturer": "Alpha & Omega",
                "package": "SOT-23",
                "description": "Switching MOSFET Transistor - AO3415A",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET AO3415A shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace AO3415A MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "AO3415A"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "SI2301",
                "category": "MOSFET",
                "manufacturer": "Vishay",
                "package": "SOT-23",
                "description": "Switching MOSFET Transistor - SI2301",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET SI2301 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace SI2301 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "SI2301"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "SI2302",
                "category": "MOSFET",
                "manufacturer": "Vishay",
                "package": "SOT-23",
                "description": "Switching MOSFET Transistor - SI2302",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET SI2302 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace SI2302 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "SI2302"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "SIRA12DP-T1-GE3",
                "category": "MOSFET",
                "manufacturer": "Vishay",
                "package": "SOT-23",
                "description": "Switching MOSFET Transistor - SIRA12DP-T1-GE3",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET SIRA12DP-T1-GE3 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace SIRA12DP-T1-GE3 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "SIRA12DP-T1-GE3"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "DMG2302UQ-7",
                "category": "MOSFET",
                "manufacturer": "Infineon",
                "package": "TO-220",
                "description": "Switching MOSFET Transistor - DMG2302UQ-7",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "G",
                                        "type": "INPUT",
                                        "description": "Gate"
                                },
                                {
                                        "num": 2,
                                        "name": "S",
                                        "type": "POWER",
                                        "description": "Source"
                                },
                                {
                                        "num": 3,
                                        "name": "D",
                                        "type": "POWER",
                                        "description": "Drain"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MOSFET DMG2302UQ-7 shorted internally; load stays permanently active",
                                "cause": "Overcurrent or inductive voltage kickback spike",
                                "test": "Measure diode drop from Drain to Source",
                                "expected": "0.5V - 0.7V (good), under 0.05V (shorted)",
                                "fix": "Replace DMG2302UQ-7 MOSFET and check flyback protection diode."
                        }
                ],
                "replacements": [
                        "DMG2302UQ-7"
                ],
                "boards": [
                        "Switching Power Rails",
                        "Motor H-bridges"
                ],
                "tags": [
                        "mosfet",
                        "switch",
                        "transistor"
                ],
                "custom": false
        },
        {
                "id": "SS24",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SMA",
                "description": "Schottky / Rectifier / ESD protection diode - SS24",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace SS24 diode."
                        }
                ],
                "replacements": [
                        "SS24"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "SS34",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SMA",
                "description": "Schottky / Rectifier / ESD protection diode - SS34",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace SS34 diode."
                        }
                ],
                "replacements": [
                        "SS34"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "SS54",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SMA",
                "description": "Schottky / Rectifier / ESD protection diode - SS54",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace SS54 diode."
                        }
                ],
                "replacements": [
                        "SS54"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "LL4148",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - LL4148",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace LL4148 diode."
                        }
                ],
                "replacements": [
                        "LL4148"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "M7",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - M7",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace M7 diode."
                        }
                ],
                "replacements": [
                        "M7"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "S1M",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - S1M",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace S1M diode."
                        }
                ],
                "replacements": [
                        "S1M"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "BAT54A",
                "category": "Diode",
                "manufacturer": "Diodes Inc",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - BAT54A",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace BAT54A diode."
                        }
                ],
                "replacements": [
                        "BAT54A"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "BAT54C",
                "category": "Diode",
                "manufacturer": "Diodes Inc",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - BAT54C",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace BAT54C diode."
                        }
                ],
                "replacements": [
                        "BAT54C"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "PESD5V0U1UA",
                "category": "Diode",
                "manufacturer": "Diodes Inc",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - PESD5V0U1UA",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace PESD5V0U1UA diode."
                        }
                ],
                "replacements": [
                        "PESD5V0U1UA"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "ESD5Z5V-2/TR",
                "category": "Diode",
                "manufacturer": "ON Semi",
                "package": "SOD-323",
                "description": "Schottky / Rectifier / ESD protection diode - ESD5Z5V-2/TR",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "K",
                                        "type": "POWER",
                                        "description": "Cathode"
                                },
                                {
                                        "num": 2,
                                        "name": "A",
                                        "type": "POWER",
                                        "description": "Anode"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Signal line shorted to ground or protection line open",
                                "cause": "ESD spike hit the signal line and fused diode",
                                "test": "Measure diode drop in forward bias",
                                "expected": "0.2V - 0.6V depending on type (Schottky lower, Silicon higher)",
                                "fix": "Replace ESD5Z5V-2/TR diode."
                        }
                ],
                "replacements": [
                        "ESD5Z5V-2/TR"
                ],
                "boards": [
                        "Input protection rails",
                        "Power supplies"
                ],
                "tags": [
                        "diode",
                        "protection",
                        "schottky",
                        "rectifier"
                ],
                "custom": false
        },
        {
                "id": "8.000MHz-Crystal",
                "category": "Oscillator",
                "manufacturer": "TXC Corp",
                "package": "SMD 3.2x2.5mm",
                "description": "Clock Resonator / Quartz Crystal - 8.000MHz-Crystal",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "X1",
                                        "type": "PASSIVE",
                                        "description": "Clock Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Processor clock fails to start; system dead",
                                "cause": "Internal quartz fracture due to physical drop",
                                "test": "Check clock oscillation with oscilloscope",
                                "expected": "Active frequency matching rated speed",
                                "fix": "Replace the 8.000MHz-Crystal crystal."
                        }
                ],
                "replacements": [
                        "8.000MHz-Crystal"
                ],
                "boards": [
                        "Main system boards",
                        "USB hubs"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator"
                ],
                "custom": false
        },
        {
                "id": "12.000MHz-Crystal",
                "category": "Oscillator",
                "manufacturer": "TXC Corp",
                "package": "SMD 3.2x2.5mm",
                "description": "Clock Resonator / Quartz Crystal - 12.000MHz-Crystal",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "X1",
                                        "type": "PASSIVE",
                                        "description": "Clock Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Processor clock fails to start; system dead",
                                "cause": "Internal quartz fracture due to physical drop",
                                "test": "Check clock oscillation with oscilloscope",
                                "expected": "Active frequency matching rated speed",
                                "fix": "Replace the 12.000MHz-Crystal crystal."
                        }
                ],
                "replacements": [
                        "12.000MHz-Crystal"
                ],
                "boards": [
                        "Main system boards",
                        "USB hubs"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator"
                ],
                "custom": false
        },
        {
                "id": "32.768kHz-SMD-Crystal",
                "category": "Oscillator",
                "manufacturer": "TXC Corp",
                "package": "SMD 3.2x2.5mm",
                "description": "Clock Resonator / Quartz Crystal - 32.768kHz-SMD-Crystal",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "X1",
                                        "type": "PASSIVE",
                                        "description": "Clock Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Processor clock fails to start; system dead",
                                "cause": "Internal quartz fracture due to physical drop",
                                "test": "Check clock oscillation with oscilloscope",
                                "expected": "Active frequency matching rated speed",
                                "fix": "Replace the 32.768kHz-SMD-Crystal crystal."
                        }
                ],
                "replacements": [
                        "32.768kHz-SMD-Crystal"
                ],
                "boards": [
                        "Main system boards",
                        "USB hubs"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator"
                ],
                "custom": false
        },
        {
                "id": "24.000MHz-Crystal",
                "category": "Oscillator",
                "manufacturer": "TXC Corp",
                "package": "SMD 3.2x2.5mm",
                "description": "Clock Resonator / Quartz Crystal - 24.000MHz-Crystal",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "X1",
                                        "type": "PASSIVE",
                                        "description": "Clock Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Processor clock fails to start; system dead",
                                "cause": "Internal quartz fracture due to physical drop",
                                "test": "Check clock oscillation with oscilloscope",
                                "expected": "Active frequency matching rated speed",
                                "fix": "Replace the 24.000MHz-Crystal crystal."
                        }
                ],
                "replacements": [
                        "24.000MHz-Crystal"
                ],
                "boards": [
                        "Main system boards",
                        "USB hubs"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator"
                ],
                "custom": false
        },
        {
                "id": "50MHz-Oscillator",
                "category": "Oscillator",
                "manufacturer": "TXC Corp",
                "package": "SMD 3.2x2.5mm",
                "description": "Clock Resonator / Quartz Crystal - 50MHz-Oscillator",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "X1",
                                        "type": "PASSIVE",
                                        "description": "Clock Input"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Processor clock fails to start; system dead",
                                "cause": "Internal quartz fracture due to physical drop",
                                "test": "Check clock oscillation with oscilloscope",
                                "expected": "Active frequency matching rated speed",
                                "fix": "Replace the 50MHz-Oscillator crystal."
                        }
                ],
                "replacements": [
                        "50MHz-Oscillator"
                ],
                "boards": [
                        "Main system boards",
                        "USB hubs"
                ],
                "tags": [
                        "crystal",
                        "clock",
                        "oscillator"
                ],
                "custom": false
        },
        {
                "id": "BME280",
                "category": "Sensors",
                "manufacturer": "Bosch",
                "package": "LGA-8",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - BME280",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor BME280 does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the BME280 sensor."
                        }
                ],
                "replacements": [
                        "BME280"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "BME680",
                "category": "Sensors",
                "manufacturer": "Bosch",
                "package": "LGA-8",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - BME680",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor BME680 does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the BME680 sensor."
                        }
                ],
                "replacements": [
                        "BME680"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "BMP280-SMD",
                "category": "Sensors",
                "manufacturer": "Bosch",
                "package": "LGA-8",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - BMP280-SMD",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor BMP280-SMD does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the BMP280-SMD sensor."
                        }
                ],
                "replacements": [
                        "BMP280-SMD"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "DHT11-MODULE",
                "category": "Sensors",
                "manufacturer": "Maxim",
                "package": "QFN",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - DHT11-MODULE",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor DHT11-MODULE does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the DHT11-MODULE sensor."
                        }
                ],
                "replacements": [
                        "DHT11-MODULE"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "LM75AD",
                "category": "Sensors",
                "manufacturer": "Maxim",
                "package": "QFN",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - LM75AD",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor LM75AD does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the LM75AD sensor."
                        }
                ],
                "replacements": [
                        "LM75AD"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "LSM6DS3TR-C",
                "category": "Sensors",
                "manufacturer": "STMicroelectronics",
                "package": "QFN",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - LSM6DS3TR-C",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor LSM6DS3TR-C does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the LSM6DS3TR-C sensor."
                        }
                ],
                "replacements": [
                        "LSM6DS3TR-C"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "MAX30102",
                "category": "Sensors",
                "manufacturer": "Maxim",
                "package": "QFN",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - MAX30102",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor MAX30102 does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the MAX30102 sensor."
                        }
                ],
                "replacements": [
                        "MAX30102"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "VL53L0X",
                "category": "Sensors",
                "manufacturer": "Maxim",
                "package": "QFN",
                "description": "I2C / SPI Environmental, Motion or Optical Sensor - VL53L0X",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "VDD",
                                        "type": "POWER",
                                        "description": "Power supply"
                                },
                                {
                                        "num": 2,
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                },
                                {
                                        "num": 3,
                                        "name": "SCL",
                                        "type": "INPUT",
                                        "description": "I2C Clock"
                                },
                                {
                                        "num": 4,
                                        "name": "SDA",
                                        "type": "I/O",
                                        "description": "I2C Data"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Sensor VL53L0X does not communicate on I2C bus; locks up SDA line",
                                "cause": "ESD spike on communication lines",
                                "test": "Check diode drop of SDA and SCL lines",
                                "expected": "0.55V - 0.70V",
                                "fix": "Replace the VL53L0X sensor."
                        }
                ],
                "replacements": [
                        "VL53L0X"
                ],
                "boards": [
                        "Weather stations",
                        "Wearables",
                        "Vibration monitors"
                ],
                "tags": [
                        "sensor",
                        "i2c",
                        "spi",
                        "analog"
                ],
                "custom": false
        },
        {
                "id": "Micro-USB-5P",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "SMD Connector",
                "description": "Input / Output Interface Connector - Micro-USB-5P",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside Micro-USB-5P",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace Micro-USB-5P connector."
                        }
                ],
                "replacements": [
                        "Micro-USB-5P"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "HDMI-Type-A-19P",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "Through-Hole Connector",
                "description": "Input / Output Interface Connector - HDMI-Type-A-19P",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside HDMI-Type-A-19P",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace HDMI-Type-A-19P connector."
                        }
                ],
                "replacements": [
                        "HDMI-Type-A-19P"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "RJ45-Gigabit",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "Through-Hole Connector",
                "description": "Input / Output Interface Connector - RJ45-Gigabit",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside RJ45-Gigabit",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace RJ45-Gigabit connector."
                        }
                ],
                "replacements": [
                        "RJ45-Gigabit"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "MicroSD-Slot",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "SMD Connector",
                "description": "Input / Output Interface Connector - MicroSD-Slot",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside MicroSD-Slot",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace MicroSD-Slot connector."
                        }
                ],
                "replacements": [
                        "MicroSD-Slot"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "DB9-Female",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "Through-Hole Connector",
                "description": "Input / Output Interface Connector - DB9-Female",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside DB9-Female",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace DB9-Female connector."
                        }
                ],
                "replacements": [
                        "DB9-Female"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "JST-XH-2P",
                "category": "Connector",
                "manufacturer": "Molex",
                "package": "Through-Hole Connector",
                "description": "Input / Output Interface Connector - JST-XH-2P",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside JST-XH-2P",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace JST-XH-2P connector."
                        }
                ],
                "replacements": [
                        "JST-XH-2P"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "XT60-Male",
                "category": "Connector",
                "manufacturer": "Amphenol",
                "package": "Through-Hole Connector",
                "description": "Input / Output Interface Connector - XT60-Male",
                "pinout": {
                        "pins": [
                                {
                                        "num": 1,
                                        "name": "Pin 1",
                                        "type": "I/O",
                                        "description": "Pin 1 connection"
                                },
                                {
                                        "num": 2,
                                        "name": "Pin 2",
                                        "type": "I/O",
                                        "description": "Pin 2 connection"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Intermittent connection, pins loose, or physical damage inside XT60-Male",
                                "cause": "Mechanical wear or cable strain tearing pads off PCB",
                                "test": "Inspect solder joints under microscope",
                                "expected": "Smooth solder fillets, no cracks",
                                "fix": "Re-solder joint or replace XT60-Male connector."
                        }
                ],
                "replacements": [
                        "XT60-Male"
                ],
                "boards": [
                        "Interface panels",
                        "Input boards"
                ],
                "tags": [
                        "connector",
                        "interface",
                        "port"
                ],
                "custom": false
        },
        {
                "id": "Apple M2 (APL1109)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA (Unified Memory Package)",
                "description": "Apple Silicon M2 Octa-Core SoC with integrated GPU and unified LPDDR5 RAM",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "PP1v1_S2D_VDD_SOC",
                                        "type": "POWER",
                                        "description": "SoC core power supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "PP1v2_S2_VDD_DRAM",
                                        "type": "POWER",
                                        "description": "LPDDR5 memory supply"
                                },
                                {
                                        "num": "H4",
                                        "name": "DRAM_CLK_P",
                                        "type": "INPUT",
                                        "description": "DRAM clock positive"
                                },
                                {
                                        "num": "J4",
                                        "name": "DRAM_CLK_N",
                                        "type": "INPUT",
                                        "description": "DRAM clock negative"
                                },
                                {
                                        "num": "AA1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MacBook dead, drawing 20V 0.03A or 5V 0.00A on meter, DFU mode failure",
                                "cause": "Unified RAM chip solder joint failure under RAM (cold joints), or main SoC core line shorted to ground",
                                "test": "Measure diode drop on PP1v1_S2D_VDD_SOC and PP1v2_S2_VDD_DRAM capacitors",
                                "expected": "PP1v1_S2D_VDD_SOC = 0.08V (low core drop), PP1v2_S2_VDD_DRAM = 0.35V",
                                "fix": "Reball unified memory chip if solder fatigue, or replace entire logic board if SoC is internally shorted."
                        }
                ],
                "replacements": [
                        "Apple M2"
                ],
                "boards": [
                        "820-02536 (MacBook Air M2)",
                        "820-02773 (MacBook Pro M2)"
                ],
                "tags": [
                        "apple",
                        "m2",
                        "soc",
                        "macbook",
                        "silicon"
                ],
                "custom": false
        },
        {
                "id": "Apple M3 (APL1120)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA (Unified Memory Package)",
                "description": "Apple Silicon M3 3nm SoC with hardware-accelerated ray tracing and dynamic caching",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "PP0v85_VDD_SOC",
                                        "type": "POWER",
                                        "description": "SoC core 0.85V supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "PP1v2_VDD_DRAM",
                                        "type": "POWER",
                                        "description": "LPDDR5X memory supply"
                                },
                                {
                                        "num": "AA1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "MacBook powers on to 20V but black screen, no boot, DFU restore fails with Error 9 or 4014",
                                "cause": "Solder pad corrosion under SoC BGA near memory rails due to liquid ingress through hinges",
                                "test": "Measure resistance of PP1v2_VDD_DRAM to ground",
                                "expected": "> 500 ohms (good), under 2 ohms (shorted)",
                                "fix": "Ultrasonic board cleaning, or reflow/reball SoC if pads are corroded."
                        }
                ],
                "replacements": [
                        "Apple M3"
                ],
                "boards": [
                        "820-03222 (MacBook Pro M3)",
                        "820-03155 (MacBook Air 13-inch M3)"
                ],
                "tags": [
                        "apple",
                        "m3",
                        "soc",
                        "macbook",
                        "silicon"
                ],
                "custom": false
        },
        {
                "id": "Apple M4 (APL1121)",
                "category": "CPU / SoC",
                "manufacturer": "Apple",
                "package": "BGA (Unified Memory Package)",
                "description": "Apple Silicon M4 Second-Gen 3nm SoC with 10-core CPU and ultra high-performance NPU",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "PP0v80_VDD_CPU",
                                        "type": "POWER",
                                        "description": "CPU core supply 0.8V"
                                },
                                {
                                        "num": "B1",
                                        "name": "PP1v1_VDD_DRAM",
                                        "type": "POWER",
                                        "description": "LPDDR5X memory supply"
                                },
                                {
                                        "num": "AA1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Device dead, drawing 5V 0.05A cycling on USB-C ammeter",
                                "cause": "Internal NPU/SoC short or core PMIC voltage regulator failure",
                                "test": "Measure diode drop on PP0v80_VDD_CPU inductors",
                                "expected": "0.015V - 0.03V (low drop is normal, check for true 0.000V short)",
                                "fix": "Replace PMIC if short is external, otherwise replace logic board."
                        }
                ],
                "replacements": [
                        "Apple M4"
                ],
                "boards": [
                        "iPad Pro M4 (2024)",
                        "MacBook Pro M4 (2024)"
                ],
                "tags": [
                        "apple",
                        "m4",
                        "soc",
                        "macbook",
                        "silicon"
                ],
                "custom": false
        },
        {
                "id": "Intel Core i9-13900K",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "LGA-1700",
                "description": "Raptor Lake 24-core (8 P-cores + 16 E-cores) High-Performance Desktop Processor",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCCSA",
                                        "type": "POWER",
                                        "description": "System Agent power supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC_CORE",
                                        "type": "POWER",
                                        "description": "CPU Core power supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "VDDQ",
                                        "type": "POWER",
                                        "description": "DDR5/DDR4 memory controller supply"
                                },
                                {
                                        "num": "AN1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "PC fails to POST, debug LEDs on motherboard lock on solid red 'CPU', system power cycles",
                                "cause": "Degradation of internal ring bus voltage due to microcode spikes, or bent pins inside LGA-1700 socket",
                                "test": "Measure resistance of VCC_CORE rail to GND on motherboard bypass caps, and inspect socket pins",
                                "expected": "VCC_CORE resistance ~1.2 ohms (normal low core impedance), LGA pins straight",
                                "fix": "Replace degraded CPU, or replace/realign LGA-1700 socket pins."
                        }
                ],
                "replacements": [
                        "Intel Core i9-13900K",
                        "Intel Core i9-14900K"
                ],
                "boards": [
                        "ASUS ROG Maximus Z790",
                        "MSI MPG Z790 Carbon"
                ],
                "tags": [
                        "intel",
                        "cpu",
                        "desktop",
                        "raptor-lake",
                        "lga-1700"
                ],
                "custom": false
        },
        {
                "id": "Intel Core i9-14900K",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "LGA-1700",
                "description": "Raptor Lake Refresh 24-core Desktop Processor up to 6.0GHz",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCCSA",
                                        "type": "POWER",
                                        "description": "System Agent power supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC_CORE",
                                        "type": "POWER",
                                        "description": "CPU Core power supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "VDDQ",
                                        "type": "POWER",
                                        "description": "DDR5 memory controller supply"
                                },
                                {
                                        "num": "AN1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Unreal Engine games crash with 'out of video memory' errors, or random BSODs under heavy load",
                                "cause": "Silicon core degradation from high default motherboard power profiles and excessive voltage",
                                "test": "Run Cinebench test and monitor core voltages and thermal throttling via HWiNFO",
                                "expected": "Core voltage under 1.4V, temperature under 100C",
                                "fix": "Update motherboard BIOS to 'Intel Default Profile' baseline, downclock multiplier, or RMA CPU."
                        }
                ],
                "replacements": [
                        "Intel Core i9-14900K",
                        "Intel Core i9-13900K"
                ],
                "boards": [
                        "ASUS ROG Strix Z790-E",
                        "Gigabyte Z790 AORUS Master"
                ],
                "tags": [
                        "intel",
                        "cpu",
                        "desktop",
                        "raptor-lake-refresh",
                        "lga-1700"
                ],
                "custom": false
        },
        {
                "id": "Intel Core Ultra 7 155H",
                "category": "CPU / SoC",
                "manufacturer": "Intel",
                "package": "BGA-2049",
                "description": "Meteor Lake 16-core Laptop Processor with integrated Arc Graphics and NPU AI accelerator",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VCC_CORE",
                                        "type": "POWER",
                                        "description": "Core CPU voltage rail"
                                },
                                {
                                        "num": "B1",
                                        "name": "VCC_SOC",
                                        "type": "POWER",
                                        "description": "SoC tile voltage rail"
                                },
                                {
                                        "num": "C1",
                                        "name": "VCC_IO",
                                        "type": "POWER",
                                        "description": "I/O tile voltage rail"
                                },
                                {
                                        "num": "AA1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Laptop dead, draws 20V 0.01A on charger, VCC_SOC standby rail shorted to ground",
                                "cause": "Integrated PMIC or filtering MLCC capacitor on VCC_SOC rail shorted",
                                "test": "Check diode drop on VCC_SOC test points around CPU",
                                "expected": "0.25V",
                                "fix": "Locate shorted capacitor with thermal camera and replace it. If SoC is shorted internally, replace board."
                        }
                ],
                "replacements": [
                        "Intel Core Ultra 7 155H"
                ],
                "boards": [
                        "Dell XPS 13 Plus 9340",
                        "Lenovo Yoga Slim 7 14"
                ],
                "tags": [
                        "intel",
                        "cpu",
                        "laptop",
                        "meteor-lake",
                        "npu",
                        "arc-graphics"
                ],
                "custom": false
        },
        {
                "id": "AMD Ryzen 7 7800X3D",
                "category": "CPU / SoC",
                "manufacturer": "AMD",
                "package": "AM5 (LGA-1718)",
                "description": "Zen 4 8-core Desktop Processor with 96MB 3D V-Cache vertical stack",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDDCR_CPU",
                                        "type": "POWER",
                                        "description": "CPU Core power supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VDDCR_SOC",
                                        "type": "POWER",
                                        "description": "SoC/Memory controller power supply"
                                },
                                {
                                        "num": "C1",
                                        "name": "VDDIO_MEM",
                                        "type": "POWER",
                                        "description": "DDR5 memory power supply"
                                },
                                {
                                        "num": "AM1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "PC dead, debug LED locks on 'CPU', physical bulging or burn mark on bottom LGA pads",
                                "cause": "Excessive VDDCR_SOC voltage (early motherboard BIOS exceeded 1.3V) causing thermal runaway and melting the 3D V-Cache silicon",
                                "test": "Measure resistance of VDDCR_SOC rail to GND",
                                "expected": "15 - 30 ohms (good), under 0.5 ohms (shorted)",
                                "fix": "Replace melted Ryzen CPU and update motherboard BIOS to limit SOC voltage to 1.3V."
                        }
                ],
                "replacements": [
                        "AMD Ryzen 7 7800X3D",
                        "AMD Ryzen 7 7700X"
                ],
                "boards": [
                        "ASUS ROG Strix B650-A",
                        "Gigabyte B650 AORUS Elite"
                ],
                "tags": [
                        "amd",
                        "cpu",
                        "desktop",
                        "zen4",
                        "am5",
                        "x3d"
                ],
                "custom": false
        },
        {
                "id": "AMD Ryzen 9 7950X",
                "category": "CPU / SoC",
                "manufacturer": "AMD",
                "package": "AM5 (LGA-1718)",
                "description": "Zen 4 16-core, 32-thread Flagship Desktop Processor",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDDCR_CPU",
                                        "type": "POWER",
                                        "description": "CPU Core power supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VDDCR_SOC",
                                        "type": "POWER",
                                        "description": "SoC power supply"
                                },
                                {
                                        "num": "AM1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "PC powers on but fails to detect DDR5 RAM in dual-channel, works only in single-channel",
                                "cause": "Memory controller inside IO Die damaged by high voltages or bent pins on AM5 socket",
                                "test": "Inspect AM5 socket with microscope, test memory lines with DDR5 slot tester",
                                "expected": "All slot LEDs active and uniform",
                                "fix": "Repair bent LGA socket pins, or replace Ryzen 9 CPU."
                        }
                ],
                "replacements": [
                        "AMD Ryzen 9 7950X",
                        "AMD Ryzen 9 7900X"
                ],
                "boards": [
                        "ASUS ROG Crosshair X670E Hero",
                        "MSI MEG X670E Ace"
                ],
                "tags": [
                        "amd",
                        "cpu",
                        "desktop",
                        "zen4",
                        "am5"
                ],
                "custom": false
        },
        {
                "id": "AMD Ryzen 9 8945HS",
                "category": "CPU / SoC",
                "manufacturer": "AMD",
                "package": "FP7 (BGA)",
                "description": "Hawk Point 8-core Laptop Processor with Ryzen AI NPU and Radeon 780M graphics",
                "pinout": {
                        "pins": [
                                {
                                        "num": "A1",
                                        "name": "VDDCR_CORE",
                                        "type": "POWER",
                                        "description": "CPU Core supply"
                                },
                                {
                                        "num": "B1",
                                        "name": "VDDCR_SOC",
                                        "type": "POWER",
                                        "description": "SoC supply"
                                },
                                {
                                        "num": "AA1",
                                        "name": "GND",
                                        "type": "GND",
                                        "description": "Ground"
                                }
                        ]
                },
                "commonFailures": [
                        {
                                "symptom": "Gaming laptop powers on, keyboard lights up, but screen is black and Radeon graphics fail to initialize",
                                "cause": "Lead-free BGA solder ball fatigue/cracking under the CPU core due to aggressive thermal cycles",
                                "test": "Apply firm downward physical pressure on the CPU heatsink and boot system, or perform reflow test",
                                "expected": "Brief display activity or post with physical pressure indicates cracked BGA balls",
                                "fix": "Reball the AMD BGA CPU or replace the motherboard."
                        }
                ],
                "replacements": [
                        "AMD Ryzen 9 8945HS",
                        "AMD Ryzen 7 8840HS"
                ],
                "boards": [
                        "ASUS ROG Zephyrus G14 (2024)",
                        "Razer Blade 14 (2024)"
                ],
                "tags": [
                        "amd",
                        "cpu",
                        "laptop",
                        "hawk-point",
                        "npu",
                        "radeon"
                ],
                "custom": false
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
