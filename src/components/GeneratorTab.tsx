import { useState, useMemo } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle, Repeat, MapPin, Users, BarChart3, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo, DEFAULT_SCHOOL_SETTINGS, Holiday } from '../types';

interface Props {
  teachers: Teacher[];
  locations: Location[];
  holidays: Holiday[];
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
  0: 'Paz', 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt'
};

type RotationMode = 'locationBased' | 'standard' | 'rotating' | 'staircase';

export default function GeneratorTab({ teachers, locations, holidays, onGenerate, onSuccess, schoolInfo }: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [rotationMode, setRotationMode] = useState<RotationMode>('rotating');
  const [activeDays, setActiveDays] = useState<number[]>(settings.schoolDays);
  const [error, setError] = useState<string | null>(null);

  const totalDuties = locations.reduce((sum, loc) => sum + (loc.duties?.length || 0), 0);
  const eligibleTeachers = useMemo(() => teachers.filter(t => t.dutyType !== 'nobetDisi'), [teachers]);
  const holidayDates = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);

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
    if (rotationMode === 'rotating') {
      return generateRotating(start, end);
    }
    if (rotationMode === 'staircase') {
      return generateStaircase(start, end);
    }
    return generateFairDistribution(start, end);
  };

  // Sabit Atama: atanan öğretmenler sabit yerde ve günde
  const generateLocationBased = (start: Date, end: Date) => {
    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    const newAssignments: Assignment[] = [];
    let currentDate = start;

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      if (holidayDates.has(dateStr)) {
        currentDate = addDays(currentDate, 1);
        continue;
      }
      const dayOfWeek = getDay(currentDate);

      for (const location of locations) {
        for (const duty of (location.duties || [])) {
          if (duty.day === dayOfWeek) {
            const teacher = teachers.find(t => t.id === duty.teacherId);
            if (teacher?.unavailableDays?.includes(dayOfWeek)) continue;
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

  // Dönerli: atanan öğretmenler aynı günde kalır, hafta hafta yer TÜM lokasyonlar arasında kayar
  const generateRotating = (start: Date, end: Date) => {
    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    const L = locations.length;

    // Her gün için öğretmen slotlarını topla; locationIdx = lokasyonun global sıra numarası
    const dayTemplate = new Map<number, { teacherId: string; locationIdx: number }[]>();

    for (let li = 0; li < L; li++) {
      const location = locations[li];
      for (const duty of (location.duties || [])) {
        if (!dayTemplate.has(duty.day)) dayTemplate.set(duty.day, []);
        dayTemplate.get(duty.day)!.push({ teacherId: duty.teacherId, locationIdx: li });
      }
    }

    const newAssignments: Assignment[] = [];
    let currentDate = start;
    const refWeekStart = startOfWeek(start, { weekStartsOn: 1 });

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      if (holidayDates.has(dateStr)) {
        currentDate = addDays(currentDate, 1);
        continue;
      }
      const dayOfWeek = getDay(currentDate);
      const template = dayTemplate.get(dayOfWeek);

      if (template && template.length > 0) {
        const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekOffset = Math.round(
          (currentWeekStart.getTime() - refWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );

        for (const slot of template) {
          const teacher = teachers.find(t => t.id === slot.teacherId);
          if (teacher?.unavailableDays?.includes(dayOfWeek)) continue;
          const rotatedLocIdx = (slot.locationIdx + weekOffset) % L;
          newAssignments.push({
            id: uuidv4(),
            date: dateStr,
            locationId: locations[rotatedLocIdx].id,
            teacherId: slot.teacherId,
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

  // Adil Dönerli: tüm eligible öğretmenler adil şekilde dağıtılır
  const generateFairDistribution = (start: Date, end: Date) => {
    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    if (eligibleTeachers.length === 0) {
      setError('Nöbet tutabilecek öğretmen bulunmuyor.');
      return;
    }

    const daySlots = new Map<number, string[]>();
    for (const location of locations) {
      for (const duty of (location.duties || [])) {
        if (!daySlots.has(duty.day)) daySlots.set(duty.day, []);
        daySlots.get(duty.day)!.push(location.id);
      }
    }

    const dutyCounts: Record<string, number> = {};
    eligibleTeachers.forEach(t => { dutyCounts[t.id] = 0; });

    const lastLocationIdx: Record<string, number> = {};
    eligibleTeachers.forEach(t => { lastLocationIdx[t.id] = -1; });

    const newAssignments: Assignment[] = [];
    let currentDate = start;

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      if (holidayDates.has(dateStr)) {
        currentDate = addDays(currentDate, 1);
        continue;
      }
      const dayOfWeek = getDay(currentDate);
      const slotsForDay = daySlots.get(dayOfWeek);

      if (slotsForDay && slotsForDay.length > 0) {
        const assignedToday = new Set<string>();
        const slotsToFill = [...slotsForDay];
        const availableForDay = eligibleTeachers.filter(t => !t.unavailableDays?.includes(dayOfWeek));

        if (availableForDay.length === 0) {
          currentDate = addDays(currentDate, 1);
          continue;
        }

        for (let s = 0; s < slotsToFill.length; s++) {
          const sorted = [...availableForDay].sort((a, b) => {
            const aToday = assignedToday.has(a.id) ? 1 : 0;
            const bToday = assignedToday.has(b.id) ? 1 : 0;
            if (aToday !== bToday) return aToday - bToday;
            return dutyCounts[a.id] - dutyCounts[b.id];
          });

          const chosen = sorted[0];

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

  // Merdiven: hem nöbet günü hem nöbet yeri her hafta 1 adım kayar
  const generateStaircase = (start: Date, end: Date) => {
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
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      if (activeDays.includes(dow) && !holidayDates.has(dateStr)) {
        const curWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 }).getTime();
        const weekIdx = Math.round((curWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000));
        if (!weekMap.has(weekIdx)) weekMap.set(weekIdx, new Map());
        weekMap.get(weekIdx)!.set(dow, dateStr);
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
        const dow = getDay(parseISO(dateStr));
        let chosenIdx = -1;
        for (let i = 0; i < teacherQueue.length; i++) {
          if (!teacherQueue[i].unavailableDays?.includes(dow)) {
            chosenIdx = i;
            break;
          }
        }
        if (chosenIdx === -1) chosenIdx = 0;

        const teacher = teacherQueue.splice(chosenIdx, 1)[0];
        newAssignments.push({
          id: uuidv4(),
          date: dateStr,
          locationId,
          teacherId: teacher.id,
        });
        teacherQueue.push(teacher);
      }
    }

    if (newAssignments.length === 0) {
      setError('Seçilen tarih aralığında nöbet atanacak gün bulunamadı.');
      return;
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const sortedPreviewDays = [...activeDays]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .slice(0, 5);
  const previewLocs = locations.slice(0, 4);

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
              {/* Dönerli */}
              <button
                onClick={() => setRotationMode('rotating')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  rotationMode === 'rotating'
                    ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                    : 'border-slate-200 hover:border-slate-300 bg-surface'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-1.5 rounded-lg ${rotationMode === 'rotating' ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <span className={`font-semibold text-sm ${rotationMode === 'rotating' ? 'text-violet-700' : 'text-slate-700'}`}>
                    Dönerli
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Atanan öğretmenler aynı günde kalır, nöbet yeri her hafta bir sonrakine kayar.
                </p>
              </button>

              {/* Merdiven */}
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

              {/* Adil Dönerli */}
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
                  Tüm öğretmenler adil dağıtılır. Fazla/eksik öğretmen durumunda nöbet sayıları dengelenir.
                </p>
              </button>

              {/* Sabit Atama */}
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
                  Atanmış öğretmenler her hafta aynı yerde ve günde kalır. Değişim olmaz.
                </p>
              </button>
            </div>
          </div>

          {/* Day selector for Merdiven */}
          {rotationMode === 'staircase' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">Nöbet Günleri</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      activeDays.includes(day.id)
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {day.label}
                  </button>
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

          {/* Dönerli preview */}
          {rotationMode === 'rotating' && totalDuties > 0 && (
            <div className="bg-violet-50/50 border border-violet-100 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-violet-800 mb-2">Dönerli Önizleme</h4>
              <p className="text-xs text-slate-500 mb-3">Öğretmenler nöbet günlerinde sabit kalır. Her hafta nöbet yerleri bir sonrakine kayar.</p>
              <div className="space-y-2">
                {locations.filter(loc => (loc.duties?.length || 0) > 0).map(loc => (
                  <div key={loc.id} className="bg-surface rounded-lg border border-violet-100 p-3">
                    <span className="font-medium text-slate-700 text-sm">{loc.name}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(loc.duties || []).map((duty, i) => {
                        const teacher = teachers.find(t => t.id === duty.teacherId);
                        return (
                          <span key={i} className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
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

          {/* Stats Panel for Adil Dönerli */}
          {rotationMode === 'standard' && totalDuties > 0 && teacherCount > 0 && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-semibold text-indigo-800">Dağıtım Bilgileri</h4>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{teacherCount}</div>
                  <div className="text-xs text-slate-500 mt-1">Nöbet Tutacak Öğretmen</div>
                </div>
                <div className="bg-surface rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">{totalWeekly}</div>
                  <div className="text-xs text-slate-500 mt-1">Haftalık Slot</div>
                </div>
                <div className="bg-surface rounded-lg border border-indigo-100 p-3 text-center">
                  <div className="text-2xl font-bold text-indigo-700">~{ratio}</div>
                  <div className="text-xs text-slate-500 mt-1">Nöbet / Kişi / Hafta</div>
                </div>
              </div>

              {teacherCount > totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <Users className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Öğretmen fazlası:</span> Her hafta {teacherCount - totalWeekly} öğretmen nöbet tutmayacak. 
                    Sistem en az nöbet tutanları önceliklendirir.
                  </p>
                </div>
              )}

              {teacherCount < totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Users className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">Öğretmen eksikliği:</span> Her hafta {totalWeekly - teacherCount} ekstra nöbet gerekiyor. 
                    Sistem çift nöbetleri adilce dağıtır.
                  </p>
                </div>
              )}

              {teacherCount === totalWeekly && (
                <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <Users className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-emerald-700">
                    <span className="font-semibold">Tam denge:</span> Öğretmen sayısı haftalık slot sayısına eşit.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {Array.from(weeklyStats.daySlots.entries())
                  .sort(([a], [b]) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                  .map(([day, locs]) => (
                    <span key={day} className="text-xs bg-surface border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
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
                  <div key={loc.id} className="bg-surface rounded-lg border border-emerald-100 p-3">
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
                  : rotationMode === 'rotating'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : rotationMode === 'staircase'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Settings2 className="w-5 h-5" />
              {rotationMode === 'locationBased'
                ? 'Sabit Atama ile Program Oluştur'
                : rotationMode === 'rotating'
                  ? 'Dönerli Program Oluştur'
                  : rotationMode === 'staircase'
                    ? 'Merdiven Nöbet Programı Oluştur'
                    : 'Adil Dönerli Program Oluştur'}
            </button>
            <p className="text-center text-sm text-slate-500 mt-3">
              {rotationMode === 'standard'
                ? `${teacherCount} öğretmen, ${locations.length} nöbet yeri, haftalık ${totalWeekly} slot`
                : rotationMode === 'staircase'
                  ? `${eligibleTeachers.length} öğretmen, ${locations.length} nöbet yeri, ${activeDays.length} gün`
                  : `${locations.length} nöbet yeri, ${totalDuties} görev ataması`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
