#!/usr/bin/env node
/**
 * BoardScope Electron Main Process
 * This file creates the native desktop window and manages the embedded server.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
const SERVER_PORT = 8080;

// ── START LICENSE & PROXY SERVER ────────────────────────────────
function startServer() {
  const expressApp = express();
  expressApp.use(express.json({ limit: '50mb' }));

  // Serve static files (boardview.html, multimeter.js, etc.)
  expressApp.use(express.static(__dirname));

  expressApp.get('/', (req, res) => {
    res.json({ status: 'BoardScope License & Proxy Server v' + app.getVersion() });
  });

  // AI Status
  expressApp.get('/ai-status', (req, res) => {
    const cfg = loadAIConfig();
    res.json({
      configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)', base_url: cfg.baseUrl || '',
      providers: publicAIProviders(readAIConfigFile())
    });
  });

  // AI Setup — upserts one provider into the multi-provider store and makes
  // it active. Re-saving a provider without a key keeps its stored key.
  expressApp.post('/ai-setup', (req, res) => {
    const { provider, key, model, base_url } = req.body;
    if (!provider) return res.status(400).json({ success: false, error: 'No provider given' });
    const store = readAIConfigFile() || { active: null, providers: {} };
    if (!store.providers || typeof store.providers !== 'object') store.providers = {};
    const prev = store.providers[provider] || {};
    const entry = { key: key || prev.key || '' };
    if (model || prev.model) entry.model = model || prev.model;
    if (base_url || prev.base_url) entry.base_url = base_url || prev.base_url;
    if (!entry.key) return res.status(400).json({ success: false, error: 'No API key for provider ' + provider });
    store.providers[provider] = entry;
    store.active = provider;
    try {
      writeAIConfigFile(store);
      res.json({ success: true });
    } catch (err) {
      // The client must see this — it used to be reported as success while
      // every server-side AI feature kept saying "no key configured"
      console.error('[AI] Could not save API config:', err.message);
      res.status(500).json({ success: false, error: 'Could not save API config: ' + err.message });
    }
  });

  // AI Switch — change the active provider (AI-window dropdown). The provider
  // must already be configured; /ai-setup is the way to add one.
  expressApp.post('/ai-switch', (req, res) => {
    const { provider } = req.body || {};
    const store = readAIConfigFile() || { providers: {} };
    const entry = provider && store.providers && store.providers[provider];
    if (!entry || !entry.key) {
      return res.status(400).json({ success: false, error: 'Provider not configured: ' + provider });
    }
    store.active = provider;
    try {
      writeAIConfigFile(store);
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Could not switch provider: ' + err.message });
    }
    const cfg = loadAIConfig();
    res.json({
      success: true,
      configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)', base_url: cfg.baseUrl || '',
      providers: publicAIProviders(store)
    });
  });

  // AI Proxy
  expressApp.post('/ai', async (req, res) => {
    const cfg = loadAIConfig();
    if (!cfg.key) {
      return res.status(503).json({ error: { type: 'no_api_key', message: 'No API key configured.' } });
    }

    const providerDef = AI_PROVIDERS[cfg.provider] || AI_PROVIDERS.anthropic;
    let reqModel = cfg.model;
    if (req.body.model) reqModel = req.body.model;

    // No model configured — resolve the current default from the live list
    if (!reqModel && (cfg.provider === 'openrouter' || cfg.provider === 'google')) {
      reqModel = (await freshDefaultModel(cfg.provider, cfg.key)) || undefined;
    }

    const send = async (modelToUse) => {
      const outBody = providerDef.transform ? providerDef.transform(req.body, modelToUse) : JSON.stringify(req.body);
      let apiPath = providerDef.path;
      if (cfg.provider === 'google') {
        let model = (modelToUse || 'gemini-3.8-flash').replace(/^models\//, '');
        // Google retired Gemini 1.5/2.0 (2026-06-01) and closed 2.5-flash to new
        // API keys (2026-10) — upgrade stale saved config to the current default
        if (/^gemini-(1\.5|2\.0|2\.5)-/.test(model)) model = 'gemini-3.8-flash';
        apiPath = `/v1beta/models/${model}:generateContent?key=${cfg.key}`;
      }
      const options = {
        hostname: providerDef.hostname,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(outBody),
          ...(cfg.provider !== 'google' && providerDef.headers ? providerDef.headers(cfg.key) : {}),
        }
      };
      console.log(`[AI] ${cfg.provider} → ${providerDef.hostname}${apiPath}`);
      return requestUpstream(options, outBody);
    };

    try {
      let usedModel = reqModel;
      let result = await send(usedModel);
      // Stale-model auto-heal — a retired model must never strand an install
      const errMsg = (result.data && result.data.error && result.data.error.message) || '';
      if (result.data && result.data.error && STALE_MODEL_RE.test(errMsg)) {
        const fresh = await freshDefaultModel(cfg.provider, cfg.key, usedModel);
        if (fresh && fresh !== usedModel) {
          console.log(`[AI] Stale model "${usedModel}" — retrying with "${fresh}"`);
          usedModel = fresh;
          result = await send(fresh);
        }
      }
      if (providerDef.normalize) result.data = providerDef.normalize(result.data);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({ error: { type: 'upstream_error', message: err.message } });
    }
  });

  // License Validation
  expressApp.post('/license-validate', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ valid: false, error: 'No key provided' });

    const k = key.trim().toUpperCase();

    // Trial keys embed their own expiry date: BOARDSCOPE-TRIAL-YYYYMMDD
    // (scripts/trial-key.js). Checked locally BEFORE the Polar serial
    // regex below — trial keys match that shape too and Polar rejects
    // them, which dropped licensed installs back to Free.
    if (/^BOARDSCOPE-TRIAL-/.test(k)) {
      if (!/^BOARDSCOPE-TRIAL-[0-9]{8}$/.test(k)) {
        return res.json({ valid: false, error: 'Invalid trial key format — expected BOARDSCOPE-TRIAL-YYYYMMDD (expiry date)' });
      }
      const y = +k.slice(-8, -4), m = +k.slice(-4, -2), d = +k.slice(-2);
      const expiry = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
      const isRealDate = expiry.getUTCFullYear() === y && expiry.getUTCMonth() === m - 1 && expiry.getUTCDate() === d;
      if (!isRealDate || y < 2026 || y > 2099) {
        return res.json({ valid: false, error: 'Invalid trial key date' });
      }
      if (expiry.getTime() <= Date.now()) {
        return res.json({ valid: false, error: `This trial license expired on ${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}. Get Pro at https://boardscope.ca or contact support@boardscope.ca for an extension` });
      }
      return res.json({ valid: true, plan: 'trial', expires: expiry.toISOString() });
    }
    const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);
    const isPolarUUID = /^BOARDSCOPE[-_][0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

    let orgId = process.env.POLAR_ORG_ID;
    if (!orgId) {
      if (isPolarSerial || isPolarUUID) return res.json({ valid: true, plan: 'lifetime', dev_mode: true });
      return res.json({ valid: false, error: 'Invalid license format' });
    }

    const body = JSON.stringify({ key, organization_id: orgId, label: 'boardscope-activation' });
    const options = {
      hostname: 'api.polar.sh',
      path: '/v1/customer-portal/license-keys/validate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };

    const up = https.request(options, upRes => {
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch(_) { data = {}; }
        if (upRes.statusCode === 200 && data.license_key) {
          const lk = data.license_key;
          res.json({ valid: lk.status === 'granted', plan: lk.expires_at ? 'yearly' : 'lifetime', expires: lk.expires_at });
        } else {
          res.json({ valid: false, error: data.detail || 'Key invalid' });
        }
      });
    });
    up.on('error', err => res.json({ valid: false, error: err.message }));
    up.write(body);
    up.end();
  });

  // OBD Proxy Routes
  expressApp.get('/obd-list', (req, res) => {
    proxyOBD(res, 'https://openboarddata.org/');
  });

  expressApp.get('/obd-proxy', (req, res) => {
    const bpath = req.query.bpath;
    if (!bpath || !/^[a-z0-9/_-]+$/i.test(bpath)) {
      return res.status(400).send('Invalid bpath');
    }
    proxyOBD(res, `https://openboarddata.org/?a=generate&bpath=${encodeURIComponent(bpath)}`);
  });

  expressApp.listen(SERVER_PORT, () => {
    console.log(`BoardScope License Server listening on port ${SERVER_PORT}`);
  });
}

// ── LIVE MODEL DEFAULTS ──────────────────────────────────────────
// Hardcoded defaults go stale as providers retire models (Gemini 2.5-flash
// being the latest to strand installs). Resolve defaults from the
// provider's live model list — cached 24 h — and retry once with a fresh
// model when a call dies with a stale-model error.
const STALE_MODEL_RE = /no longer available|not supported|not found|does not exist|deprecat|unsupported|is not available|unknown model|invalid model|not a valid model|no such model|model_not_found/i;
const _liveModelCache = {};

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { headers: { 'User-Agent': 'BoardScope/1.0' }, timeout: 8000 }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); }
      });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.on('error', reject);
  });
}

// Which model to default to: cheap+fast families first (gemini-flash,
// gpt-mini, claude-haiku, qwen, llama), newest version within the family.
function pickDefaultFromList(provider, raw) {
  const ver = id => (String(id).match(/\d+(\.\d+)*/g) || []).map(Number);
  const newer = (a, b) => {
    const va = ver(a), vb = ver(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (va[i] || 0) - (vb[i] || 0);
      if (d) return d;
    }
    return 0;
  };
  if (provider === 'google') {
    const usable = (raw || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'));
    const flash = usable.map(m => String(m.name || '').replace('models/', '')).filter(id => /^gemini-[\d.]+-flash$/.test(id));
    if (flash.length) return flash.sort((a, b) => newer(b, a))[0];
    return usable[0] ? String(usable[0].name).replace('models/', '') : null;
  }
  if (provider === 'openrouter') {
    const FAMILIES = [
      /^google\/gemini-[\d.]+-flash$/,
      /^openai\/gpt-[\d.]+o?-mini/,
      /^anthropic\/claude-[\d.]+.*haiku/,
      /^qwen\/qwen-[\d.]+-/,
      /^meta-llama\/llama-[\d.]+-/,
    ];
    for (const fam of FAMILIES) {
      const hits = (raw || []).filter(m => m.id && fam.test(m.id) && !/preview|beta|latest$|:free$/i.test(m.id));
      if (hits.length) return hits.sort((a, b) => newer(b.id, a.id))[0].id;
    }
    const free = (raw || []).filter(m => m.pricing && String(m.pricing.prompt) === '0');
    return (free[0] && free[0].id) || (raw[0] && raw[0].id) || null;
  }
  return null;
}

