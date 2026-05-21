const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  print: () => ipcRenderer.send('print-page'),

  // Update sistem
  onUpdateStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Uygulama bilgileri
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  // Veritabanı yedekleme
  createBackup: () => ipcRenderer.invoke('backup:create'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  openBackupFolder: () => ipcRenderer.invoke('backup:open-folder'),
  getBackupPaths: () => ipcRenderer.invoke('backup:get-paths'),
  pickExternalBackupDir: () => ipcRenderer.invoke('backup:pick-external-dir'),
  clearExternalBackupDir: () => ipcRenderer.invoke('backup:clear-external-dir'),
  downloadBackup: (sourcePath) => ipcRenderer.invoke('backup:download', sourcePath),
  onBackupStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('backup-status', listener);
    return () => ipcRenderer.removeListener('backup-status', listener);
  },
});
