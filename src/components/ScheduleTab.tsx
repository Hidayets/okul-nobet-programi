import React, { useState, useMemo, useEffect, useRef } from 'react';
import { format, parseISO, getISOWeek, getDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Calendar, Printer, Send, X, CheckCircle2, BarChart3, Archive, Trash2, ChevronDown, ChevronUp, ArrowLeft, ArrowRight, Palette, Layers } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo, ScheduleArchive, formatAcademicYear, canTeacherDutyOnDay } from '../types';

type ZebraColor = 'none' | 'blue' | 'green' | 'purple' | 'amber';

const ZEBRA_COLORS: { id: ZebraColor; label: string; swatch: string; print: string }[] = [
  { id: 'none', label: 'Renksiz', swatch: '#ffffff', print: 'transparent' },
  { id: 'blue', label: 'Mavi', swatch: '#dbeafe', print: '#dbeafe' },
  { id: 'green', label: 'Yeşil', swatch: '#dcfce7', print: '#dcfce7' },
  { id: 'purple', label: 'Mor', swatch: '#ede9fe', print: '#ede9fe' },
  { id: 'amber', label: 'Sarı', swatch: '#fef3c7', print: '#fef3c7' },
];

const ZEBRA_STORAGE_KEY = 'pdfZebraColor';

interface Props {
  assignments: Assignment[];
  setAssignments?: React.Dispatch<React.SetStateAction<Assignment[]>>;
  teachers: Teacher[];
  locations: Location[];
  schoolInfo: SchoolInfo;
  isAdmin?: boolean;
  activeYear?: string;
  scheduleArchives?: ScheduleArchive[];
  setScheduleArchives?: React.Dispatch<React.SetStateAction<ScheduleArchive[]>>;
}

