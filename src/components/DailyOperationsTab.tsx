import React, { useState, useMemo } from 'react';
import { format, parseISO, getDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, UserX, UserCheck, RefreshCw, AlertTriangle, BarChart3, Clock } from 'lucide-react';
import { Teacher, Assignment, Absence, Substitution, SchoolInfo, DEFAULT_SCHOOL_SETTINGS, calculateLessonTimes } from '../types';

interface Props {
  teachers: Teacher[];
  assignments: Assignment[];
  absences: Absence[];
  setAbsences: React.Dispatch<React.SetStateAction<Absence[]>>;
  substitutions: Substitution[];
  setSubstitutions: React.Dispatch<React.SetStateAction<Substitution[]>>;
  isAdmin: boolean;
  schoolInfo: SchoolInfo;
}

interface DistributionSummary {
  perTeacher: { id: string; name: string; todayCount: number; cumulativeCount: number }[];
  unassignedLessons: { hour: number; className: string; absentTeacherName: string }[];
  totalAssigned: number;
  totalUnassigned: number;
}

export default function DailyOperationsTab({
  teachers,
  assignments,
  absences,
  setAbsences,
  substitutions,
  setSubstitutions,
  isAdmin,
  schoolInfo,
}: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const lessonTimes = useMemo(() => calculateLessonTimes(settings), [settings]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [summary, setSummary] = useState<DistributionSummary | null>(null);

  const dayOfWeek = useMemo(() => {
    const date = parseISO(selectedDate);
    return getDay(date);
  }, [selectedDate]);

  const dailyAbsences = useMemo(() => {
    return absences.filter((a) => a.date === selectedDate);
  }, [absences, selectedDate]);

  const dailySubstitutions = useMemo(() => {
    return substitutions.filter((s) => s.date === selectedDate);
  }, [substitutions, selectedDate]);

  const dutyTeachers = useMemo(() => {
    const dailyAssignments = assignments.filter((a) => a.date === selectedDate);
    return teachers.filter((t) => dailyAssignments.some((a) => a.teacherId === t.id));
  }, [assignments, teachers, selectedDate]);

  const absentIdSet = useMemo(() => {
    return new Set(dailyAbsences.map(a => a.teacherId));
  }, [dailyAbsences]);

  const handleToggleAbsence = (teacherId: string) => {
    const isAbsent = dailyAbsences.some((a) => a.teacherId === teacherId);
    if (isAbsent) {
      setAbsences((prev) => prev.filter((a) => !(a.date === selectedDate && a.teacherId === teacherId)));
      setSubstitutions((prev) => prev.filter((s) => !(s.date === selectedDate && s.absentTeacherId === teacherId)));
    } else {
      setAbsences((prev) => [...prev, { id: uuidv4(), date: selectedDate, teacherId }]);
    }
    setSummary(null);
  };

  const handleAutoAssign = () => {
    if (dutyTeachers.length === 0) {
      alert('Bu tarihte nöbetçi öğretmen bulunmamaktadır!');
      return;
    }

    const availableDutyTeachers = dutyTeachers.filter(t => !absentIdSet.has(t.id));

    if (availableDutyTeachers.length === 0) {
      alert('Tüm nöbetçi öğretmenler devamsız! Görevlendirme yapılamıyor.');
      return;
    }

    // Cumulative substitution counts from ALL dates (excluding today which we'll rebuild)
    const cumulativeCounts: Record<string, number> = {};
    availableDutyTeachers.forEach(t => { cumulativeCounts[t.id] = 0; });

    substitutions
      .filter(s => s.date !== selectedDate && s.substituteTeacherId)
      .forEach(s => {
        if (cumulativeCounts[s.substituteTeacherId] !== undefined) {
          cumulativeCounts[s.substituteTeacherId]++;
        }
      });

    const currentSubstitutions = substitutions.filter(s => s.date !== selectedDate);
    const newSubstitutions: Substitution[] = [];
    const unassignedLessons: { hour: number; className: string; absentTeacherName: string }[] = [];

    // Track today's assignments per teacher and per (teacherId, hour) slot
    const todayCounts: Record<string, number> = {};
    availableDutyTeachers.forEach(t => { todayCounts[t.id] = 0; });
    const assignedSlots = new Set<string>(); // "teacherId-hour"

    // Collect all lessons that need coverage, sorted by hour for deterministic ordering
    const lessonsToAssign: { hour: number; className: string; absentTeacher: Teacher }[] = [];

    dailyAbsences.forEach(absence => {
      const teacher = teachers.find(t => t.id === absence.teacherId);
      if (!teacher?.schedule?.[dayOfWeek]) return;

      const classesToday = teacher.schedule[dayOfWeek];
      Object.entries(classesToday).forEach(([hourStr, className]) => {
        lessonsToAssign.push({
          hour: parseInt(hourStr, 10),
          className,
          absentTeacher: teacher,
        });
      });
    });

    lessonsToAssign.sort((a, b) => a.hour - b.hour);

    for (const lesson of lessonsToAssign) {
      const { hour, className, absentTeacher } = lesson;

      // Filter candidates: not absent, free at this hour (no own class), not already covering another class this hour
      const candidates = availableDutyTeachers.filter(dt => {
        const hasOwnClass = !!dt.schedule?.[dayOfWeek]?.[hour];
        const alreadyAssignedThisHour = assignedSlots.has(`${dt.id}-${hour}`);
        return !hasOwnClass && !alreadyAssignedThisHour;
      });

      if (candidates.length === 0) {
        unassignedLessons.push({
          hour,
          className,
          absentTeacherName: absentTeacher.name,
        });
        continue;
      }

      // Pick the candidate with the lowest cumulative count; tie-break by today's count
      candidates.sort((a, b) => {
        const cumDiff = cumulativeCounts[a.id] - cumulativeCounts[b.id];
        if (cumDiff !== 0) return cumDiff;
        return todayCounts[a.id] - todayCounts[b.id];
      });

      const chosen = candidates[0];

      newSubstitutions.push({
        id: uuidv4(),
        date: selectedDate,
        hour,
        className,
        absentTeacherId: absentTeacher.id,
        substituteTeacherId: chosen.id,
      });

      todayCounts[chosen.id]++;
      cumulativeCounts[chosen.id]++;
      assignedSlots.add(`${chosen.id}-${hour}`);
    }

    setSubstitutions([...currentSubstitutions, ...newSubstitutions]);

    setSummary({
      perTeacher: availableDutyTeachers.map(t => ({
        id: t.id,
        name: t.name,
        todayCount: todayCounts[t.id],
        cumulativeCount: cumulativeCounts[t.id],
      })).sort((a, b) => b.todayCount - a.todayCount),
      unassignedLessons,
      totalAssigned: newSubstitutions.length,
      totalUnassigned: unassignedLessons.length,
    });
  };

  const formattedDate = format(parseISO(selectedDate), 'dd MMMM yyyy EEEE', { locale: tr });

  return (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold">Günlük İşlemler</h2>
            <p className="text-sm text-slate-500">Devamsızlık ve ders boşluk doldurma işlemleri</p>
          </div>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setSummary(null); }}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Distribution Summary */}
      {summary && (
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-slate-800">Dağıtım Özeti</h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                Atanan: {summary.totalAssigned} ders
              </div>
              {summary.totalUnassigned > 0 && (
                <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Atanamayan: {summary.totalUnassigned} ders
                </div>
              )}
            </div>

            {/* Per-teacher stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {summary.perTeacher.map(pt => (
                <div key={pt.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50">
                  <span className="text-sm font-medium text-slate-700 truncate mr-2">{pt.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      Bugün: {pt.todayCount}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      Top: {pt.cumulativeCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Unassigned warnings */}
            {summary.unassignedLessons.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-700">Atanamayan Dersler (nöbetçi müsait değil):</p>
                {summary.unassignedLessons.map((ul, i) => (
                  <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <span className="text-amber-800">
                      <span className="font-semibold">{ul.hour}. ders</span> — {ul.className} ({ul.absentTeacherName})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Absences */}
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Öğretmen Durumu</h3>
            <span className="text-sm text-slate-500">{formattedDate}</span>
          </div>
          <div className="p-4 max-h-[500px] overflow-y-auto">
            <div className="space-y-2">
              {teachers.map((teacher) => {
                const isAbsent = dailyAbsences.some((a) => a.teacherId === teacher.id);
                const isDuty = dutyTeachers.some(dt => dt.id === teacher.id);
                return (
                  <div
                    key={teacher.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isAbsent ? 'bg-red-50 border-red-200' : 'bg-surface border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isAbsent ? 'text-red-700' : 'text-slate-700'}`}>
                        {teacher.name}
                      </span>
                      {isDuty && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                          Nöbetçi
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleAbsence(teacher.id)}
                      disabled={!isAdmin}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                        isAbsent
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      } ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {isAbsent ? (
                        <>
                          <UserX className="w-4 h-4" /> Yok Yazıldı
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4" /> Okulda
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Substitutions */}
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Ders Görevlendirmeleri</h3>
            {isAdmin && (
              <button
                onClick={handleAutoAssign}
                disabled={dailyAbsences.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Otomatik Dağıt
              </button>
            )}
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto">
            {dailyAbsences.length === 0 ? (
              <div className="text-center text-slate-500 mt-10">
                Bugün için devamsız öğretmen bulunmuyor.
              </div>
            ) : dailySubstitutions.length === 0 ? (
              <div className="text-center text-slate-500 mt-10">
                {isAdmin ? 'Devamsız öğretmenlerin dersleri var. Dağıtmak için "Otomatik Dağıt" butonuna tıklayın.' : 'Henüz ders görevlendirmesi yapılmadı.'}
              </div>
            ) : (
              <div className="space-y-3">
                {dailySubstitutions
                  .sort((a, b) => a.hour - b.hour)
                  .map((sub) => {
                    const absentTeacher = teachers.find((t) => t.id === sub.absentTeacherId);
                    const substituteTeacher = sub.substituteTeacherId
                      ? teachers.find((t) => t.id === sub.substituteTeacherId)
                      : null;
                    const isUnassigned = !sub.substituteTeacherId;

                    const lt = lessonTimes.find(l => l.lesson === sub.hour);

                    // Check if substitute has own class at a different hour (show "boş ders" badge)
                    const subHasScheduleToday = substituteTeacher?.schedule?.[dayOfWeek];
                    const subTotalLessons = subHasScheduleToday
                      ? Object.keys(subHasScheduleToday).length
                      : 0;

                    return (
                      <div
                        key={sub.id}
                        className={`p-4 rounded-lg border ${
                          isUnassigned
                            ? 'border-amber-300 bg-amber-50/70'
                            : 'border-indigo-100 bg-indigo-50/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              isUnassigned ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                            }`}>
                              {sub.hour}. Ders
                            </span>
                            {lt && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {lt.start} - {lt.end}
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-slate-800">{sub.className}</span>
                        </div>
                        <div className="text-sm text-slate-600 space-y-1">
                          <p><span className="text-slate-400">Gelmeyen:</span> {absentTeacher?.name}</p>
                          {isUnassigned ? (
                            <p className="flex items-center gap-1.5 text-amber-700 font-medium">
                              <AlertTriangle className="w-4 h-4" />
                              Uygun nöbetçi bulunamadı
                            </p>
                          ) : (
                            <div className="flex items-center justify-between">
                              <p>
                                <span className="text-slate-400">Görevli:</span>{' '}
                                <span className="font-medium text-indigo-700">{substituteTeacher?.name}</span>
                              </p>
                              {substituteTeacher && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                  {subTotalLessons > 0 ? `${subTotalLessons} ders/gün` : 'Boş program'}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
