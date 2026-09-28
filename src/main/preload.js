const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveCredentials: (creds) => ipcRenderer.invoke('credentials:save', creds),
  loadCredentials: () => ipcRenderer.invoke('credentials:load'),
  clearCredentials: () => ipcRenderer.invoke('credentials:clear'),
  hasSavedCredentials: () => ipcRenderer.invoke('credentials:has-saved'),

  selectExcelFile: () => ipcRenderer.invoke('select-excel-file'),

  startAutomation: (config) => ipcRenderer.invoke('start-automation', config),

  stopAutomation: () => ipcRenderer.invoke('stop-automation'),

  onProgress: (callback) => {
    ipcRenderer.on('automation:progress', (_event, data) => callback(data));
  },
  onLog: (callback) => {
    ipcRenderer.on('automation:log', (_event, line) => callback(line));
  },
  onFinished: (callback) => {
    ipcRenderer.on('automation:finished', (_event, summary) => callback(summary));
  },
  onError: (callback) => {
    ipcRenderer.on('automation:error', (_event, message) => callback(message));
  },
});
