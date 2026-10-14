const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, Menu, session } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

let win;
let origin = '';
const setupFile = join(__dirname, 'setup.html');
function safeOrigin(raw) {
  try {
    const url = new URL(String(raw).trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !/^[a-z0-9.-]+$/.test(host) || !host.includes('.') || /^[\d.]+$/.test(host)
      || host.endsWith('.local') || host.endsWith('.internal')) return '';
    return `https://${host}`;
  } catch { return ''; }
}
function settingsFile() { return join(app.getPath('userData'), 'endpoint.json'); }
function loadOrigin() {
  try { return safeOrigin(JSON.parse(readFileSync(settingsFile(), 'utf8')).origin); }
  catch { return ''; }
}
function saveOrigin(value) { writeFileSync(settingsFile(), JSON.stringify({ origin: value }), { mode: 0o600 }); }
function isSetupSender(event) {
  return event.sender === win?.webContents && event.sender.getURL() === pathToFileURL(setupFile).toString();
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
function showApp() { if (origin) win.loadURL(`${origin}/app`); else win.loadFile(setupFile); }
function makeWindow() {
  win = new BrowserWindow({
    width: 1150, height: 800, minWidth: 760, minHeight: 570, show: false,
    backgroundColor: '#0a111e', title: 'مدار | اپ همراه', icon: join(__dirname, 'icon.ico'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    if (url === pathToFileURL(setupFile).toString()) return;
    let same = false;
    try { same = new URL(url).origin === origin && url.startsWith('https://'); } catch { /* custom scheme */ }
    if (!same) { event.preventDefault(); external(url); }
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  showApp();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'مدار', submenu: [
      { label: 'تغییر آدرس Worker', click: () => win.loadFile(setupFile) },
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
    if (!next) return { ok: false, error: 'آدرس HTTPS معتبر وارد کنید.' };
    origin = next;
    saveOrigin(next);
    showApp();
    return { ok: true };
  });
  makeWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
