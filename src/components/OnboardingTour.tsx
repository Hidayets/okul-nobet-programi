import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Users,
  BookOpen,
  MapPin,
  Settings as SettingsIcon,
  Calendar,
  ClipboardList,
  BarChart3,
  GraduationCap,
  Layers,
} from 'lucide-react';

export const ONBOARDING_STORAGE_KEY = 'onboardingCompletedV1';

interface Step {
  title: string;
  body: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tabId?: string;
  tip?: string;
}

const STEPS: Step[] = [
  {
    title: 'Hoş Geldiniz!',
    icon: Sparkles,
    body: (
      <>
        Okul Nöbet Programına hoş geldiniz. Bu kısa tur ile uygulamayı en verimli şekilde nasıl
        kullanacağınızı göstereceğiz. İstediğiniz zaman <strong>Atla</strong> diyebilirsiniz; Yardım
        (<span className="font-mono">?</span>) butonuyla turu tekrar başlatabilirsiniz.
      </>
    ),
  },
  {
    title: 'Eğitim-Öğretim Yılı',
    icon: GraduationCap,
    body: (
      <>
        Sol üstteki yıl açılır menüsünden farklı eğitim-öğretim yılları arasında geçiş yapabilirsiniz.
        Her yılın öğretmen, ders programı, nöbet çizelgesi ve devamsızlık verisi birbirinden bağımsız
        tutulur.
      </>
    ),
    tip: 'Yeni bir öğretim yılına geçtiğinizde mevcut öğretmen listenizi otomatik aktarabilirsiniz.',
  },
  {
    title: 'Öğretmenler',
    icon: Users,
    tabId: 'teachers',
    body: (
      <>
        Öğretmenleri buradan ekleyebilir, düzenleyebilir veya silebilirsiniz. Her öğretmen için{' '}
        <strong>Sabit / Hareketli / Nöbet Dışı</strong> tipi belirleyin. Nöbet tercihlerini
        <strong> "tutamaz"</strong> veya <strong>"sadece şu günler"</strong> olarak ayarlayabilirsiniz.
      </>
    ),
    tip: 'Yeni: Word veya e-okul listesini Panodan Ekle ile tek tıkla içe alabilirsiniz.',
  },
  {
    title: 'Ders Programları',
    icon: BookOpen,
    tabId: 'schedules',
    body: (
      <>
        Öğretmenlerin haftalık ders programlarını <strong>Excel'den yükleyebilir</strong> veya elle
        girebilirsiniz. Program yüklendikten sonra öğretmenin günlük ders sayısı otomatik bilinir;
        nöbet atamalarında akıllı uyarılar bu bilgiyi kullanır.
      </>
    ),
  },
  {
    title: 'Nöbet Yerleri',
    icon: MapPin,
    tabId: 'locations',
    body: (
      <>
        Bahçe, kantin, kat girişleri vb. nöbet yerlerini buradan tanımlayın. Her yer için
        günlere göre kaç öğretmenin atanacağını belirleyebilirsiniz.
      </>
    ),
  },
  {
    title: 'Program Oluştur',
    icon: SettingsIcon,
    tabId: 'generator',
    body: (
      <>
        Tarih aralığı + dağıtım modu (dönerli / merdiven) seçin ve <strong>Otomatik Oluştur</strong>'a
        basın. Sistem öğretmen tercihlerini, ders sayılarını ve müsaitlikleri dikkate alarak adil bir
        çizelge üretir.
      </>
    ),
  },
  {
    title: 'Nöbet Çizelgesi',
    icon: Calendar,
    tabId: 'schedule',
    body: (
      <>
        Hazır çizelgeyi buradan görebilir, yazdırabilir ve e-posta olarak gönderebilirsiniz.
        Hücredeki öğretmene tıklayarak <strong>başkasıyla değiştirebilir</strong>,{' '}
        <strong>çift nöbet</strong> işaretleyebilir veya silebilirsiniz.
      </>
    ),
    tip: 'Toolbar\'daki "Yer / Gün" okları çizelgeyi tek tıkla rotasyonla kaydırır.',
  },
  {
    title: 'Çift Nöbet & PDF Renk',
    icon: Layers,
    tabId: 'schedule',
    body: (
      <>
        Aynı öğretmenin aynı gün iki nöbeti olduğunda hücreyi tıklayıp <strong>Çift Nöbet</strong>{' '}
        olarak işaretleyin; PDF çıktısına otomatik bir not düşülür. <strong>PDF Renk</strong>{' '}
        butonundan satır zebra rengini Mavi/Yeşil/Mor/Sarı arasında seçebilirsiniz.
      </>
    ),
  },
  {
    title: 'Günlük İşlemler',
    icon: ClipboardList,
    tabId: 'daily',
    body: (
      <>
        Devamsız öğretmenleri işaretleyin, <strong>Otomatik Dağıt</strong> ile boş kalan dersleri
        nöbetçiler arasında adil paylaştırın. Yeni eklenen{' '}
        <strong>Geçici Nöbetçi Havuzu</strong>'ndan boş öğretmenleri elle de
        görevlendirebilirsiniz.
      </>
    ),
    tip: 'Bir öğretmen nöbetçi olduğu halde devamsızsa "Nöbet Değişikliği Önerisi" otomatik çıkar.',
  },
  {
    title: 'Devamsızlık Takip',
    icon: BarChart3,
    tabId: 'absenceTracking',
    body: (
      <>
        Yıl boyunca öğretmen başına devamsızlık özetini buradan görebilir, mazeret/rapor/görevli
        izinli ayrımıyla raporlayabilirsiniz.
      </>
    ),
  },
  {
    title: 'Ayarlar',
    icon: SettingsIcon,
    tabId: 'settings',
    body: (
      <>
        Okul bilgileri, ders saatleri, tema, şifre ve eğitim-öğretim yılı yönetimi buradan yapılır.
        Bildirim e-postası göndermek için <strong>Gmail uygulama şifresi</strong> ayarlamayı
        unutmayın.
      </>
    ),
  },
  {
    title: 'Hazırsınız!',
    icon: Sparkles,
    body: (
      <>
        Tur tamamlandı. Aklınıza takılan olursa sağ üstteki <span className="font-mono">?</span>{' '}
        butonuyla bu turu istediğiniz zaman tekrar açabilirsiniz. Hayırlı nöbetler!
      </>
    ),
  },
];

