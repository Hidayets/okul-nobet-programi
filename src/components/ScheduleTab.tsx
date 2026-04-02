import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Calendar, Printer, Send, X, CheckCircle2 } from 'lucide-react';
import { Teacher, Location, Assignment, SchoolInfo } from '../types';

interface Props {
  assignments: Assignment[];
  teachers: Teacher[];
  locations: Location[];
  schoolInfo: SchoolInfo;
  isAdmin?: boolean;
}

export default function ScheduleTab({ assignments, teachers, locations, schoolInfo, isAdmin = false }: Props) {
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'sending' | 'success'>('idle');

  const scheduleData = useMemo(() => {
    const data: Record<string, Record<string, Teacher[]>> = {};
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
        data[assignment.date][assignment.locationId].push(teacher);
      }
    });

    const sortedDates = Array.from(dates).sort();
    return { data, sortedDates };
  }, [assignments, teachers, locations]);

  const handlePrint = () => {
    window.print();
  };

  const handleSendNotifications = () => {
    setNotificationStatus('sending');
    
    // Simulate API call for sending SMS/Email
    setTimeout(() => {
      setNotificationStatus('success');
      setTimeout(() => {
        setShowNotificationModal(false);
        setNotificationStatus('idle');
      }, 2000);
    }, 1500);
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

  return (
    <div className="space-y-6 relative">
      <style type="text/css" media="print">
        {`
          @page { size: landscape; margin: 1cm; }
          table { border-collapse: collapse !important; width: 100% !important; }
          th, td { border: 1px solid black !important; padding: 8px !important; color: black !important; background-color: transparent !important; }
          th { font-weight: bold !important; }
          .print-no-border { border: none !important; }
        `}
      </style>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Nöbet Çizelgesi</h2>
          <p className="text-sm text-slate-500 mt-1">
            {scheduleData.sortedDates.length} günlük program oluşturuldu.
          </p>
        </div>
        <div className="flex gap-3">
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

      <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:overflow-visible">
        
        {/* Print Header */}
        <div className="hidden print:block text-center mb-6 font-bold text-lg leading-tight">
          <div>T.C.</div>
          {schoolInfo.valilik && <div>{schoolInfo.valilik.toLocaleUpperCase('tr-TR')} VALİLİĞİ</div>}
          {schoolInfo.kaymakamlik && <div>{schoolInfo.kaymakamlik.toLocaleUpperCase('tr-TR')} KAYMAKAMLIĞI</div>}
          {schoolInfo.okulAdi && <div>{schoolInfo.okulAdi.toLocaleUpperCase('tr-TR')}</div>}
        </div>

        <div className="hidden print:block text-center mb-4 font-bold text-xl">
          {monthName} AYI NÖBET PROGRAMI
        </div>

        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse print:text-sm print:border print:border-black">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 print:bg-transparent print:border-black">
                <th className="py-4 px-6 print:py-2 print:px-2 font-semibold text-slate-700 print:text-black whitespace-nowrap sticky left-0 bg-slate-50 print:bg-transparent z-10 border-r border-slate-200 print:border print:border-black">
                  Tarih / Gün
                </th>
                {locations.map((location) => (
                  <th key={location.id} className="py-4 px-6 print:py-2 print:px-2 font-semibold text-slate-700 print:text-black min-w-[150px] print:min-w-0 print:border print:border-black">
                    <div className="flex flex-col">
                      <span>{location.name}</span>
                    </div>
                  </th>
                ))}
                {schoolInfo.mudurYardimcilari.length > 0 && (
                  <th className="py-4 px-6 print:py-2 print:px-2 font-semibold text-slate-700 print:text-black min-w-[150px] print:min-w-0 print:border print:border-black">
                    Nöbetçi Md. Yrd.
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 print:divide-black border-b border-slate-200 print:border-black">
              {scheduleData.sortedDates.map((date, index) => {
                const parsedDate = parseISO(date);
                const formattedDate = format(parsedDate, 'dd.MM.yyyy');
                const dayName = format(parsedDate, 'EEEE', { locale: tr });
                
                const vpCount = schoolInfo.mudurYardimcilari.length;
                const assignedVp = vpCount > 0 ? schoolInfo.mudurYardimcilari[index % vpCount] : null;

                return (
                  <tr key={date} className="hover:bg-slate-50/50 transition-colors print:hover:bg-transparent">
                    <td className="py-4 px-6 print:py-2 print:px-2 whitespace-nowrap sticky left-0 bg-surface print:bg-transparent group-hover:bg-slate-50/50 z-10 border-r border-slate-200 print:border print:border-black">
                      <div className="font-medium text-slate-900 print:text-black">{formattedDate}</div>
                      <div className="text-sm text-slate-500 print:text-black">{dayName}</div>
                    </td>
                    {locations.map((location) => {
                      const assignedTeachers = scheduleData.data[date]?.[location.id] || [];
                      return (
                        <td key={location.id} className="py-4 px-6 print:py-2 print:px-2 print:border print:border-black">
                          {assignedTeachers.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {assignedTeachers.map((teacher, ti) => (
                                <span key={ti} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 print:bg-transparent print:border-none print:p-0 print:text-black">
                                  {teacher.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-300 print:text-black text-sm">-</span>
                          )}
                        </td>
                      );
                    })}
                    {assignedVp && (
                      <td className="py-4 px-6 print:py-2 print:px-2 font-medium text-slate-700 print:text-black print:border print:border-black">
                        {assignedVp.name}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Print Footer */}
        <div className="hidden print:block mt-8 text-sm">
          <h4 className="font-bold mb-2 underline">NÖBETÇİ ÖĞRETMEN GÖREV TALİMATNAMESİ</h4>
          <ol className="list-decimal pl-5 space-y-1 mb-12 text-justify">
            <li>Derse başlamadan 20 dk. önce okula gelir ve ders bitiminden 20 dk. sonra okuldan ayrılır.</li>
            <li>Nöbetçi öğretmen sabah ilk olarak derslikleri kontrol eder, bölümleri denetler ve okulun eğitim öğretime hazır olup olmadığını nöbet defterine yazarak giriş imzasını atar.</li>
            <li>Nöbetçi öğretmen, o gün gelmeyen öğretmenleri tespit ederek ilgili müdür yardımcısına bildirir, boş geçen derslere girerek defteri "Nöbetçi Öğretmen" yazarak imzalar; öğretmenlerin durumlarını ve boş derslerin nasıl doldurulduğunu nöbet defterine geçirir.</li>
            <li>Nöbeti sonunda nöbet defterine nöbeti ile ilgili raporu yazar ve imzalar.</li>
          </ol>

          <div className="flex justify-between items-start mt-16 pt-8">
            <div className="flex gap-16">
              {/* We can leave this empty or put something else if VP is in the table */}
            </div>
            <div className="text-center">
              <div className="font-bold">{schoolInfo.okulMuduru}</div>
              <div>Okul Müdürü</div>
            </div>
          </div>
        </div>

      </div>

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm print:hidden">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-slate-800">Bildirimleri Gönder</h3>
              <button 
                onClick={() => setShowNotificationModal(false)}
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
                  <h4 className="text-lg font-medium text-slate-800 mb-2">Bildirimler Gönderildi!</h4>
                  <p className="text-slate-500">Tüm nöbetçi öğretmenlere SMS ve E-posta yoluyla görevleri iletildi.</p>
                </div>
              ) : (
                <>
                  <p className="text-slate-600 mb-6">
                    Oluşturulan nöbet programı, ilgili öğretmenlerin sisteme kayıtlı telefon numaralarına SMS ve e-posta adreslerine mail olarak gönderilecektir.
                  </p>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Örnek Mesaj:</h4>
                    <p className="text-sm text-slate-600 italic">
                      "Sayın [Öğretmen Adı], [Tarih] tarihinde [Nöbet Yeri] konumunda nöbet göreviniz bulunmaktadır. İyi çalışmalar dileriz."
                    </p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowNotificationModal(false)}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                      disabled={notificationStatus === 'sending'}
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSendNotifications}
                      disabled={notificationStatus === 'sending'}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-70"
                    >
                      {notificationStatus === 'sending' ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Gönderiliyor...
                        </span>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Onayla ve Gönder
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

