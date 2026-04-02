import { useState } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle, ArrowRightLeft, Repeat, MapPin } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo } from '../types';

interface Props {
  teachers: Teacher[];
  locations: Location[];
  onGenerate: (assignments: Assignment[]) => void;
  onSuccess: () => void;
  schoolInfo: SchoolInfo;
}

const DAY_SHORT: Record<number, string> = {
  1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz'
};

type RotationMode = 'locationBased' | 'standard' | 'staircase';

export default function GeneratorTab({ teachers, locations, onGenerate, onSuccess, schoolInfo }: Props) {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [rotationMode, setRotationMode] = useState<RotationMode>('standard');
  const [error, setError] = useState<string | null>(null);

  const totalDuties = locations.reduce((sum, loc) => sum + (loc.duties?.length || 0), 0);

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

    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    if (rotationMode === 'standard') {
      generateStandard(start, end);
    } else {
      generateStaircase(start, end);
    }
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

  const generateStandard = (start: Date, end: Date) => {
    const newAssignments: Assignment[] = [];

    // Her gün için hangi lokasyonlarda hangi öğretmenler var — sıralı
    const dayDutyMap = new Map<number, { teacherId: string; locationId: string }[]>();

    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        if (!dayDutyMap.has(duty.day)) dayDutyMap.set(duty.day, []);
        dayDutyMap.get(duty.day)!.push({
          teacherId: duty.teacherId,
          locationId: location.id,
        });
      }
    }

    const refWeekStart = startOfWeek(start, { weekStartsOn: 1 }).getTime();

    let currentDate = start;
    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);
      const dutiesForDay = dayDutyMap.get(dayOfWeek);

      if (dutiesForDay && dutiesForDay.length > 0) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const curWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 }).getTime();
        const weekOffset = Math.round((curWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000));

        const locIds = dutiesForDay.map(d => d.locationId);
        const teacherIds = dutiesForDay.map(d => d.teacherId);
        const count = dutiesForDay.length;

        // Her hafta öğretmenler bir sonraki nöbet yerine kayar
        for (let i = 0; i < count; i++) {
          const shiftedLocIndex = (i + weekOffset) % count;
          const actualLocIndex = shiftedLocIndex < 0 ? shiftedLocIndex + count : shiftedLocIndex;

          newAssignments.push({
            id: uuidv4(),
            date: dateStr,
            locationId: locIds[actualLocIndex],
            teacherId: teacherIds[i],
          });
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

  const generateStaircase = (start: Date, end: Date) => {
    const newAssignments: Assignment[] = [];

    // Tüm günlerdeki görevleri topla
    const allDays = new Set<number>();
    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        allDays.add(duty.day);
      }
    }
    const sortedDays = [...allDays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    const D = sortedDays.length;

    if (D === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış.');
      return;
    }

    // Her gün için görevleri topla
    const dayDutyMap = new Map<number, { teacherId: string; locationId: string }[]>();
    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        if (!dayDutyMap.has(duty.day)) dayDutyMap.set(duty.day, []);
        dayDutyMap.get(duty.day)!.push({
          teacherId: duty.teacherId,
          locationId: location.id,
        });
      }
    }

    const refWeekStart = startOfWeek(start, { weekStartsOn: 1 }).getTime();

    let currentDate = start;
    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);

      const curWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 }).getTime();
      const weekOffset = Math.round((curWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000));

      // Merdiven: gün de kayar — bu haftanın dayOfWeek'i için hangi orijinal günün öğretmenlerini kullan
      const dayIdx = sortedDays.indexOf(dayOfWeek);
      if (dayIdx === -1) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      const originalDayIdx = ((dayIdx - weekOffset) % D + D) % D;
      const originalDay = sortedDays[originalDayIdx];
      const dutiesForOriginalDay = dayDutyMap.get(originalDay);

      if (dutiesForOriginalDay && dutiesForOriginalDay.length > 0) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const locIds = dutiesForOriginalDay.map(d => d.locationId);
        const teacherIds = dutiesForOriginalDay.map(d => d.teacherId);
        const count = dutiesForOriginalDay.length;

        for (let i = 0; i < count; i++) {
          const shiftedLocIndex = ((i + weekOffset) % count + count) % count;
          newAssignments.push({
            id: uuidv4(),
            date: dateStr,
            locationId: locIds[shiftedLocIndex],
            teacherId: teacherIds[i],
          });
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  Nöbet yerlerine atanmış öğretmen ve gün bilgisine göre program oluşturulur.
                </p>
              </button>

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
                    Standart Dönerli
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Öğretmenler sırayla nöbet tutar. Yer ataması sıra numarasına göre sabit kalır.
                </p>
              </button>

              <button
                onClick={() => setRotationMode('staircase')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  rotationMode === 'staircase'
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                    : 'border-slate-200 hover:border-slate-300 bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-lg ${rotationMode === 'staircase' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <span className={`font-semibold text-sm ${rotationMode === 'staircase' ? 'text-amber-700' : 'text-slate-700'}`}>
                    Merdiven
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Her hafta hem nöbet günü hem nöbet yeri 1 adım kayar.
                </p>
              </button>
            </div>
          </div>

          {/* Duty preview for standard/staircase */}
          {rotationMode !== 'locationBased' && totalDuties > 0 && (
            <div className={`border rounded-xl p-4 ${
              rotationMode === 'staircase' ? 'bg-amber-50/50 border-amber-100' : 'bg-indigo-50/50 border-indigo-100'
            }`}>
              <h4 className={`text-sm font-semibold mb-3 ${
                rotationMode === 'staircase' ? 'text-amber-800' : 'text-indigo-800'
              }`}>
                {rotationMode === 'standard'
                  ? 'Her hafta öğretmenler bir sonraki nöbet yerine kayar'
                  : 'Her hafta hem gün hem nöbet yeri 1 adım kayar'}
              </h4>
              <div className="space-y-2">
                {locations.filter(loc => (loc.duties?.length || 0) > 0).map(loc => (
                  <div key={loc.id} className="bg-white rounded-lg border border-slate-100 p-3">
                    <span className="font-medium text-slate-700 text-sm">{loc.name}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(loc.duties || []).map((duty, i) => {
                        const teacher = teachers.find(t => t.id === duty.teacherId);
                        return (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                            rotationMode === 'staircase' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                          }`}>
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
                rotationMode === 'staircase'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : rotationMode === 'locationBased'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Settings2 className="w-5 h-5" />
              {rotationMode === 'locationBased' ? 'Sabit Atama ile Program Oluştur'
                : rotationMode === 'staircase' ? 'Merdiven Nöbet Programı Oluştur'
                : 'Dönerli Nöbet Programı Oluştur'}
            </button>
            <p className="text-center text-sm text-slate-500 mt-3">
              {locations.length} nöbet yeri, {totalDuties} görev ataması ile program oluşturulacak.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
