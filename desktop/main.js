/* ==========================================================================
   desktop/main.js  ::  پوسته‌ی Electron — بازی را در یک پنجره‌ی تمام‌صفحه
   با دسترسی کامل به WebGL اجرا می‌کند. کل کد بازی همان فایل‌های پوشه‌ی
   js/ است و هیچ نسخه‌ی جداگانه‌ای ندارد.
   ========================================================================== */
'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.KAFKHAB_DEV === '1';
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 900,
    minHeight: 540,
    title: 'تکاور ریسینگ — TAKAVAR RACING',
    backgroundColor: '#05070d',
    autoHideMenuBar: true,
    fullscreen: !isDev && process.platform !== 'darwin',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      // بازی به WebGL2/1 و WebAudio نیاز دارد؛ هر دو در Chromium فعال‌اند
      webgl: true
    }
  });

  win.loadFile(path.join(__dirname, '..', 'index.html'));
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // لینک‌های بیرونی در مرورگر باز شوند نه داخل بازی
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

/* ------------------------------------------------------------- میان‌برها */
function registerShortcuts() {
  Menu.setApplicationMenu(null);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); }
    if (input.key === 'F10') { win.setSimpleFullScreen ? win.setSimpleFullScreen(!win.isSimpleFullScreen()) : null; }
    if (input.key === 'Escape' && win.isFullScreen()) { /* Esc داخل بازی = مکث */ }
  });
}

/* IPC: ذخیره‌سازی روی دیسک به‌جای localStorage (اختیاری، بازی خودش
   از localStorage استفاده می‌کند و در Electron پایدار است) */
ipcMain.handle('kafkhab:version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// تک‌نمونه‌ای
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
