import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const isDev   = process.env.NODE_ENV === 'development';
const PORT    = 3000;
const APP_URL = `http://localhost:${PORT}`;

let mainWindow   = null;
let serverProcess = null;

// ─── Sunucu hazır olana kadar bekle ──────────────────────────────────────────
async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok || res.status < 500) return true;
    } catch { /* henüz hazır değil */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

// ─── Üretim modunda sunucuyu arka planda başlat ───────────────────────────────
function startServer() {
  if (isDev) return; // Geliştirmede sunucu zaten dışarıda çalışıyor

  // Electron exe'sinin yanındaki OkulNobet.exe'yi bul
  const exeDir    = path.dirname(app.getPath('exe'));
  const serverExe = path.join(exeDir, 'OkulNobet.exe');

  serverProcess = spawn(serverExe, [], {
    detached: false,
    stdio: 'ignore',
    windowsHide: true,   // CMD penceresi gösterme
  });

  serverProcess.on('error', (err) => {
    console.error('Sunucu başlatılamadı:', err.message);
  });
}

// ─── Ana pencereyi oluştur ───────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Okul Nöbet Programı',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Pencere yüklenene kadar gizli tut
    show: false,
    backgroundColor: '#f8fafc',
  });

  // Menü çubuğunu gizle (F11 ile tam ekran hâlâ çalışır)
  mainWindow.setMenuBarVisibility(false);

  // Hazır olunca göster
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(APP_URL);

  // Harici linkleri tarayıcıda aç, uygulama penceresinde değil
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Uygulama hazır ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startServer();

  // Sunucunun ayağa kalkmasını bekle
  const ready = await waitForServer();
  if (!ready) {
    console.error('Sunucu 15 saniye içinde başlamadı.');
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── Temizlik ─────────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});