async function freshDefaultModel(provider, key, avoidModel) {
  const now = Date.now();
  const c = _liveModelCache[provider];
  if (c && (now - c.ts) < 24 * 3600 * 1000 && c.model !== avoidModel) return c.model;
  try {
    let model = null;
    if (provider === 'openrouter') {
      model = pickDefaultFromList('openrouter', ((await httpsGetJson('https://openrouter.ai/api/v1/models')) || {}).data);
    } else if (provider === 'google' && key) {
      model = pickDefaultFromList('google', ((await httpsGetJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key))) || {}).models);
    }
    if (model) { _liveModelCache[provider] = { model, ts: now }; return model; }
  } catch (_) { }
  return null;
}

function requestUpstream(options, body) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(options, upRes => {
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch (_) { data = {}; }
        resolve({ status: upRes.statusCode, data });
      });
    });
    upstream.on('error', reject);
    upstream.write(body);
    upstream.end();
  });
}

// ── AI PROVIDER HELPERS ──────────────────────────────────────────
const AI_PROVIDERS = {
  anthropic: {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
  },
  openrouter: {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'HTTP-Referer': 'http://localhost:8080', 'X-Title': 'BoardScope' }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const useModel = parsed.model || model || 'qwen/qwen-2.5-72b-instruct';
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return { ...msg, content: msg.content.map(block => (block.type === 'image' && block.source) ? { type: 'image_url', image_url: { url: `data:${block.source.media_type || 'image/jpeg'};base64,${block.source.data}` } } : block) };
      });
      return JSON.stringify({ model: useModel, max_tokens: parsed.max_tokens || 1000, messages });
    },
    normalize: (data) => {
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    }
  },
  openai: {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    headers: (key) => ({ 'Authorization': `Bearer ${key}` }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return { ...msg, content: msg.content.map(block => (block.type === 'image' && block.source) ? { type: 'image_url', image_url: { url: `data:${block.source.media_type || 'image/jpeg'};base64,${block.source.data}` } } : block) };
      });
      return JSON.stringify({ model: model || 'gpt-4o', max_tokens: parsed.max_tokens || 1000, messages });
    },
    normalize: (data) => {
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    }
  },
  google: {
    hostname: 'generativelanguage.googleapis.com',
    headers: (key) => ({ 'Content-Type': 'application/json' }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const userMessage = parsed.messages[parsed.messages.length - 1]?.content || '';
      const parts = Array.isArray(userMessage) ? userMessage.map(block => block.type === 'text' ? { text: block.text } : { inline_data: { mime_type: block.source.media_type || 'image/jpeg', data: block.source.data } }) : [{ text: userMessage }];
      return JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: parsed.max_tokens || 1000, temperature: 0.7 }, systemInstruction: { parts: [{ text: parsed.system || '' }] } });
    },
    normalize: (data) => {
      if (data.error) return data;
      // Thinking models emit thought summaries as extra parts — keep only
      // the answer (parts[0] alone misses it when the first part is a thought)
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(p => p.text && !p.thought).map(p => p.text).join('');
      return { content: [{ type: 'text', text }] };
    }
  }
};

