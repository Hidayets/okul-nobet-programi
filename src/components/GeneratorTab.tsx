import { useState } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle, ArrowRightLeft, Repeat } from 'lucide-react';
import { Teacher, Location, Assignment, ScheduleConfig, SchoolInfo, DEFAULT_SCHOOL_SETTINGS } from '../types';

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

type RotationMode = 'standard' | 'staircase';

export default function GeneratorTab({ teachers, locations, onGenerate, onSuccess, schoolInfo }: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [activeDays, setActiveDays] = useState<number[]>(settings.schoolDays);
  const [rotationMode, setRotationMode] = useState<RotationMode>('standard');
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (dayId: number) => {
    setActiveDays(prev => 
      prev.includes(dayId) 
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

  const handleGenerate = () => {
    setError(null);

    const eligibleTeachers = teachers.filter(t => t.dutyType !== 'nobetDisi');

    if (eligibleTeachers.length === 0) {
      setError('Nöbet tutabilecek öğretmen bulunmuyor. (Tüm öğretmenler "Nöbet Dışı" olarak işaretli olabilir.)');
      return;
    }
    if (locations.length === 0) {
      setError('Lütfen önce nöbet yeri ekleyin.');
      return;
    }
    if (activeDays.length === 0) {
      setError('Lütfen en az bir nöbet günü seçin.');
      return;
    }
    if (eligibleTeachers.length < locations.length) {
      setError('Nöbet tutacak öğretmen sayısı, nöbet yeri sayısından az olamaz. (Nöbet dışı öğretmenler hariç tutuldu.)');
      return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isBefore(end, start)) {
      setError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }

    let teacherQueue = [...eligibleTeachers].sort(() => Math.random() - 0.5);
    const newAssignments: Assignment[] = [];

    if (rotationMode === 'standard') {
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
    } else {
      // Staircase mode: both day and location shift each week
      const sortedDays = [...activeDays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
      const D = sortedDays.length;
      const L = locations.length;
      const slotsPerWeek = D * L;

      // Group dates by calendar week
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
        // Build assignment list for this week with diagonal shift
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

        // Assign teachers from queue only to existing slots
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
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  // Preview: show staircase shift for first 3 weeks
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
                    Merdiven (Gün + Yer Değişimli)
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Her hafta hem nöbet günü hem nöbet yeri 1 adım kayar. Hiçbir öğretmen sürekli aynı gün ve yerde kalmaz.
                </p>
              </button>
            </div>
          </div>

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
                          const L = previewLocs.length;
                          const actualDayIdx = (0 + weekIdx) % D;
                          const actualLocIdx = (locIdx + weekIdx) % L;
                          const dayName = DAY_SHORT[sortedPreviewDays[actualDayIdx]];
                          const locName = previewLocs[actualLocIdx].name;
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
              <p className="text-xs text-amber-600 mt-2">
                Aynı öğretmen 1. hafta {DAY_SHORT[sortedPreviewDays[0]]}/{previewLocs[0]?.name} →
                {' '}2. hafta {DAY_SHORT[sortedPreviewDays[1 % sortedPreviewDays.length]]}/{previewLocs[1 % previewLocs.length]?.name} →
                {' '}3. hafta {DAY_SHORT[sortedPreviewDays[2 % sortedPreviewDays.length]]}/{previewLocs[2 % previewLocs.length]?.name} şeklinde ilerler.
              </p>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100">
            <button
              onClick={handleGenerate}
              className={`w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm text-white ${
                rotationMode === 'staircase'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              <Settings2 className="w-5 h-5" />
              {rotationMode === 'staircase' ? 'Merdiven Nöbet Programı Oluştur' : 'Dönerli Nöbet Programı Oluştur'}
            </button>
            <p className="text-center text-sm text-slate-500 mt-3">
              Mevcut {teachers.filter(t => t.dutyType !== 'nobetDisi').length} öğretmen ve {locations.length} nöbet yeri ile program oluşturulacak.
              {teachers.some(t => t.dutyType === 'nobetDisi') && (
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
