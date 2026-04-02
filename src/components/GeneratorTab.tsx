import { useState } from 'react';
import { format, addDays, isBefore, isSameDay, getDay, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Settings2, AlertCircle } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo, DEFAULT_SCHOOL_SETTINGS } from '../types';

interface Props {
  teachers: Teacher[];
  locations: Location[];
  onGenerate: (assignments: Assignment[]) => void;
  onSuccess: () => void;
  schoolInfo: SchoolInfo;
}

export default function GeneratorTab({ teachers, locations, onGenerate, onSuccess, schoolInfo }: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [error, setError] = useState<string | null>(null);

  const totalDuties = locations.reduce((sum, loc) => sum + (loc.duties?.length || 0), 0);

  const handleGenerate = () => {
    setError(null);

    if (locations.length === 0) {
      setError('Lütfen önce nöbet yeri ekleyin.');
      return;
    }

    if (totalDuties === 0) {
      setError('Nöbet yerlerine henüz görevli atanmamış. Lütfen "Nöbet Yerleri" sekmesinden öğretmen ve gün ataması yapın.');
      return;
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isBefore(end, start)) {
      setError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }

    const newAssignments: Assignment[] = [];
    let currentDate = start;

    while (isBefore(currentDate, end) || isSameDay(currentDate, end)) {
      const dayOfWeek = getDay(currentDate);
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      for (const location of locations) {
        const duties = location.duties || [];
        for (const duty of duties) {
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
      setError('Seçilen tarih aralığında nöbet atanacak gün bulunamadı. Nöbet yerlerindeki gün atamalarını kontrol edin.');
      return;
    }

    onGenerate(newAssignments);
    onSuccess();
  };

  const dutyPreview = locations.filter(loc => (loc.duties?.length || 0) > 0);

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Settings2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Program Oluştur</h2>
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

          {/* Duty Preview */}
          {dutyPreview.length > 0 && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-indigo-800 mb-3">Nöbet Atamaları Özeti</h4>
              <div className="space-y-2">
                {dutyPreview.map(loc => (
                  <div key={loc.id} className="bg-white rounded-lg border border-indigo-100 p-3">
                    <span className="font-medium text-slate-700 text-sm">{loc.name}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(loc.duties || []).map((duty, i) => {
                        const teacher = teachers.find(t => t.id === duty.teacherId);
                        const dayName = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][duty.day];
                        return (
                          <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {teacher?.name || '?'} — {dayName}
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
              className="w-full py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Settings2 className="w-5 h-5" />
              Nöbet Programı Oluştur
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
