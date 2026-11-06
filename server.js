#!/usr/bin/env node
/**
 * BoardScope Local Proxy Server (Express Version)
 * Run: node server.js
 * Then open: http://localhost:8080
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { trialCheck } = require('./license-validate');

// App version for status routes — read from package.json so it can't drift
// from the release (obfuscated builds without a package.json fall back)
const APP_VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; }
  catch (_) { return '6.0.14'; }
})();

// Handle keygen before server start
if (process.argv[2] === 'keygen') {
  const count = parseInt(process.argv[3] || '1', 10);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = n => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
  console.log('\nBoardScope Pro License Keys:');
  console.log('─'.repeat(32));
  for (let i = 0; i < count; i++) {
    const s1=rand(4), s2=rand(4), s3=rand(4);
    const sum = (s1+s2+s3).split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    const check = String.fromCharCode((sum % 26) + 65);
    const s4 = check + rand(3);
    console.log(`BS-${s1}-${s2}-${s3}-${s4}`);
  }
  console.log('─'.repeat(32) + '\n');
  process.exit(0);
}

const PORT = process.env.PORT || 8080;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// ── PROVIDER CONFIGS ─────────────────────────────────────────────
const PROVIDERS = {
  anthropic: {
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    headers:  (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    transform: (body) => body,
  },
  openrouter: {
    hostname: 'openrouter.ai',
    path:     '/api/v1/chat/completions',
    headers:  (key) => ({
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'http://localhost:8080',
      'X-Title': 'BoardScope',
    }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const useModel = parsed.model || model || 'qwen/qwen-2.5-72b-instruct';
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              const { media_type, data } = block.source;
              return { type: 'image_url', image_url: { url: `data:${media_type || 'image/jpeg'};base64,${data}` } };
            }
            return block;
          })
        };
      });
      return JSON.stringify({ model: useModel, max_tokens: parsed.max_tokens || 1000, messages });
    },
    normalize: (data) => {
      if (data.error) return data;
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    },
  },
  openai: {
    hostname: 'api.openai.com',
    path:     '/v1/chat/completions',
    headers:  (key) => ({ 'Authorization': `Bearer ${key}` }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              const { media_type, data } = block.source;
              return { type: 'image_url', image_url: { url: `data:${media_type || 'image/jpeg'};base64,${data}` } };
            }
            return block;
          })
        };
      });
      return JSON.stringify({ model: model || 'gpt-4o', max_tokens: parsed.max_tokens || 1000, messages });
    },
    normalize: (data) => {
      if (data.error) return data;
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    },
  },
  google: {
    hostname: 'generativelanguage.googleapis.com',
    path: null,
    headers: (key) => ({ 'Content-Type': 'application/json' }),
    transform: (body, model) => {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const userMessage = parsed.messages[parsed.messages.length - 1]?.content || '';
      const parts = [];
      if (Array.isArray(userMessage)) {
        for (const block of userMessage) {
          if (block.type === 'text') parts.push({ text: block.text });
          else if (block.type === 'image' && block.source) parts.push({ inline_data: { mime_type: block.source.media_type || 'image/jpeg', data: block.source.data } });
        }
      } else {
        parts.push({ text: userMessage });
      }
      return JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: parsed.max_tokens || 1000, temperature: 0.7 },
        systemInstruction: { parts: [{ text: parsed.system || '' }] }
      });
    },
    normalize: (data) => {
      if (data.error) return data;
      // Thinking models emit thought summaries as extra parts — keep only
      // the answer (parts[0] alone misses it when the first part is a thought)
      const text = (data.candidates?.[0]?.content?.parts || [])
        .filter(p => p.text && !p.thought).map(p => p.text).join('');
      return { content: [{ type: 'text', text }] };
    },
  }
};

// ── CONFIG LOADING ───────────────────────────────────────────────
// The install dir can be read-only (system-wide installs) — a .api_key
// written there failed with EACCES and every server-side AI feature then
// reported "no key configured". Write to the app dir when possible and
// fall back to ~/.boardscope/, reading from either location.
function apiKeyPaths() {
  return [
    path.join(__dirname, '.api_key'),
    path.join(process.env.HOME || process.env.USERPROFILE || '.', '.boardscope', '.api_key'),
  ];
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
// could only ever hold one. Same two locations as .api_key: app dir first
// (read-only system installs fall back to ~/.boardscope/).
function configPaths() {
  return [
    path.join(__dirname, '.ai_config.json'),
    path.join(process.env.HOME || process.env.USERPROFILE || '.', '.boardscope', '.ai_config.json'),
  ];
}

function readConfigFile() {
  for (const p of configPaths()) {
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { }
    }
  }
  return null;
}

function writeConfigFile(store) {
  try {
    fs.writeFileSync(configPaths()[0], JSON.stringify(store, null, 2));
    return configPaths()[0];
  } catch (_) {
    const fallback = configPaths()[1];
    fs.mkdirSync(path.dirname(fallback), { recursive: true });
    fs.writeFileSync(fallback, JSON.stringify(store, null, 2));
    return fallback;
  }
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
    const val = v.join('=').trim();
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
function publicProviders(store) {
  const out = {};
  for (const [id, e] of Object.entries((store && store.providers) || {})) {
    if (e && e.key) out[id] = { model: e.model || null, base_url: e.base_url || null };
  }
  return out;
}

function loadConfig() {
  let provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  let model = process.env.AI_MODEL || null;
  let baseUrl = process.env.AI_BASE_URL || null;

  let store = readConfigFile();
  if (!store || !store.providers || !Object.keys(store.providers).length) {
    const legacy = parseLegacyKeyFile();
    if (legacy) {
      store = legacy;
      try { writeConfigFile(store); } catch (_) { }
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

// ── ROUTES ───────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ status: 'BoardScope License & Proxy Server v' + APP_VERSION });
});

// AI Status
app.get('/ai-status', (req, res) => {
  const cfg = loadConfig();
  res.json({
    configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)', base_url: cfg.baseUrl || '',
    providers: publicProviders(readConfigFile())
  });
});

// AI Setup — upserts one provider into the multi-provider store and makes
// it active. Re-saving a provider without a key keeps its stored key.
app.post('/ai-setup', (req, res) => {
  const { provider, key, model, base_url } = req.body;
  if (!provider) return res.status(400).json({ success: false, error: 'No provider given' });
  const store = readConfigFile() || { active: null, providers: {} };
  if (!store.providers || typeof store.providers !== 'object') store.providers = {};
  const prev = store.providers[provider] || {};
  const entry = { key: key || prev.key || '' };
  if (model || prev.model) entry.model = model || prev.model;
  if (base_url || prev.base_url) entry.base_url = base_url || prev.base_url;
  if (!entry.key) return res.status(400).json({ success: false, error: 'No API key for provider ' + provider });
  store.providers[provider] = entry;
  store.active = provider;
  try {
    writeConfigFile(store);
    res.json({ success: true });
  } catch (err) {
    // Read-only install with an unwritable home dir — the client must know,
    // it used to treat this as success and diagnosis broke silently
    console.error('[AI] Could not save API config:', err.message);
    res.status(500).json({ success: false, error: 'Could not save API config: ' + err.message });
  }
});

// AI Switch — change the active provider (AI-window dropdown). The provider
// must already be configured; /ai-setup is the way to add one.
app.post('/ai-switch', (req, res) => {
  const { provider } = req.body || {};
  const store = readConfigFile() || { providers: {} };
  const entry = provider && store.providers && store.providers[provider];
  if (!entry || !entry.key) {
    return res.status(400).json({ success: false, error: 'Provider not configured: ' + provider });
  }
  store.active = provider;
  try {
    writeConfigFile(store);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Could not switch provider: ' + err.message });
  }
  const cfg = loadConfig();
  res.json({
    success: true,
    configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)', base_url: cfg.baseUrl || '',
    providers: publicProviders(store)
  });
});

// AI Proxy
app.post('/ai', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg.key) {
    return res.status(503).json({ error: { type: 'no_api_key', message: 'No API key configured.' } });
  }

  const providerDef = PROVIDERS[cfg.provider] || PROVIDERS.anthropic;
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
app.post('/license-validate', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'No key provided' });

  // Simple local validation fallback
  const k = key.trim().toUpperCase();

  // Trial keys carry their own expiry — check before Polar/optimistic paths
  const trial = trialCheck(k);
  if (trial) return res.json(trial);

  const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);
  const isPolarUUID = /^BOARDSCOPE[-_][0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

  // If no Polar config, use optimistic validation
  let orgId = process.env.POLAR_ORG_ID;
  if (!orgId) {
    if (isPolarSerial || isPolarUUID) {
      return res.json({ valid: true, plan: 'lifetime', dev_mode: true });
    }
    return res.json({ valid: false, error: 'Invalid license format' });
  }

  // Real Polar validation
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
        res.json({ valid: false, error: data.detail || 'Key invalid or deactivated' });
      }
    });
  });
  up.on('error', err => res.json({ valid: false, error: err.message }));
  up.write(body);
  up.end();
});

// OBD Proxy
app.get('/obd-list', (req, res) => proxyOBD(res, 'https://openboarddata.org/'));
app.get('/obd-proxy', (req, res) => {
  const bpath = req.query.bpath;
  if (!bpath || !/^[a-z0-9/_-]+$/i.test(bpath)) return res.status(400).send('Invalid bpath');
  proxyOBD(res, `https://openboarddata.org/?a=generate&bpath=${encodeURIComponent(bpath)}`);
});

function proxyOBD(res, targetUrl) {
  console.log('[OBD] Fetching ' + targetUrl);
  const request = https.get(targetUrl, { headers: { 'User-Agent': 'BoardScope/1.0' }, timeout: 10000 }, function(upstream) {
    res.writeHead(upstream.statusCode, {
      'Content-Type': upstream.headers['content-type'] || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    upstream.pipe(res);
  });
  request.on('error', err => res.status(502).send('OBD error: ' + err.message));
  request.on('timeout', () => { request.destroy(); res.status(504).send('OBD timeout'); });
}

app.listen(PORT, () => {
  console.log(`BoardScope Server running at http://localhost:${PORT}`);
});
