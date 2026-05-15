// With nodeIntegration: true and contextIsolation: false, 
// the renderer can use ipcRenderer directly via require().
// This preload is kept minimal.
const { ipcRenderer } = require('electron');
window.ipcRenderer = ipcRenderer;
