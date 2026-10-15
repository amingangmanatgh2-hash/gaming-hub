const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, Menu, session } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { safeOrigin, fetchBootstrap } = require('./endpoint.cjs');

let win;
let origin = '';
let retryTimer;
let generation = 0;
let setupLoading = false;
let statusText = 'در انتظار نشانی Worker…';
const setupFile = join(__dirname, 'setup.html');
const localUrl = pathToFileURL(setupFile).toString();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function settingsFile() { return join(app.getPath('userData'), 'endpoint.json'); }
function loadOrigin() {
  try {
    const saved = safeOrigin(JSON.parse(readFileSync(settingsFile(), 'utf8')).origin);
    if (saved) return saved;
  } catch { /* first launch */ }
  try { return safeOrigin(JSON.parse(readFileSync(join(__dirname, 'build-config.json'), 'utf8')).workerOrigin); }
  catch { return ''; }
}
function saveOrigin(value) { writeFileSync(settingsFile(), JSON.stringify({ origin: value }), { mode: 0o600 }); }
function isSetupSender(event) {
  return event.sender === win?.webContents && event.sender.getURL() === localUrl;
}
function external(url) {
  if (typeof url !== 'string' || url.length > 4096) return;
  if (/^vless:\/\//i.test(url)) {
    shell.openExternal(url).catch(() => {
      clipboard.writeText(url);
      dialog.showMessageBox(win, { type: 'info', message: 'کلاینت VLESS پیدا نشد؛ کانفیگ در کلیپ‌بورد کپی شد.' });
    });
  } else if (/^https:\/\//i.test(url)) {
    shell.openExternal(url).catch(() => {});
  }
}
function status(message) {
  statusText = message;
  if (win && !win.isDestroyed() && win.webContents.getURL() === localUrl) win.webContents.send('endpoint-status', message);
}
function showSetup() {
  if (win && !win.isDestroyed() && win.webContents.getURL() !== localUrl && !setupLoading) {
    setupLoading = true;
    win.loadFile(setupFile).catch(() => {}).finally(() => { setupLoading = false; });
  }
}
function stopChecking() { generation++; clearTimeout(retryTimer); }
function manualSetup() {
  stopChecking();
  status('نشانی Worker را بررسی یا تغییر دهید.');
  showSetup();
}
async function checkAndOpen() {
  const id = ++generation;
  clearTimeout(retryTimer);
  if (!origin) { status('نشانی Worker را وارد کنید.'); showSetup(); return; }
  showSetup();
  status('دریافت تنظیمات تازه از Worker…');
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = await fetchBootstrap(origin);
    if (id !== generation || !win || win.isDestroyed()) return;
    if (result.ok) {
      status(`${result.siteName} آماده است؛ بارگذاری داشبورد…`);
      win.loadURL(result.appUrl).catch(() => {
        if (id !== generation || !win || win.isDestroyed()) return;
        status('صفحه بارگذاری نشد؛ دوباره تلاش می‌کنیم.');
        showSetup();
        retryTimer = setTimeout(checkAndOpen, 12000);
      });
      return;
    }
    if (result.pending) break; // Worker is reachable; admin must finish /setup.
    if (attempt < 2) await pause(300 * (2 ** attempt));
  }
  if (id !== generation) return;
  status(result?.message || 'ارتباط برقرار نشد.');
  // Leave the signed binary unchanged; it automatically recovers after setup/network repair.
  retryTimer = setTimeout(checkAndOpen, result?.pending ? 12000 : 18000);
}
function makeWindow() {
  win = new BrowserWindow({
    width: 1150, height: 800, minWidth: 760, minHeight: 570, show: false,
    backgroundColor: '#0a111e', title: 'مدار | اپ همراه', icon: join(__dirname, 'icon.ico'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { if (win?.webContents.getURL() === localUrl) status(statusText); });
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    if (url === localUrl) return;
    let same = false;
    try { same = new URL(url).origin === origin && url.startsWith('https://'); } catch { /* custom scheme */ }
    if (!same) { event.preventDefault(); external(url); }
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.on('closed', () => { stopChecking(); setupLoading = false; win = null; });
  showSetup();
  if (origin) void checkAndOpen();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'مدار', submenu: [
      { label: 'بررسی دوبارهٔ اتصال', click: () => { if (win) void checkAndOpen(); } },
      { label: 'تغییر آدرس Worker', click: manualSetup },
      { label: 'باز کردن در مرورگر', click: () => origin && external(`${origin}/app`) },
      { type: 'separator' }, { role: 'quit', label: 'خروج' },
    ] },
  ]));
}
app.whenReady().then(() => {
  origin = loadOrigin();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ipcMain.handle('get-endpoint', (event) => isSetupSender(event) ? origin : '');
  ipcMain.handle('save-endpoint', (event, input) => {
    if (!isSetupSender(event)) return { ok: false, error: 'درخواست مجاز نیست.' };
    const next = safeOrigin(input);
    if (!next) return { ok: false, error: 'نشانی عمومی HTTPS بدون مسیر یا پارامتر وارد کنید.' };
    origin = next;
    saveOrigin(next);
    void checkAndOpen();
    return { ok: true };
  });
  ipcMain.handle('retry-endpoint', (event) => {
    if (!isSetupSender(event)) return { ok: false };
    void checkAndOpen();
    return { ok: true };
  });
  makeWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
