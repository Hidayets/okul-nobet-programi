import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

// Uygulama ismini açıkça sabitle. Aksi halde Electron app.getName() çağrısı
// package.json'daki "name" alanına bakar; bu da bundle sürecine göre değişebilir.
// Sabitleyince app.getPath('userData') her sürümde aynı klasörü döndürür.
// → %APPDATA%/okul-nobet-programi
app.setName('okul-nobet-programi');

// Native dialog'u kapatmak için flag - frontend kendi UI'sını gösterir
const USE_NATIVE_UPDATE_DIALOG = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const isDev   = process.env.NODE_ENV === 'development';
const PORT    = 3000;

let mainWindow   = null;
let serverProcess = null;
let appMode = null; // 'server' | 'client'
let serverUrl = `http://localhost:${PORT}`;

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
autoUpdater.logger = console;

autoUpdater.on('checking-for-update', () => {
  console.log('Güncelleme kontrol ediliyor...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
});

autoUpdater.on('update-available', (info) => {
  console.log('Güncelleme mevcut:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'available',
      version: info.version,
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Uygulama güncel.');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'not-available',
      version: info?.version,
    });
  }
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Güncelleme indirildi:', info.version);

  // Kurulum tetiklenmeden önce veritabanını mutlaka yedekle.
  // Mevcut mimaride DB install dizininin dışında (AppData\Local) tutulduğu
  // için NSIS güncelleme onu zaten silmez; bu yedek "ek güvence" amaçlıdır.
  try {
    const res = backupDatabase('pre-update');
    if (mainWindow && res.ok) {
      mainWindow.webContents.send('backup-status', {
        status: 'created',
        reason: 'pre-update',
        path: res.path,
      });
    }
  } catch (err) {
    console.warn('[backup] update-downloaded yedeği başarısız:', err?.message || err);
  }

  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'downloaded',
      version: info.version,
    });
  }

  if (USE_NATIVE_UPDATE_DIALOG) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Güncelleme Hazır',
      message: `Yeni sürüm (v${info.version}) indirildi.`,
      detail: 'Güncellemeyi yüklemek için uygulama yeniden başlatılacak.',
      buttons: ['Şimdi Yeniden Başlat', 'Sonra'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        // isSilent=true: NSIS wizard'ı gösterme, sessiz kur ve uygulamayı yeniden aç.
        autoUpdater.quitAndInstall(true, true);
      }
    });
  }
});

autoUpdater.on('error', (err) => {
  console.error('Güncelleme hatası:', err?.message || err);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', {
      status: 'error',
      message: err?.message || 'Bilinmeyen hata',
    });
  }
});

