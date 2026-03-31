import { useState, useEffect } from 'react';
import { Calendar, MapPin, Users, Settings, FileText, ClipboardList, BookOpen, LogOut } from 'lucide-react';
import { cn } from './lib/utils';
import { Teacher, Location, Assignment, ScheduleConfig, Absence, Substitution, SchoolInfo, ClassInfo } from './types';
import TeachersTab from './components/TeachersTab';
import LocationsTab from './components/LocationsTab';
import GeneratorTab from './components/GeneratorTab';
import ScheduleTab from './components/ScheduleTab';
import DailyOperationsTab from './components/DailyOperationsTab';
import SettingsTab from './components/SettingsTab';
import SchedulesTab from './components/SchedulesTab';
import Login from './components/Login';
import Register from './components/Register';
import { useAuth } from './AuthContext';
import { useApiSync } from './hooks/useApiSync';
import { useApiDoc } from './hooks/useApiDoc';

type Tab = 'teachers' | 'locations' | 'generator' | 'schedule' | 'daily' | 'settings' | 'schedules';

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  
  // State from API
  const [teachers, setTeachers] = useApiSync<Teacher>('teachers', []);
  const [classes, setClasses] = useApiSync<ClassInfo>('classes', []);
  const [locations, setLocations] = useApiSync<Location>('locations', []);
  const [assignments, setAssignments] = useApiSync<Assignment>('assignments', []);
  const [absences, setAbsences] = useApiSync<Absence>('absences', []);
  const [substitutions, setSubstitutions] = useApiSync<Substitution>('substitutions', []);
  
  const [schoolInfo, setSchoolInfo] = useApiDoc<SchoolInfo>('schoolInfo/info', {
    valilik: '',
    kaymakamlik: '',
    okulAdi: '',
    okulMuduru: '',
    mudurYardimcilari: []
  });

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

  const isAdmin = user.role === 'admin';

  // Filter tabs based on role
  const allTabs = [
    { id: 'teachers', label: 'Öğretmenler', icon: Users, adminOnly: true },
    { id: 'schedules', label: 'Ders Programları', icon: BookOpen, adminOnly: true },
    { id: 'locations', label: 'Nöbet Yerleri', icon: MapPin, adminOnly: true },
    { id: 'generator', label: 'Program Oluştur', icon: Settings, adminOnly: true },
    { id: 'schedule', label: 'Nöbet Çizelgesi', icon: Calendar, adminOnly: false },
    { id: 'daily', label: 'Günlük İşlemler', icon: ClipboardList, adminOnly: false },
    { id: 'settings', label: 'Ayarlar', icon: Settings, adminOnly: true },
  ] as const;

  const visibleTabs = allTabs.filter(tab => !tab.adminOnly || isAdmin);

  // If current tab is not visible, switch to first visible
  if (!visibleTabs.find(t => t.id === activeTab)) {
    setActiveTab(visibleTabs[0].id as Tab);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-surface border-b border-slate-200 sticky top-0 z-10">
        <div className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <FileText className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Okul Nöbet Programı
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-500 hidden sm:block">
                Kurum: <span className="font-semibold text-slate-700">{user.kurumKodu}</span>
                <span className="mx-2">•</span>
                Rol: <span className="font-semibold text-slate-700">{isAdmin ? 'Admin' : 'Öğretmen'}</span>
              </div>
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

      <main className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'teachers' && isAdmin && (
          <TeachersTab teachers={teachers} setTeachers={setTeachers} />
        )}
        {activeTab === 'schedules' && isAdmin && (
          <SchedulesTab 
            teachers={teachers} 
            setTeachers={setTeachers}
            classes={classes}
            setClasses={setClasses}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'locations' && isAdmin && (
          <LocationsTab locations={locations} setLocations={setLocations} />
        )}
        {activeTab === 'generator' && isAdmin && (
          <GeneratorTab 
            teachers={teachers} 
            locations={locations} 
            onGenerate={setAssignments} 
            onSuccess={() => setActiveTab('schedule')}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab 
            assignments={assignments} 
            teachers={teachers} 
            locations={locations} 
            schoolInfo={schoolInfo}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'daily' && (
          <DailyOperationsTab
            teachers={teachers}
            assignments={assignments}
            absences={absences}
            setAbsences={setAbsences}
            substitutions={substitutions}
            setSubstitutions={setSubstitutions}
            isAdmin={isAdmin}
            schoolInfo={schoolInfo}
          />
        )}
        {activeTab === 'settings' && isAdmin && (
          <SettingsTab
            schoolInfo={schoolInfo}
            setSchoolInfo={setSchoolInfo}
          />
        )}
      </main>
    </div>
  );
}
