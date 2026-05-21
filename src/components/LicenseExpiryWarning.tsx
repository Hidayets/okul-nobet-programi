import { useMemo } from 'react';
import { AlertTriangle, Mail, X, Calendar, Copy } from 'lucide-react';
import { LicenseSummary } from '../types';
import { formatLicenseDateLongTr } from '../lib/licenseDates';

interface Props {
  license: LicenseSummary | null;
  /** Uyarının tetikleneceği eşik (varsayılan 30 gün = bir ay). */
  thresholdDays?: number;
  onDismiss: () => void;
}

const CONTACT_EMAIL = 'okulcozumleri@gmail.com';

export default function LicenseExpiryWarning({
  license,
  thresholdDays = 30,
  onDismiss,
}: Props) {
  const state = useMemo<'expired' | 'expiring' | 'ok' | null>(() => {
    if (!license || !license.expiresAt) return null;
    const d = license.daysRemaining;
    if (d === null || d === undefined) return null;
    if (d < 0) return 'expired';
    if (d <= thresholdDays) return 'expiring';
    return 'ok';
  }, [license, thresholdDays]);

  if (!license || !license.expiresAt || state === 'ok' || state === null) return null;

  const isExpired = state === 'expired';
  const dateText = formatLicenseDateLongTr(license.expiresAt);

  const mainSentence = isExpired
    ? `${dateText} tarihinde lisans süreniz dolmuştur. Lütfen ${CONTACT_EMAIL} adresiyle iletişime geçiniz.`
    : `${dateText} tarihinde lisans süreniz dolacaktır. Lütfen ${CONTACT_EMAIL} adresiyle iletişime geçiniz.`;

  const copyEmail = () => {
    try {
      navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
        <div className={`px-6 py-5 ${isExpired ? 'bg-red-50 border-b border-red-100' : 'bg-amber-50 border-b border-amber-100'}`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-100' : 'bg-amber-100'}`}>
              <AlertTriangle className={`w-6 h-6 ${isExpired ? 'text-red-600' : 'text-amber-600'}`} />
            </div>
            <div className="flex-1">
              <h2 className={`text-lg font-bold ${isExpired ? 'text-red-900' : 'text-amber-900'}`}>
                {isExpired ? 'Lisans süreniz doldu' : 'Lisans süreniz dolmak üzere'}
              </h2>
            </div>
            <button
              onClick={onDismiss}
              className={`p-1.5 rounded-md transition-colors ${
                isExpired ? 'text-red-700 hover:bg-red-100' : 'text-amber-700 hover:bg-amber-100'
              }`}
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
            <Calendar className="w-5 h-5 text-slate-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-slate-500">Lisans bitiş tarihi</p>
              <p className="text-sm font-semibold text-slate-900">{dateText}</p>
            </div>
          </div>

          <p className="text-sm text-slate-800 leading-relaxed">{mainSentence}</p>

          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
            <Mail className="w-5 h-5 text-indigo-600 flex-shrink-0" />
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Lisans yenileme talebi — ' + (license.okulAdi || ''))}`}
              className="flex-1 text-sm font-mono font-semibold text-indigo-700 hover:text-indigo-900 underline-offset-2 hover:underline break-all"
            >
              {CONTACT_EMAIL}
            </a>
            <button
              onClick={copyEmail}
              className="p-1.5 rounded hover:bg-indigo-100 text-indigo-600 transition-colors flex-shrink-0"
              title="E-posta adresini kopyala"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {license.okulAdi && (
            <p className="text-xs text-slate-500">
              Okul: <span className="font-medium text-slate-700">{license.okulAdi}</span>
            </p>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onDismiss}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isExpired
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            Anladım
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
