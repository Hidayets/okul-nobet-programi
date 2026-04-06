import { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { BarChart3, Printer, UserX } from 'lucide-react';
import { Teacher, Absence, SchoolInfo, ABSENCE_REASONS, AbsenceReason, formatAcademicYear } from '../types';

interface Props {
  teachers: Teacher[];
  absences: Absence[];
  schoolInfo: SchoolInfo;
  activeYear: string;
}

interface TeacherAbsenceSummary {
  teacher: Teacher;
  total: number;
  mazeret: number;
  rapor: number;
  gorevliIzinli: number;
  diger: number;
  unspecified: number;
  details: { date: string; reason?: AbsenceReason }[];
}

export default function AbsenceTrackingTab({ teachers, absences, schoolInfo, activeYear }: Props) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);

  const summaryData = useMemo(() => {
    const map = new Map<string, TeacherAbsenceSummary>();
    teachers.forEach(t => {
      map.set(t.id, {
        teacher: t,
        total: 0,
        mazeret: 0, rapor: 0, gorevliIzinli: 0, diger: 0,
        unspecified: 0,
        details: [],
      });
    });

    absences.forEach(a => {
      const entry = map.get(a.teacherId);
      if (!entry) return;
      entry.total++;
      const rawReason = a.reason as string | undefined;
      const reason = rawReason === 'gorevli' || rawReason === 'izinli' ? 'gorevliIzinli' : a.reason;
      if (reason && reason in entry) {
        (entry as any)[reason]++;
      } else {
        entry.unspecified++;
      }
      entry.details.push({ date: a.date, reason: a.reason });
    });

    return Array.from(map.values())
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [teachers, absences]);

  const totals = useMemo(() => {
    return summaryData.reduce(
      (acc, item) => ({
        total: acc.total + item.total,
        mazeret: acc.mazeret + item.mazeret,
        rapor: acc.rapor + item.rapor,
        gorevliIzinli: acc.gorevliIzinli + item.gorevliIzinli,
        diger: acc.diger + item.diger,
        unspecified: acc.unspecified + item.unspecified,
      }),
      { total: 0, mazeret: 0, rapor: 0, gorevliIzinli: 0, diger: 0, unspecified: 0 }
    );
  }, [summaryData]);

  const handlePrint = () => setIsPrinting(true);

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

  const yearLabel = formatAcademicYear(activeYear);
  const okulAdi = schoolInfo.okulAdi || '';

  return (
    <div className="space-y-6 absence-tracking-container">
      {isPrinting && (
        <style type="text/css" media="print">
          {`
            @page { size: portrait; margin: 1.5cm; }
            .absence-tracking-container > *:not(.absence-print-section):not(style) { display: none !important; }
            .absence-print-section { display: block !important; }
            .absence-print-section * { color: black !important; }
            .absence-print-section table { border-collapse: collapse !important; width: 100% !important; }
            .absence-print-section th, .absence-print-section td { border: 1.5px solid #334155 !important; padding: 6px 10px !important; font-size: 11px !important; }
            .absence-print-section th { background-color: #f1f5f9 !important; font-weight: 700 !important; text-align: center !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          `}
        </style>
      )}

      {/* Print section */}
      <div className="absence-print-section hidden" style={isPrinting ? { display: 'none' } : undefined}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          {okulAdi && <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{okulAdi}</div>}
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>ÖĞRETMEN DEVAMSIZLIK TAKİP ÇİZELGESİ</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{yearLabel}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '30px' }}>#</th>
              <th style={{ textAlign: 'left' }}>Öğretmen</th>
              <th style={{ width: '50px' }}>Toplam</th>
              {ABSENCE_REASONS.map(r => (
                <th key={r.id} style={{ width: '60px' }}>{r.label}</th>
              ))}
              <th style={{ width: '60px' }}>Belirtilmemiş</th>
            </tr>
          </thead>
          <tbody>
            {summaryData.map((item, i) => (
              <tr key={item.teacher.id}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>{item.teacher.name}</td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.total}</td>
                <td style={{ textAlign: 'center' }}>{item.mazeret || '-'}</td>
                <td style={{ textAlign: 'center' }}>{item.rapor || '-'}</td>
                <td style={{ textAlign: 'center' }}>{item.gorevliIzinli || '-'}</td>
                <td style={{ textAlign: 'center' }}>{item.diger || '-'}</td>
                <td style={{ textAlign: 'center' }}>{item.unspecified || '-'}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={2} style={{ textAlign: 'right' }}>TOPLAM</td>
              <td style={{ textAlign: 'center' }}>{totals.total}</td>
              <td style={{ textAlign: 'center' }}>{totals.mazeret || '-'}</td>
              <td style={{ textAlign: 'center' }}>{totals.rapor || '-'}</td>
              <td style={{ textAlign: 'center' }}>{totals.gorevliIzinli || '-'}</td>
              <td style={{ textAlign: 'center' }}>{totals.diger || '-'}</td>
              <td style={{ textAlign: 'center' }}>{totals.unspecified || '-'}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ textAlign: 'right', marginTop: '50px' }}>
          {schoolInfo.okulMuduru && (
            <div style={{ display: 'inline-block', textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '12px' }}>{schoolInfo.okulMuduru}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Okul Müdürü</div>
            </div>
          )}
        </div>
      </div>

      {/* Screen header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Devamsızlık Takip</h2>
          <p className="text-sm text-slate-500 mt-1">{yearLabel} — {summaryData.length} öğretmen, toplam {totals.total} gün devamsızlık</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={summaryData.length === 0}
          className="bg-surface border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50"
        >
          <Printer className="w-4 h-4" />
          Yazdır
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
        <div className="bg-surface p-4 rounded-xl border border-slate-200 text-center">
          <div className="text-2xl font-bold text-slate-800">{totals.total}</div>
          <div className="text-xs text-slate-500 mt-1">Toplam Gün</div>
        </div>
        {ABSENCE_REASONS.map(r => (
          <div key={r.id} className="bg-surface p-4 rounded-xl border border-slate-200 text-center">
            <div className="text-2xl font-bold text-slate-700">{(totals as any)[r.id]}</div>
            <div className="text-xs text-slate-500 mt-1">{r.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {summaryData.length === 0 ? (
        <div className="bg-surface p-12 rounded-2xl shadow-sm border border-slate-200 text-center print:hidden">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserX className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Devamsızlık Kaydı Yok</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Bu dönemde henüz devamsızlık kaydı bulunmuyor. Günlük İşlemler sekmesinden devamsızlık girişi yapabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase w-10">#</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase">Öğretmen</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase text-center w-16">Toplam</th>
                  {ABSENCE_REASONS.map(r => (
                    <th key={r.id} className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase text-center w-20">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaryData.map((item, i) => (
                  <>
                    <tr
                      key={item.teacher.id}
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedTeacher(expandedTeacher === item.teacher.id ? null : item.teacher.id)}
                    >
                      <td className="py-3 px-4 text-sm text-slate-500">{i + 1}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{item.teacher.name}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-sm">
                          {item.total}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-sm">{item.mazeret || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4 text-center text-sm">{item.rapor || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4 text-center text-sm">{item.gorevliIzinli || <span className="text-slate-300">-</span>}</td>
                      <td className="py-3 px-4 text-center text-sm">{item.diger || <span className="text-slate-300">-</span>}</td>
                    </tr>
                    {expandedTeacher === item.teacher.id && (
                      <tr key={`${item.teacher.id}-detail`}>
                        <td colSpan={3 + ABSENCE_REASONS.length} className="px-4 py-3 bg-slate-50/80">
                          <div className="flex flex-wrap gap-2">
                            {item.details
                              .sort((a, b) => a.date.localeCompare(b.date))
                              .map((d, di) => {
                                const reason = d.reason ? ABSENCE_REASONS.find(r => r.id === d.reason) : null;
                                return (
                                  <span key={di} className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                                    <span className="font-medium text-slate-700">
                                      {format(parseISO(d.date), 'dd MMM yyyy', { locale: tr })}
                                    </span>
                                    {reason && (
                                      <span className="text-red-500 font-medium">({reason.label})</span>
                                    )}
                                  </span>
                                );
                              })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                  <td colSpan={2} className="py-3 px-4 text-sm text-slate-700 text-right">TOPLAM</td>
                  <td className="py-3 px-4 text-center text-sm text-slate-800">{totals.total}</td>
                  <td className="py-3 px-4 text-center text-sm">{totals.mazeret || '-'}</td>
                  <td className="py-3 px-4 text-center text-sm">{totals.rapor || '-'}</td>
                  <td className="py-3 px-4 text-center text-sm">{totals.gorevliIzinli || '-'}</td>
                  <td className="py-3 px-4 text-center text-sm">{totals.diger || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
