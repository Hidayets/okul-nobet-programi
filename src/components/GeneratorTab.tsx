import { useState, useMemo } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle, Repeat, MapPin, Users, BarChart3 } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo } from '../types';

interface Props {
  teachers: Teacher[];
  locations: Location[];
  onGenerate: (assignments: Assignment[]) => void;
  onSuccess: () => void;
  schoolInfo: SchoolInfo;
}

const DAY_SHORT: Record<number, string> = {
  0: 'Paz', 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt'
};

type RotationMode = 'locationBased' | 'standard';

export default function GeneratorTab({ teachers, locations, onGenerate, onSuccess, schoolInfo }: Props) {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [rotationMode, setRotationMode] = useState<RotationMode>('standard');
  const [error, setError] = useState<string | null>(null);

  const totalDuties = locations.reduce((sum, loc) => sum + (loc.duties?.length || 0), 0);
  const eligibleTeachers = useMemo(() => teachers.filter(t => t.dutyType !== 'nobetDisi'), [teachers]);

  // Haftalık slot yapısı: hangi gün kaç kişi lazım
  const weeklyStats = useMemo(() => {
    const daySlots = new Map<number, string[]>();
    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        if (!daySlots.has(duty.day)) daySlots.set(duty.day, []);
        daySlots.get(duty.day)!.push(location.id);
      }
    }
    const totalWeekly = Array.from(daySlots.values()).reduce((s, arr) => s + arr.length, 0);
    const teacherCount = eligibleTeachers.length;
    return { daySlots, totalWeekly, teacherCount };
  }, [locations, eligibleTeachers]);

  const handleGenerate = () => {
    setError(null);

    if (locations.length === 0) {
      setError('Lütfen önce nöbet yeri ekleyin.');
      return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isBefore(end, start)) {
      setError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }

    if (rotationMode === 'locationBased') {
      return generateLocationBased(start, end);
    }

    return generateFairDistribution(start, end);
  };

  const generateLocationBased = (start: Date, end: Date) => {
    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    const newAssignments: Assignment[] = [];
    let currentDate = start;

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      for (const location of locations) {
        for (const duty of (location.duties || [])) {
          if (duty.day === dayOfWeek) {
            newAssignments.push({
              id: uuidv4(),
              date: dateStr,
              locationId: location.id,
              teacherId: duty.teacherId,
            });
          }
        }
      }
      currentDate = addDays(currentDate, 1);
    }

    if (newAssignments.length === 0) {
      setError('Seçilen tarih aralığında nöbet atanacak gün bulunamadı.');
      return;
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const generateFairDistribution = (start: Date, end: Date) => {
    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    if (eligibleTeachers.length === 0) {
      setError('Nöbet tutabilecek öğretmen bulunmuyor.');
      return;
    }

    // Günlük slot yapısı: hangi lokasyonlar hangi günlerde dolu olmalı
    const daySlots = new Map<number, string[]>();
    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        if (!daySlots.has(duty.day)) daySlots.set(duty.day, []);
        daySlots.get(duty.day)!.push(location.id);
      }
    }

    // Kümülatif nöbet sayıları — adil dağıtım için
    const dutyCounts: Record<string, number> = {};
    eligibleTeachers.forEach(t => { dutyCounts[t.id] = 0; });

    // Her öğretmenin son nöbet lokasyonunu takip et (yer rotasyonu için)
    const lastLocationIdx: Record<string, number> = {};
    eligibleTeachers.forEach(t => { lastLocationIdx[t.id] = -1; });

    const newAssignments: Assignment[] = [];
    let currentDate = start;

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);
      const slotsForDay = daySlots.get(dayOfWeek);

      if (slotsForDay && slotsForDay.length > 0) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const assignedToday = new Set<string>();
        const slotsToFill = [...slotsForDay];

        // Günün slotlarını doldur
        for (let s = 0; s < slotsToFill.length; s++) {
          // Öğretmenleri sırala: bugün atanmamış olanlar önce, sonra en az nöbet tutan
          const sorted = [...eligibleTeachers].sort((a, b) => {
            const aToday = assignedToday.has(a.id) ? 1 : 0;
            const bToday = assignedToday.has(b.id) ? 1 : 0;
            if (aToday !== bToday) return aToday - bToday;
            return dutyCounts[a.id] - dutyCounts[b.id];
          });

          const chosen = sorted[0];

          // Yer rotasyonu: öğretmenin son atandığı lokasyondan farklı bir yer seç
          let bestSlotIdx = s;
          if (slotsToFill.length > 1) {
            const prevLocIdx = lastLocationIdx[chosen.id];
            for (let j = s; j < slotsToFill.length; j++) {
              if (j !== prevLocIdx) {
                bestSlotIdx = j;
                break;
              }
            }
          }

          // Slotları takas et (seçilen lokasyonu öne al)
          if (bestSlotIdx !== s) {
            [slotsToFill[s], slotsToFill[bestSlotIdx]] = [slotsToFill[bestSlotIdx], slotsToFill[s]];
          }

          newAssignments.push({
            id: uuidv4(),
            date: dateStr,
            locationId: slotsToFill[s],
            teacherId: chosen.id,
          });

          lastLocationIdx[chosen.id] = s;
          assignedToday.add(chosen.id);
          dutyCounts[chosen.id]++;
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    if (newAssignments.length === 0) {
      setError('Seçilen tarih aralığında nöbet atanacak gün bulunamadı.');
      return;
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const { totalWeekly, teacherCount } = weeklyStats;
  const ratio = teacherCount > 0 && totalWeekly > 0
    ? (totalWeekly / teacherCount).toFixed(1)
    : '0';

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Settings2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Program Ayarları</h2>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Başlangıç Tarihi</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Bitiş Tarihi</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Rotation Mode */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">Nöbet Dönüş Şekli</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setRotationMode('standard')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  rotationMode === 'standard'
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                    : 'border-slate-200 hover:border-slate-300 bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-lg ${rotationMode === 'standard' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Repeat className="w-5 h-5" />
                  </div>
                  <span className={`font-semibold text-sm ${rotationMode === 'standard' ? 'text-indigo-700' : 'text-slate-700'}`}>
                    Adil Dönerli
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tüm öğretmenler adil şekilde dağıtılır. En az nöbet tutan öncelik kazanır. Fazla öğretmen varsa sıra bekler, az öğretmen varsa çift nöbet adilce paylaştırılır.
                </p>
              </button>

              <button
                onClick={() => setRotationMode('locationBased')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  rotationMode === 'locationBased'
                    ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                    : 'border-slate-200 hover:border-slate-300 bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-lg ${rotationMode === 'locationBased' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <span className={`font-semibold text-sm ${rotationMode === 'locationBased' ? 'text-emerald-700' : 'text-slate-700'}`}>
                    Sabit Atama
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Nöbet yerlerine atanmış öğretmenler her hafta aynı yerde ve günde kalır. Değişim olmaz.
                </p>
              </button>
            </div>
          </div>

          {/* Stats Panel for Adil Dönerli */}
          {rotationMode === 'standard' && totalDuties > 0 && teacherCount > 0 && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-semibold text-indigo-800">Dağıtım Bilgileri</h4>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{teacherCount}</div>
                  <div className="text-xs text-slate-500 mt-1">Nöbet Tutacak Öğretmen</div>
                </div>
                <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{totalWeekly}</div>
                  <div className="text-xs text-slate-500 mt-1">Haftalık Slot</div>
                </div>
                <div className="bg-white rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">~{ratio}</div>
                  <div className="text-xs text-slate-500 mt-1">Nöbet / Kişi / Hafta</div>
                </div>
              </div>

              {teacherCount > totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Users className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Öğretmen fazlası:</span> Her hafta {teacherCount - totalWeekly} öğretmen nöbet tutmayacak. 
                    Sistem en az nöbet tutanları önceliklendirir, böylece herkes zamanla eşit sayıda nöbet tutar.
                  </p>
                </div>
              )}

              {teacherCount < totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Users className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">Öğretmen eksikliği:</span> Her hafta {totalWeekly - teacherCount} ekstra nöbet gerekiyor. 
                    Sistem çift nöbetleri en az nöbet tutanlara adilce dağıtır.
                  </p>
                </div>
              )}

              {teacherCount === totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-emerald-700">
                    <span className="font-semibold">Tam denge:</span> Öğretmen sayısı haftalık slot sayısına eşit. Herkes haftada 1 nöbet tutacak.
                  </p>
                </div>
              )}

              {/* Day breakdown */}
              <div className="flex flex-wrap gap-2">
                {Array.from(weeklyStats.daySlots.entries())
                  .sort(([a], [b]) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                  .map(([day, locs]) => (
                    <span key={day} className="text-xs bg-white border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                      {DAY_SHORT[day]}: {locs.length} kişi
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Location-based preview */}
          {rotationMode === 'locationBased' && totalDuties > 0 && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-emerald-800 mb-3">Nöbet Atamaları Özeti</h4>
              <div className="space-y-2">
                {locations.filter(loc => (loc.duties?.length || 0) > 0).map(loc => (
                  <div key={loc.id} className="bg-white rounded-lg border border-emerald-100 p-3">
                    <span className="font-medium text-slate-700 text-sm">{loc.name}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(loc.duties || []).map((duty, i) => {
                        const teacher = teachers.find(t => t.id === duty.teacherId);
                        return (
                          <span key={i} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            {teacher?.name || '?'} — {DAY_SHORT[duty.day]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100">
            <button
              onClick={handleGenerate}
              disabled={totalDuties === 0}
              className={`w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm text-white ${
                rotationMode === 'locationBased'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Settings2 className="w-5 h-5" />
              {rotationMode === 'locationBased' ? 'Sabit Atama ile Program Oluştur' : 'Adil Dönerli Program Oluştur'}
            </button>
            <p className="text-center text-sm text-slate-500 mt-3">
              {rotationMode === 'standard'
                ? `${teacherCount} öğretmen, ${locations.length} nöbet yeri, haftalık ${totalWeekly} slot`
                : `${locations.length} nöbet yeri, ${totalDuties} görev ataması`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
