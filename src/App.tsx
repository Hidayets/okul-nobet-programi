import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, MapPin, Users, Settings, FileText, ClipboardList, BookOpen, LogOut, GraduationCap, ChevronDown, BarChart3, HelpCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from './lib/utils';
import { Teacher, Location, Assignment, Absence, Substitution, SchoolInfo, ClassInfo, Holiday, ScheduleArchive, getCurrentAcademicYear, formatAcademicYear } from './types';
import TeachersTab from './components/TeachersTab';
import LocationsTab from './components/LocationsTab';
import GeneratorTab from './components/GeneratorTab';
import ScheduleTab from './components/ScheduleTab';
import DailyOperationsTab from './components/DailyOperationsTab';
import SettingsTab from './components/SettingsTab';
import SchedulesTab from './components/SchedulesTab';
import AbsenceTrackingTab from './components/AbsenceTrackingTab';
import SuperAdminPanel from './components/SuperAdminPanel';
import Login from './components/Login';
import Register from './components/Register';
import OnboardingTour, { ONBOARDING_STORAGE_KEY } from './components/OnboardingTour';
import UpdateNotifier, { UpdateStatus } from './components/UpdateNotifier';
import LicenseExpiryWarning from './components/LicenseExpiryWarning';
import { formatLicenseDateLongTr } from './lib/licenseDates';
import { useAuth } from './AuthContext';
import { useApiSync } from './hooks/useApiSync';
import { useApiDoc } from './hooks/useApiDoc';
import { unifyTeachers } from './lib/teacherMatching';

// Vite üzerinden enjekte edilen client sürümü (build sırasında define ile gelir).
// vite.config.ts içinde ayrıca tanımlanmadıysa fallback değeri kullanılır.
declare const __APP_VERSION__: string;
const CLIENT_VERSION: string =
  (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '') ||
  (typeof window !== 'undefined' && (window as any).__APP_VERSION__) ||
  '';

type Tab = 'teachers' | 'locations' | 'generator' | 'schedule' | 'daily' | 'absenceTracking' | 'settings' | 'schedules';

