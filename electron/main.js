import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

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
autoUpdater.logger = null;

// Ayar dosyası: mod ve sunucu IP'si saklanır
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'connection-settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
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

    const tmpPath = path.join(app.getPath('userData'), 'setup.html');
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
    const { networkInterfaces } = await_import_os();
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch {}
  return 'localhost';
}

function await_import_os() {
  const os = require('os');
  return os;
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

  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
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
