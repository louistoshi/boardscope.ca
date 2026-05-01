#!/usr/bin/env node
/**
 * BoardScope Local Proxy Server
 * Run: node server.js
 * Then open: http://localhost:8080
 *
 * ── AI PROVIDER SETUP ─────────────────────────────────────────────
 * Configure via environment variables or a .api_key config file.
 *
 * OPTION 1 — Anthropic direct:
 *   ANTHROPIC_API_KEY=sk-ant-...  node server.js
 *
 * OPTION 2 — OpenRouter (access Claude, GPT-4, Gemini, Llama etc.):
 *   AI_PROVIDER=openrouter
 *   AI_API_KEY=sk-or-...
 *   AI_MODEL=anthropic/claude-sonnet-4          (or any OpenRouter model)
 *   node server.js
 *
 * OPTION 3 — OpenAI:
 *   AI_PROVIDER=openai
 *   AI_API_KEY=sk-...
 *   AI_MODEL=gpt-4o
 *   node server.js
 *
 * OPTION 4 — Any OpenAI-compatible endpoint (Ollama, LM Studio, etc.):
 *   AI_PROVIDER=openai_compat
 *   AI_API_KEY=ollama          (some local servers don't need a real key)
 *   AI_BASE_URL=http://localhost:11434/v1
 *   AI_MODEL=llama3
 *   node server.js
 *
 * OPTION 5 — .api_key config file (easier than env vars):
 *   Create a file called .api_key next to server.js with content like:
 *
 *   provider=openrouter
 *   key=sk-or-v1-...
 *   model=anthropic/claude-sonnet-4
 *
 *   Or for Anthropic direct (just one line):
 *   sk-ant-api03-...
 * ──────────────────────────────────────────────────────────────────
 */

const http  = require('http');
const https = require('https');
const http_ = require('http');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// Handle keygen before port parsing

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

const PORT = parseInt(process.argv[2] || '8080', 10);
const DIR  = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

