const { contextBridge, ipcRenderer } = require('electron');
// The main process only honors these IPC calls while the local setup.html is active.
contextBridge.exposeInMainWorld('madarSetup', {
  current: () => ipcRenderer.invoke('get-endpoint'),
  save: (value) => ipcRenderer.invoke('save-endpoint', value),
});