// ── API KEY STORAGE ──────────────────────────────────────────────
// System-wide installs (/opt, /usr) make the app dir root-owned and
// read-only — a .api_key written next to electron-main.js silently failed
// with EACCES, so saving a key in Settings reported success while every
// server-side AI feature (AI Diagnosis, /ai proxy) kept saying "no key
// configured". Store it in the user's data dir instead, still reading the
// legacy file if it exists from an older install.
function apiKeyPaths() {
  const paths = [];
  try { paths.push(path.join(app.getPath('userData'), '.api_key')); } catch (_) { }
  paths.push(path.join(__dirname, '.api_key'));
  return paths;
}

function readApiKeyFile() {
  for (const p of apiKeyPaths()) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  return null;
}

// ── MULTI-PROVIDER AI STORE ──────────────────────────────────────
// .ai_config.json holds every provider the user has configured plus which
// one is active:  { "active": "openrouter",
//                    "providers": { "<id>": { key, model, base_url } } }
// The AI-window provider switcher needs all of them; a single .api_key INI
// could only ever hold one. Same locations as .api_key: userData first,
// legacy app-dir file still read (older installs).
function aiConfigPaths() {
  const paths = [];
  try { paths.push(path.join(app.getPath('userData'), '.ai_config.json')); } catch (_) { }
  paths.push(path.join(__dirname, '.ai_config.json'));
  return paths;
}

