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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { content: [{ type: 'text', text }] };
    },
  }
};

// ── CONFIG LOADING ───────────────────────────────────────────────
function loadConfig() {
  let provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  let model = process.env.AI_MODEL || null;
  let baseUrl = process.env.AI_BASE_URL || null;

  const keyFile = path.join(__dirname, '.api_key');
  if (fs.existsSync(keyFile)) {
    const content = fs.readFileSync(keyFile, 'utf8').trim();
    if (content.startsWith('sk-ant-') || content.startsWith('sk-ant_')) {
      key = content; provider = 'anthropic';
    } else {
      for (const line of content.split('\n')) {
        const [k, ...v] = line.trim().split('=');
        const val = v.join('=').trim();
        if (!val) continue;
        if (k === 'provider') provider = val.toLowerCase();
        if (k === 'key') key = val;
        if (k === 'model') model = val;
        if (k === 'base_url') baseUrl = val;
      }
    }
  }
  return { provider, key, model, baseUrl };
}

// ── ROUTES ───────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ status: 'BoardScope License & Proxy Server v5.4.1' });
});

// AI Status
app.get('/ai-status', (req, res) => {
  const cfg = loadConfig();
  res.json({ configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)' });
});

// AI Setup
app.post('/ai-setup', (req, res) => {
  const { provider, key, model, base_url } = req.body;
  const configPath = path.join(__dirname, '.api_key');
  let content = `provider=${provider}\nkey=${key}`;
  if (model) content += `\nmodel=${model}`;
  if (base_url) content += `\nbase_url=${base_url}`;
  fs.writeFileSync(configPath, content);
  res.json({ success: true });
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

  const outBody = providerDef.transform ? providerDef.transform(req.body, reqModel) : JSON.stringify(req.body);

  let hostname = providerDef.hostname;
  let apiPath = providerDef.path;
  if (cfg.provider === 'google') {
    const model = (reqModel || 'gemini-2.0-flash').replace(/^models\//, '');
    apiPath = `/v1beta/models/${model}:generateContent?key=${cfg.key}`;
  }

  console.log(`[AI] ${cfg.provider} → ${hostname}${apiPath}`);

  const options = {
    hostname,
    path: apiPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(outBody),
      ...(cfg.provider !== 'google' && providerDef.headers ? providerDef.headers(cfg.key) : {}),
    }
  };

  const lib = https;
  const upstream = lib.request(options, upRes => {
    const chunks = [];
    upRes.on('data', c => chunks.push(c));
    upRes.on('end', () => {
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch(_) { data = {}; }
      if (providerDef.normalize) data = providerDef.normalize(data);
      res.status(upRes.statusCode).json(data);
    });
  });

  upstream.on('error', err => {
    res.status(502).json({ error: { type: 'upstream_error', message: err.message } });
  });

  upstream.write(outBody);
  upstream.end();
});

// License Validation
app.post('/license-validate', async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ valid: false, error: 'No key provided' });

  // Simple local validation fallback
  const k = key.trim().toUpperCase();
  const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);
  const isPolarUUID = /^BOARDSCOPE_[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

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