export default function ScheduleTab({ assignments, setAssignments, teachers, locations, schoolInfo, isAdmin = false, activeYear, scheduleArchives = [], setScheduleArchives }: Props) {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  const [printMode, setPrintMode] = useState<'schedule' | 'dutyCounts' | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [zebraColor, setZebraColor] = useState<ZebraColor>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(ZEBRA_STORAGE_KEY)) as ZebraColor | null;
    return saved && ZEBRA_COLORS.some(z => z.id === saved) ? saved : 'blue';
  });
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [popover, setPopover] = useState<{ assignmentId: string; teacherId: string; date: string; locationId: string } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(ZEBRA_STORAGE_KEY, zebraColor);
  }, [zebraColor]);

  useEffect(() => {
    if (!popover && !colorPickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [popover, colorPickerOpen]);

  const handleCancelSchedule = () => {
    if (setAssignments) {
      setAssignments([]);
    }
    setShowCancelConfirm(false);
  };

  const toggleDoubleDuty = (assignmentId: string) => {
    if (!setAssignments) return;
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, isDoubleDuty: !a.isDoubleDuty } : a));
  };

  const removeAssignment = (assignmentId: string) => {
    if (!setAssignments) return;
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    setPopover(null);
  };

  const replaceAssignmentTeacher = (assignmentId: string, newTeacherId: string) => {
    if (!setAssignments) return;
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, teacherId: newTeacherId } : a));
    setPopover(null);
  };

  const shiftTeachersByOne = (direction: 'forward' | 'backward') => {
    if (!setAssignments) return;
    const dates = Array.from(new Set(assignments.map(a => a.date))).sort();
    const next = assignments.map(a => ({ ...a }));
    for (const date of dates) {
      const dayAssignments = next.filter(a => a.date === date);
      const grouped: Record<string, Assignment[]> = {};
      for (const a of dayAssignments) {
        if (!grouped[a.locationId]) grouped[a.locationId] = [];
        grouped[a.locationId].push(a);
      }
      const locIds = locations.map(l => l.id).filter(id => grouped[id]?.length);
      if (locIds.length < 2) continue;
      const teacherLists = locIds.map(id => grouped[id].map(a => a.teacherId));
      const rotated = direction === 'forward'
        ? [teacherLists[teacherLists.length - 1], ...teacherLists.slice(0, -1)]
        : [...teacherLists.slice(1), teacherLists[0]];
      locIds.forEach((id, idx) => {
        const newIds = rotated[idx];
        grouped[id].forEach((a, i) => { a.teacherId = newIds[i] ?? a.teacherId; });
      });
    }
    setAssignments(next);
  };

  const shiftDaysByOne = (direction: 'forward' | 'backward') => {
    if (!setAssignments) return;
    const dates = Array.from(new Set(assignments.map(a => a.date))).sort();
    if (dates.length < 2) return;
    const rotatedDates = direction === 'forward'
      ? [dates[dates.length - 1], ...dates.slice(0, -1)]
      : [...dates.slice(1), dates[0]];
    const dateMap: Record<string, string> = {};
    dates.forEach((d, i) => { dateMap[d] = rotatedDates[i]; });
    setAssignments(prev => prev.map(a => ({ ...a, date: dateMap[a.date] ?? a.date })));
  };

  const teacherDailyLessonCount = (teacherId: string, dayOfWeek: number): number => {
    const t = teachers.find(x => x.id === teacherId);
    if (!t?.schedule) return 0;
    const day = t.schedule[dayOfWeek];
    if (!day) return 0;
    return Object.values(day).filter(v => v && String(v).trim()).length;
  };

  const scheduleData = useMemo(() => {
    const data: Record<string, Record<string, { teacher: Teacher; assignment: Assignment }[]>> = {};
    const dates = new Set<string>();

    assignments.forEach((assignment) => {
      dates.add(assignment.date);
      if (!data[assignment.date]) {
        data[assignment.date] = {};
      }
      if (!data[assignment.date][assignment.locationId]) {
        data[assignment.date][assignment.locationId] = [];
      }

      const teacher = teachers.find(t => t.id === assignment.teacherId);
      if (teacher) {
        data[assignment.date][assignment.locationId].push({ teacher, assignment });
      }
    });

    const sortedDates = Array.from(dates).sort();
    return { data, sortedDates };
  }, [assignments, teachers]);

  const hasDoubleDuty = useMemo(() => assignments.some(a => a.isDoubleDuty), [assignments]);

  const popoverInfo = useMemo(() => {
    if (!popover) return null;
    const teacher = teachers.find(t => t.id === popover.teacherId);
    if (!teacher) return null;
    const date = parseISO(popover.date);
    const dayOfWeek = getDay(date);
    const lessonCount = teacherDailyLessonCount(teacher.id, dayOfWeek);
    const targetWeek = getISOWeek(date);
    const sameWeek = assignments.filter(a => {
      if (a.teacherId !== teacher.id || a.id === popover.assignmentId) return false;
      return getISOWeek(parseISO(a.date)) === targetWeek;
    });
    const weekDutyCount = sameWeek.length + 1;
    const totalDuties = assignments.filter(a => a.teacherId === teacher.id).length;
    const sameDay = assignments.filter(a =>
      a.teacherId === teacher.id && a.date === popover.date && a.id !== popover.assignmentId,
    );
    const dayConflict = !canTeacherDutyOnDay(teacher, dayOfWeek);
    const candidateTeachers = teachers
      .filter(t => t.id !== teacher.id && t.dutyType !== 'nobetDisi' && canTeacherDutyOnDay(t, dayOfWeek))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    const currentAssignment = assignments.find(a => a.id === popover.assignmentId);
    return {
      teacher,
      lessonCount,
      weekDutyCount,
      sameWeek,
      totalDuties,
      sameDay,
      dayConflict,
      candidateTeachers,
      currentAssignment,
      dayOfWeek,
    };
  }, [popover, teachers, assignments]);

  const uniqueTeachersInSchedule = useMemo(() => {
    const teacherIds = new Set(assignments.map(a => a.teacherId));
    return teachers
      .filter(t => teacherIds.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [assignments, teachers]);

  const dutyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.forEach(a => {
      counts[a.teacherId] = (counts[a.teacherId] || 0) + 1;
    });
    return teachers
      .filter(t => counts[t.id])
      .map(t => ({ name: t.name, count: counts[t.id] }))
      .sort((a, b) => b.count - a.count);
  }, [assignments, teachers]);

  const triggerPrint = () => {
    if ((window as any).electronAPI?.print) {
      (window as any).electronAPI.print();
    } else {
      window.print();
    }
  };

  const handlePrint = () => {
    setPrintMode('schedule');
  };

  const handlePrintDutyCounts = () => {
    setPrintMode('dutyCounts');
  };

  useEffect(() => {
    if (printMode) {
      const timer = setTimeout(() => {
        triggerPrint();
        setPrintMode(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [printMode]);

  const [emailResult, setEmailResult] = useState<{ sent: number; failed: number; details?: any[] } | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const teachersWithDuties = useMemo(() => {
    const map = new Map<string, { teacher: Teacher; duties: { date: string; location: string }[] }>();
    assignments.forEach(a => {
      const teacher = teachers.find(t => t.id === a.teacherId);
      if (!teacher || !teacher.email) return;
      if (!map.has(teacher.id)) {
        map.set(teacher.id, { teacher, duties: [] });
      }
      const loc = locations.find(l => l.id === a.locationId);
      map.get(teacher.id)!.duties.push({
        date: format(parseISO(a.date), 'dd.MM.yyyy EEEE', { locale: tr }),
        location: loc?.name || '-',
      });
    });
    return Array.from(map.values());
  }, [assignments, teachers, locations]);

  const teachersWithoutEmail = useMemo(() => {
    const ids = new Set(assignments.map(a => a.teacherId));
    return teachers.filter(t => ids.has(t.id) && !t.email);
  }, [assignments, teachers]);

  const [showConfirm, setShowConfirm] = useState(false);

  const handleSendNotifications = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }
    setShowConfirm(false);
    setNotificationStatus('sending');
    setEmailError(null);
    setEmailResult(null);

    if (!schoolInfo.gmailEmail || !schoolInfo.gmailAppPassword) {
      setEmailError('Gmail ayarları yapılmamış. Ayarlar sayfasından Gmail adresinizi ve uygulama şifrenizi girin.');
      setNotificationStatus('idle');
      return;
    }

    if (teachersWithDuties.length === 0) {
      setEmailError('E-posta adresi olan nöbetçi öğretmen bulunamadı.');
      setNotificationStatus('idle');
      return;
    }

    const okulAdi = schoolInfo.okulAdi || 'Okul';
    const recipients = teachersWithDuties.map(({ teacher, duties }) => {
      const dutyRows = duties
        .map(d => `<tr><td style="border:1px solid #ddd;padding:6px 10px">${d.date}</td><td style="border:1px solid #ddd;padding:6px 10px">${d.location}</td></tr>`)
        .join('');

      return {
        email: teacher.email,
        subject: `${okulAdi} - Nöbet Görev Bilgilendirmesi`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <h2 style="color:#4338ca">Nöbet Görev Bilgilendirmesi</h2>
            <p>Sayın <strong>${teacher.name}</strong>,</p>
            <p>Aşağıda nöbet görev programınız yer almaktadır:</p>
            <table style="border-collapse:collapse;width:100%;margin:16px 0">
              <thead><tr>
                <th style="border:1px solid #ddd;padding:8px 10px;background:#f0f0f0;text-align:left">Tarih</th>
                <th style="border:1px solid #ddd;padding:8px 10px;background:#f0f0f0;text-align:left">Nöbet Yeri</th>
              </tr></thead>
              <tbody>${dutyRows}</tbody>
            </table>
            <p style="color:#666;font-size:13px">İyi çalışmalar dileriz.<br><strong>${okulAdi}</strong></p>
          </div>
        `,
      };
    });

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gmailEmail: schoolInfo.gmailEmail,
          gmailAppPassword: schoolInfo.gmailAppPassword,
          recipients,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEmailError(data.error || 'E-posta gönderilemedi.');
        setNotificationStatus('idle');
        return;
      }

      setEmailResult({ sent: data.sent, failed: data.failed, details: data.details });
      setNotificationStatus('success');
      setTimeout(() => {
        setShowNotificationModal(false);
        setNotificationStatus('idle');
        setEmailResult(null);
      }, 5000);
    } catch {
      setEmailError('Bağlantı hatası. Sunucu çalıştığından emin olun.');
      setNotificationStatus('idle');
    }
  };

  if (assignments.length === 0) {
    return (
      <div className="bg-surface p-12 rounded-2xl shadow-sm border border-slate-200 text-center">
        <div className="bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Calendar className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Henüz Program Oluşturulmadı</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          "Program Oluştur" sekmesine giderek öğretmenleriniz ve nöbet yerleriniz için yeni bir dönerli nöbet çizelgesi hazırlayabilirsiniz.
        </p>
      </div>
    );
  }

  const firstDate = scheduleData.sortedDates[0];
  const monthName = firstDate ? format(parseISO(firstDate), 'MMMM', { locale: tr }).toLocaleUpperCase('tr-TR') : '';
  const yearLabel = activeYear ? formatAcademicYear(activeYear) : '';

  return (
    <div className="space-y-6 relative">
      {/* Dynamic print CSS based on printMode */}
      <style type="text/css" media="print">
        {`
          @page { margin: 0.5cm; }
          html, body { font-size: 9pt !important; }
          table { border-collapse: collapse !important; width: 100% !important; table-layout: fixed !important; }
          th, td { border: 1px solid black !important; padding: 2px 4px !important; color: black !important; background-color: transparent !important; font-size: 8pt !important; line-height: 1.2 !important; }
          th { font-weight: bold !important; font-size: 8pt !important; }
          .print-no-border { border: none !important; }
          .print-header-block { font-size: 10pt !important; margin-bottom: 4px !important; line-height: 1.3 !important; }
          .print-title-block { font-size: 11pt !important; margin-bottom: 4px !important; }
          .print-footer-block { font-size: 7pt !important; margin-top: 6px !important; }
          .print-footer-block li { margin-bottom: 0 !important; }
          .print-week-sep td { padding: 1px 4px !important; font-size: 7pt !important; }
          .print-zebra-row td { background-color: ${ZEBRA_COLORS.find(z => z.id === zebraColor)?.print || 'transparent'} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          ${printMode === 'schedule' ? `
            @page { size: landscape; }
            .duty-counts-print-section { display: none !important; }
          ` : ''}
          ${printMode === 'dutyCounts' ? `
            @page { size: portrait; }
            .schedule-print-section { display: none !important; }
            .duty-counts-print-section { display: block !important; position: static !important; left: auto !important; top: auto !important; }
            .duty-counts-print-section table { table-layout: auto !important; }
            .duty-counts-print-section th, .duty-counts-print-section td { font-size: 10pt !important; padding: 4px 8px !important; }
          ` : ''}
        `}
      </style>

      {/* Screen UI controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Nöbet Çizelgesi</h2>
          <p className="text-sm text-slate-500 mt-1">
            {scheduleData.sortedDates.length} günlük program oluşturuldu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && setAssignments && (
            <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden" title="Tüm öğretmenleri yer/gün rotasyonuyla kaydır">
              <button
                onClick={() => shiftTeachersByOne('backward')}
                className="px-2 py-1.5 hover:bg-slate-100 text-slate-600 transition-colors flex items-center gap-1 text-xs"
                title="Öğretmenleri 1 yer geri kaydır"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Yer
              </button>
              <button
                onClick={() => shiftTeachersByOne('forward')}
                className="px-2 py-1.5 hover:bg-slate-100 text-slate-600 border-l border-slate-200 transition-colors flex items-center gap-1 text-xs"
                title="Öğretmenleri 1 yer ileri kaydır"
              >
                Yer
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => shiftDaysByOne('backward')}
                className="px-2 py-1.5 hover:bg-slate-100 text-slate-600 border-l border-slate-200 transition-colors flex items-center gap-1 text-xs"
                title="Günleri 1 geri kaydır"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Gün
              </button>
              <button
                onClick={() => shiftDaysByOne('forward')}
                className="px-2 py-1.5 hover:bg-slate-100 text-slate-600 border-l border-slate-200 transition-colors flex items-center gap-1 text-xs"
                title="Günleri 1 ileri kaydır"
              >
                Gün
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => { setColorPickerOpen(o => !o); setPopover(null); }}
              className="bg-surface border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              title="PDF satır rengi"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden md:inline">PDF Renk</span>
              <span
                className="inline-block w-3 h-3 rounded-sm border border-slate-300"
                style={{ background: ZEBRA_COLORS.find(z => z.id === zebraColor)?.swatch }}
              />
            </button>
            {colorPickerOpen && (
              <div className="absolute right-0 mt-1 bg-surface border border-slate-200 rounded-lg shadow-lg p-2 z-40 w-44">
                {ZEBRA_COLORS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setZebraColor(c.id); setColorPickerOpen(false); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-slate-100 ${
                      zebraColor === c.id ? 'bg-slate-100 font-medium' : ''
                    }`}
                  >
                    <span
                      className="inline-block w-4 h-4 rounded-sm border border-slate-300"
                      style={{ background: c.swatch }}
                    />
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {isAdmin && setAssignments && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              İptal Et
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowNotificationModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4" />
              Bildirim Gönder
            </button>
          )}
          <button
            onClick={handlePrint}
            className="bg-surface border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Yazdır
          </button>
        </div>
      </div>

      {/* Schedule Table - printable for 'schedule' mode */}
      <div className="schedule-print-section bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:overflow-visible">
        
        {/* Print Header */}
        <div className="hidden print:block text-center font-bold print-header-block">
          <div>T.C.</div>
          {schoolInfo.valilik && <div>{schoolInfo.valilik.toLocaleUpperCase('tr-TR')} VALİLİĞİ</div>}
          {schoolInfo.kaymakamlik && <div>{schoolInfo.kaymakamlik.toLocaleUpperCase('tr-TR')} KAYMAKAMLIĞI</div>}
          {schoolInfo.okulAdi && <div>{schoolInfo.okulAdi.toLocaleUpperCase('tr-TR')}</div>}
        </div>

        <div className="hidden print:block text-center font-bold print-title-block">
          {monthName} AYI NÖBET PROGRAMI
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse print:text-[8pt] print:border print:border-black">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 print:bg-transparent print:border-black">
                <th className="py-4 px-6 print:py-0.5 print:px-1 font-semibold text-slate-700 print:text-black whitespace-nowrap sticky left-0 bg-slate-50 print:bg-transparent z-10 border-r border-slate-200 print:border print:border-black">
                  Tarih / Gün
                </th>
                {locations.map((location) => (
                  <th key={location.id} className="py-4 px-6 print:py-0.5 print:px-1 font-semibold text-slate-700 print:text-black min-w-[150px] print:min-w-0 print:border print:border-black">
                    {location.name}
                  </th>
                ))}
                {schoolInfo.mudurYardimcilari.length > 0 && (
                  <th className="py-4 px-6 print:py-0.5 print:px-1 font-semibold text-slate-700 print:text-black min-w-[150px] print:min-w-0 print:border print:border-black">
                    Nöbetçi Md. Yrd.
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="border-b border-slate-200 print:border-black">
              {scheduleData.sortedDates.map((date, index) => {
                const parsedDate = parseISO(date);
                const formattedDate = format(parsedDate, 'dd.MM.yyyy');
                const dayName = format(parsedDate, 'EEEE', { locale: tr });
                const weekNum = getISOWeek(parsedDate);

                const prevDate = index > 0 ? parseISO(scheduleData.sortedDates[index - 1]) : null;
                const prevWeek = prevDate ? getISOWeek(prevDate) : null;
                const isNewWeek = index === 0 || weekNum !== prevWeek;

                const vpCount = schoolInfo.mudurYardimcilari.length;
                const assignedVp = vpCount > 0 ? schoolInfo.mudurYardimcilari[index % vpCount] : null;

                const colCount = locations.length + 1 + (vpCount > 0 ? 1 : 0);

                return (
                  <React.Fragment key={date}>
                    {isNewWeek && (
                      <tr className="print:break-inside-avoid print-week-sep">
                        <td
                          colSpan={colCount}
                          className={`py-2 px-6 print:py-0 print:px-1 text-xs font-bold text-slate-500 print:text-black bg-slate-100 print:bg-gray-200 tracking-wide ${
                            index > 0 ? 'border-t-[3px] border-slate-400 print:border-t-[2px] print:border-black' : ''
                          } print:border print:border-black`}
                        >
                          {weekNum}. HAFTA
                        </td>
                      </tr>
                    )}
                    <tr className={`hover:bg-slate-50/50 transition-colors print:hover:bg-transparent border-b border-slate-200 print:border-black ${index % 2 === 1 ? 'print-zebra-row' : ''}`}>
                      <td className="py-4 px-6 print:py-0.5 print:px-1 whitespace-nowrap sticky left-0 bg-surface print:bg-transparent group-hover:bg-slate-50/50 z-10 border-r border-slate-200 print:border print:border-black">
                        <div className="font-medium text-slate-900 print:text-black print:leading-tight">{formattedDate}</div>
                        <div className="text-sm text-slate-500 print:text-black print:text-[7pt] print:leading-tight">{dayName}</div>
                      </td>
                      {locations.map((location) => {
                        const cellEntries = scheduleData.data[date]?.[location.id] || [];
                        return (
                          <td key={location.id} className="py-4 px-6 print:py-0.5 print:px-1 print:border print:border-black align-top">
                            {cellEntries.length > 0 ? (
                              <div className="flex flex-col gap-1 print:gap-0">
                                {cellEntries.map(({ teacher, assignment }) => {
                                  const isDouble = !!assignment.isDoubleDuty;
                                  const canEdit = isAdmin && !!setAssignments;
                                  return (
                                    <button
                                      key={assignment.id}
                                      type="button"
                                      onClick={(e) => {
                                        if (!canEdit) return;
                                        e.stopPropagation();
                                        setPopover({
                                          assignmentId: assignment.id,
                                          teacherId: teacher.id,
                                          date,
                                          locationId: location.id,
                                        });
                                      }}
                                      className={`text-left inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium border transition-colors print:p-0 print:border-none print:bg-transparent print:text-black print:leading-tight ${
                                        isDouble
                                          ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                          : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100'
                                      } ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                                      title={canEdit ? 'Düzenlemek için tıkla' : ''}
                                    >
                                      <span>{teacher.name}</span>
                                      {isDouble && (
                                        <span className="text-[10px] font-bold bg-amber-500 text-white px-1 rounded-sm print:bg-transparent print:text-black print:border print:border-black print:px-0.5">
                                          2x
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-slate-300 print:text-black text-sm">-</span>
                            )}
                          </td>
                        );
                      })}
                      {assignedVp && (
                        <td className="py-4 px-6 print:py-0.5 print:px-1 font-medium text-slate-700 print:text-black print:border print:border-black">
                          {assignedVp.name}
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Print Footer */}
        <div className="hidden print:block print-footer-block">
          {hasDoubleDuty && (
            <div className="mb-2" style={{ border: '1px solid #000', padding: '3px 6px', background: '#fef3c7' }}>
              <strong>NOT:</strong> Yanında "<strong>2x</strong>" işareti bulunan öğretmenler aynı gün <strong>çift nöbet</strong> tutmaktadır.
            </div>
          )}
          <h4 className="font-bold mb-1 underline">NÖBETÇİ ÖĞRETMEN GÖREV TALİMATNAMESİ</h4>
          <ol className="list-decimal pl-4 space-y-0 mb-4 text-justify">
            <li>Derse başlamadan 20 dk. önce okula gelir ve ders bitiminden 20 dk. sonra okuldan ayrılır.</li>
            <li>Nöbetçi öğretmen sabah ilk olarak derslikleri kontrol eder, bölümleri denetler ve okulun eğitim öğretime hazır olup olmadığını nöbet defterine yazarak giriş imzasını atar.</li>
            <li>Nöbetçi öğretmen, o gün gelmeyen öğretmenleri tespit ederek ilgili müdür yardımcısına bildirir, boş geçen derslere girerek defteri "Nöbetçi Öğretmen" yazarak imzalar.</li>
            <li>Nöbeti sonunda nöbet defterine nöbeti ile ilgili raporu yazar ve imzalar.</li>
          </ol>

          {uniqueTeachersInSchedule.length > 0 && (
            <div style={{ marginTop: '12px', pageBreakInside: 'avoid' }}>
              <h4 className="font-bold mb-1 underline">NÖBET PROGRAMI İMZA ÇİZELGESİ</h4>
              <p style={{ fontSize: '7pt', marginBottom: '4px' }}>Yukarıdaki nöbet programını okudum, anladım ve kabul ettim.</p>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #000', padding: '2px 6px', background: '#f0f0f0', width: '30px', fontSize: '7pt' }}>#</th>
                    <th style={{ border: '1px solid #000', padding: '2px 6px', background: '#f0f0f0', textAlign: 'left', fontSize: '7pt' }}>Öğretmen Adı Soyadı</th>
                    <th style={{ border: '1px solid #000', padding: '2px 6px', background: '#f0f0f0', width: '120px', fontSize: '7pt' }}>İmza</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueTeachersInSchedule.map((teacher, i) => (
                    <tr key={teacher.id}>
                      <td style={{ border: '1px solid #000', padding: '2px 6px', textAlign: 'center', fontSize: '7pt' }}>{i + 1}</td>
                      <td style={{ border: '1px solid #000', padding: '2px 6px', fontSize: '7pt' }}>{teacher.name}</td>
                      <td style={{ border: '1px solid #000', padding: '2px 6px', height: '20px' }}></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end items-start mt-4">
            <div className="text-center">
              <div className="font-bold">{schoolInfo.okulMuduru}</div>
              <div>Okul Müdürü</div>
            </div>
          </div>
        </div>

      </div>

      {/* Duty Counts Print Section */}
      <div className="duty-counts-print-section" style={{ display: printMode === 'dutyCounts' ? 'block' : 'none' }}>
        <div className="text-center font-bold" style={{ marginBottom: '12px' }}>
          <div>T.C.</div>
          {schoolInfo.valilik && <div>{schoolInfo.valilik.toLocaleUpperCase('tr-TR')} VALİLİĞİ</div>}
          {schoolInfo.kaymakamlik && <div>{schoolInfo.kaymakamlik.toLocaleUpperCase('tr-TR')} KAYMAKAMLIĞI</div>}
          {schoolInfo.okulAdi && <div>{schoolInfo.okulAdi.toLocaleUpperCase('tr-TR')}</div>}
          <div style={{ marginTop: '8px', fontSize: '14pt' }}>ÖĞRETMEN NÖBET SAYILARI</div>
          <div style={{ fontSize: '10pt', fontWeight: 'normal', color: '#555', marginTop: '4px' }}>
            {yearLabel || 'Eğitim-Öğretim Yılı'}
          </div>
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #000', padding: '4px 8px', background: '#f0f0f0', width: '40px' }}>#</th>
              <th style={{ border: '1px solid #000', padding: '4px 8px', background: '#f0f0f0', textAlign: 'left' }}>Öğretmen Adı</th>
              <th style={{ border: '1px solid #000', padding: '4px 8px', background: '#f0f0f0', width: '80px' }}>Nöbet Sayısı</th>
            </tr>
          </thead>
          <tbody>
            {dutyCounts.map((item, i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{item.name}</td>
                <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold' }}>{item.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: 'right', marginTop: '40px' }}>
          <div style={{ fontWeight: 'bold' }}>{schoolInfo.okulMuduru || ''}</div>
          <div>Okul Müdürü</div>
        </div>
      </div>

      {/* Duty Counts Summary on screen */}
      {dutyCounts.length > 0 && (
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-violet-100 p-2 rounded-lg text-violet-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Öğretmen Nöbet Sayıları</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {yearLabel ? `${yearLabel} — ` : ''}{dutyCounts.length} öğretmen, toplam {assignments.length} nöbet
                </p>
              </div>
            </div>
            <button
              onClick={handlePrintDutyCounts}
              className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Yazdır
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {dutyCounts.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <span className="text-sm text-slate-700 truncate mr-2">{item.name}</span>
                  <span className="bg-violet-100 text-violet-700 text-sm font-bold px-2 py-0.5 rounded-md flex-shrink-0">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Archives */}
      {scheduleArchives.length > 0 && (
        <ArchiveSection
          archives={scheduleArchives}
          teachers={teachers}
          locations={locations}
          schoolInfo={schoolInfo}
          isAdmin={isAdmin}
          onDelete={isAdmin && setScheduleArchives ? (archiveId) => {
            setScheduleArchives(prev => prev.filter(a => a.id !== archiveId));
          } : undefined}
        />
      )}

      {/* Smart popover: cell info + actions */}
      {popover && popoverInfo && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-24 px-4 print:hidden" onClick={() => setPopover(null)}>
          <div
            ref={popoverRef}
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">
                  {format(parseISO(popover.date), 'dd.MM.yyyy EEEE', { locale: tr })} —{' '}
                  {locations.find(l => l.id === popover.locationId)?.name || ''}
                </div>
                <div className="text-base font-semibold text-slate-800">{popoverInfo.teacher.name}</div>
              </div>
              <button onClick={() => setPopover(null)} className="text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                  <div className="text-[11px] text-slate-500">O gün ders</div>
                  <div className="text-lg font-bold text-slate-700">{popoverInfo.lessonCount}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                  <div className="text-[11px] text-slate-500">Bu hafta nöbet</div>
                  <div className="text-lg font-bold text-slate-700">{popoverInfo.weekDutyCount}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                  <div className="text-[11px] text-slate-500">Toplam nöbet</div>
                  <div className="text-lg font-bold text-slate-700">{popoverInfo.totalDuties}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                {popoverInfo.dayConflict && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
                    <span className="text-xs">⚠️ Bu öğretmen tercih ayarlarına göre {format(parseISO(popover.date), 'EEEE', { locale: tr })} günü nöbet tutmamalı.</span>
                  </div>
                )}
                {popoverInfo.lessonCount >= 8 && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
                    <span className="text-xs">⚠️ O gün {popoverInfo.lessonCount} dersi var (full).</span>
                  </div>
                )}
                {popoverInfo.lessonCount === 0 && (
                  <div className="flex items-center gap-2 text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1.5 rounded">
                    <span className="text-xs">ℹ️ O gün hiç dersi yok.</span>
                  </div>
                )}
                {popoverInfo.sameDay.length > 0 && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
                    <span className="text-xs">⚠️ Aynı gün başka nöbet(ler)i var ({popoverInfo.sameDay.length}). Çift nöbet sayılır.</span>
                  </div>
                )}
                {popoverInfo.sameWeek.length >= 2 && (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded">
                    <span className="text-xs">⚠️ Bu hafta {popoverInfo.sameWeek.length + 1} nöbeti var.</span>
                  </div>
                )}
              </div>

              {popoverInfo.currentAssignment && (
                <button
                  onClick={() => toggleDoubleDuty(popoverInfo.currentAssignment!.id)}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                    popoverInfo.currentAssignment.isDoubleDuty
                      ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  {popoverInfo.currentAssignment.isDoubleDuty ? 'Çift Nöbet İşaretini Kaldır' : 'Çift Nöbet Olarak İşaretle'}
                </button>
              )}

              {popoverInfo.candidateTeachers.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-1.5">Bu öğretmeni başkasıyla değiştir:</div>
                  <select
                    onChange={(e) => {
                      if (e.target.value) replaceAssignmentTeacher(popover.assignmentId, e.target.value);
                    }}
                    defaultValue=""
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-surface"
                  >
                    <option value="">Bir öğretmen seçin...</option>
                    {popoverInfo.candidateTeachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => removeAssignment(popover.assignmentId)}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Bu Nöbeti Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Schedule Confirmation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm print:hidden">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">Çizelgeyi İptal Et</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 mb-6">
                Mevcut nöbet çizelgesi tamamen silinecek. Bu işlem geri alınamaz.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Vazgeç
                </button>
                <button
                  onClick={handleCancelSchedule}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Evet, İptal Et
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm print:hidden">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-800">Bildirimleri Gönder</h3>
              <button 
                onClick={() => { setShowNotificationModal(false); setShowConfirm(false); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={notificationStatus === 'sending'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {notificationStatus === 'success' ? (
                <div className="text-center py-6">
                  <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h4 className="text-lg font-medium text-slate-800 mb-2">E-postalar Gönderildi!</h4>
                  {emailResult && (
                    <div className="space-y-1 text-sm">
                      <p className="text-emerald-600 font-medium">{emailResult.sent} e-posta başarıyla gönderildi.</p>
                      {emailResult.failed > 0 && (
                        <p className="text-red-500">{emailResult.failed} e-posta gönderilemedi.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {emailError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {emailError}
                    </div>
                  )}

                  {!schoolInfo.gmailEmail || !schoolInfo.gmailAppPassword ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                      <p className="text-sm text-amber-700">
                        Gmail ayarları yapılmamış. <strong>Ayarlar</strong> sayfasından Gmail adresinizi ve uygulama şifrenizi girmeniz gerekiyor.
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-slate-600 mb-4">
                        Nöbet programı, e-posta adresi kayıtlı öğretmenlere <strong>{schoolInfo.gmailEmail}</strong> adresinden gönderilecektir.
                      </p>

                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-slate-600">E-posta gönderilecek:</span>
                          <span className="font-semibold text-emerald-600">{teachersWithDuties.length} öğretmen</span>
                        </div>
                        {teachersWithoutEmail.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">E-postası olmayan:</span>
                            <span className="font-semibold text-amber-600">{teachersWithoutEmail.length} öğretmen</span>
                          </div>
                        )}
                      </div>

                      {teachersWithoutEmail.length > 0 && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-700 mb-1 font-medium">E-postası olmayan öğretmenler:</p>
                          <p className="text-xs text-amber-600">
                            {teachersWithoutEmail.map(t => t.name).join(', ')}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {showConfirm ? (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-2">
                      <p className="text-sm font-semibold text-amber-800 mb-3">
                        {teachersWithDuties.length} öğretmene e-posta göndermek istediğinize emin misiniz?
                      </p>
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setShowConfirm(false)}
                          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors text-sm"
                        >
                          Vazgeç
                        </button>
                        <button
                          onClick={handleSendNotifications}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                        >
                          <Send className="w-4 h-4" />
                          Evet, Gönder
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => { setShowNotificationModal(false); setEmailError(null); setShowConfirm(false); }}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                        disabled={notificationStatus === 'sending'}
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleSendNotifications}
                        disabled={notificationStatus === 'sending' || !schoolInfo.gmailEmail || !schoolInfo.gmailAppPassword || teachersWithDuties.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {notificationStatus === 'sending' ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Gönderiliyor...
                          </span>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            E-postaları Gönder
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ArchiveItem: React.FC<{
  archive: ScheduleArchive;
  teachers: Teacher[];
  locations: Location[];
  isExpanded: boolean;
  onToggle: () => void;
  onDelete?: (id: string) => void;
  confirmDeleteId: string | null;
  setConfirmDeleteId: React.Dispatch<React.SetStateAction<string | null>>;
}> = ({
  archive,
  teachers,
  locations,
  isExpanded,
  onToggle,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}) => {
  const archiveScheduleData = useMemo(() => {
    const data: Record<string, Record<string, Teacher[]>> = {};
    const dates = new Set<string>();
    archive.assignments.forEach((a) => {
      dates.add(a.date);
      if (!data[a.date]) data[a.date] = {};
      if (!data[a.date][a.locationId]) data[a.date][a.locationId] = [];
      const t = teachers.find(t2 => t2.id === a.teacherId);
      if (t) data[a.date][a.locationId].push(t);
    });
    return { data, sortedDates: Array.from(dates).sort() };
  }, [archive.assignments, teachers]);

  const archivedDate = new Date(archive.archivedAt);
  const archivedStr = format(archivedDate, 'dd.MM.yyyy HH:mm', { locale: tr });

  return (
    <div>
      <div
        className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <Archive className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div>
            <span className="font-medium text-slate-800">{archive.label}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-500">
                {archive.assignments.length} nöbet | Arşivlenme: {archivedStr}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            confirmDeleteId === archive.id ? (
              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { onDelete(archive.id); setConfirmDeleteId(null); }}
                  className="text-xs bg-red-600 text-white px-2.5 py-1 rounded-md font-medium hover:bg-red-700 transition-colors"
                >
                  Sil
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-xs bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md font-medium hover:bg-slate-300 transition-colors"
                >
                  İptal
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(archive.id); }}
                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                title="Arşivi Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="px-6 pb-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2 px-3 font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200">Tarih / Gün</th>
                  {locations.map(loc => (
                    <th key={loc.id} className="py-2 px-3 font-semibold text-slate-600 border-r border-slate-200 last:border-r-0">{loc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {archiveScheduleData.sortedDates.map(date => {
                  const parsed = parseISO(date);
                  return (
                    <tr key={date} className="border-b border-slate-100 last:border-b-0">
                      <td className="py-2 px-3 whitespace-nowrap border-r border-slate-200">
                        <div className="font-medium text-slate-700">{format(parsed, 'dd.MM.yyyy')}</div>
                        <div className="text-xs text-slate-400">{format(parsed, 'EEEE', { locale: tr })}</div>
                      </td>
                      {locations.map(loc => {
                        const assigned = archiveScheduleData.data[date]?.[loc.id] || [];
                        return (
                          <td key={loc.id} className="py-2 px-3 border-r border-slate-200 last:border-r-0">
                            {assigned.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {assigned.map((t, ti) => (
                                  <span key={ti} className="text-xs font-medium text-slate-700">{t.name}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function ArchiveSection({
  archives,
  teachers,
  locations,
  schoolInfo,
  isAdmin,
  onDelete,
}: {
  archives: ScheduleArchive[];
  teachers: Teacher[];
  locations: Location[];
  schoolInfo: SchoolInfo;
  isAdmin: boolean;
  onDelete?: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedArchives = useMemo(
    () => [...archives].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt)),
    [archives]
  );

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-3">
        <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
          <Archive className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Arşivlenmiş Nöbet Çizelgeleri</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {sortedArchives.length} arşivlenmiş çizelge
          </p>
        </div>
      </div>
      <div className="divide-y divide-slate-200">
        {sortedArchives.map((archive) => (
          <ArchiveItem
            key={archive.id}
            archive={archive}
            teachers={teachers}
            locations={locations}
            isExpanded={expandedId === archive.id}
            onToggle={() => setExpandedId(expandedId === archive.id ? null : archive.id)}
            onDelete={onDelete}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
          />
        ))}
      </div>
    </div>
  );
}