const ICON_BG = ['bg-indigo-100 text-indigo-600', 'bg-emerald-100 text-emerald-600', 'bg-amber-100 text-amber-600', 'bg-violet-100 text-violet-600', 'bg-sky-100 text-sky-600', 'bg-rose-100 text-rose-600'];

interface Props {
  open: boolean;
  onClose: () => void;
  onTabChange?: (tabId: string) => void;
}

export default function OnboardingTour({ open, onClose, onTabChange }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  useEffect(() => {
    if (open && current.tabId && onTabChange) {
      onTabChange(current.tabId);
    }
  }, [open, step, current.tabId, onTabChange]);

  const accent = useMemo(() => ICON_BG[step % ICON_BG.length], [step]);

  if (!open) return null;
  const Icon = current.icon;

  const handleFinish = () => {
    try { localStorage.setItem(ONBOARDING_STORAGE_KEY, '1'); } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 animate-[fadeIn_.2s_ease]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <div className="text-xs font-medium text-slate-500">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold mr-2">
              {step + 1}
            </span>
            <span className="font-semibold text-slate-700">{step + 1}</span>
            <span className="text-slate-400"> / {STEPS.length}</span>
          </div>
          <button
            onClick={handleFinish}
            className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
            title="Turu kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-start gap-4 mb-4">
            <div className={`p-3 rounded-xl ${accent} flex-shrink-0`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{current.title}</h3>
              <div className="text-sm text-slate-600 mt-1 leading-relaxed">{current.body}</div>
            </div>
          </div>

          {current.tip && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{current.tip}</span>
            </div>
          )}

          <div className="flex items-center gap-1 mt-5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i === step ? 'bg-indigo-600' : i < step ? 'bg-indigo-300' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <button
            onClick={handleFinish}
            className="text-sm text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded hover:bg-slate-100 transition-colors"
          >
            Atla
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={isFirst}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Önceki
            </button>
            {isLast ? (
              <button
                onClick={handleFinish}
                className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                Bitir
              </button>
            ) : (
              <button
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                className="px-4 py-1.5 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center gap-1 transition-colors"
              >
                Sonraki
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
