const { contextBridge, ipcRenderer } = require('electron');
// The main process only honors these IPC calls while the local setup.html is active.
contextBridge.exposeInMainWorld('madarSetup', {
  current: () => ipcRenderer.invoke('get-endpoint'),
  save: (value) => ipcRenderer.invoke('save-endpoint', value),
  retry: () => ipcRenderer.invoke('retry-endpoint'),
  onStatus: (callback) => ipcRenderer.on('endpoint-status', (_event, message) => {
    if (typeof callback === 'function' && typeof message === 'string') callback(message);
  }),
});