function readAIConfigFile() {
  for (const p of aiConfigPaths()) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { }
    }
  }
  return null;
}

function writeAIConfigFile(store) {
  const primary = aiConfigPaths()[0];
  fs.mkdirSync(path.dirname(primary), { recursive: true });
  fs.writeFileSync(primary, JSON.stringify(store, null, 2));
  return primary;
}

// Legacy single-provider .api_key INI → store shape (migrated on first load)
function parseLegacyKeyFile() {
  const content = readApiKeyFile();
  if (content === null) return null;
  const trimmed = content.trim();
  if (trimmed.startsWith('sk-ant-') || trimmed.startsWith('sk-ant_')) {
    return { active: 'anthropic', providers: { anthropic: { key: trimmed } } };
  }
  const entry = {};
  let provider = 'anthropic';
  for (const line of trimmed.split('\n')) {
    const [k, ...v] = line.trim().split('=');
    const val = v.join('=').trim();   // join: keys/values may contain '='
    if (!val) continue;
    if (k === 'provider') provider = val.toLowerCase();
    if (k === 'key') entry.key = val;
    if (k === 'model') entry.model = val;
    if (k === 'base_url') entry.base_url = val;
  }
  if (!entry.key) return null;
  return { active: provider, providers: { [provider]: entry } };
}

// Providers map as the client may see it — never includes keys
function publicAIProviders(store) {
  const out = {};
  for (const [id, e] of Object.entries((store && store.providers) || {})) {
    if (e && e.key) out[id] = { model: e.model || null, base_url: e.base_url || null };
  }
  return out;
}

function loadAIConfig() {
  let provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  let model = process.env.AI_MODEL || null;
  let baseUrl = process.env.AI_BASE_URL || null;

  let store = readAIConfigFile();
  if (!store || !store.providers || !Object.keys(store.providers).length) {
    const legacy = parseLegacyKeyFile();
    if (legacy) {
      store = legacy;
      try { writeAIConfigFile(store); } catch (_) { }
    }
  }
  const providers = (store && store.providers) || {};
  const active = (store && store.active && providers[store.active] && providers[store.active].key)
    ? store.active
    : Object.keys(providers).find(id => providers[id] && providers[id].key);
  if (active) {
    const e = providers[active];
    return { provider: active, key: e.key, model: e.model || null, baseUrl: e.base_url || null };
  }
  return { provider, key, model, baseUrl };
}

