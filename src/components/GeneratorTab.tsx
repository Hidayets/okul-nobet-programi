import { useState } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle, ArrowRightLeft, Repeat, MapPin } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo, DEFAULT_SCHOOL_SETTINGS } from '../types';

interface Props {
  teachers: Teacher[];
  locations: Location[];
  onGenerate: (assignments: Assignment[]) => void;
  onSuccess: () => void;
  schoolInfo: SchoolInfo;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Pazartesi' },
  { id: 2, label: 'Salı' },
  { id: 3, label: 'Çarşamba' },
  { id: 4, label: 'Perşembe' },
  { id: 5, label: 'Cuma' },
  { id: 6, label: 'Cumartesi' },
  { id: 0, label: 'Pazar' },
];

const DAY_SHORT: Record<number, string> = {
  1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz'
};

type RotationMode = 'locationBased' | 'standard' | 'staircase';

export default function GeneratorTab({ teachers, locations, onGenerate, onSuccess, schoolInfo }: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [activeDays, setActiveDays] = useState<number[]>(settings.schoolDays);
  const [rotationMode, setRotationMode] = useState<RotationMode>('locationBased');
  const [error, setError] = useState<string | null>(null);

  const totalDuties = locations.reduce((sum, loc) => sum + (loc.duties?.length || 0), 0);

  const toggleDay = (dayId: number) => {
    setActiveDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

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

    const eligibleTeachers = teachers.filter(t => t.dutyType !== 'nobetDisi');

    if (eligibleTeachers.length === 0) {
      setError('Nöbet tutabilecek öğretmen bulunmuyor.');
      return;
    }
    if (activeDays.length === 0) {
      setError('Lütfen en az bir nöbet günü seçin.');
      return;
    }
    if (eligibleTeachers.length < locations.length) {
      setError('Nöbet tutacak öğretmen sayısı, nöbet yeri sayısından az olamaz.');
      return;
    }

    if (rotationMode === 'standard') {
      generateStandard(start, end, eligibleTeachers);
    } else {
      generateStaircase(start, end, eligibleTeachers);
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

  const generateStandard = (start: Date, end: Date, eligibleTeachers: Teacher[]) => {
    let teacherQueue = [...eligibleTeachers].sort(() => Math.random() - 0.5);
    const newAssignments: Assignment[] = [];

    let currentDate = start;
    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);
      if (activeDays.includes(dayOfWeek)) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        locations.forEach(location => {
          const assignedTeacher = teacherQueue.shift()!;
          newAssignments.push({
            id: uuidv4(),
            date: dateStr,
            locationId: location.id,
            teacherId: assignedTeacher.id
          });
          teacherQueue.push(assignedTeacher);
        });
      }
      currentDate = addDays(currentDate, 1);
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const generateStaircase = (start: Date, end: Date, eligibleTeachers: Teacher[]) => {
    let teacherQueue = [...eligibleTeachers].sort(() => Math.random() - 0.5);
    const newAssignments: Assignment[] = [];

    const sortedDays = [...activeDays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
    const D = sortedDays.length;
    const L = locations.length;
    const slotsPerWeek = D * L;

    const refWeekStart = startOfWeek(start, { weekStartsOn: 1 }).getTime();
    const weekMap = new Map<number, Map<number, string>>();

    let currentDate = start;
    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dow = getDay(currentDate);
      if (activeDays.includes(dow)) {
        const curWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 }).getTime();
        const weekIdx = Math.round((curWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000));
        if (!weekMap.has(weekIdx)) weekMap.set(weekIdx, new Map());
        weekMap.get(weekIdx)!.set(dow, format(currentDate, 'yyyy-MM-dd'));
      }
      currentDate = addDays(currentDate, 1);
    }

    const sortedWeeks = [...weekMap.entries()].sort(([a], [b]) => a - b);

    for (const [weekIdx, dates] of sortedWeeks) {
      const weekAssignments: { dateStr: string; locationId: string }[] = [];

      for (let slot = 0; slot < slotsPerWeek; slot++) {
        const abstractDayIdx = Math.floor(slot / L);
        const abstractLocIdx = slot % L;
        const actualDayIdx = (abstractDayIdx + weekIdx) % D;
        const actualLocIdx = (abstractLocIdx + weekIdx) % L;
        const actualDow = sortedDays[actualDayIdx];
        const dateStr = dates.get(actualDow);

        if (dateStr) {
          weekAssignments.push({
            dateStr,
            locationId: locations[actualLocIdx].id,
          });
        }
      }

      for (const { dateStr, locationId } of weekAssignments) {
        const teacher = teacherQueue.shift()!;
        newAssignments.push({
          id: uuidv4(),
          date: dateStr,
          locationId,
          teacherId: teacher.id,
        });
        teacherQueue.push(teacher);
      }
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const sortedPreviewDays = [...activeDays]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .slice(0, 5);
  const previewLocs = locations.slice(0, 4);

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

          {/* Day selector for standard/staircase */}
          {rotationMode !== 'locationBased' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">Nöbet Günleri</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      activeDays.includes(day.id)
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {day.label}
                  </button>
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

          {/* Staircase Preview */}
          {rotationMode === 'staircase' && sortedPreviewDays.length >= 2 && previewLocs.length >= 2 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h4 className="text-sm font-semibold text-amber-800 mb-3">Merdiven Nöbet Önizleme</h4>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="py-1.5 px-2 text-left text-amber-600 font-semibold border-b border-amber-200">Hafta</th>
                      {previewLocs.map(loc => (
                        <th key={loc.id} className="py-1.5 px-2 text-center text-amber-600 font-semibold border-b border-amber-200">
                          {loc.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2].map(weekIdx => (
                      <tr key={weekIdx}>
                        <td className="py-1.5 px-2 font-medium text-amber-700 border-b border-amber-100 whitespace-nowrap">
                          {weekIdx + 1}. Hafta
                        </td>
                        {previewLocs.map((_, locIdx) => {
                          const D = sortedPreviewDays.length;
                          const actualDayIdx = (0 + weekIdx) % D;
                          const dayName = DAY_SHORT[sortedPreviewDays[actualDayIdx]];
                          const isHighlighted = locIdx === 0;
                          return (
                            <td key={locIdx} className={`py-1.5 px-2 text-center border-b border-amber-100 ${isHighlighted ? 'font-bold text-amber-900' : 'text-amber-700'}`}>
                              {dayName}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100">
            <button
              onClick={handleGenerate}
              disabled={rotationMode === 'locationBased' && totalDuties === 0}
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
              {rotationMode === 'locationBased'
                ? `${locations.length} nöbet yeri, ${totalDuties} görev ataması ile program oluşturulacak.`
                : `${teachers.filter(t => t.dutyType !== 'nobetDisi').length} öğretmen ve ${locations.length} nöbet yeri ile program oluşturulacak.`}
              {rotationMode !== 'locationBased' && teachers.some(t => t.dutyType === 'nobetDisi') && (
                <span className="block text-amber-600 mt-1">
                  ({teachers.filter(t => t.dutyType === 'nobetDisi').length} öğretmen nöbet dışı)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
