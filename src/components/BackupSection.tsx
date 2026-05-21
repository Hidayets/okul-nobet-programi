import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  FolderOpen,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  HardDriveDownload,
  FileArchive,
  Info,
  Cloud,
  CloudOff,
  Download,
  X as XIcon,
} from 'lucide-react';

interface BackupItem {
  name: string;
  path: string;
  size: number;
  createdAt: string;
}

interface BackupPaths {
  dbFile: string;
  backupDir: string;
  dbExists: boolean;
  externalDir?: string | null;
}

interface ElectronBackupAPI {
  createBackup?: () => Promise<{ ok: boolean; path?: string; externalPath?: string | null; externalError?: string | null; error?: string }>;
  listBackups?: () => Promise<BackupItem[]>;
  openBackupFolder?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  getBackupPaths?: () => Promise<BackupPaths>;
  pickExternalBackupDir?: () => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  clearExternalBackupDir?: () => Promise<{ ok: boolean; error?: string }>;
  downloadBackup?: (sourcePath?: string) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  onBackupStatus?: (cb: (data: any) => void) => (() => void) | void;
}

function getBackupAPI(): ElectronBackupAPI | null {
  if (typeof window === 'undefined') return null;
  return (window as any).electronAPI || null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function reasonLabel(name: string): { label: string; tone: 'pre-update' | 'startup' | 'manual' } {
  if (name.includes('pre-update')) return { label: 'Güncelleme öncesi', tone: 'pre-update' };
  if (name.includes('startup')) return { label: 'Günlük otomatik', tone: 'startup' };
  return { label: 'Elle alınan', tone: 'manual' };
}

export default function BackupSection() {
  const api = getBackupAPI();
  const isElectron = !!api?.createBackup;

  const [paths, setPaths] = useState<BackupPaths | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!api?.listBackups || !api?.getBackupPaths) return;
    setLoading(true);
    try {
      const [p, list] = await Promise.all([
        api.getBackupPaths(),
        api.listBackups(),
      ]);
      setPaths(p);
      setBackups(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Yedek listesi alınamadı.' });
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!isElectron) return;
    refresh();
  }, [isElectron, refresh]);

  // Pre-update gibi otomatik yedeklemelerde listeyi tazele
  useEffect(() => {
    if (!api?.onBackupStatus) return;
    const off = api.onBackupStatus(() => {
      refresh();
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [api, refresh]);

  const handleCreate = useCallback(async () => {
    if (!api?.createBackup) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await api.createBackup();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Yedek başarıyla oluşturuldu.' });
        refresh();
      } else {
        setMessage({ type: 'error', text: res.error || 'Yedek alınamadı.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Yedek alınırken hata oluştu.' });
    } finally {
      setCreating(false);
    }
  }, [api, refresh]);

  const handleOpenFolder = useCallback(async () => {
    if (!api?.openBackupFolder) return;
    try {
      const res = await api.openBackupFolder();
      if (!res.ok) {
        setMessage({ type: 'error', text: res.error || 'Klasör açılamadı.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Klasör açılırken hata oluştu.' });
    }
  }, [api]);

  const handlePickExternal = useCallback(async () => {
    if (!api?.pickExternalBackupDir) return;
    try {
      const res = await api.pickExternalBackupDir();
      if (res.canceled) return;
      if (res.ok) {
        setMessage({
          type: 'success',
          text: 'Ek yedek konumu kaydedildi. Bundan sonraki tüm yedekler buraya da kopyalanacak.',
        });
        refresh();
      } else {
        setMessage({ type: 'error', text: res.error || 'Klasör seçilemedi.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Klasör seçilirken hata oluştu.' });
    }
  }, [api, refresh]);

  const handleClearExternal = useCallback(async () => {
    if (!api?.clearExternalBackupDir) return;
    if (!confirm('Ek yedek konumunu kaldırmak istediğinizden emin misiniz?\n\nMevcut yedek dosyaları orada kalır, sadece yeni yedekler artık oraya kopyalanmaz.')) {
      return;
    }
    try {
      const res = await api.clearExternalBackupDir();
      if (res.ok) {
        setMessage({ type: 'info', text: 'Ek yedek konumu kaldırıldı.' });
        refresh();
      } else {
        setMessage({ type: 'error', text: res.error || 'Kaldırılamadı.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Kaldırma sırasında hata oluştu.' });
    }
  }, [api, refresh]);

  const handleDownload = useCallback(async (sourcePath?: string) => {
    if (!api?.downloadBackup) return;
    try {
      const res = await api.downloadBackup(sourcePath);
      if (res.canceled) return;
      if (res.ok) {
        setMessage({ type: 'success', text: `Yedek kaydedildi: ${res.path}` });
      } else {
        setMessage({ type: 'error', text: res.error || 'İndirme başarısız.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'İndirme sırasında hata oluştu.' });
    }
  }, [api]);

  // Otomatik mesaj temizleme
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="bg-cyan-100 p-2 rounded-lg text-cyan-600">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-slate-800">Veri Yedekleme</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Veritabanı otomatik olarak günde 1 kez ve her güncelleme öncesi yedeklenir.
            Son 15 yedek tutulur, eskileri otomatik silinir.
          </p>
        </div>
      </div>

      {!isElectron && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Yedekleme özelliği yalnızca <strong>masaüstü uygulamasında</strong> kullanılabilir.
            Tarayıcı üzerinden bağlandığınızda yedek işlemlerini görüntüleyemezsiniz.
          </span>
        </div>
      )}

      {isElectron && (
        <>
          {message && (
            <div
              className={`mb-5 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : message.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              {message.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {message.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {message.type === 'info' && <Info className="w-4 h-4" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Dosya Yolları */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                <Database className="w-4 h-4" />
                Veritabanı Dosyası
              </div>
              <p className="text-xs text-slate-700 font-mono break-all">
                {paths?.dbFile || '—'}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {paths?.dbExists ? 'Dosya mevcut' : 'Dosya henüz oluşturulmamış'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-semibold uppercase tracking-wide">
                <FileArchive className="w-4 h-4" />
                Yedek Klasörü
              </div>
              <p className="text-xs text-slate-700 font-mono break-all">
                {paths?.backupDir || '—'}
              </p>
              <p className="text-xs text-slate-400 mt-2">{backups.length} yedek mevcut</p>
            </div>
          </div>

          {/* Ek Yedek Konumu (OneDrive/Drive/USB) */}
          <div
            className={`rounded-xl border p-4 mb-6 ${
              paths?.externalDir ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/40'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`p-2 rounded-lg flex-shrink-0 ${
                    paths?.externalDir ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {paths?.externalDir ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-800 mb-0.5">Ek Yedek Konumu</h3>
                  <p className="text-xs text-slate-500 mb-2">
                    OneDrive / Google Drive / Yandex Disk gibi senkronize bir klasör seçin —
                    her yedek dosyası buraya da kopyalanır ve otomatik buluta yüklenir.
                  </p>
                  {paths?.externalDir ? (
                    <p className="text-xs text-slate-700 font-mono break-all bg-white/70 rounded-md px-2 py-1 border border-emerald-200">
                      {paths.externalDir}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Henüz ek konum seçilmemiş. Yedekler yalnızca bu bilgisayarda tutuluyor.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={handlePickExternal}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    paths?.externalDir
                      ? 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  {paths?.externalDir ? 'Değiştir' : 'Klasör Seç'}
                </button>
                {paths?.externalDir && (
                  <button
                    type="button"
                    onClick={handleClearExternal}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 transition-colors"
                    title="Ek yedek konumunu kaldır"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                    Kaldır
                  </button>
                )}
              </div>
            </div>
            {paths?.externalDir && (
              <div className="mt-3 flex items-start gap-2 text-xs text-emerald-700 bg-emerald-100/60 rounded-md px-3 py-2 border border-emerald-200">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Veriler okuldan dışarı çıkmaz — yalnızca okul yöneticisinin kendi bulut hesabına
                  senkronlanır. KVKK kapsamında veri sorumlusu okulda kalır.
                </span>
              </div>
            )}
          </div>

          {/* Aksiyon Butonları */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-wait"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Yedek alınıyor...
                </>
              ) : (
                <>
                  <HardDriveDownload className="w-4 h-4" />
                  Şimdi Yedek Al
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleDownload()}
              disabled={!paths?.dbExists}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Mevcut veritabanının kopyasını seçtiğiniz konuma indirin (USB, harici disk vb.)"
            >
              <Download className="w-4 h-4" />
              Yedeği İndir
            </button>

            <button
              type="button"
              onClick={handleOpenFolder}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Yedek Klasörünü Aç
            </button>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {/* Yedek Listesi */}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Son Yedekler</h3>

            {backups.length === 0 ? (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 border border-dashed border-slate-300">
                Henüz yedek alınmamış. Uygulama yeniden başladığında otomatik yedek oluşturulur veya
                yukarıdaki butonla hemen yedek alabilirsiniz.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {backups.map((b) => {
                  const r = reasonLabel(b.name);
                  return (
                    <li
                      key={b.path}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <FileArchive className="w-4 h-4 text-cyan-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate" title={b.name}>
                            {b.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {formatDate(b.createdAt)} · {formatBytes(b.size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            r.tone === 'pre-update'
                              ? 'bg-indigo-100 text-indigo-700'
                              : r.tone === 'startup'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDownload(b.path)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Bu yedeği bir konuma indir"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-5 p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <p className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
              <span>
                Bir yedeği geri yüklemek için: önce uygulamayı kapatın, yedek klasöründen ilgili
                <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">.sqlite</code>
                dosyasını <code className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">database.sqlite</code>
                <span> </span>olarak yeniden adlandırıp veritabanı klasörüne kopyalayın.
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
