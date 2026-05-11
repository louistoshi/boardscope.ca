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
    res.json({ status: 'BoardScope License & Proxy Server v5.4.1' });
  });

  // AI Status
  expressApp.get('/ai-status', (req, res) => {
    const cfg = loadAIConfig();
    res.json({ configured: !!cfg.key, provider: cfg.provider, model: cfg.model || '(default)' });
  });

  // AI Setup
  expressApp.post('/ai-setup', (req, res) => {
    const { provider, key, model, base_url } = req.body;
    const configPath = path.join(__dirname, '.api_key');
    let content = `provider=${provider}\nkey=${key}`;
    if (model) content += `\nmodel=${model}`;
    if (base_url) content += `\nbase_url=${base_url}`;
    fs.writeFileSync(configPath, content);
    res.json({ success: true });
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

    const upstream = https.request(options, upRes => {
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
  expressApp.post('/license-validate', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ valid: false, error: 'No key provided' });

    const k = key.trim().toUpperCase();
    const isPolarSerial = /^BOARDSCOPE-[A-Z0-9]+-[0-9]+$/.test(k);
    const isPolarUUID = /^BOARDSCOPE_[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(k);

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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { content: [{ type: 'text', text }] };
    }
  }
};

function loadAIConfig() {
  let provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  let key = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || null;
  let model = process.env.AI_MODEL || null;
  const keyFile = path.join(__dirname, '.api_key');
  if (fs.existsSync(keyFile)) {
    const content = fs.readFileSync(keyFile, 'utf8').trim();
    if (content.startsWith('sk-ant-')) { key = content; provider = 'anthropic'; }
    else {
      content.split('\n').forEach(line => {
        const [k, v] = line.trim().split('=');
        if (k === 'provider') provider = v.toLowerCase();
        if (k === 'key') key = v;
        if (k === 'model') model = v;
      });
    }
  }
  return { provider, key, model };
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
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  buildMenu();

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

  const template = [
    ...(isMac ? [{
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
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Board File...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Board Files', extensions: ['brd', 'pdf'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('file-opened', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'About BoardScope',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About BoardScope',
              message: 'BoardScope v1.0.0',
              detail: 'PCB Boardview & Schematic Analysis Tool for board repair\n\n© 2024 BoardScope',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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
