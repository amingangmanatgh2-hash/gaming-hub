/* همیار پلاس — پوستهٔ ویندوز (Electron)
   قانون ساده: اینترنت و سایت باشد ← نسخهٔ آنلاینِ سایت؛ نباشد ← نسخهٔ سبک لوکالِ همراه برنامه (app/).
   هر ۳۰ ثانیه و هنگام برگشت شبکه دوباره بررسی می‌کند و بی‌صدا به آنلاین سوئیچ می‌کند. */
const { app, BrowserWindow, ipcMain, shell, Menu, session, net } = require('electron');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { safeOrigin, fetchBootstrap } = require('./endpoint.cjs');

let win;
let origin = '';
let onlineMode = false;
let generation = 0;
let retryTimer;
const localIndex = join(__dirname, 'app', 'index.html');
const setupFile = join(__dirname, 'setup.html');
const localUrl = pathToFileURL(localIndex).toString();
const setupUrl = pathToFileURL(setupFile).toString();

const settingsFile = () => join(app.getPath('userData'), 'endpoint.json');
function loadOrigin() {
  try { const saved = safeOrigin(JSON.parse(readFileSync(settingsFile(), 'utf8')).origin); if (saved) return saved; } catch { /* اولین اجرا */ }
  try { return safeOrigin(JSON.parse(readFileSync(join(__dirname, 'build-config.json'), 'utf8')).siteOrigin); } catch { return ''; }
}
function saveOrigin(value) { try { writeFileSync(settingsFile(), JSON.stringify({ origin: value }), { mode: 0o600 }); } catch { /* بدون ذخیره هم کار می‌کند */ } }

function loadLocal() {
  onlineMode = false;
  if (!win || win.isDestroyed()) return;
  const current = win.webContents.getURL();
  if (current !== localUrl && existsSync(localIndex)) win.loadFile(localIndex).catch(() => {});
  win.setTitle('همیار پلاس 📦 (لوکال/آفلاین)');
}
function scheduleRecheck() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { if (!onlineMode) void checkSite(false); }, 30000);
}
async function checkSite(firstRun) {
  const id = ++generation;
  if (!origin) { loadLocal(); return; }
  const result = await fetchBootstrap(origin);
  if (id !== generation || !win || win.isDestroyed()) return;
  if (result.ok) {
    if (!onlineMode) {
      onlineMode = true;
      win.setTitle('همیار پلاس 🟢 (آنلاین)');
      win.loadURL(result.appUrl).catch(() => { if (id === generation) { loadLocal(); scheduleRecheck(); } });
    }
  } else {
    if (firstRun || onlineMode) loadLocal();
    scheduleRecheck();
  }
}

function isSetupSender(event) { return event.sender === win?.webContents && event.sender.getURL() === setupUrl; }

function makeWindow() {
  win = new BrowserWindow({
    width: 1150, height: 820, minWidth: 720, minHeight: 560, show: false,
    backgroundColor: '#0b1026', title: 'همیار پلاس', icon: join(__dirname, 'icon.ico'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    if (url === localUrl || url === setupUrl || url.startsWith(localUrl + '#')) return; // ناوبری داخل نسخهٔ لوکال
    let same = false;
    try { same = origin && new URL(url).origin === origin; } catch { /* طرح‌های دیگر */ }
    if (!same) { event.preventDefault(); if (/^https:\/\//i.test(url)) void shell.openExternal(url); }
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && onlineMode && code !== -3) { loadLocal(); scheduleRecheck(); }
  });
  win.on('closed', () => { generation++; clearTimeout(retryTimer); win = null; });

  // اول فوری نسخهٔ لوکال را نشان بده تا کاربر منتظر نماند، بعد اگر سایت بود سوئیچ کن
  loadLocal();
  if (origin) void checkSite(true);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'همیار پلاس', submenu: [
      { label: '🔄 بررسی دوبارهٔ اتصال به سایت', click: () => { onlineMode = false; void checkSite(false); } },
      { label: '📦 رفتن به نسخهٔ لوکال (آفلاین)', click: () => { generation++; loadLocal(); } },
      { label: '☁️ تغییر آدرس سایت…', click: () => { generation++; win?.loadFile(setupFile).catch(() => {}); } },
      { label: '🌐 باز کردن سایت در مرورگر', click: () => { if (origin) void shell.openExternal(origin + '/'); } },
      { type: 'separator' }, { role: 'quit', label: 'خروج' },
    ] },
    { label: 'نمایش', submenu: [{ role: 'reload', label: 'بازنشانی' }, { role: 'zoomIn', label: 'درشت‌تر' }, { role: 'zoomOut', label: 'ریزتر' }, { role: 'resetZoom', label: 'اندازهٔ پیش‌فرض' }, { role: 'togglefullscreen', label: 'تمام‌صفحه' }] },
  ]));
}

app.whenReady().then(() => {
  origin = loadOrigin();
  session.defaultSession.setPermissionRequestHandler((_c, _p, cb) => cb(false));
  ipcMain.handle('get-origin', (event) => (isSetupSender(event) ? origin : ''));
  ipcMain.handle('save-origin', (event, input) => {
    if (!isSetupSender(event)) return { ok: false, error: 'درخواست مجاز نیست.' };
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) { origin = ''; saveOrigin(''); generation++; loadLocal(); return { ok: true, local: true }; }
    const next = safeOrigin(raw);
    if (!next) return { ok: false, error: 'نشانی عمومی HTTPS بدون مسیر وارد کنید؛ مثل https://hamyar-plus.pages.dev' };
    origin = next; saveOrigin(next); onlineMode = false; loadLocal(); void checkSite(true);
    return { ok: true };
  });
  ipcMain.handle('go-local', (event) => { if (!isSetupSender(event)) return { ok: false }; generation++; loadLocal(); return { ok: true }; });
  net.online = true;
  makeWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) makeWindow(); });
