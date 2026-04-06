import { Holiday } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface RawHoliday {
  date: string;
  name: string;
}

function weekdayRange(startStr: string, endStr: string, name: string): RawHoliday[] {
  const result: RawHoliday[] = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      result.push({ date: `${yyyy}-${mm}-${dd}`, name });
    }
  }
  return result;
}

function isWeekday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow !== 0 && dow !== 6;
}

/**
 * MEB eğitim-öğretim yılı takvim verileri.
 * Kaynak: meb.gov.tr resmi duyuruları
 *
 * MEB'e göre 29 Ekim, 23 Nisan ve 19 Mayıs okuldaki törenlere
 * katılım nedeniyle İŞ GÜNÜ sayılır, bu yüzden dahil edilmez.
 */
function getMebCalendar(academicYear: string): RawHoliday[] {
  switch (academicYear) {
    case '2024-2025':
      return [
        ...weekdayRange('2024-11-18', '2024-11-22', '1. Ara Tatil'),
        { date: '2025-01-01', name: 'Yılbaşı' },
        ...weekdayRange('2025-01-20', '2025-01-31', 'Yarıyıl Tatili'),
        { date: '2025-03-31', name: 'Ramazan Bayramı' },
        { date: '2025-04-01', name: 'Ramazan Bayramı' },
        ...weekdayRange('2025-04-14', '2025-04-18', '2. Ara Tatil'),
        { date: '2025-05-01', name: 'Emek ve Dayanışma Günü' },
        { date: '2025-06-05', name: 'Kurban Bayramı Arife' },
        { date: '2025-06-06', name: 'Kurban Bayramı' },
        { date: '2025-06-09', name: 'Kurban Bayramı' },
      ];

    case '2025-2026':
      return [
        ...weekdayRange('2025-11-10', '2025-11-14', '1. Ara Tatil'),
        { date: '2025-11-24', name: 'Öğretmenler Günü' },
        { date: '2026-01-01', name: 'Yılbaşı' },
        ...weekdayRange('2026-01-19', '2026-01-30', 'Yarıyıl Tatili'),
        ...weekdayRange('2026-03-16', '2026-03-20', '2. Ara Tatil / Ramazan Bayramı'),
        { date: '2026-05-01', name: 'Emek ve Dayanışma Günü' },
        { date: '2026-05-26', name: 'Kurban Bayramı Arife' },
        { date: '2026-05-27', name: 'Kurban Bayramı' },
        { date: '2026-05-28', name: 'Kurban Bayramı' },
        { date: '2026-05-29', name: 'Kurban Bayramı' },
      ];

    default:
      return [];
  }
}

// 29 Ekim, 23 Nisan, 19 Mayıs, 15 Temmuz, 30 Ağustos
// MEB takviminde iş günü sayıldığı veya okul dışı dönemde kaldığı için çıkarılır
const EXCLUDED_MMDD = new Set([
  '10-28', '10-29', '04-23', '05-19', '07-15', '08-30',
]);

async function fetchNagerHolidays(year: number): Promise<RawHoliday[]> {
  const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/TR`);
  if (!res.ok) return [];
  const data: { date: string; localName: string }[] = await res.json();
  return data.map(h => ({ date: h.date, name: h.localName }));
}

/**
 * Belirtilen eğitim-öğretim yılı için tatil günlerini döndürür.
 *
 * 1) Bilinen yıllar için MEB resmi takvim verileri kullanılır
 * 2) Bilinmeyen yıllar için Nager.Date API'den resmi tatiller çekilir
 * 3) Hafta sonu günleri ve okul dışı dönem (Temmuz-Ağustos) filtrelenir
 */
export async function fetchMebHolidays(academicYear: string): Promise<{
  holidays: Holiday[];
  source: 'meb' | 'api' | 'empty';
}> {
  const parts = academicYear.split('-').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { holidays: [], source: 'empty' };
  }
  const [startYear, endYear] = parts;
  const schoolStart = `${startYear}-09-01`;
  const schoolEnd = `${endYear}-06-30`;

  const mebData = getMebCalendar(academicYear);

  if (mebData.length > 0) {
    return {
      holidays: mebData.map(h => ({ id: uuidv4(), date: h.date, name: h.name })),
      source: 'meb',
    };
  }

  // MEB verisi yoksa API'den çek
  let apiData: RawHoliday[] = [];
  try {
    const [h1, h2] = await Promise.all([
      fetchNagerHolidays(startYear),
      fetchNagerHolidays(endYear),
    ]);
    apiData = [...h1, ...h2];
  } catch {
    return { holidays: [], source: 'empty' };
  }

  const filtered = apiData.filter(h => {
    if (h.date < schoolStart || h.date > schoolEnd) return false;
    if (EXCLUDED_MMDD.has(h.date.slice(5))) return false;
    if (!isWeekday(h.date)) return false;
    return true;
  });

  return {
    holidays: filtered.map(h => ({ id: uuidv4(), date: h.date, name: h.name })),
    source: filtered.length > 0 ? 'api' : 'empty',
  };
}