// ── PROVIDER CONFIGS ─────────────────────────────────────────────
const PROVIDERS = {
  anthropic: {
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    headers:  (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    // Anthropic uses its own message format — pass through directly
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
      const parsed = JSON.parse(body);
      // Prefer: 1) model from request body, 2) model from config, 3) fallback
      const useModel = parsed.model || model || 'qwen/qwen-2.5-72b-instruct';
      // Convert Anthropic-style image content blocks to OpenAI format
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              const { media_type, data } = block.source;
              const mimeType = media_type || 'image/jpeg';
              return {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` }
              };
            }
            return block;
          })
        };
      });
      return JSON.stringify({
        model: useModel,
        max_tokens: parsed.max_tokens || 1000,
        messages,
      });
    },
    // Convert OpenAI response → Anthropic format
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
      const parsed = JSON.parse(body);
      // Convert Anthropic-style image content blocks to OpenAI format
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              const { media_type, data } = block.source;
              const mimeType = media_type || 'image/jpeg';
              return {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` }
              };
            }
            return block;
          })
        };
      });
      return JSON.stringify({
        model: model || 'gpt-4o',
        max_tokens: parsed.max_tokens || 1000,
        messages,
      });
    },
    normalize: (data) => {
      if (data.error) return data;
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    },
  },
  openai_compat: {
    // Generic OpenAI-compatible: Ollama, LM Studio, Together AI, Groq, Mistral, etc.
    hostname: null, // set from AI_BASE_URL
    path:     '/v1/chat/completions',
    headers:  (key) => ({ 'Authorization': `Bearer ${key}` }),
    transform: (body, model) => {
      const parsed = JSON.parse(body);
      // Convert Anthropic-style image content blocks to OpenAI format
      const messages = (parsed.messages || []).map(msg => {
        if (!Array.isArray(msg.content)) return msg;
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              // Anthropic format: { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '...' } }
              // OpenAI format: { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
              const { media_type, data } = block.source;
              const mimeType = media_type || 'image/jpeg';
              return {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${data}` }
              };
            }
            return block;
          })
        };
      });
      return JSON.stringify({
        model: model || 'grok-3-mini',
        max_tokens: parsed.max_tokens || 1000,
        messages,
      });
    },
    normalize: (data) => {
      if (data.error) return data;
      const text = data.choices?.[0]?.message?.content || '';
      return { content: [{ type: 'text', text }] };
    },
  },
  google: {
    hostname: 'generativelanguage.googleapis.com',
    path:     null, // set dynamically with model name
    headers:  (key) => ({ 'Content-Type': 'application/json' }),
    // Convert Anthropic format → Google Gemini format
    transform: (body, model) => {
      const parsed = JSON.parse(body);
      const userMessage = parsed.messages[parsed.messages.length - 1]?.content || '';
      
      // Build parts array — support text + images
      const parts = [];
      if (Array.isArray(userMessage)) {
        for (const block of userMessage) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image' && block.source) {
            const { media_type, data } = block.source;
            parts.push({
              inline_data: { mime_type: media_type || 'image/jpeg', data }
            });
          }
        }
      } else {
        // Plain text message
        parts.push({ text: userMessage });
      }
      
      return JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: parsed.max_tokens || 1000,
          temperature: 0.7,
        },
        systemInstruction: {
          parts: [{ text: parsed.system || '' }]
        }
      });
    },
    normalize: (data) => {
      if (data.error) return data;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { content: [{ type: 'text', text }] };
    },
  },
};

// ── CONFIG LOADING ───────────────────────────────────────────────
function loadConfig() {
  // Start with environment variables
  let provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let key      = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  let model    = process.env.AI_MODEL || null;
  let baseUrl  = process.env.AI_BASE_URL || null;

  // Override with .api_key file if present
  const keyFile = path.join(DIR, '.api_key');
  if (fs.existsSync(keyFile)) {
    const content = fs.readFileSync(keyFile, 'utf8').trim();
    if (content.startsWith('sk-ant-') || content.startsWith('sk-ant_')) {
      // Plain Anthropic key — backward compatible
      key = content; provider = 'anthropic';
    } else {
      // Parse key=value format
      for (const line of content.split('\n')) {
        const [k, ...v] = line.trim().split('=');
        const val = v.join('=').trim();
        if (!val) continue;
        if (k === 'provider') provider = val.toLowerCase();
        if (k === 'key')      key = val;
        if (k === 'model')    model = val;
        if (k === 'base_url') baseUrl = val;
      }
    }
  }

  return { provider, key, model, baseUrl };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function proxyOBD(res, targetUrl) {
  console.log('[OBD] Fetching ' + targetUrl);
  
  const request = https.get(targetUrl, { 
    headers: { 'User-Agent': 'BoardScope/1.0' },
    timeout: 10000 // 10 second timeout
  }, function(upstream) {
    console.log(`[OBD] Response status: ${upstream.statusCode}`);
    res.writeHead(upstream.statusCode, {
      'Content-Type': upstream.headers['content-type'] || 'text/plain',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    upstream.pipe(res);
  });
  
  request.on('error', function(err) {
    console.error('[OBD] Request Error:', err.message);
    res.writeHead(502);
    res.end('OBD fetch error: ' + err.message);
  });
  
  request.on('timeout', function() {
    console.error('[OBD] Request Timeout');
    request.destroy();
    res.writeHead(504);
    res.end('OBD fetch timeout');
  });
  
  request.end();
}

// ── AI PROXY ────────────────────────────────────────────────────
async function proxyAI(req, res) {
  const cfg = loadConfig();

  if (!cfg.key) {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: {
      type: 'no_api_key',
      message: 'No API key configured.\n\nQuick setup options:\n\n' +
        '① Google Gemini (FREE):\n   AI_PROVIDER=google AI_API_KEY=YOUR_GOOGLE_KEY node server.js\n\n' +
        '② Anthropic:\n   ANTHROPIC_API_KEY=sk-ant-... node server.js\n\n' +
        '③ OpenRouter (Claude, GPT-4, Gemini, Llama):\n   AI_PROVIDER=openrouter AI_API_KEY=sk-or-... node server.js\n\n' +
        '④ OpenAI:\n   AI_PROVIDER=openai AI_API_KEY=sk-... node server.js\n\n' +
        '⑤ .api_key file (next to server.js):\n   provider=google\n   key=YOUR_GOOGLE_KEY\n\n' +
        'Get keys at:\n  Google: https://aistudio.google.com/apikey\n  Anthropic: console.anthropic.com\n  OpenRouter: openrouter.ai/keys'
    }}));
    return;
  }

  const providerDef = PROVIDERS[cfg.provider] || PROVIDERS.anthropic;
  let body;
  try { body = await readBody(req); } catch(e) { res.writeHead(400); res.end('Bad request'); return; }

  // Transform request body for non-Anthropic providers
  // Prefer model from request body, fallback to config file model
  let reqModel = cfg.model;
  try {
    const parsed = JSON.parse(body);
    if (parsed.model) reqModel = parsed.model;
  } catch(_) {}
  const outBody = providerDef.transform ? providerDef.transform(body, reqModel) : body;

  // Determine hostname
  let hostname = providerDef.hostname;
  let apiPath  = providerDef.path;
  if (cfg.provider === 'openai_compat' && cfg.baseUrl) {
    try {
      const u = new URL(cfg.baseUrl);
      hostname = u.hostname;
      apiPath  = u.pathname.replace(/\/$/, '') + '/chat/completions';
    } catch(_) {}
  }
  if (cfg.provider === 'google') {
    const model = (cfg.model || 'gemini-2.0-flash').replace(/^models\//, '');
    apiPath = `/v1beta/models/${model}:generateContent?key=${cfg.key}`;
  }

  console.log(`[AI] ${cfg.provider}${cfg.model ? ' / ' + cfg.model : ''} → ${hostname}${apiPath}`);

  const isHttps = cfg.provider !== 'openai_compat' || (cfg.baseUrl||'').startsWith('https');
  const reqLib  = isHttps ? https : http_;

  const options = {
    hostname,
    port: isHttps ? 443 : (cfg.baseUrl ? parseInt(new URL(cfg.baseUrl).port)||80 : 80),
    path: apiPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(outBody),
      ...(cfg.provider !== 'google' && providerDef.headers ? providerDef.headers(cfg.key) : {}),
    }
  };

  const upstream = reqLib.request(options, upRes => {
    const chunks = [];
    upRes.on('data', c => chunks.push(c));
    upRes.on('end', () => {
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch(_) { data = {}; }
      
      // Log error details for debugging
      if (upRes.statusCode >= 400) {
        console.error(`[AI] ${upRes.statusCode} Response:`, JSON.stringify(data, null, 2));
      }
      
      // Normalize to Anthropic format if needed
      if (providerDef.normalize) data = providerDef.normalize(data);
      console.log(`[AI] Response ← ${upRes.statusCode}`);
      res.writeHead(upRes.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(data));
    });
  });

  upstream.on('error', err => {
    console.error('[AI] Error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: { type: 'upstream_error', message: err.message } }));
  });

  upstream.write(outBody);
  upstream.end();
}

// ── MAIN SERVER ──────────────────────────────────────────────────
// ── MAIN SERVER ──────────────────────────────────────────────────
var server = http.createServer(async function(req, res) {
  // Use WHATWG URL API instead of url.parse()
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams);
  
  // For compatibility with existing code that uses parsed.query
  const parsed = { query, pathname };
  // ...

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(); return;
  }

  if (pathname === '/ai' && req.method === 'POST') { await proxyAI(req, res); return; }

  // ── POLAR LICENSE VALIDATION ──────────────────────────────────────────────
  // Validates a Polar license key server-side so the org_id stays secret.
  // Set POLAR_ORG_ID in your environment or .polar_config file.
  if (pathname === '/license-validate' && req.method === 'POST') {
    const json = await readBody(req);
    let key;
    try { key = JSON.parse(json).key; } catch(_) {}

    if (!key) {
      res.writeHead(400, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify({valid:false, error:'No key provided'}));
      return;
    }

    // Load Polar org ID from env or config file
    let orgId = process.env.POLAR_ORG_ID;
    const polarCfgPath = require('path').join(__dirname, '.polar_config');
    if (!orgId && require('fs').existsSync(polarCfgPath)) {
      const lines = require('fs').readFileSync(polarCfgPath,'utf8').trim().split('\n');
      for (const line of lines) {
        const [k,...v] = line.split('=');
        if (k.trim() === 'org_id') orgId = v.join('=').trim();
      }
    }

    if (!orgId) {
      // No Polar config — accept key optimistically (dev mode)
      // In production always set POLAR_ORG_ID
      console.warn('[License] POLAR_ORG_ID not set — accepting key in dev mode');
      res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify({valid:true, plan:'lifetime', dev_mode:true}));
      return;
    }

    // Call Polar validation API
    const body = JSON.stringify({
      key,
      organization_id: orgId,
      label: 'boardscope-activation',
    });

    const options = {
      hostname: 'api.polar.sh',
      path: '/v1/customer-portal/license-keys/validate',
      method: 'POST',
      port: 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const https = require('https');
    const up = https.request(options, upRes => {
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch(_) { data = {}; }

        if (upRes.statusCode === 200 && data.license_key) {
          const lk      = data.license_key;
          const valid   = lk.status === 'granted';
          const expires = lk.expires_at || null;
          // Detect plan from expiry — no expiry = lifetime, has expiry = yearly
          const plan    = expires ? 'yearly' : 'lifetime';

          if (valid && expires && new Date(expires) < new Date()) {
            res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
            res.end(JSON.stringify({valid:false, error:'Your yearly license has expired. Renew at thelogiclab.app to continue using Pro features.'}));
            return;
          }

          res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({valid, plan, expires}));
        } else {
          const errMsg = data.detail || data.error || 'Key not found or already deactivated';
          res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
          res.end(JSON.stringify({valid:false, error: errMsg}));
        }
      });
    });

    up.on('error', err => {
      res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
      res.end(JSON.stringify({valid:false, error:'Could not reach Polar servers: ' + err.message}));
    });

    up.write(body);
    up.end();
    return;
  }

  if (pathname === '/ai-status' && req.method === 'GET') {
    const cfg = loadConfig();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      configured: !!cfg.key,
      provider: cfg.provider,
      model: cfg.model || '(default)',
    }));
    return;
  }

  if (pathname === '/ai-setup' && req.method === 'POST') {
    const body = await readBody(req);
    const { provider, key, model, base_url } = JSON.parse(body);
    
    const configPath = path.join(DIR, '.api_key');
    let content = `provider=${provider}\nkey=${key}`;
    if (model) content += `\nmodel=${model}`;
    if (base_url) content += `\nbase_url=${base_url}`;
    
    fs.writeFileSync(configPath, content);
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({success: true}));
    return;
  }

  if (pathname === '/ai-list-models' && req.method === 'GET') {
    const cfg = loadConfig();
    if (!cfg.key || cfg.provider !== 'google') {
      res.writeHead(400, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify({error: 'Google provider not configured'}));
      return;
    }

    // Call Google's listModels API
    const listOptions = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models?key=${cfg.key}`,
      method: 'GET',
    };

    const listReq = https.request(listOptions, (upRes) => {
      const chunks = [];
      upRes.on('data', c => chunks.push(c));
      upRes.on('end', () => {
        const rawText = Buffer.concat(chunks).toString();
        
        // Check if response is HTML (indicates 404 or error page)
        if (rawText.trim().startsWith('<')) {
          console.error('[AI] Google API returned HTML (likely 404):', rawText.substring(0, 200));
          res.writeHead(502, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          res.end(JSON.stringify({error: 'Google API returned an error page. Check your API key and model name.'}));
          return;
        }
        
        let data;
        try { data = JSON.parse(rawText); } catch(e) {
          console.error('[AI] List models response was not JSON:', rawText.substring(0, 200));
          res.writeHead(502, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          res.end(JSON.stringify({error: 'Invalid response from Google API: ' + e.message}));
          return;
        }
        
        if (upRes.statusCode === 200 && data.models) {
          const models = data.models.map(m => ({
            name: m.name.replace('models/', ''),
            displayName: m.displayName,
            version: m.version,
            supportedMethods: m.supportedGenerationMethods || []
          }));
          res.writeHead(200, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          res.end(JSON.stringify({models}));
        } else {
          console.error('[AI] Google API error:', upRes.statusCode, data);
          res.writeHead(upRes.statusCode, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
          res.end(JSON.stringify({ error: data.error?.message || 'Failed to list models', details: data }));
        }
      });
    });

    listReq.on('error', (err) => {
      console.error('[AI] List models request error:', err.message);
      res.writeHead(502, {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify({error: err.message}));
    });

    listReq.end();
    return;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX: Added the missing /obd-list route
  // This returns a list of available board paths for the frontend to search.
  // ─────────────────────────────────────────────────────────────────────────
  if (pathname === '/obd-list') {
    // This URL points to the raw directory listing structure of the OBD dataset.
    // The frontend uses a regex to find the board path.
    // We are proxying the root of openboarddata.org which returns an HTML page
    // containing links to the board files.
    proxyOBD(res, 'https://openboarddata.org/');
    return;
  }

  if (pathname === '/obd-proxy') {
    var bpath = parsed.query.bpath;
    if (!bpath || !/^[a-z0-9/_-]+$/i.test(bpath)) { res.writeHead(400); res.end('Invalid bpath'); return; }
    proxyOBD(res, 'https://openboarddata.org/?a=generate&bpath=' + encodeURIComponent(bpath));
    return;
  }

  // Serve service worker for PWA
  if (pathname === '/sw.js') {
    const swPath = path.join(DIR, 'sw.js');
    if (fs.existsSync(swPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' });
      fs.createReadStream(swPath).pipe(res);
      return;
    }
  }

  // Serve manifest for PWA
  if (pathname === '/manifest.json') {
    const manifestPath = path.join(DIR, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      fs.createReadStream(manifestPath).pipe(res);
      return;
    }
  }

  var filePath = path.join(DIR, pathname === '/' ? 'boardview.html' : pathname);
  if (!filePath.startsWith(DIR)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, function(err, stat) {
    if (err || !stat.isFile()) {
      filePath = path.join(DIR, 'boardview.html');
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    }
    var ext  = path.extname(filePath);
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', function() {
  const cfg = loadConfig();
  const providerLabel = {
    anthropic:    'Anthropic (direct)',
    openrouter:   'OpenRouter',
    openai:       'OpenAI',
    openai_compat:'OpenAI-compatible',
  }[cfg.provider] || cfg.provider;

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║          BoardScope Server               ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log('  ║  Open:  http://localhost:' + PORT + '             ║');
  console.log('  ║  Stop:  Ctrl + C                         ║');
  console.log('  ╠══════════════════════════════════════════╣');
  if (cfg.key) {
    console.log('  ║  AI  ✓  ' + (providerLabel + ' ').padEnd(33) + '║');
    if (cfg.model) console.log('  ║         Model: ' + cfg.model.padEnd(26) + '║');
  } else {
    console.log('  ║  AI  ✗  No key — AI features disabled   ║');
    console.log('  ║         See server.js for setup options  ║');
  }
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});