/**
 * Proxy request to OpenBoardData.org
 */
function proxyOBD(res, targetUrl) {
  console.log('[OBD] Fetching ' + targetUrl);
  const request = https.get(targetUrl, { 
    headers: { 'User-Agent': 'BoardScope/1.0' },
    timeout: 10000 
  }, function(upstream) {
    res.writeHead(upstream.statusCode, {
      'Content-Type': upstream.headers['content-type'] || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    upstream.pipe(res);
  });
  request.on('error', (err) => {
    console.error('[OBD] Error:', err.message);
    res.status(502).send('OBD error: ' + err.message);
  });
  request.on('timeout', () => {
    request.destroy();
    res.status(504).send('OBD timeout');
  });
  request.end();
}

// ── CREATE WINDOW ──────────────────────────────────────────────────
// Linux WMs scale the 1024×1024 non-alpha source PNG badly into the
// X11 _NET_WM_ICON property (minimized/taskbar entry renders as a blank
// sliver — tester report, v6.0.19). Hand Linux a 256px render instead.
function resolveWindowIcon() {
  if (process.platform === 'linux') {
    const p = path.join(__dirname, 'assets', 'icons', '256x256.png');
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, 'assets', 'icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'BoardScope',
    backgroundColor: '#0d0f12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    icon: resolveWindowIcon(),
  });

  buildMenu();
  setupDeviceAccess(mainWindow.webContents.session);

  waitForServer().then(() => {
    mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}/boardview.html`);
  }).catch(err => {
    console.error('Server failed to start:', err);
    dialog.showErrorBox('Server Error', 'Failed to start BoardScope server. Please restart the application.');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools();
  }
}

// ── WEB SERIAL + WEBUSB (multimeter / oscilloscope) ────────────────
// Electron ships no built-in serial-port or USB-device picker. Unless the
// session's select-serial-port event picks a port, navigator.serial
// .requestPort() rejects with NotFoundError — which multimeter.js treats
// as "user cancelled", so CONNECT did nothing at all in the desktop app
// (every platform — the web build in Chrome was unaffected). The same
// applies to navigator.usb.requestDevice() and select-usb-device, which
// the OWON HDS needs: it's a raw bulk-USB device, never a serial port.
function setupDeviceAccess(ses) {
  const hexId = (v) => { const n = parseInt(v, 16); return Number.isNaN(n) ? -1 : n; };
  const isLocalOrigin = (o) => /^https?:\/\/(127\.0\.0\.1|localhost):/.test(o || '');

  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) =>
    (permission === 'serial' || permission === 'usb') && isLocalOrigin(requestingOrigin));

  // Grants normally die with the WebContents. Pre-granting serial/USB
  // devices keeps them accessible across the OWON HDS firmware's USB
  // teardown/re-enumeration, so drivers can reconnect via
  // navigator.serial.getPorts() / navigator.usb.getDevices().
  ses.setDevicePermissionHandler((details) =>
    (details.deviceType === 'serial' || details.deviceType === 'usb') &&
    isLocalOrigin(details.origin));

  // One pending in-app port picker at a time; a newer request supersedes
  // the older one (its callback resolves as cancelled).
  let pendingPortPick = null;

  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (!portList || portList.length === 0) {
      callback(''); // requestPort() rejects NotFoundError → "cancelled" status
      return;
    }
    // OWON test gear first — it's what the deb ships udev rules for
    const owon = portList.find(p =>
      hexId(p.vendorId) === 0x5345 && hexId(p.productId) === 0x1234);
    if (owon) { callback(owon.portId); return; }
    if (portList.length === 1) { callback(portList[0].portId); return; }
    // Several ports and none is known gear — ask with the in-app picker.
    // A native showMessageBoxSync grew one GTK button per system tty, and
    // keyboards/receivers (they enumerate as serial ports) stretched that
    // dialog to full-screen width at the bottom of the window. The in-app
    // picker is a compact scrollable list; resolving the callback after
    // the user answers is exactly how Electron custom choosers work.
    if (!mainWindow || mainWindow.isDestroyed()) { callback(''); return; }
    // The picker also used to drown the meter in a 30-row scroll of legacy
    // ttyS0–31 ports (tester report, v6.0.19). Keep only USB-looking ports:
    // Chromium stamps vendorId/productId on ports served by its own
    // usbserial driver, but some builds expose just a displayName or a
    // ttyUSB/ttyACM name — accept any of the three signals. No lone-port
    // auto-pick here: an auto-picked wrong/silent port used to sit at
    // "detecting…" forever, and v6.0.20's variant auto-opened ports while
    // our own reconnect logic held the meter — the short list is the
    // predictable behavior.
    const usbLike = (p) => (p.vendorId && p.productId) || p.displayName ||
      /^tty(USB|ACM)\d+$/.test(p.portName || '');
    let shown = portList.filter(usbLike);
    if (shown.length === 0) shown = portList.slice(); // legacy-only system — show everything
    // A device exposing several interfaces appears once per label; keep the
    // first occurrence so one physical port is one button.
    const seenLabels = new Set();
    shown = shown.filter(p => {
      const label = (p.displayName ? p.displayName + ' — ' : '') + (p.portName || p.portId);
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    });
    const wc = mainWindow.webContents;
    if (pendingPortPick) pendingPortPick.finish('');
    let settled = false;
    const onPick = (e, portId) => {
      if (e.sender !== wc || !pendingPortPick) return;
      const hit = portList.find(p => p.portId === portId);
      pendingPortPick.finish(hit ? hit.portId : '');
    };
    pendingPortPick = {
      finish: (portId) => {
        if (settled) return;
        settled = true;
        pendingPortPick = null;
        ipcMain.removeListener('serial-port-pick', onPick);
        wc.send('serial-port-choice:close');
        try { callback(portId); } catch (_) { /* renderer may be gone */ }
      },
    };
    ipcMain.on('serial-port-pick', onPick);
    wc.send('serial-port-choice', shown.map(p => ({
      portId: p.portId,
      label: (p.displayName ? p.displayName + ' — ' : '') + (p.portName || p.portId),
    })));
  });

  // WebUSB — multimeter.js falls back to this when the HDS has no serial
  // port (stock Linux). requestDevice() is filtered to OWON 5345:1234 in
  // the renderer, so the list normally holds exactly that device.
  // Electron's USBDevice carries vendorId/productId as integers.
  ses.on('select-usb-device', (event, details, callback) => {
    event.preventDefault();
    const devices = details.deviceList || [];
    const owon = devices.find(d => d.vendorId === 0x5345 && d.productId === 0x1234);
    if (owon) { callback(owon.deviceId); return; }
    if (devices.length === 1) { callback(devices[0].deviceId); return; }
    callback('');
  });
}

// ── WAIT FOR SERVER ────────────────────────────────────────────────
function waitForServer(maxAttempts = 30, interval = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(`http://127.0.0.1:${SERVER_PORT}`, (res) => {
        resolve();
      }).on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Server did not start in time'));
        }
      });
    };
    check();
  });
}

