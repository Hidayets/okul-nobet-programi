import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO, getDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, UserX, UserCheck, RefreshCw, AlertTriangle, BarChart3, Clock, Printer, ChevronDown, Lightbulb, ShieldAlert, Users } from 'lucide-react';
import { Teacher, Assignment, Absence, Substitution, SchoolInfo, DEFAULT_SCHOOL_SETTINGS, calculateLessonTimes, AbsenceReason, ABSENCE_REASONS } from '../types';

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

  const [reasonPickerFor, setReasonPickerFor] = useState<string | null>(null);

  const handleMarkAbsent = (teacherId: string, reason: AbsenceReason) => {
    setAbsences((prev) => [...prev, { id: uuidv4(), date: selectedDate, teacherId, reason }]);
    setReasonPickerFor(null);
    setSummary(null);
  };

  const handleMarkPresent = (teacherId: string) => {
    setAbsences((prev) => prev.filter((a) => !(a.date === selectedDate && a.teacherId === teacherId)));
    setSubstitutions((prev) => prev.filter((s) => !(s.date === selectedDate && s.absentTeacherId === teacherId)));
    setSummary(null);
  };

  // Nöbetçi olduğu halde devamsız olan öğretmenler
  const absentDutyTeachers = useMemo(() => {
    return dutyTeachers.filter(t => absentIdSet.has(t.id));
  }, [dutyTeachers, absentIdSet]);

  // Nöbet değişikliği önerileri: boş dersi en çok olan, nöbet sayısı en az olan
  const dutyReplacements = useMemo(() => {
    if (absentDutyTeachers.length === 0) return [];
    return teachers
      .filter(t => {
        if (absentIdSet.has(t.id)) return false;
        if (dutyTeachers.some(dt => dt.id === t.id)) return false;
        if (t.dutyType === 'nobetDisi') return false;
        return true;
      })
      .map(t => {
        const schedule = t.schedule?.[dayOfWeek] || {};
        const freeHours = settings.lessonCount - Object.keys(schedule).length;
        const totalDutyCount = assignments.filter(a => a.teacherId === t.id).length;
        return { teacher: t, freeHours, totalDutyCount };
      })
      .filter(item => item.freeHours > 0)
      .sort((a, b) => {
        if (b.freeHours !== a.freeHours) return b.freeHours - a.freeHours;
        return a.totalDutyCount - b.totalDutyCount;
      })
      .slice(0, 5);
  }, [teachers, absentIdSet, dutyTeachers, absentDutyTeachers, dayOfWeek, settings.lessonCount, assignments]);

  // Nöbetçi olmayan ama boş dersi olan öğretmenler
  const nonDutyFreeSuggestions = useMemo(() => {
    return teachers
      .filter(t => {
        if (t.dutyType === 'nobetDisi') return false;
        if (dutyTeachers.some(dt => dt.id === t.id)) return false;
        if (absentIdSet.has(t.id)) return false;
        return true;
      })
      .map(t => {
        const schedule = t.schedule?.[dayOfWeek] || {};
        const busySet = new Set(Object.keys(schedule).map(Number));
        const freeHoursList: number[] = [];
        for (let h = 1; h <= settings.lessonCount; h++) {
          if (!busySet.has(h)) freeHoursList.push(h);
        }
        return { teacher: t, freeHours: freeHoursList };
      })
      .filter(item => item.freeHours.length > 0)
      .sort((a, b) => b.freeHours.length - a.freeHours.length);
  }, [teachers, dutyTeachers, absentIdSet, dayOfWeek, settings.lessonCount]);

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

  const [isPrinting, setIsPrinting] = useState(false);

  const printableSubs = useMemo(() => {
    return dailySubstitutions
      .filter(s => s.substituteTeacherId)
      .sort((a, b) => a.hour - b.hour)
      .map((sub, i) => ({
        index: i + 1,
        substitute: teachers.find(t => t.id === sub.substituteTeacherId)?.name || '-',
        absent: teachers.find(t => t.id === sub.absentTeacherId)?.name || '-',
        className: sub.className,
        hour: sub.hour,
        time: lessonTimes.find(l => l.lesson === sub.hour),
      }));
  }, [dailySubstitutions, teachers, lessonTimes]);

  const handlePrintSubstitutions = () => {
    if (printableSubs.length === 0) {
      alert('Yazdırılacak görevlendirme bulunmuyor.');
      return;
    }
    setIsPrinting(true);
  };

  useEffect(() => {
    if (isPrinting) {
      const timer = setTimeout(() => {
        if ((window as any).electronAPI?.print) {
          (window as any).electronAPI.print();
        } else {
          window.print();
        }
        setIsPrinting(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isPrinting]);

  const okulAdi = schoolInfo.okulAdi || '';
  const mudur = schoolInfo.okulMuduru || '';
  const yardimcilar = (schoolInfo.mudurYardimcilari || []).map(v => v.name);

  return (
    <div className="space-y-6 daily-ops-container">
      {/* Print styles */}
      {isPrinting && (
        <style type="text/css" media="print">
          {`
            @page { size: portrait; margin: 1.5cm; }
            .daily-ops-container > *:not(.daily-print-section):not(style) { display: none !important; }
            .daily-print-section { display: block !important; }
            .daily-print-section * { color: black !important; }
            .daily-print-section table { border-collapse: collapse !important; width: 100% !important; }
            .daily-print-section th, .daily-print-section td { border: 1.5px solid #334155 !important; padding: 8px 12px !important; font-size: 13px !important; }
            .daily-print-section th { background-color: #f1f5f9 !important; font-weight: 700 !important; text-align: center !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          `}
        </style>
      )}

      {/* Printable substitution section */}
      <div className="daily-print-section hidden" style={isPrinting ? { display: 'none' } : undefined}>
        <div style={{ textAlign: 'center', marginBottom: '24px', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
          {okulAdi && <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{okulAdi}</div>}
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Ders Görevlendirme Çizelgesi</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>{formattedDate}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Sıra</th>
              <th>Görevli Öğretmen</th>
              <th>Gelmeyen Öğretmen</th>
              <th>Sınıf</th>
              <th>Ders Saati</th>
            </tr>
          </thead>
          <tbody>
            {printableSubs.map(sub => (
              <tr key={sub.index}>
                <td style={{ textAlign: 'center' }}>{sub.index}</td>
                <td>{sub.substitute}</td>
                <td>{sub.absent}</td>
                <td>{sub.className}</td>
                <td style={{ textAlign: 'center' }}>{sub.hour}. Ders{sub.time ? ` (${sub.time.start}-${sub.time.end})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '60px', padding: '0 20px' }}>
          {yardimcilar.map((name, i) => (
            <div key={i} style={{ textAlign: 'center', minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '50px' }}>Müdür Yardımcısı</div>
              <div style={{ fontSize: '12px', fontWeight: 600, borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>{name}</div>
            </div>
          ))}
          {mudur && (
            <div style={{ textAlign: 'center', minWidth: '160px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '50px' }}>Okul Müdürü</div>
              <div style={{ fontSize: '12px', fontWeight: 600, borderTop: '1px solid #94a3b8', paddingTop: '4px' }}>{mudur}</div>
            </div>
          )}
        </div>
      </div>

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
                const absence = dailyAbsences.find((a) => a.teacherId === teacher.id);
                const isAbsent = !!absence;
                const isDuty = dutyTeachers.some(dt => dt.id === teacher.id);
                const reasonInfo = absence?.reason ? ABSENCE_REASONS.find(r => r.id === absence.reason) : null;
                const isReasonOpen = reasonPickerFor === teacher.id;

                return (
                  <div
                    key={teacher.id}
                    className={`relative p-3 rounded-lg border ${
                      isAbsent ? 'bg-red-50 border-red-200' : 'bg-surface border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isAbsent ? 'text-red-700' : 'text-slate-700'}`}>
                          {teacher.name}
                        </span>
                        {isDuty && (
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            Nöbetçi
                          </span>
                        )}
                        {reasonInfo && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                            {reasonInfo.label}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (isAbsent) {
                            handleMarkPresent(teacher.id);
                          } else if (isAdmin) {
                            setReasonPickerFor(isReasonOpen ? null : teacher.id);
                          }
                        }}
                        disabled={!isAdmin}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors flex-shrink-0 ${
                          isAbsent
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        } ${!isAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        {isAbsent ? (
                          <>
                            <UserX className="w-4 h-4" /> Geri Al
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-4 h-4" /> Yok Yaz
                            <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>

                    {isReasonOpen && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ABSENCE_REASONS.map(r => (
                          <button
                            key={r.id}
                            onClick={() => handleMarkAbsent(teacher.id, r.id)}
                            className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors border border-red-200"
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
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
            <div className="flex items-center gap-2">
              {dailySubstitutions.length > 0 && (
                <button
                  onClick={handlePrintSubstitutions}
                  className="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Yazdır
                </button>
              )}
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

      {/* Nöbetçi Değişikliği Önerisi */}
      {absentDutyTeachers.length > 0 && dutyReplacements.length > 0 && (
        <div className="bg-surface rounded-xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 bg-amber-50/50 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-800">Nöbet Değişikliği Gerekli</h3>
              <p className="text-xs text-amber-600 mt-0.5">
                {absentDutyTeachers.map(t => t.name).join(', ')} bugün nöbetçi olduğu halde devamsız.
              </p>
            </div>
          </div>
          <div className="p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Önerilen yedek nöbetçiler:</p>
            <div className="space-y-2">
              {dutyReplacements.map((item, i) => (
                <div key={item.teacher.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-amber-700 w-6">{i + 1}.</span>
                    <div>
                      <span className="text-sm font-medium text-slate-800">{item.teacher.name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-emerald-600 font-medium">{item.freeHours} boş ders</span>
                        <span className="text-xs text-slate-400">|</span>
                        <span className="text-xs text-slate-500">Toplam {item.totalDutyCount} nöbet</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Boş Dersi Olan Öğretmenler (nöbetçi olmayan) */}
      {dailyAbsences.length > 0 && nonDutyFreeSuggestions.length > 0 && (
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-violet-600" />
            <div>
              <h3 className="font-semibold text-slate-800">Görevlendirilebilecek Öğretmenler</h3>
              <p className="text-xs text-slate-500 mt-0.5">Nöbetçi olmadığı halde bugün boş dersi olan öğretmenler</p>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {nonDutyFreeSuggestions.slice(0, 12).map(item => (
                <div key={item.teacher.id} className="flex items-center justify-between p-2.5 rounded-lg border border-violet-100 bg-violet-50/30">
                  <span className="text-sm font-medium text-slate-700 truncate mr-2">{item.teacher.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                      {item.freeHours.length} boş
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ({item.freeHours.join(', ')}. ders)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