// Renderer → Main: manuel kontrol ve kurulum tetikleyicileri
ipcMain.handle('updater:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, currentVersion: app.getVersion(), updateInfo: result?.updateInfo || null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    // Kurulumdan hemen önce son bir yedek daha al (savunmacı katman).
    try { backupDatabase('pre-update'); } catch {}
    // isSilent=true: NSIS sihirbazı gösterilmez, sessiz kurulum yapılır.
    // isForceRunAfter=true: kurulum sonrası uygulama otomatik açılır.
    // Bu kombinasyon "ilk defa kuruluyormuş gibi" hissini ortadan kaldırır.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// ───── Yedekleme IPC'leri ─────
ipcMain.handle('backup:create', async () => {
  return backupDatabase('manual');
});

ipcMain.handle('backup:list', async () => {
  return listBackups();
});

ipcMain.handle('backup:open-folder', async () => {
  try {
    ensureBackupDir();
    await shell.openPath(BACKUP_DIR);
    return { ok: true, path: BACKUP_DIR };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('backup:get-paths', async () => {
  return {
    dbFile: DB_FILE,
    backupDir: BACKUP_DIR,
    dbExists: fs.existsSync(DB_FILE),
    externalDir: getExternalBackupDir(),
  };
});

// Ek yedek konumunu kullanıcıya seçtir (OneDrive/Drive/USB klasörü gibi)
ipcMain.handle('backup:pick-external-dir', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow || undefined, {
      title: 'Ek yedek klasörü seçin (OneDrive/Drive klasörü önerilir)',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Bu klasörü kullan',
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    const chosen = result.filePaths[0];
    // Yazma izni testi: gerçekten yazabiliyor muyuz?
    try {
      const probe = path.join(chosen, '.okulnobet-write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
    } catch {
      return { ok: false, error: 'Seçilen klasöre yazma izniniz yok. Başka bir klasör seçin.' };
    }
    const settings = loadBackupSettings();
    settings.externalDir = chosen;
    saveBackupSettings(settings);
    return { ok: true, path: chosen };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('backup:clear-external-dir', async () => {
  try {
    const settings = loadBackupSettings();
    delete settings.externalDir;
    saveBackupSettings(settings);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// "Yedeği indir": mevcut DB'nin (veya seçilen yedeğin) kopyasını kullanıcının
// belirlediği konuma kaydeder. USB/Drive/manual transfer için.
ipcMain.handle('backup:download', async (_evt, sourcePath) => {
  try {
    const src = (typeof sourcePath === 'string' && sourcePath) ? sourcePath : DB_FILE;
    if (!fs.existsSync(src)) {
      return { ok: false, error: 'Kaynak dosya bulunamadı.' };
    }
    const ts = new Date().toISOString().split('T')[0];
    const defaultName = path.basename(src).startsWith('database-')
      ? path.basename(src)
      : `okul-nobet-yedek-${ts}.sqlite`;
    const result = await dialog.showSaveDialog(mainWindow || undefined, {
      title: 'Yedeği nereye kaydedelim?',
      defaultPath: defaultName,
      filters: [
        { name: 'SQLite Veritabanı', extensions: ['sqlite'] },
        { name: 'Tüm dosyalar', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    fs.copyFileSync(src, result.filePath);
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('app:get-info', () => {
  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    appMode,
    serverUrl,
  };
});

// Ayar dosyası: mod ve sunucu IP'si saklanır.
//
// Bağlantı ayarlarını sabit bir konumda tutuyoruz:
//   %LOCALAPPDATA%\OkulNobetProgrami\connection-settings.json
//
// Bu klasör veritabanıyla aynı yerde, install dizinin DIŞINDA. NSIS update
// onu silmediği gibi, app.getName()/productName değişikliklerine karşı da
// bağışıklık sağlar. Eski sürümlerde dosya app.getPath('userData') altındaydı;
// orada bulursak otomatik olarak yeni konuma taşıyoruz (geriye dönük uyumluluk).
const SETTINGS_DIR  = path.join(os.homedir(), 'AppData', 'Local', 'OkulNobetProgrami');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'connection-settings.json');

// Eski (userData tabanlı) konumlardan yeni sabit konuma taşı.
// Birkaç olası eski isim deneriz: app.getName() değişmiş olabilir.
function migrateLegacySettings() {
  if (fs.existsSync(SETTINGS_FILE)) return; // Yeni konum hazırsa dokunma.
  const candidates = [];
  try { candidates.push(path.join(app.getPath('userData'), 'connection-settings.json')); } catch {}
  // Olası eski productName tabanlı yollar
  const appDataRoaming = path.join(os.homedir(), 'AppData', 'Roaming');
  for (const name of ['okul-nobet-programi', 'Okul Nöbet Programı', 'okul-nobet']) {
    candidates.push(path.join(appDataRoaming, name, 'connection-settings.json'));
  }
  for (const oldPath of candidates) {
    try {
      if (oldPath && fs.existsSync(oldPath)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
        fs.copyFileSync(oldPath, SETTINGS_FILE);
        console.log('[settings] Eski konumdan yeni konuma taşındı:', oldPath, '→', SETTINGS_FILE);
        return;
      }
    } catch (err) {
      console.warn('[settings] Migration sırasında hata:', err?.message || err);
    }
  }
}

function getSettingsPath() {
  return SETTINGS_FILE;
}

function loadSettings() {
  try {
    migrateLegacySettings();
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('[settings] Yazma hatası:', err?.message || err);
  }
}

function getIconPath() {
  if (isDev) return path.join(__dirname, '..', 'build', 'icon.ico');
  return path.join(process.resourcesPath, 'icon.ico');
}

async function waitForServer(url, maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return true;
    } catch { /* henüz hazır değil */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

function startServer() {
  if (isDev) return;
  const exeDir = path.dirname(app.getPath('exe'));
  const serverExe = path.join(exeDir, 'OkulNobet.exe');

  serverProcess = spawn(serverExe, [], {
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  });

  serverProcess.on('error', (err) => {
    console.error('Sunucu başlatılamadı:', err.message);
  });
}

function createMainWindow(url) {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Okul Nöbet Programı',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    if (!linkUrl || linkUrl === '' || linkUrl === 'about:blank') return { action: 'allow' };
    if (linkUrl.startsWith(url)) return { action: 'allow' };
    if (linkUrl.startsWith('http')) shell.openExternal(linkUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  ipcMain.removeAllListeners('print-page');
  ipcMain.on('print-page', () => {
    if (mainWindow) mainWindow.webContents.print({ silent: false });
  });
}

// Mod seçim penceresi
function createSetupWindow() {
  return new Promise((resolve) => {
    const iconPath = getIconPath();

    const setupWin = new BrowserWindow({
      width: 520,
      height: 480,
      resizable: false,
      title: 'Okul Nöbet Programı — Bağlantı Ayarı',
      icon: iconPath,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
      },
      show: false,
      backgroundColor: '#0f172a',
      autoHideMenuBar: true,
    });

    setupWin.setMenuBarVisibility(false);
    setupWin.removeMenu();

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 32px; user-select: none; }
  h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 6px; }
  .sub { color: #94a3b8; font-size: 0.85rem; margin-bottom: 28px; text-align: center; line-height: 1.5; }
  .cards { display: flex; gap: 16px; width: 100%; }
  .card { flex: 1; background: #1e293b; border: 2px solid #334155; border-radius: 14px; padding: 24px 18px; text-align: center; cursor: pointer; transition: all 0.2s; }
  .card:hover { border-color: #818cf8; transform: translateY(-3px); box-shadow: 0 12px 30px rgba(79,70,229,0.2); }
  .card.active { border-color: #818cf8; background: #1e1b4b; }
  .card .icon { font-size: 2.2rem; margin-bottom: 10px; }
  .card h2 { font-size: 1rem; font-weight: 700; margin-bottom: 6px; }
  .card p { font-size: 0.78rem; color: #94a3b8; line-height: 1.4; }
  .ip-section { margin-top: 20px; width: 100%; display: none; }
  .ip-section.show { display: block; }
  .ip-section label { font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 6px; }
  .ip-section input { width: 100%; padding: 10px 14px; border-radius: 8px; border: 2px solid #334155; background: #1e293b; color: #f1f5f9; font-size: 0.95rem; font-family: monospace; outline: none; transition: border-color 0.2s; }
  .ip-section input:focus { border-color: #818cf8; }
  .ip-section .hint { font-size: 0.75rem; color: #64748b; margin-top: 6px; }
  .btn { margin-top: 24px; width: 100%; padding: 12px; border-radius: 10px; border: none; background: #4f46e5; color: white; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
  .btn:hover { background: #4338ca; }
  .btn:disabled { opacity: 0.4; cursor: default; }
</style></head><body>
  <h1>Okul Nöbet Programı</h1>
  <p class="sub">Bu bilgisayar nasıl çalışsın?</p>
  <div class="cards">
    <div class="card" id="cardServer" onclick="selectMode('server')">
      <div class="icon">🖥️</div>
      <h2>Ana Bilgisayar</h2>
      <p>Programı ilk kuran bilgisayar. Veritabanı burada tutulur.</p>
    </div>
    <div class="card" id="cardClient" onclick="selectMode('client')">
      <div class="icon">💻</div>
      <h2>Bağlanan Bilgisayar</h2>
      <p>Ana bilgisayara bağlanır. Aynı şifre ile giriş yapar.</p>
    </div>
  </div>
  <div class="ip-section" id="ipSection">
    <label>Ana Bilgisayarın IP Adresi</label>
    <input type="text" id="ipInput" placeholder="Örn: 192.168.1.50" oninput="validateIp()">
    <div class="hint">Ana bilgisayarda uygulama açıkken başlık çubuğundaki IP adresini buraya girin.</div>
  </div>
  <button class="btn" id="startBtn" onclick="start()" disabled>Başla</button>
<script>
  const { ipcRenderer } = require('electron');
  let mode = null;
  function selectMode(m) {
    mode = m;
    document.getElementById('cardServer').classList.toggle('active', m === 'server');
    document.getElementById('cardClient').classList.toggle('active', m === 'client');
    document.getElementById('ipSection').classList.toggle('show', m === 'client');
    if (m === 'server') { document.getElementById('startBtn').disabled = false; }
    else { validateIp(); }
  }
  function validateIp() {
    const val = document.getElementById('ipInput').value.trim();
    document.getElementById('startBtn').disabled = !val;
  }
  function start() {
    const ip = document.getElementById('ipInput').value.trim();
    ipcRenderer.send('setup-done', { mode, serverIp: ip || '' });
  }
</script></body></html>`;

    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const tmpPath = path.join(SETTINGS_DIR, 'setup.html');
    fs.writeFileSync(tmpPath, html);
    setupWin.loadFile(tmpPath);

    setupWin.once('ready-to-show', () => setupWin.show());

    ipcMain.once('setup-done', (_e, data) => {
      setupWin.close();
      resolve(data);
    });

    setupWin.on('closed', () => {
      resolve(null);
    });
  });
}

// Sunucu modunda başlık çubuğunda IP göster
function getLocalIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch {}
  return 'localhost';
}

// ───────────────────────────────────────────────────────────
// Veritabanı yedekleme (otomatik + güncelleme öncesi)
// ───────────────────────────────────────────────────────────
// Veritabanı server.ts ile aynı yolda tutulur:
//   %LOCALAPPDATA%\OkulNobetProgrami\database.sqlite
// Yedekler ise yan klasörde tutulur:
//   %LOCALAPPDATA%\OkulNobetProgrami\backups\
const DB_BASE_DIR = path.join(os.homedir(), 'AppData', 'Local', 'OkulNobetProgrami');
const DB_FILE     = path.join(DB_BASE_DIR, 'database.sqlite');
const BACKUP_DIR  = path.join(DB_BASE_DIR, 'backups');
const MAX_BACKUPS = 15;
const STARTUP_BACKUP_KEY = 'lastStartupBackupDate';
const EXTERNAL_BACKUP_MAX = 30; // Bulut klasöründe daha fazla tutalım

function getBackupSettingsPath() {
  return path.join(app.getPath('userData'), 'backup-settings.json');
}

function loadBackupSettings() {
  try {
    const raw = fs.readFileSync(getBackupSettingsPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveBackupSettings(settings) {
  try {
    fs.writeFileSync(getBackupSettingsPath(), JSON.stringify(settings, null, 2));
    return true;
  } catch (err) {
    console.warn('[backup] Ayarlar kaydedilemedi:', err?.message || err);
    return false;
  }
}

function getExternalBackupDir() {
  const settings = loadBackupSettings();
  const dir = settings?.externalDir;
  if (!dir || typeof dir !== 'string') return null;
  return dir;
}

function ensureBackupDir() {
  try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch {}
}

// Ek (kullanıcının seçtiği — örn. OneDrive/Drive senkronize klasörü) konumdaki
// eski yedekleri temizle. Sadece bizim yazdığımız "database-..." dosyalarına dokunulur.
function pruneExternalBackups(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir)
      .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
      .map((f) => ({
        full: path.join(dir, f),
        mtime: fs.statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of entries.slice(EXTERNAL_BACKUP_MAX)) {
      try { fs.unlinkSync(old.full); } catch {}
    }
  } catch (err) {
    console.warn('[backup] Ek klasördeki eski yedekler temizlenemedi:', err?.message || err);
  }
}

function pruneOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const entries = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
      .map((f) => ({
        name: f,
        full: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of entries.slice(MAX_BACKUPS)) {
      try { fs.unlinkSync(old.full); } catch {}
    }
  } catch (err) {
    console.warn('Eski yedekler temizlenemedi:', err?.message || err);
  }
}

// reason: 'startup' | 'pre-update' | 'manual'
function backupDatabase(reason = 'manual') {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { ok: false, error: 'Veritabanı henüz oluşturulmamış.' };
    }
    ensureBackupDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-]/gi, '');
    const fileName = `database-${ts}-${safeReason}.sqlite`;
    const dest = path.join(BACKUP_DIR, fileName);
    fs.copyFileSync(DB_FILE, dest);
    pruneOldBackups();
    console.log(`[backup] Veritabanı yedeklendi (${reason}):`, dest);

    // Kullanıcı ek bir konum (OneDrive/Drive/USB) seçtiyse oraya da kopyala.
    // OneDrive/Drive klasörü ise istemci otomatik buluta senkronlar; uygulamanın
    // doğrudan bulut API'leriyle uğraşması gerekmez ve KVKK sorumluluğu okulda kalır.
    let externalPath = null;
    let externalError = null;
    const extDir = getExternalBackupDir();
    if (extDir) {
      try {
        fs.mkdirSync(extDir, { recursive: true });
        externalPath = path.join(extDir, fileName);
        fs.copyFileSync(DB_FILE, externalPath);
        pruneExternalBackups(extDir);
        console.log('[backup] Ek konuma da kopyalandı:', externalPath);
      } catch (err) {
        externalError = err?.message || String(err);
        externalPath = null;
        console.warn('[backup] Ek konuma kopyalama başarısız:', externalError);
      }
    }

    return { ok: true, path: dest, externalPath, externalError };
  } catch (err) {
    console.error('[backup] Yedek alınamadı:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// Aynı gün içinde tekrar yedek almasın diye basit bir flag dosyası kullan
function maybeRunStartupBackup() {
  try {
    if (appMode !== 'server') return; // İstemci modunda lokal DB yok
    if (!fs.existsSync(DB_FILE)) return;
    const today = new Date().toISOString().split('T')[0];
    const flagPath = path.join(BACKUP_DIR, `.${STARTUP_BACKUP_KEY}`);
    let last = null;
    try { last = fs.readFileSync(flagPath, 'utf-8').trim(); } catch {}
    if (last === today) return; // Bugün zaten yedek alındı
    ensureBackupDir();
    const res = backupDatabase('startup');
    if (res.ok) {
      try { fs.writeFileSync(flagPath, today); } catch {}
    }
  } catch (err) {
    console.warn('[backup] Startup yedeklemesi atlandı:', err?.message || err);
  }
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('database-') && f.endsWith('.sqlite'))
      .map((f) => {
        const full = path.join(BACKUP_DIR, f);
        const stat = fs.statSync(full);
        return {
          name: f,
          path: full,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

app.whenReady().then(async () => {
  let settings = loadSettings();

  // İlk çalışma veya ayar yoksa mod seçim ekranı göster
  if (!settings) {
    const result = await createSetupWindow();
    if (!result) { app.quit(); return; }
    settings = { mode: result.mode, serverIp: result.serverIp };
    saveSettings(settings);
  }

  appMode = settings.mode;

  if (appMode === 'server') {
    startServer();
    serverUrl = `http://localhost:${PORT}`;
    const ready = await waitForServer(serverUrl);
    if (!ready) {
      dialog.showErrorBox('Hata', 'Sunucu 20 saniye içinde başlamadı.');
      app.quit();
      return;
    }
    createMainWindow(serverUrl);

    // Başlıkta IP göster
    const localIp = getLocalIp();
    if (mainWindow) {
      mainWindow.setTitle(`Okul Nöbet Programı — Sunucu: ${localIp}:${PORT}`);
    }
  } else {
    // İstemci modu: sunucu IP'sine bağlan
    serverUrl = `http://${settings.serverIp}:${PORT}`;
    const ready = await waitForServer(serverUrl, 10000);
    if (!ready) {
      const response = await dialog.showMessageBox({
        type: 'error',
        title: 'Bağlantı Hatası',
        message: `Ana bilgisayara bağlanılamadı.\n\n${serverUrl} adresine ulaşılamıyor.\n\nAna bilgisayarın açık ve aynı ağda olduğundan emin olun.`,
        buttons: ['Ayarları Sıfırla', 'Tekrar Dene', 'Çıkış'],
        defaultId: 1,
      });
      if (response.response === 0) {
        // Ayarları sıfırla
        try { fs.unlinkSync(getSettingsPath()); } catch {}
        app.relaunch();
        app.quit();
        return;
      } else if (response.response === 1) {
        app.relaunch();
        app.quit();
        return;
      } else {
        app.quit();
        return;
      }
    }
    createMainWindow(serverUrl);
    if (mainWindow) {
      mainWindow.setTitle(`Okul Nöbet Programı — Bağlı: ${settings.serverIp}`);
    }
  }

  // Günlük rolling yedek (sunucu modunda, üretim/geliştirme fark etmez).
  // Sunucu hazır olduktan ~3 sn sonra arka planda çalışır.
  setTimeout(() => {
    try { maybeRunStartupBackup(); } catch {}
  }, 3000);

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Güncelleme kontrolü başarısız:', err?.message || err);
      });
    }, 5000);

    // Her 4 saatte bir güncelleme kontrolü
    setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('Periyodik güncelleme kontrolü başarısız:', err?.message || err);
      });
    }, 4 * 60 * 60 * 1000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(serverUrl);
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});