// ── BUILD MENU ─────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';

  if (!isMac) {
    // Windows/Linux: the in-app menu bar is the app's only menu. Removing
    // the native one avoids a doubled "File Edit View …" bar above it.
    Menu.setApplicationMenu(null);
    return;
  }

  // macOS keeps only the standard app-name menu (About / Services / Hide /
  // Quit). File/Edit/etc. live in the in-app menu bar — repeating them
  // natively showed two stacked menu bars. The hidden Edit submenu keeps
  // copy/paste/undo shortcuts working without a visible duplicate menu.
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      visible: false,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC HANDLERS ───────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('fs:readFile', async (event, filePath) => {
  return fs.readFileSync(filePath, 'utf8');
});

ipcMain.handle('fs:readFileBinary', async (event, filePath) => {
  return fs.readFileSync(filePath).toString('base64');
});

ipcMain.handle('fs:stat', async (event, filePath) => {
  return fs.statSync(filePath);
});

ipcMain.handle('app:getPath', async (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('app:getVersion', async () => {
  return app.getVersion();
});

// ── APP LIFECYCLE ──────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    app.whenReady().then(createWindow);
  }
});

// Handle file associations (open .brd files by double-clicking)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('file-opened', filePath);
  }
});

// Quit and cleanup
app.on('will-quit', () => {
  // Server runs in-process, no cleanup needed
});
