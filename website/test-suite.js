/**
 * BoardScope Post-Repair Testing Suite
 * Automated test sequences to verify repairs before returning to customers
 * 
 * Usage:
 *   const testSuite = new TestSuite();
 *   await testSuite.init();
 *   const result = await testSuite.runSuite('macbook-power-on');
 *   testSuite.generateReport(result);
 * 
 * Events:
 *   'suite-started' - Test suite execution began
 *   'test-started' - Individual test started
 *   'test-completed' - Individual test completed
 *   'suite-completed' - All tests completed
 *   'suite-error' - Error during execution
 */

class TestSuite {
  constructor() {
    this.suites = [];
    this.results = [];
    this.running = false;
    this.currentSuite = null;
    this.currentTest = null;
    this._listeners = {};
    
    // Initialize built-in test suites
    this._initBuiltinSuites();
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
  
  // ── TEST EXECUTION ──
  async runSuite(suiteId, options = {}) {
    const suite = this.suites.find(s => s.id === suiteId);
    if (!suite) {
      console.error('[TestSuite] Suite not found:', suiteId);
      return { success: false, error: 'Suite not found' };
    }
    
    if (this.running) {
      console.warn('[TestSuite] Already running a test suite');
      return { success: false, error: 'Already running' };
    }
    
    this.running = true;
    this.currentSuite = suite;
    
    const result = {
      suiteId: suite.id,
      suiteName: suite.name,
      runDate: new Date().toISOString(),
      boardId: options.boardId || 'unknown',
      jobTicket: options.jobTicket || null,
      technician: options.technician || 'Unknown',
      startTime: Date.now(),
      endTime: null,
      duration: null,
      results: [],
      overallStatus: 'RUNNING',
      passCount: 0,
      failCount: 0,
      skipCount: 0,
      notes: []
    };
    
    this.emit('suite-started', { suite, result });
    console.log('[TestSuite] Starting suite:', suite.name);
    
    try {
      for (let i = 0; i < suite.tests.length; i++) {
        if (!this.running) break; // User stopped
        
        const test = suite.tests[i];
        this.currentTest = test;
        
        // Check dependencies
        if (test.dependsOn) {
          const depResult = result.results.find(r => r.testId === test.dependsOn);
          if (depResult && depResult.status === 'FAIL') {
            // Skip this test if dependency failed
            result.results.push({
              testId: test.id,
              testName: test.name,
              status: 'SKIP',
              reason: `Dependency ${test.dependsOn} failed`,
              timestamp: new Date().toISOString()
            });
            result.skipCount++;
            continue;
          }
        }
        
        this.emit('test-started', { test, index: i, total: suite.tests.length });
        
        const testResult = await this._runTest(test);
        result.results.push(testResult);
        
        if (testResult.status === 'PASS') {
          result.passCount++;
        } else if (testResult.status === 'FAIL') {
          result.failCount++;
          
          // Stop if critical test failed
          if (test.critical) {
            console.warn('[TestSuite] Critical test failed, stopping suite');
            break;
          }
        } else if (testResult.status === 'SKIP') {
          result.skipCount++;
        }
        
        this.emit('test-completed', { test, result: testResult, index: i, total: suite.tests.length });
      }
      
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.overallStatus = result.failCount === 0 ? 'PASS' : 'FAIL';
      
      // Save result
      this.results.push(result);
      this._saveResults();
      
      // Update suite stats
      suite.lastRun = result.runDate;
      suite.runCount = (suite.runCount || 0) + 1;
      
      this.running = false;
      this.currentSuite = null;
      this.currentTest = null;
      
      this.emit('suite-completed', { suite, result });
      console.log('[TestSuite] Suite completed:', result.overallStatus);
      
      return { success: true, result };
      
    } catch (error) {
      this.running = false;
      this.currentSuite = null;
      this.currentTest = null;
      
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      result.overallStatus = 'ERROR';
      
      this.emit('suite-error', { suite, error: error.message });
      console.error('[TestSuite] Suite error:', error);
      
      return { success: false, error: error.message, result };
    }
  }
  
  async _runTest(test) {
    const startTime = Date.now();
    
    try {
      let testResult = {
        testId: test.id,
        testName: test.name,
        status: 'RUNNING',
        measured: null,
        expected: test.expected,
        tolerance: test.tolerance,
        unit: test.unit,
        timestamp: new Date().toISOString(),
        duration: null,
        notes: ''
      };
      
      switch (test.type) {
        case 'measurement':
          testResult = await this._testMeasurement(test, testResult);
          break;
        case 'continuity':
          testResult = await this._testContinuity(test, testResult);
          break;
        case 'short-check':
          testResult = await this._testShortCheck(test, testResult);
          break;
        case 'visual':
          testResult = await this._testVisual(test, testResult);
          break;
        default:
          testResult.status = 'SKIP';
          testResult.notes = 'Unknown test type';
      }
      
      testResult.duration = Date.now() - startTime;
      return testResult;
      
    } catch (error) {
      return {
        testId: test.id,
        testName: test.name,
        status: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      };
    }
  }
  
  async _testMeasurement(test, result) {
    // Highlight net on board
    if (typeof activateNet === 'function') activateNet(test.target);

    if (!window.G_meter || !window.G_meter.connected) {
      result.status = 'SKIP';
      result.notes = 'Multimeter not connected';
      return result;
    }

    const reading = await this._waitForStableReading(test.timeout || 5000);

    if (!reading) {
      result.status = 'FAIL';
      result.notes = 'Timeout — no stable reading received';
      return result;
    }

    // Convert mV to V if needed
    const measV = reading.mode === 'mV' ? reading.value / 1000 : reading.value;
    result.measured = parseFloat(measV.toFixed(4));

    const diff = Math.abs(result.measured - test.expected);
    const withinTolerance = diff <= test.tolerance;
    result.status = withinTolerance ? 'PASS' : 'FAIL';
    result.deviation = diff;
    result.notes = withinTolerance
      ? `${result.measured}${test.unit} — within tolerance`
      : `${result.measured}${test.unit}, expected ${test.expected}±${test.tolerance}${test.unit}`;

    return result;
  }

  async _testContinuity(test, result) {
    if (typeof activateNet === 'function') activateNet(test.target);
    result.status = 'SKIP';
    result.notes = 'Continuity test requires manual probe';
    return result;
  }

  async _testShortCheck(test, result) {
    if (typeof activateNet === 'function') activateNet(test.target);

    if (!window.G || !window.G.obd || !window.G.obd.netData) {
      result.status = 'SKIP';
      result.notes = 'No OBD reference data loaded';
      return result;
    }

    const nd = window.G.obd.netData.get(test.target);
    if (!nd) {
      result.status = 'SKIP';
      result.notes = `Net ${test.target} not in OBD data`;
      return result;
    }

    const refDiode = parseFloat(nd.d);
    if (isNaN(refDiode)) {
      result.status = 'SKIP';
      result.notes = 'No diode reference for this net';
      return result;
    }

    result.measured = refDiode;
    if (refDiode < 0.05) {
      result.status = 'FAIL';
      result.notes = `OBD diode reads ${refDiode}V — net may be shorted`;
    } else {
      result.status = 'PASS';
      result.notes = `OBD diode reference OK: ${refDiode}V`;
    }
    return result;
  }

  async _testVisual(test, result) {
    return new Promise((resolve) => {
      this.emit('visual-prompt', {
        test,
        pass: () => {
          result.status = 'PASS';
          result.notes = 'Visual inspection: passed by technician';
          resolve(result);
        },
        fail: () => {
          result.status = 'FAIL';
          result.notes = 'Visual inspection: failed by technician';
          resolve(result);
        }
      });
    });
  }

  async _waitForStableReading(timeout) {
    return new Promise((resolve) => {
      if (!window.G_meter || !window.G_meter.connected) { resolve(null); return; }
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(null); }
      }, timeout);
      window.G_meter.on('stable', function onStable(reading) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(reading);
        }
      });
    });
  }
  
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  stopSuite() {
    this.running = false;
    console.log('[TestSuite] Suite stopped by user');
  }
  
  // ── REPORT GENERATION ──
  generateReport(result) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Report - ${result.suiteName}</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 40px; background: #f5f5f5; }
    .report { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #1a1d24; margin-bottom: 8px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 14px; }
    .status.PASS { background: #d4edda; color: #155724; }
    .status.FAIL { background: #f8d7da; color: #721c24; }
    .meta { color: #666; font-size: 14px; margin-bottom: 32px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .summary-card { background: #f8f9fa; padding: 16px; border-radius: 6px; text-align: center; }
    .summary-number { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
    .summary-label { font-size: 12px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; padding: 12px; background: #f8f9fa; font-size: 12px; text-transform: uppercase; color: #666; }
    td { padding: 12px; border-bottom: 1px solid #e9ecef; }
    .test-pass { color: #28a745; font-weight: 700; }
    .test-fail { color: #dc3545; font-weight: 700; }
    .test-skip { color: #6c757d; }
  </style>
</head>
<body>
  <div class="report">
    <h1>Post-Repair Test Report</h1>
    <div class="status ${result.overallStatus}">${result.overallStatus}</div>
    
    <div class="meta">
      <div><strong>Suite:</strong> ${result.suiteName}</div>
      <div><strong>Board:</strong> ${result.boardId}</div>
      <div><strong>Job Ticket:</strong> ${result.jobTicket || 'N/A'}</div>
      <div><strong>Technician:</strong> ${result.technician}</div>
      <div><strong>Date:</strong> ${new Date(result.runDate).toLocaleString()}</div>
      <div><strong>Duration:</strong> ${(result.duration / 1000).toFixed(1)}s</div>
    </div>
    
    <div class="summary">
      <div class="summary-card">
        <div class="summary-number" style="color:#28a745">${result.passCount}</div>
        <div class="summary-label">Passed</div>
      </div>
      <div class="summary-card">
        <div class="summary-number" style="color:#dc3545">${result.failCount}</div>
        <div class="summary-label">Failed</div>
      </div>
      <div class="summary-card">
        <div class="summary-number" style="color:#6c757d">${result.skipCount}</div>
        <div class="summary-label">Skipped</div>
      </div>
    </div>
    
    <h2>Test Results</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Status</th>
          <th>Measured</th>
          <th>Expected</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${result.results.map(r => `
          <tr>
            <td>${r.testName}</td>
            <td class="test-${r.status.toLowerCase()}">${r.status}</td>
            <td>${r.measured !== null ? r.measured + (r.unit || '') : '—'}</td>
            <td>${r.expected !== null ? r.expected + '±' + r.tolerance + (r.unit || '') : '—'}</td>
            <td>${r.notes || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div style="margin-top: 40px; padding-top: 24px; border-top: 2px solid #e9ecef; color: #666; font-size: 12px;">
      Generated by BoardScope v5.4 · ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>
    `;
    
    return html;
  }
  
  exportReportHTML(result) {
    const html = this.generateReport(result);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${result.suiteId}-${Date.now()}.html`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  exportReportPDF(result) {
    // Generate HTML and trigger print dialog
    const html = this.generateReport(result);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }
  
  // ── SUITE MANAGEMENT ──
  getSuites() {
    return this.suites;
  }
  
  getSuite(suiteId) {
    return this.suites.find(s => s.id === suiteId);
  }
  
  getResults(suiteId = null) {
    if (suiteId) {
      return this.results.filter(r => r.suiteId === suiteId);
    }
    return this.results;
  }
  
  getLatestResult(suiteId) {
    const suiteResults = this.getResults(suiteId);
    return suiteResults.length > 0 ? suiteResults[suiteResults.length - 1] : null;
  }
  
  // ── STORAGE ──
  _saveResults() {
    try {
      // Keep last 50 results
      const toSave = this.results.slice(-50);
      localStorage.setItem('boardscope_test_results', JSON.stringify(toSave));
    } catch (error) {
      console.error('[TestSuite] Save results error:', error);
    }
  }
  
  _loadResults() {
    try {
      const stored = localStorage.getItem('boardscope_test_results');
      this.results = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[TestSuite] Load results error:', error);
      this.results = [];
    }
  }
  
  // ── BUILT-IN TEST SUITES ──

  // Helper: build a measurement test object
  _t(id, name, target, expected, tolerance, unit = 'V', critical = false, dep = null) {
    return {
      id, name, type: 'measurement', target, mode: 'DCV',
      expected, tolerance, unit, critical, timeout: 8000,
      ...(dep ? { dependsOn: dep } : {})
    };
  }

  // Helper: build a standard MacBook power-sequence suite
  _macSuite(id, name, boardModels, description, ppbus = 12.6, extraTests = []) {
    const p = (s) => `${id}-${s}`;
    return {
      id, name, description, boardModels, estimatedDuration: 300000,
      tests: [
        this._t(p('ppbus'),   'PPBUS_G3H',   'PPBUS_G3H',   ppbus, 0.5,  'V', true),
        this._t(p('pp3v42'),  'PP3V42_G3H',  'PP3V42_G3H',  3.42,  0.1,  'V', true,  p('ppbus')),
        this._t(p('pp5v'),    'PP5V_S5',     'PP5V_S5',     5.0,   0.2,  'V', true,  p('pp3v42')),
        this._t(p('pp3v3s5'), 'PP3V3_S5',    'PP3V3_S5',    3.3,   0.1,  'V', true,  p('pp5v')),
        this._t(p('pp3v3s4'), 'PP3V3_S4',    'PP3V3_S4',    3.3,   0.1,  'V', false, p('pp3v3s5')),
        this._t(p('pp1v8'),   'PP1V8_S0',    'PP1V8_S0',    1.8,   0.1,  'V', false, p('pp3v3s4')),
        this._t(p('pp1v05'),  'PP1V05_S0',   'PP1V05_S0',   1.05,  0.05, 'V', false, p('pp1v8')),
        ...extraTests
      ],
      created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
    };
  }

  // Helper: build an iPhone power suite
  _iphoneSuite(id, name, boardModels, description, battV = 3.85) {
    const p = (s) => `${id}-${s}`;
    return {
      id, name, description, boardModels, estimatedDuration: 180000,
      tests: [
        this._t(p('batt'),    'Battery (PP_VCC_MAIN)',  'PP_VCC_MAIN',      battV, 0.4,  'V', true),
        this._t(p('1v8'),     'PP1V8_ALWAYS',           'PP1V8_ALWAYS',     1.8,   0.1,  'V', true,  p('batt')),
        this._t(p('nand'),    'PP3V0_NAND',             'PP3V0_NAND',       3.0,   0.1,  'V', true,  p('1v8')),
        this._t(p('vbus'),    'USB VBUS (charging)',    'USB_VBUS',         5.0,   0.3,  'V', false),
        this._t(p('chgr'),    'CHGR_ACOK',             'CHGR_ACOK',        3.3,   0.2,  'V', false, p('vbus')),
        this._t(p('boost'),   'PPVDD_BOOST (display)', 'PPVDD_BOOST',      5.4,   0.3,  'V', false, p('nand')),
      ],
      created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
    };
  }

  _initBuiltinSuites() {
    const p = (id, s) => `${id}-${s}`;

    this.suites = [
      // ── QUICK / GENERIC ──
      {
        id: 'quick-power',
        name: 'Quick Power Check (Any board)',
        description: 'Fast 3-rail sanity check — use when board model is unknown',
        boardModels: ['All'],
        estimatedDuration: 60000,
        tests: [
          this._t('qp-bus',  'Main Bus',  'PPBUS_G3H', 12.6, 1.0, 'V', true),
          this._t('qp-3v3',  '3.3V Rail', 'PP3V3_S5',  3.3,  0.3, 'V', true),
          this._t('qp-1v8',  '1.8V Rail', 'PP1V8_S0',  1.8,  0.2, 'V', false),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── MacBook Pro 13" Retina 2013-2014 (820-3437) ──
      this._macSuite('mbp13-3437', 'MacBook Pro 13" 2013-14 (820-3437)', ['820-3437-B'],
        'Full power sequence — 820-3437. PPBUS from MagSafe ~16.5V or battery ~12.6V.',
        12.6, [this._t(p('mbp13-3437','smc'), 'SMC_RESET_L', 'SMC_RESET_L', 3.3, 0.2, 'V', false, p('mbp13-3437','pp1v05'))]),

      // ── MacBook Pro 15" Retina 2013-2014 (820-3787) ──
      this._macSuite('mbp15-3787', 'MacBook Pro 15" 2013-14 (820-3787)', ['820-3787-A'],
        'Full power sequence — 820-3787. Check PPBUS via MagSafe 85W adapter.'),

      // ── MacBook Pro 13" 2015 (820-4924) ──
      this._macSuite('mbp13-4924', 'MacBook Pro 13" 2015 (820-4924)', ['820-4924-A'],
        'Power sequence — 820-4924. ISL6259 charger. Confirm PP3V42 before attempting boot.'),

      // ── MacBook Pro 13" 2016 Touch Bar (820-00165) ──
      this._macSuite('mbp13-00165', 'MacBook Pro 13" 2016 Touch Bar (820-00165)', ['820-00165-A'],
        'USB-C board. PPBUS from USB-C PD negotiation (~20V→converted). PP3V42 from ISL9240.',
        12.6, [this._t(p('mbp13-00165','pd'), 'USBC_VBUS', 'USBC_VBUS', 20.0, 2.0, 'V', true)]),

      // ── MacBook Pro 13" 2016 No Touch Bar (820-00923) ──
      this._macSuite('mbp13-00923', 'MacBook Pro 13" 2016 No TB (820-00923)', ['820-00923-A'],
        'USB-C, no Touch Bar — 820-00923. Same ISL9240 charger as 00165 but different SMC.',
        12.6),

      // ── MacBook Pro 13" 2017 (820-00850) ──
      this._macSuite('mbp13-00850', 'MacBook Pro 13" 2017 (820-00850)', ['820-00850-A'],
        'Kaby Lake — 820-00850. USB-C charging. PP3V42_G3H is first rail after PPBUS.'),

      // ── MacBook Pro 13" 2018-2019 Touch Bar (820-01521) ──
      this._macSuite('mbp13-01521', 'MacBook Pro 13" 2018-19 (820-01521)', ['820-01521-A'],
        'Coffee Lake — 820-01521. T2 chip controls power sequence. Check PP3V42 first.',
        12.6, [this._t(p('mbp13-01521','t2'), 'PP3V3_S0SW_T2', 'PP3V3_S0SW_T2', 3.3, 0.1, 'V', false, p('mbp13-01521','pp1v05'))]),

      // ── MacBook Pro 16" 2019 (820-01814) ──
      this._macSuite('mbp16-01814', 'MacBook Pro 16" 2019 (820-01814)', ['820-01814-A'],
        'Ice Lake — 820-01814. T2 chip. Higher current demands on 1V05 and VCORE rails.',
        12.6, [this._t(p('mbp16-01814','vcore'), 'PPVCORE_S0', 'PPVCORE_S0', 1.0, 0.15, 'V', false, p('mbp16-01814','pp1v05'))]),

      // ── MacBook Pro 13" 2020 Intel (820-01987) ──
      this._macSuite('mbp13-01987', 'MacBook Pro 13" 2020 Intel (820-01987)', ['820-01987-A'],
        'Ice Lake — 820-01987. T2 chip. Last Intel 13" MBP. USB-C only.'),

      // ── MacBook Pro 13" M1 2020 (820-02390) ──
      {
        id: 'mbp13-m1',
        name: 'MacBook Pro 13" M1 2020 (820-02390)',
        description: 'Apple Silicon — 820-02390. No T2, no Intel ME. PMU integrated in M1. Different rail names.',
        boardModels: ['820-02390-A'],
        estimatedDuration: 300000,
        tests: [
          this._t('m1-ppbus',   'PPBUS_G3H',       'PPBUS_G3H',       12.6, 0.5,  'V', true),
          this._t('m1-pp3v42',  'PP3V42_G3H',      'PP3V42_G3H',      3.42, 0.1,  'V', true,  'm1-ppbus'),
          this._t('m1-pp3v3s5', 'PP3V3_S5',        'PP3V3_S5',        3.3,  0.1,  'V', true,  'm1-pp3v42'),
          this._t('m1-pp1v8',   'PP1V8_S0',        'PP1V8_S0',        1.8,  0.1,  'V', false, 'm1-pp3v3s5'),
          this._t('m1-pp0v9',   'PP0V9_S0',        'PP0V9_S0',        0.9,  0.05, 'V', false, 'm1-pp1v8'),
          this._t('m1-ppddr',   'PPDDR_S0 (LPDDR)', 'PPDDR_S0',      1.1,  0.05, 'V', false, 'm1-pp0v9'),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── MacBook Air 13" 2013-2014 (820-3598) ──
      this._macSuite('mba13-3598', 'MacBook Air 13" 2013-14 (820-3598)', ['820-3598-A'],
        'Haswell Air — 820-3598. MagSafe 2. Similar sequence to MBP 3437.'),

      // ── MacBook Air 13" 2018-2019 (820-01521 / 820-00165 variant) ──
      this._macSuite('mba13-2019', 'MacBook Air 13" 2019 (820-01598)', ['820-01598-A'],
        'USB-C Air — 820-01598. No T2 chip. Simpler than MBP. PP3V42 key first checkpoint.'),

      // ── MacBook Air M1 2020 (820-02388) ──
      {
        id: 'mba-m1',
        name: 'MacBook Air M1 2020 (820-02388)',
        description: 'Apple Silicon Air — 820-02388. No fan. Check PPBUS then follow M1 rail sequence.',
        boardModels: ['820-02388-A'],
        estimatedDuration: 240000,
        tests: [
          this._t('mba-m1-ppbus',  'PPBUS_G3H',    'PPBUS_G3H',    12.6, 0.5,  'V', true),
          this._t('mba-m1-pp3v42', 'PP3V42_G3H',   'PP3V42_G3H',   3.42, 0.1,  'V', true,  'mba-m1-ppbus'),
          this._t('mba-m1-pp3v3',  'PP3V3_S5',     'PP3V3_S5',     3.3,  0.1,  'V', true,  'mba-m1-pp3v42'),
          this._t('mba-m1-pp1v8',  'PP1V8_S0',     'PP1V8_S0',     1.8,  0.1,  'V', false, 'mba-m1-pp3v3'),
          this._t('mba-m1-pp0v9',  'PP0V9_S0',     'PP0V9_S0',     0.9,  0.05, 'V', false, 'mba-m1-pp1v8'),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── MacBook 12" 2015-2016 (820-00138) ──
      this._macSuite('mb12-00138', 'MacBook 12" 2015-16 (820-00138)', ['820-00138-A', '820-00239-A'],
        'Single USB-C board — 820-00138/00239. TPS65982 USB-C controller. PPBUS from USB-C PD.',
        12.0),

      // ── iMac 27" 2017 (820-00951) ──
      {
        id: 'imac27-2017',
        name: 'iMac 27" 2017 (820-00951)',
        description: 'Kaby Lake iMac — 820-00951. PSU rails differ from MacBook. Check 12V standby first.',
        boardModels: ['820-00951-A'],
        estimatedDuration: 360000,
        tests: [
          this._t('imac17-12v',   '12V Standby',     'PP12V_G3H',    12.0, 0.5,  'V', true),
          this._t('imac17-5v',    '5V Standby',      'PP5V_G3H',     5.0,  0.2,  'V', true,  'imac17-12v'),
          this._t('imac17-3v42',  'PP3V42_G3H',      'PP3V42_G3H',   3.42, 0.1,  'V', true,  'imac17-5v'),
          this._t('imac17-3v3s5', 'PP3V3_S5',        'PP3V3_S5',     3.3,  0.1,  'V', true,  'imac17-3v42'),
          this._t('imac17-1v8',   'PP1V8_S0',        'PP1V8_S0',     1.8,  0.1,  'V', false, 'imac17-3v3s5'),
          this._t('imac17-1v05',  'PP1V05_S0',       'PP1V05_S0',    1.05, 0.05, 'V', false, 'imac17-1v8'),
          this._t('imac17-gpu',   'PPVCORE_GPU',     'PPVCORE_GPU',  1.0,  0.1,  'V', false, 'imac17-1v05'),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── Mac Mini 2018 (820-00939) ──
      {
        id: 'macmini-2018',
        name: 'Mac Mini 2018 (820-00939)',
        description: 'Coffee Lake Mini — 820-00939. T2 chip. External PSU brick. Check PPBUS first.',
        boardModels: ['820-00939-A'],
        estimatedDuration: 300000,
        tests: [
          this._t('mm18-ppbus',   'PPBUS_G3H',    'PPBUS_G3H',    12.6, 0.5,  'V', true),
          this._t('mm18-pp3v42',  'PP3V42_G3H',   'PP3V42_G3H',   3.42, 0.1,  'V', true,  'mm18-ppbus'),
          this._t('mm18-pp3v3s5', 'PP3V3_S5',     'PP3V3_S5',     3.3,  0.1,  'V', true,  'mm18-pp3v42'),
          this._t('mm18-pp1v8',   'PP1V8_S0',     'PP1V8_S0',     1.8,  0.1,  'V', false, 'mm18-pp3v3s5'),
          this._t('mm18-pp1v05',  'PP1V05_S0',    'PP1V05_S0',    1.05, 0.05, 'V', false, 'mm18-pp1v8'),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── iPhone 11 / 11 Pro ──
      this._iphoneSuite('iph11', 'iPhone 11 / 11 Pro Power', ['iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max'],
        'Power and charging rails for iPhone 11 family. Battery nominal 3.85V.'),

      // ── iPhone 12 / 12 Pro ──
      this._iphoneSuite('iph12', 'iPhone 12 / 12 Pro Power', ['iPhone 12', 'iPhone 12 Pro', 'iPhone 12 Pro Max'],
        'iPhone 12 family. A14 SoC. USB-C PD charging via USBC controller.'),

      // ── iPhone 13 / 13 Pro ──
      this._iphoneSuite('iph13', 'iPhone 13 / 13 Pro Power', ['iPhone 13', 'iPhone 13 Pro', 'iPhone 13 Pro Max'],
        'iPhone 13 family. A15 SoC. Check PP1V8_ALWAYS before probing CPU area.'),

      // ── iPhone 14 / 14 Pro ──
      this._iphoneSuite('iph14', 'iPhone 14 / 14 Pro Power', ['iPhone 14', 'iPhone 14 Pro', 'iPhone 14 Pro Max'],
        'iPhone 14 family. A15/A16. Crash detection added. Same charging rail names.'),

      // ── iPhone 15 / 15 Pro ──
      this._iphoneSuite('iph15', 'iPhone 15 / 15 Pro Power', ['iPhone 15', 'iPhone 15 Pro', 'iPhone 15 Pro Max'],
        'iPhone 15 family. A16/A17 Pro. USB-C replaces Lightning. VBUS now from USB-C PD.'),

      // ── iPad Pro 11" 2021 (M1) ──
      {
        id: 'ipad-pro-m1',
        name: 'iPad Pro 11" / 12.9" 2021 (M1)',
        description: 'M1 iPad Pro. Similar rail structure to M1 MacBook but with display boost rail.',
        boardModels: ['iPad Pro 11" 2021', 'iPad Pro 12.9" 2021'],
        estimatedDuration: 240000,
        tests: [
          this._t('ipadm1-batt',  'BATT_SYS',           'BATT_SYS',         3.85, 0.4,  'V', true),
          this._t('ipadm1-1v8',   'PP1V8_ALWAYS',       'PP1V8_ALWAYS',     1.8,  0.1,  'V', true,  'ipadm1-batt'),
          this._t('ipadm1-3v0',   'PP3V0_NAND',         'PP3V0_NAND',       3.0,  0.1,  'V', true,  'ipadm1-1v8'),
          this._t('ipadm1-lcd',   'LCD_VDD',            'LCD_VDD',          3.3,  0.1,  'V', false, 'ipadm1-3v0'),
          this._t('ipadm1-bklt',  'LCD_VDDIO (boost)',  'LCD_BKLT',         20.0, 2.0,  'V', false, 'ipadm1-lcd'),
          this._t('ipadm1-vbus',  'USB VBUS (charging)','USB_VBUS',         5.0,  0.3,  'V', false),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },

      // ── iPad Air 4th Gen ──
      {
        id: 'ipad-air4',
        name: 'iPad Air 4th Gen (A14)',
        description: 'iPad Air 4 — A14 Bionic, USB-C. First iPad Air with USB-C charging.',
        boardModels: ['iPad Air 4th Gen 2020'],
        estimatedDuration: 200000,
        tests: [
          this._t('air4-batt', 'BATT_SYS',       'BATT_SYS',       3.85, 0.4, 'V', true),
          this._t('air4-1v8',  'PP1V8_ALWAYS',   'PP1V8_ALWAYS',   1.8,  0.1, 'V', true,  'air4-batt'),
          this._t('air4-nand', 'PP3V0_NAND',     'PP3V0_NAND',     3.0,  0.1, 'V', true,  'air4-1v8'),
          this._t('air4-lcd',  'LCD_VDD',        'LCD_VDD',        3.3,  0.1, 'V', false, 'air4-nand'),
          this._t('air4-vbus', 'USB VBUS',       'USB_VBUS',       5.0,  0.3, 'V', false),
        ],
        created: '2026-04-18T00:00:00.000Z', lastRun: null, runCount: 0
      },
    ];

    // Load saved results
    this._loadResults();
  }

  // ── AI-GENERATED SUITES ──
  addAISuite(query, parsed) {
    const id = 'ai-' + Date.now();
    const tests = (parsed.tests || []).map((t, i) => ({
      id: `${id}-t${i}`,
      name: t.name || t.target || `Test ${i+1}`,
      type: 'measurement',
      target: t.target || t.name || '',
      mode: 'DCV',
      expected: parseFloat(t.expected) || 0,
      tolerance: parseFloat(t.tolerance) || 0.2,
      unit: t.unit || 'V',
      critical: !!t.critical,
      timeout: 8000
    }));
    const suite = {
      id,
      name: (parsed.name || query).slice(0, 60),
      description: parsed.description || `AI power sequence for: ${query}`,
      boardModels: [query],
      estimatedDuration: tests.length * 10000,
      tests,
      created: new Date().toISOString(),
      lastRun: null,
      runCount: 0,
      aiGenerated: true
    };
    this.suites.push(suite);
    return suite;
  }
}

// Export for use in BoardScope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TestSuite;
}