export default function App() {
  const { user, license, loading, signOut, licenseLockout } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [tourOpen, setTourOpen] = useState(false);
  const [showLicenseWarning, setShowLicenseWarning] = useState(false);

  // Lisans pasifleştirildi/dolduğunda backend 403 + licenseStatus döner ve
  // AuthContext oturumu kapatır. Burada kullanıcıya tek seferlik bir uyarı
  // göster ve onlara Login ekranını sun.
  useEffect(() => {
    if (licenseLockout) {
      // Sayfa modal'lar arasında bocalamasın diye küçük bir gecikmeyle göster.
      window.setTimeout(() => {
        try {
          alert(licenseLockout.message);
        } catch {}
      }, 0);
    }
  }, [licenseLockout]);

  // Lisans bitimine 30 gün (1 ay) veya daha az kaldıysa: her uygulama açılışında (yeni oturum)
  // bir kez tam ekran uyarı gösterilir. Oturumu kapatıp tekrar açınca yeniden gösterilir.
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    if (!license || !license.expiresAt) return;
    const d = license.daysRemaining;
    if (d === null || d === undefined) return;
    if (d > 30) return;

    const key = `licenseWarnShown__${user.kurumKodu}__${license.expiresAt}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {}
    setShowLicenseWarning(true);
  }, [user, license]);

  // Güncelleme sistemi state'leri
  const [updateCheckTrigger, setUpdateCheckTrigger] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [appVersion, setAppVersion] = useState<string>(CLIENT_VERSION);
  const [versionMismatch, setVersionMismatch] = useState<{ client: string; server: string } | null>(null);

  const [activeYear, setActiveYear] = useState<string>(() => {
    return localStorage.getItem('activeAcademicYear') || getCurrentAcademicYear();
  });

  useEffect(() => {
    localStorage.setItem('activeAcademicYear', activeYear);
  }, [activeYear]);

  const scopedCollection = (name: string) => `${name}__${activeYear}`;

  const [teachers, setTeachers] = useApiSync<Teacher>(scopedCollection('teachers'), []);
  const [classes, setClasses] = useApiSync<ClassInfo>(scopedCollection('classes'), []);
  const [locations, setLocations] = useApiSync<Location>(scopedCollection('locations'), []);
  const [assignments, setAssignments] = useApiSync<Assignment>(scopedCollection('assignments'), []);
  const [absences, setAbsences] = useApiSync<Absence>(scopedCollection('absences'), []);
  const [substitutions, setSubstitutions] = useApiSync<Substitution>(scopedCollection('substitutions'), []);
  const [holidays, setHolidays] = useApiSync<Holiday>(scopedCollection('holidays'), []);
  const [scheduleArchives, setScheduleArchives] = useApiSync<ScheduleArchive>(scopedCollection('scheduleArchives'), []);

  const [schoolInfo, setSchoolInfo] = useApiDoc<SchoolInfo>('schoolInfo/info', {
    valilik: '',
    kaymakamlik: '',
    okulAdi: '',
    okulMuduru: '',
    mudurYardimcilari: []
  });

  const handleTeacherIdsMerged = useCallback((idRemap: Record<string, string>) => {
    if (!idRemap || Object.keys(idRemap).length === 0) return;
    const mapId = (id: string) => idRemap[id] ?? id;
    setAssignments((prev) => prev.map((a) => ({ ...a, teacherId: mapId(a.teacherId) })));
    setAbsences((prev) => prev.map((a) => ({ ...a, teacherId: mapId(a.teacherId) })));
    setSubstitutions((prev) =>
      prev.map((s) => ({
        ...s,
        absentTeacherId: mapId(s.absentTeacherId),
        substituteTeacherId: s.substituteTeacherId ? mapId(s.substituteTeacherId) : s.substituteTeacherId,
      })),
    );
    setLocations((prev) =>
      prev.map((loc) => ({
        ...loc,
        duties: loc.duties.map((d) => ({ ...d, teacherId: mapId(d.teacherId) })),
      })),
    );
    setScheduleArchives((prev) =>
      prev.map((arch) => ({
        ...arch,
        assignments: arch.assignments.map((a) => ({ ...a, teacherId: mapId(a.teacherId) })),
      })),
    );
  }, [setAssignments, setAbsences, setSubstitutions, setLocations, setScheduleArchives]);

  const availableYears = useMemo(() => {
    const years = new Set(schoolInfo.academicYears || []);
    years.add(getCurrentAcademicYear());
    return Array.from(years).sort();
  }, [schoolInfo.academicYears]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(activeYear)) {
      setActiveYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, activeYear]);

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    try {
      if (!localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
        setTourOpen(true);
      }
    } catch {}
  }, [user]);

  // Öğretmen listesinde aynı kişiyi temsil eden mükerrer kayıtları
  // (örn. "Ahmet Adıgüzel" ve "A. Adıgüzel") otomatik birleştirir.
  // İşlem yalnızca gerçekten birleştirilecek kayıt varsa state'i günceller,
  // bu sayede sonsuz döngü oluşmaz.
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    if (!teachers || teachers.length < 2) return;
    const { teachers: unified, idRemap } = unifyTeachers(teachers);
    if (Object.keys(idRemap).length === 0) return;
    setTeachers(unified);
    handleTeacherIdsMerged(idRemap);
  }, [teachers, user, setTeachers, handleTeacherIdsMerged]);

  // Electron uygulama bilgisini çek (paketli sürümde otoriter sürüm)
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getAppInfo) {
      api.getAppInfo().then((info: any) => {
        if (info?.version) setAppVersion(info.version);
      }).catch(() => {});
    }
  }, []);

  // Server-Client sürüm uyumsuzluğu kontrolü
  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const sv = data?.version || '';
        const cv = appVersion || CLIENT_VERSION;
        if (sv && cv && sv !== cv) {
          setVersionMismatch({ client: cv, server: sv });
        } else {
          setVersionMismatch(null);
        }
      } catch {
        // Sessizce yut, kullanıcıyı bezdirmeyelim
      }
    })();
    return () => { cancelled = true; };
  }, [user, appVersion]);

  const handleCheckUpdate = useCallback(() => {
    setUpdateCheckTrigger((n) => n + 1);
  }, []);

  const updateReady = updateStatus.status === 'downloaded';
  const updateInProgress = updateStatus.status === 'available' || updateStatus.status === 'downloading';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    if (showRegister) {
      return <Register onBackToLogin={() => setShowRegister(false)} />;
    }
    return <Login onSwitchToRegister={() => setShowRegister(true)} />;
  }

  // Özel yönetim paneli
  if (user.role === 'superadmin') {
    return <SuperAdminPanel onLogout={signOut} />;
  }

  const isAdmin = user.role === 'admin';

  // Filter tabs based on role
  const allTabs = [
    { id: 'teachers', label: 'Öğretmenler', icon: Users, adminOnly: true },
    { id: 'schedules', label: 'Ders Programları', icon: BookOpen, adminOnly: true },
    { id: 'locations', label: 'Nöbet Yerleri', icon: MapPin, adminOnly: true },
    { id: 'generator', label: 'Program Oluştur', icon: Settings, adminOnly: true },
    { id: 'schedule', label: 'Nöbet Çizelgesi', icon: Calendar, adminOnly: false },
    { id: 'daily', label: 'Günlük İşlemler', icon: ClipboardList, adminOnly: false },
    { id: 'absenceTracking', label: 'Devamsızlık Takip', icon: BarChart3, adminOnly: false },
    { id: 'settings', label: 'Ayarlar', icon: Settings, adminOnly: true },
  ] as const;

  const visibleTabs = allTabs.filter(tab => !tab.adminOnly || isAdmin);

  // If current tab is not visible, switch to first visible
  if (!visibleTabs.find(t => t.id === activeTab)) {
    setActiveTab(visibleTabs[0].id as Tab);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-surface border-b border-slate-200 sticky top-0 z-30 print:hidden">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <FileText className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 hidden sm:block">
                Okul Nöbet Programı
              </h1>
              <div className="relative ml-1 sm:ml-3">
                <select
                  value={activeYear}
                  onChange={(e) => setActiveYear(e.target.value)}
                  className="appearance-none bg-indigo-50 text-indigo-700 text-sm font-semibold pl-8 pr-8 py-1.5 rounded-lg border border-indigo-200 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer transition-colors"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{formatAcademicYear(y)}</option>
                  ))}
                </select>
                <GraduationCap className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none" />
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-500 hidden sm:block">
                Kurum: <span className="font-semibold text-slate-700">{user.kurumKodu}</span>
                <span className="mx-2">•</span>
                Rol: <span className="font-semibold text-slate-700">{isAdmin ? 'Admin' : 'Öğretmen'}</span>
              </div>

              {/* Sürüm rozeti + güncelleme kontrol butonu */}
              {appVersion && (
                <button
                  onClick={handleCheckUpdate}
                  className={cn(
                    "hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                    updateReady
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : updateInProgress
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                  title={updateReady ? "Güncelleme hazır - tıklayın" : "Güncellemeleri kontrol et"}
                >
                  <RefreshCw className={cn("w-3 h-3", updateStatus.status === 'checking' && "animate-spin")} />
                  v{appVersion}
                  {updateReady && (
                    <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  )}
                </button>
              )}

              <button
                onClick={() => setTourOpen(true)}
                className="relative text-slate-500 hover:text-indigo-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                title="Tanıtım turunu yeniden aç"
              >
                <HelpCircle className="w-5 h-5" />
                {updateReady && (
                  <span className="absolute top-0.5 right-0.5 inline-block w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
                )}
              </button>
              <button
                onClick={signOut}
                className="text-slate-500 hover:text-red-600 flex items-center gap-1 text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Çıkış
              </button>
            </div>
          </div>
          <nav className="flex space-x-8 overflow-x-auto" aria-label="Tabs">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={cn(
                    "flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors",
                    isActive
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {versionMismatch && (
        <div className="bg-amber-50 border-b border-amber-200 print:hidden">
          <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-start sm:items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 sm:mt-0 flex-shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">Sürüm uyumsuzluğu:</span>{' '}
              Bu bilgisayardaki uygulama <span className="font-mono font-semibold">v{versionMismatch.client}</span>,
              ana sunucudaki sürüm ise <span className="font-mono font-semibold">v{versionMismatch.server}</span>.
              {' '}Sorun yaşamamak için her iki bilgisayarın da güncellenmesi önerilir.
            </div>
            <button
              onClick={() => setVersionMismatch(null)}
              className="text-amber-700 hover:text-amber-900 text-xs font-medium px-2 py-1 rounded hover:bg-amber-100"
            >
              Gizle
            </button>
          </div>
        </div>
      )}

      {/* Lisans süresi bandı: kullanıcı modal'ı kapatsa bile hatırlatsın */}
      {user && user.role !== 'superadmin' && license && license.expiresAt && license.daysRemaining !== null && license.daysRemaining <= 30 && (
        <div className={cn(
          "border-b print:hidden",
          license.daysRemaining < 0 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
        )}>
          <div className={cn(
            "w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-sm",
            license.daysRemaining < 0 ? "text-red-900" : "text-amber-900"
          )}>
            <AlertTriangle className={cn(
              "w-4 h-4 flex-shrink-0",
              license.daysRemaining < 0 ? "text-red-600" : "text-amber-600"
            )} />
            <div className="flex-1">
              {license.daysRemaining < 0 ? (
                <>
                  <span className="font-semibold">{formatLicenseDateLongTr(license.expiresAt)} tarihinde lisans süreniz dolmuştur.</span>{' '}
                  Lütfen{' '}
                  <a href="mailto:okulcozumleri@gmail.com" className="font-semibold underline">okulcozumleri@gmail.com</a>{' '}
                  adresiyle iletişime geçiniz.
                </>
              ) : (
                <>
                  <span className="font-semibold">{formatLicenseDateLongTr(license.expiresAt)} tarihinde lisans süreniz dolacaktır.</span>{' '}
                  Lütfen{' '}
                  <a href="mailto:okulcozumleri@gmail.com" className="font-semibold underline">okulcozumleri@gmail.com</a>{' '}
                  adresiyle iletişime geçiniz.
                </>
              )}
            </div>
            <button
              onClick={() => setShowLicenseWarning(true)}
              className={cn(
                "text-xs font-medium px-2 py-1 rounded",
                license.daysRemaining < 0 ? "text-red-700 hover:bg-red-100" : "text-amber-700 hover:bg-amber-100"
              )}
            >
              Detay
            </button>
          </div>
        </div>
      )}

      <main className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:px-0 print:py-0 print:max-w-none">
        {activeTab === 'teachers' && isAdmin && (
          <TeachersTab teachers={teachers} setTeachers={setTeachers} />
        )}
        {activeTab === 'schedules' && isAdmin && (
          <SchedulesTab 
            teachers={teachers} 
            setTeachers={setTeachers}
            onTeacherIdsMerged={handleTeacherIdsMerged}
            classes={classes}
            setClasses={setClasses}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'locations' && isAdmin && (
          <LocationsTab locations={locations} setLocations={setLocations} teachers={teachers} />
        )}
        {activeTab === 'generator' && isAdmin && (
          <GeneratorTab 
            teachers={teachers} 
            locations={locations}
            holidays={holidays}
            onGenerate={(newAssignments) => {
              if (assignments.length > 0) {
                const sortedDates = assignments.map(a => a.date).sort();
                const archiveStart = sortedDates[0];
                const archiveEnd = sortedDates[sortedDates.length - 1];
                const formatDate = (d: string) => {
                  const [y, m, day] = d.split('-');
                  return `${day}/${m}/${y}`;
                };
                const archive: ScheduleArchive = {
                  id: crypto.randomUUID(),
                  label: `${formatDate(archiveStart)} - ${formatDate(archiveEnd)} Nöbeti`,
                  startDate: archiveStart,
                  endDate: archiveEnd,
                  assignments: [...assignments],
                  archivedAt: new Date().toISOString(),
                };
                setScheduleArchives(prev => [...prev, archive]);
              }
              setAssignments(newAssignments);
            }} 
            onSuccess={() => setActiveTab('schedule')}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab
            assignments={assignments}
            setAssignments={setAssignments}
            teachers={teachers}
            locations={locations}
            schoolInfo={schoolInfo}
            isAdmin={isAdmin}
            activeYear={activeYear}
            scheduleArchives={scheduleArchives}
            setScheduleArchives={setScheduleArchives}
          />
        )}
        {activeTab === 'daily' && (
          <DailyOperationsTab
            teachers={teachers}
            assignments={assignments}
            setAssignments={setAssignments}
            absences={absences}
            setAbsences={setAbsences}
            substitutions={substitutions}
            setSubstitutions={setSubstitutions}
            isAdmin={isAdmin}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'absenceTracking' && (
          <AbsenceTrackingTab
            teachers={teachers}
            absences={absences}
            schoolInfo={schoolInfo}
            activeYear={activeYear}
          />
        )}
        {activeTab === 'settings' && isAdmin && (
          <SettingsTab
            schoolInfo={schoolInfo}
            setSchoolInfo={setSchoolInfo}
            holidays={holidays}
            setHolidays={setHolidays}
            activeYear={activeYear}
          />
        )}
      </main>

      <footer className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-slate-400 print:hidden select-none">
        © {new Date().getFullYear()} Hidayet SEVDİ
      </footer>

      <OnboardingTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onTabChange={(tabId) => {
          const tab = visibleTabs.find(t => t.id === tabId);
          if (tab) setActiveTab(tab.id as Tab);
        }}
      />

      <UpdateNotifier
        manualCheckTrigger={updateCheckTrigger}
        onStatusChange={setUpdateStatus}
      />

      {showLicenseWarning && (
        <LicenseExpiryWarning
          license={license}
          thresholdDays={30}
          onDismiss={() => setShowLicenseWarning(false)}
        />
      )}
    </div>
  );
}
