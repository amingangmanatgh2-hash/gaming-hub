const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hamyarSetup', {
  getOrigin: () => ipcRenderer.invoke('get-origin'),
  saveOrigin: (value) => ipcRenderer.invoke('save-origin', value),
  goLocal: () => ipcRenderer.invoke('go-local'),
});
