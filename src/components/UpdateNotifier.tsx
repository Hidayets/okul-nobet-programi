import React, { useEffect, useState, useCallback } from 'react';
import { Download, CheckCircle2, AlertCircle, RefreshCw, X, Sparkles } from 'lucide-react';

export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version?: string }
  | { status: 'not-available'; version?: string }
  | { status: 'downloading'; percent?: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { status: 'downloaded'; version?: string }
  | { status: 'error'; message?: string };

interface ElectronAPI {
  onUpdateStatus?: (cb: (data: UpdateStatus) => void) => (() => void) | void;
  checkForUpdates?: () => Promise<{ ok: boolean; currentVersion?: string; updateInfo?: any; error?: string }>;
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  getAppInfo?: () => Promise<{ version: string; isPackaged: boolean; appMode: string | null; serverUrl: string }>;
}

function getElectronAPI(): ElectronAPI | null {
  return (window as any).electronAPI || null;
}

interface Props {
  // Dışarıdan tetiklenen "manuel kontrol" sayacı; her artışta yeni kontrol başlatır.
  manualCheckTrigger?: number;
  // Sürüm rozeti / indikatör için status değişimini parent'a haber ver.
  onStatusChange?: (s: UpdateStatus) => void;
}

const STORAGE_KEY = 'updateNotifier:lastDismissedVersion';

export default function UpdateNotifier({ manualCheckTrigger, onStatusChange }: Props) {
  const [status, setStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [visible, setVisible] = useState(false);
  // Manuel kontrol sırasında "güncel" / "hata" mesajını da göster
  const [forceShow, setForceShow] = useState(false);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.onUpdateStatus) return;

    const off = api.onUpdateStatus((data) => {
      setStatus(data);
      onStatusChange?.(data);
    });

    return () => {
      if (typeof off === 'function') off();
    };
  }, [onStatusChange]);

  // Manuel "Güncelleme kontrol et"
  useEffect(() => {
    if (!manualCheckTrigger) return;
    const api = getElectronAPI();
    if (!api?.checkForUpdates) {
      setStatus({ status: 'error', message: 'Güncelleme yalnızca masaüstü uygulamasında çalışır.' });
      setForceShow(true);
      setVisible(true);
      return;
    }
    setForceShow(true);
    setVisible(true);
    setStatus({ status: 'checking' });
    api.checkForUpdates().then((res) => {
      if (!res?.ok) {
        setStatus({ status: 'error', message: res?.error || 'Bilinmeyen hata' });
      }
      // Diğer durumlar onUpdateStatus event'i ile gelir
    });
  }, [manualCheckTrigger]);

  // Status değiştiğinde otomatik göster/gizle mantığı
  useEffect(() => {
    if (status.status === 'available' || status.status === 'downloading' || status.status === 'downloaded') {
      // İndirilen sürüm daha önce kapatıldıysa yine de göstermeye devam et (downloaded güncellemesi önemli)
      if (status.status === 'available') {
        try {
          const lastDismissed = localStorage.getItem(STORAGE_KEY);
          if (lastDismissed && status.version === lastDismissed) {
            // Kullanıcı bu sürüm için daha önce gizledi, yine de minik göster
          }
        } catch {}
      }
      setVisible(true);
      return;
    }
    if (forceShow && (status.status === 'not-available' || status.status === 'error')) {
      setVisible(true);
      // 6 saniye sonra otomatik kapat
      const t = setTimeout(() => {
        setVisible(false);
        setForceShow(false);
      }, 6000);
      return () => clearTimeout(t);
    }
    if (status.status === 'checking' && !forceShow) {
      // Otomatik kontrolde "kontrol ediliyor" göstermiyoruz, gürültü olmasın
      setVisible(false);
    }
  }, [status, forceShow]);

  const handleClose = useCallback(() => {
    if (status.status === 'available' && status.version) {
      try { localStorage.setItem(STORAGE_KEY, status.version); } catch {}
    }
    setVisible(false);
    setForceShow(false);
  }, [status]);

  const handleInstall = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.installUpdate) return;
    await api.installUpdate();
  }, []);

  if (!visible || status.status === 'idle') return null;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${(bytes / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-[1000] w-[340px] max-w-[calc(100vw-2rem)] animate-slide-up">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className={`flex items-center gap-2 px-4 py-3 ${
          status.status === 'error' ? 'bg-red-50 border-b border-red-100' :
          status.status === 'downloaded' ? 'bg-emerald-50 border-b border-emerald-100' :
          status.status === 'not-available' ? 'bg-slate-50 border-b border-slate-100' :
          'bg-indigo-50 border-b border-indigo-100'
        }`}>
          {status.status === 'checking' && <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />}
          {status.status === 'available' && <Sparkles className="w-5 h-5 text-indigo-600" />}
          {status.status === 'downloading' && <Download className="w-5 h-5 text-indigo-600 animate-pulse" />}
          {status.status === 'downloaded' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          {status.status === 'not-available' && <CheckCircle2 className="w-5 h-5 text-slate-500" />}
          {status.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600" />}

          <h4 className="flex-1 text-sm font-semibold text-slate-900">
            {status.status === 'checking' && 'Güncelleme kontrol ediliyor…'}
            {status.status === 'available' && 'Yeni sürüm bulundu'}
            {status.status === 'downloading' && 'Güncelleme indiriliyor'}
            {status.status === 'downloaded' && 'Güncelleme hazır'}
            {status.status === 'not-available' && 'Uygulama güncel'}
            {status.status === 'error' && 'Güncelleme hatası'}
          </h4>

          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-white/60 text-slate-500 hover:text-slate-700 transition-colors"
            title="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 text-sm text-slate-700">
          {status.status === 'checking' && (
            <p className="text-slate-600">Yeni sürüm var mı diye bakılıyor…</p>
          )}

          {status.status === 'available' && (
            <>
              <p>
                <span className="font-semibold">v{status.version}</span> sürümü mevcut.
                İndirme arka planda otomatik başladı.
              </p>
            </>
          )}

          {status.status === 'downloading' && (
            <>
              <p className="mb-2 text-slate-600">
                {status.transferred ? `${formatBytes(status.transferred)} / ${formatBytes(status.total)}` : 'İndiriliyor…'}
              </p>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 transition-all duration-300"
                  style={{ width: `${status.percent ?? 0}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500 text-right">%{status.percent ?? 0}</p>
            </>
          )}

          {status.status === 'downloaded' && (
            <>
              <p className="mb-3">
                <span className="font-semibold">v{status.version}</span> indirildi. Yeniden başlatınca devreye girer.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Şimdi Yeniden Başlat
                </button>
                <button
                  onClick={handleClose}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Sonra
                </button>
              </div>
            </>
          )}

          {status.status === 'not-available' && (
            <p className="text-slate-600">En güncel sürümü kullanıyorsunuz.</p>
          )}

          {status.status === 'error' && (
            <p className="text-red-600 text-xs">{status.message || 'Bilinmeyen hata'}</p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
      `}</style>
    </div>
  );
}
