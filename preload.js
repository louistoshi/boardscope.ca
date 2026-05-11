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
  fileStat: (filePath) => ipcRenderer.invoke('fs:stat', filePath),
  
  // App methods
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  
  // Event listeners
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, filePath) => callback(filePath));
  },
  
  // Platform info
  platform: process.platform,
  isElectron: true,
});
