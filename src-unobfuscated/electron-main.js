#!/usr/bin/env node
/**
 * BoardScope Electron Main Process
 * This file creates the native desktop window and manages the embedded server.
 */

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 8080;

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
      webSecurity: false, // Allow loading local files
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  // Build the menu
  buildMenu();

  // Wait for server to be ready (for license validation), then load the UI
  waitForServer().then(() => {
    mainWindow.loadFile(path.join(__dirname, 'boardview.html'));
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
  // Start the server process before creating window
  serverProcess = spawn('node', [path.join(__dirname, 'server.js')], {
    cwd: __dirname,
    stdio: 'ignore'
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
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
  if (serverProcess) {
    serverProcess.kill();
  }
});
