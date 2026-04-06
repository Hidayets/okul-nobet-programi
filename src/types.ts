export type DutyType = 'sabit' | 'hareketli' | 'nobetDisi';

export interface User {
  uid: string;
  role: 'admin' | 'teacher';
  kurumKodu: string;
}

export interface Teacher {
  id: string;
  name: string;
  email?: string;
  dutyType?: DutyType;
  unavailableDays?: number[]; // Days of week teacher can't do duty (0=Sun, 1=Mon, ..., 5=Fri)
  // schedule[dayOfWeek][hour] = className
  // dayOfWeek: 1 (Mon) to 5 (Fri)
  // hour: 1 to 8 (or more)
  schedule?: Record<number, Record<number, string>>;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  // schedule[dayOfWeek][hour] = teacherName or lessonName
  schedule: Record<number, Record<number, string>>;
}

export interface LocationDuty {
  teacherId: string;
  day: number; // 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum
}

export interface Location {
  id: string;
  name: string;
  duties: LocationDuty[];
}

export interface Assignment {
  id: string;
  date: string; // YYYY-MM-DD
  locationId: string;
  teacherId: string;
}

export interface ScheduleConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  activeDays: number[]; // 1=Mon, 2=Tue, ..., 5=Fri
}

export type AbsenceReason = 'mazeret' | 'rapor' | 'gorevliIzinli' | 'diger';

export const ABSENCE_REASONS: { id: AbsenceReason; label: string; color: string }[] = [
  { id: 'mazeret', label: 'Mazeret İzni', color: 'amber' },
  { id: 'rapor', label: 'Raporlu', color: 'red' },
  { id: 'gorevliIzinli', label: 'Görevli İzinli', color: 'blue' },
  { id: 'diger', label: 'Diğer', color: 'slate' },
];

export interface Absence {
  id: string;
  date: string; // YYYY-MM-DD
  teacherId: string;
  reason?: AbsenceReason;
}

export interface Substitution {
  id: string;
  date: string; // YYYY-MM-DD
  hour: number;
  className: string;
  absentTeacherId: string;
  substituteTeacherId: string;
}

export interface VicePrincipal {
  id: string;
  name: string;
}

export interface SchoolSettings {
  lessonCount: number;
  firstLessonStart: string;
  lessonDuration: number;
  breakDuration: number;
  lunchAfterLesson: number;
  lunchDuration: number;
  schoolDays: number[];
}

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  lessonCount: 8,
  firstLessonStart: '08:30',
  lessonDuration: 40,
  breakDuration: 10,
  lunchAfterLesson: 4,
  lunchDuration: 40,
  schoolDays: [1, 2, 3, 4, 5],
};

export interface LessonTime {
  lesson: number;
  start: string;
  end: string;
}

export function calculateLessonTimes(settings: SchoolSettings): LessonTime[] {
  const [startH, startM] = settings.firstLessonStart.split(':').map(Number);
  let totalMinutes = startH * 60 + startM;
  const times: LessonTime[] = [];

  for (let i = 1; i <= settings.lessonCount; i++) {
    const sh = Math.floor(totalMinutes / 60);
    const sm = totalMinutes % 60;
    const start = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;

    totalMinutes += settings.lessonDuration;

    const eh = Math.floor(totalMinutes / 60);
    const em = totalMinutes % 60;
    const end = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

    times.push({ lesson: i, start, end });

    if (i < settings.lessonCount) {
      totalMinutes += i === settings.lunchAfterLesson
        ? settings.lunchDuration
        : settings.breakDuration;
    }
  }

  return times;
}

export interface SchoolInfo {
  valilik: string;
  kaymakamlik: string;
  okulAdi: string;
  okulMuduru: string;
  mudurYardimcilari: VicePrincipal[];
  settings?: SchoolSettings;
  academicYears?: string[];
  gmailEmail?: string;
  gmailAppPassword?: string;
}

export function getCurrentAcademicYear(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 9) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function formatAcademicYear(yearId: string): string {
  return `${yearId} Eğitim-Öğretim Yılı`;
}

