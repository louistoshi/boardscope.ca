/**
 * BoardScope Preload Script
 * This script runs in the renderer process with access to Node.js APIs.
 * It securely exposes IPC methods to the frontend via contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialog methods
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  
  // File system methods
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileBinary: (filePath) => ipcRenderer.invoke('fs:readFileBinary', filePath),
  fileStat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  
  // App methods
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Event listeners
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, filePath) => callback(filePath));
  },

  // Serial port picker — the desktop app's compact CONNECT chooser.
  // The main process sends the port list when a requestPort() needs a
  // human choice; the renderer answers with 'serial-port-pick' ('' to
  // cancel). Both sides must stay in lockstep or requestPort() hangs.
  onSerialPortChoice: (callback) => {
    ipcRenderer.on('serial-port-choice', (event, ports) => callback(ports));
  },
  onSerialPortChoiceClose: (callback) => {
    ipcRenderer.on('serial-port-choice:close', () => callback());
  },
  pickSerialPort: (portId) => ipcRenderer.send('serial-port-pick', portId),

  // Meter connection diagnostics — renderer console lines don't reach the
  // terminal, so the multimeter driver's debug trail is forwarded here and
  // printed by the main process (visible when BoardScope is launched from
  // a terminal).
  meterDebug: (msg) => ipcRenderer.send('meter:debug', msg),
  
  // Platform info
  platform: process.platform,
  isElectron: true,
});
