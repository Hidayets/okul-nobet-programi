import React, { useRef, useState, useMemo, useCallback } from 'react';
import { Upload, CheckCircle2, AlertCircle, BookOpen, Users, GraduationCap, ChevronDown, Trash2, Scale, X as XIcon, AlertTriangle, ChevronRight, PenLine, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { Teacher, ClassInfo, SchoolInfo, DEFAULT_SCHOOL_SETTINGS, calculateLessonTimes } from '../types';
import { unifyTeachers, findTeacherFuzzy } from '../lib/teacherMatching';

const DAY_NUM_TO_SHORT: Record<number, string> = {
  1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz'
};
const DAY_NUM_TO_LONG: Record<number, string> = {
  1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma', 6: 'Cumartesi', 0: 'Pazar'
};
const FULL_DAY_TO_NUM: Record<string, number> = {
  'pazartesi': 1, 'salı': 2, 'çarşamba': 3, 'perşembe': 4,
  'cuma': 5, 'cumartesi': 6, 'pazar': 0,
};
const SHORT_DAY_TO_NUM: Record<string, number> = {
  'pzt': 1, 'sal': 2, 'çar': 3, 'per': 4, 'cum': 5, 'cmt': 6, 'paz': 0,
};

const TEACHER_NAME_FIELDS = ['ad soyad', 'öğretmen', 'adı soyadı', 'ad-soyad', 'name', 'öğretmen adı'];
const CLASS_NAME_FIELDS = ['sınıf', 'sınıf adı', 'class', 'şube'];

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
  /** Mükerrer öğretmen birleştirildiğinde silinen id → tutulan id (nöbet vb. kayıtları güncellemek için). */
  onTeacherIdsMerged?: (idRemap: Record<string, string>) => void;
  classes: ClassInfo[];
  setClasses: React.Dispatch<React.SetStateAction<ClassInfo[]>>;
  schoolInfo: SchoolInfo;
}

/* ─── Excel Helpers ─── */

function turkishLower(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F]/g, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase();
}

function cellStr(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

function unmergeWorksheet(ws: XLSX.WorkSheet): void {
  const merges = ws['!merges'];
  if (!merges || merges.length === 0) return;

  for (const merge of merges) {
    const { s, e } = merge;
    const topRef = XLSX.utils.encode_cell(s);
    const cell = ws[topRef];
    if (!cell) continue;

    for (let r = s.r; r <= e.r; r++) {
      for (let c = s.c; c <= e.c; c++) {
        if (r === s.r && c === s.c) continue;
        ws[XLSX.utils.encode_cell({ r, c })] = { t: cell.t, v: cell.v };
      }
    }
  }
  delete ws['!merges'];
}

const ALL_DAYS_LOWER: Record<string, number> = {
  'pazartesi': 1, 'pzt': 1, 'pts': 1,
  'salı': 2, 'sal': 2,
  'çarşamba': 3, 'çar': 3, 'çarş': 3, 'çrş': 3, 'cars': 3, 'crs': 3,
  'perşembe': 4, 'per': 4, 'perş': 4, 'prş': 4, 'pers': 4,
  'cuma': 5, 'cum': 5,
  'cumartesi': 6, 'cmt': 6,
  'pazar': 0, 'paz': 0,
};

const SORTED_DAY_ENTRIES = Object.entries(ALL_DAYS_LOWER)
  .sort(([a], [b]) => b.length - a.length);

const CANONICAL_DAYS: [string, number][] = [
  ['pazartesi', 1], ['salı', 2], ['çarşamba', 3],
  ['perşembe', 4], ['cuma', 5], ['cumartesi', 6], ['pazar', 0],
];

function matchDayName(input: string): number | null {
  if (!input || input.length < 2) return null;
  const exact = ALL_DAYS_LOWER[input];
  if (exact !== undefined) return exact;
  const candidates = CANONICAL_DAYS.filter(([name]) => name.startsWith(input));
  if (candidates.length === 1) return candidates[0][1];
  return null;
}

interface ColMapping { day: number; hour: number; }

function parseDayHourHeader(cell: string): ColMapping | null {
  const s = turkishLower(cell);
  if (!s) return null;

  for (const [dayStr, dayNum] of SORTED_DAY_ENTRIES) {
    if (!s.startsWith(dayStr)) continue;
    const rest = s.slice(dayStr.length).replace(/[\s\-_./]+/g, '');
    const hourMatch = rest.match(/^(\d+)/);
    if (hourMatch) {
      return { day: dayNum, hour: parseInt(hourMatch[1]) };
    }
  }

  // Fallback: split on first digit, match day part as prefix of full name
  const digitIdx = s.search(/\d/);
  if (digitIdx >= 2) {
    const dayPart = s.substring(0, digitIdx).replace(/[\s\-_./]+$/g, '');
    const hourStr = s.substring(digitIdx).match(/^(\d+)/);
    if (hourStr) {
      const dayNum = matchDayName(dayPart);
      const hour = parseInt(hourStr[1]);
      if (dayNum !== null && hour >= 1 && hour <= 15) {
        return { day: dayNum, hour };
      }
    }
  }

  return null;
}

function normalizeDayStr(s: string): number | null {
  const lower = turkishLower(s).replace(/[^a-zçğıöşü]/g, '');
  return matchDayName(lower);
}

function extractHour(s: string): number | null {
  const cleaned = s.replace(/[.\s]*(ders|saat|\.?\s*ders)?\s*$/i, '').trim();
  if (/^\d+$/.test(cleaned)) {
    const num = parseInt(cleaned);
    if (num >= 1 && num <= 15) return num;
  }
  return null;
}

function findNameCol(headerRow: string[], nameFields: string[], secondRow?: string[]): number {
  for (let c = 0; c < headerRow.length; c++) {
    const lower = turkishLower(headerRow[c]);
    if (nameFields.some(nf => lower.includes(nf))) return c;
  }
  if (secondRow) {
    for (let c = 0; c < secondRow.length; c++) {
      const lower = turkishLower(secondRow[c]);
      if (nameFields.some(nf => lower.includes(nf))) return c;
    }
  }
  return -1;
}

function detectHeaders(
  rows: string[][],
  nameFields: string[],
): { nameCol: number; colMap: Record<number, ColMapping>; dataStart: number } | null {
  const maxScan = Math.min(rows.length, 15);

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];

    // Strategy A: "Day-Hour" combined headers (e.g. "Pzt-1", "SALI 3", "Pazartesi-2")
    let matched = 0;
    const tempMap: Record<number, ColMapping> = {};
    for (let c = 0; c < row.length; c++) {
      const parsed = parseDayHourHeader(row[c]);
      if (parsed) {
        tempMap[c] = parsed;
        matched++;
      }
    }

    if (matched >= 3) {
      const nameCol = findNameCol(row, nameFields);
      return { nameCol, colMap: tempMap, dataStart: r + 1 };
    }

    // Strategy B: Day names in this row + hour numbers in the next row
    let dayHits = 0;
    for (const cell of row) {
      if (normalizeDayStr(cell) !== null) dayHits++;
    }

    if (dayHits >= 2 && r + 1 < rows.length) {
      const nextRow = rows[r + 1];
      let numHits = 0;
      for (const cell of nextRow) {
        if (extractHour(cell) !== null) numHits++;
      }

      if (numHits >= 3) {
        const colCount = Math.max(row.length, nextRow.length);
        const twoRowMap: Record<number, ColMapping> = {};
        for (let c = 0; c < colCount; c++) {
          const dayNum = normalizeDayStr(row[c] || '');
          const hour = extractHour(nextRow[c] || '');
          if (dayNum !== null && hour !== null) {
            twoRowMap[c] = { day: dayNum, hour };
          }
        }

        if (Object.keys(twoRowMap).length >= 3) {
          const nameCol = findNameCol(row, nameFields, nextRow);
          return { nameCol, colMap: twoRowMap, dataStart: r + 2 };
        }
      }
    }
  }

  return null;
}

function parseExcelSchedule(
  ws: XLSX.WorkSheet,
  nameFields: string[],
  maxLessonCount?: number,
): { name: string; schedule: Record<number, Record<number, string>> }[] {
  unmergeWorksheet(ws);

  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) return [];

  // Normalize all rows to the same length so no trailing columns are lost
  const maxCols = raw.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const rows: string[][] = raw.map(row => {
    const arr = (Array.isArray(row) ? row : []).map((cell: any) => cellStr(cell));
    while (arr.length < maxCols) arr.push('');
    return arr;
  });

  const detected = detectHeaders(rows, nameFields);
  if (!detected) return [];

  let { nameCol, colMap, dataStart } = detected;

  // If name column not detected, heuristic: skip first col if all-numbers, use next
  if (nameCol === -1) {
    const sampleNames = rows.slice(dataStart, dataStart + 5).map(r => r[0] || '');
    if (sampleNames.every(v => /^\d*$/.test(v))) {
      nameCol = 1;
    } else {
      nameCol = 0;
    }
  }

  const results: { name: string; schedule: Record<number, Record<number, string>> }[] = [];

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    const name = row[nameCol];
    if (!name) continue;

    const schedule: Record<number, Record<number, string>> = {};

    for (const [colStr, mapping] of Object.entries(colMap)) {
      const c = parseInt(colStr);
      const value = row[c];
      if (!value) continue;
      if (maxLessonCount && mapping.hour > maxLessonCount) continue;

      if (!schedule[mapping.day]) schedule[mapping.day] = {};
      schedule[mapping.day][mapping.hour] = value;
    }

    results.push({ name, schedule });
  }

  return results;
}

/* ─── Schedule Validation ─── */

function normalizeForMatch(s: string): string {
  return turkishLower(s).replace(/[\s\-_./]+/g, '');
}

function teacherNameMatches(teacherName: string, value: string): boolean {
  const tLower = turkishLower(teacherName.trim());
  const vLower = turkishLower(value.trim());

  if (tLower === vLower) return true;
  if (vLower.includes(tLower) || tLower.includes(vLower)) return true;

  const tParts = tLower.split(/\s+/).filter(p => p.length >= 2);
  const vParts = vLower.split(/\s+/).filter(p => p.length >= 2);
  for (const tp of tParts) {
    for (const vp of vParts) {
      if (tp === vp) return true;
    }
  }

  return fuzzyTeacherMatch(teacherName, value);
}

/**
 * Handles abbreviation formats like "A.YILMAZ", "H.ÖZTÜRK", "Ah.Yılmaz"
 * matching against full names like "Ahmet YILMAZ", "Hasan ÖZTÜRK".
 * Also handles reversed order (surname first) and initial-only formats.
 */
function fuzzyTeacherMatch(fullName: string, abbreviated: string): boolean {
  const full = turkishLower(fullName.trim());
  const abbr = turkishLower(abbreviated.trim());

  const fullParts = full.split(/\s+/).filter(Boolean);
  const abbrClean = abbr.replace(/\./g, '. ').replace(/\s+/g, ' ').trim();
  const abbrParts = abbrClean.split(/\s+/).filter(Boolean).map(p => p.replace(/\.$/, ''));

  if (fullParts.length < 2 || abbrParts.length < 1) return false;

  const tryMatch = (nameParts: string[], candidateParts: string[]): boolean => {
    if (candidateParts.length < 1) return false;

    let matchedParts = 0;
    let hasFullSurnameMatch = false;
    const usedIndices = new Set<number>();

    for (const cp of candidateParts) {
      let bestMatchIdx = -1;
      let bestMatchType: 'full' | 'initial' | 'prefix' = 'full';

      for (let ni = 0; ni < nameParts.length; ni++) {
        if (usedIndices.has(ni)) continue;
        const np = nameParts[ni];

        if (cp === np) {
          bestMatchIdx = ni;
          bestMatchType = 'full';
          break;
        }
        if (cp.length === 1 && np.startsWith(cp)) {
          if (bestMatchIdx === -1) {
            bestMatchIdx = ni;
            bestMatchType = 'initial';
          }
        } else if (cp.length >= 2 && cp.length < np.length && np.startsWith(cp)) {
          if (bestMatchIdx === -1 || bestMatchType === 'initial') {
            bestMatchIdx = ni;
            bestMatchType = 'prefix';
          }
        }
      }

      if (bestMatchIdx >= 0) {
        usedIndices.add(bestMatchIdx);
        matchedParts++;
        if (bestMatchType === 'full' && nameParts[bestMatchIdx].length >= 2) {
          hasFullSurnameMatch = true;
        }
      }
    }

    return matchedParts === candidateParts.length && hasFullSurnameMatch;
  };

  if (tryMatch(fullParts, abbrParts)) return true;

  const reversedParts = [...fullParts].reverse();
  if (tryMatch(reversedParts, abbrParts)) return true;

  return false;
}

/**
 * Excel'den okunan adı mevcut listede arar.
 * Önce birebir, bulunmazsa kısaltma (fuzzy) eşleşmesi yapılır.
 * Örn: "A. Adıgüzel" → "Ahmet Adıgüzel" eşleştirilir.
 */
function findBestTeacherMatch(teachers: Teacher[], excelName: string): number {
  return findTeacherFuzzy(teachers, excelName);
}

/** Sadece birebir isim eşleşmesi (case-insensitive) */
function teachersMatchSamePerson(nameA: string, nameB: string): boolean {
  const a = nameA.trim();
  const b = nameB.trim();
  if (!a || !b) return false;
  return turkishLower(a) === turkishLower(b);
}

/** Her zaman ilk kaydı (Öğretmenler sayfasındakini) tercih et */
function pickCanonicalTeacherName(existingName: string, _newName: string): string {
  return existingName.trim();
}

/** İlk kayıttaki dolu hücreler korunur; boşluklar ikinci kayıttan doldurulur (mükerrer birleştirme). */
function mergeSchedulesPreferFirst(
  first: Record<number, Record<number, string>> | undefined,
  second: Record<number, Record<number, string>> | undefined,
): Record<number, Record<number, string>> {
  const out: Record<number, Record<number, string>> = {};
  const days = new Set<number>([
    ...Object.keys(first || {}).map(Number),
    ...Object.keys(second || {}).map(Number),
  ]);
  for (const d of days) {
    out[d] = { ...(first?.[d] || {}) };
    const hSecond = second?.[d] || {};
    for (const [hStr, cls] of Object.entries(hSecond)) {
      const h = Number(hStr);
      const cur = out[d][h];
      if (cur == null || String(cur).trim() === '') {
        if (cls != null && String(cls).trim() !== '') {
          out[d][h] = cls;
        }
      }
    }
  }
  return out;
}

function mergeScheduleOverlay(
  base: Record<number, Record<number, string>> | undefined,
  row: Record<number, Record<number, string>>,
): Record<number, Record<number, string>> {
  const out: Record<number, Record<number, string>> = {};
  const days = new Set<number>([
    ...Object.keys(base || {}).map(Number),
    ...Object.keys(row).map(Number),
  ]);
  for (const d of days) {
    out[d] = { ...(base?.[d] || {}) };
    const hours = row[d];
    if (!hours) continue;
    for (const [hStr, cls] of Object.entries(hours)) {
      const h = Number(hStr);
      if (cls != null && String(cls).trim() !== '') {
        out[d][h] = cls;
      }
    }
  }
  return out;
}

/** Excel'deki aynı isimleri (birebir eşleşme) birleştir */
function mergeParsedTeacherRows(
  parsed: { name: string; schedule: Record<number, Record<number, string>> }[],
): { name: string; schedule: Record<number, Record<number, string>> }[] {
  const out: { name: string; schedule: Record<number, Record<number, string>> }[] = [];
  for (const row of parsed) {
    const name = row.name.trim();
    if (!name) continue;
    const j = out.findIndex((o) => turkishLower(o.name) === turkishLower(name));
    if (j >= 0) {
      out[j] = {
        name: out[j].name, // İlk kaydı koru
        schedule: mergeScheduleOverlay(out[j].schedule, row.schedule),
      };
    } else {
      out.push({ name, schedule: mergeScheduleOverlay(undefined, row.schedule) });
    }
  }
  return out;
}

function mergeTeacherRecordsKeepFirstId(a: Teacher, b: Teacher): Teacher {
  const name = pickCanonicalTeacherName(a.name, b.name);
  const schedule = mergeSchedulesPreferFirst(a.schedule, b.schedule);
  const hasSchedule = Object.keys(schedule).length > 0;
  const ua = a.unavailableDays || [];
  const ub = b.unavailableDays || [];
  const unavailableDays =
    ua.length || ub.length
      ? [...new Set([...ua, ...ub])].sort((x, y) => x - y)
      : undefined;
  // availableDays beyaz liste olduğu için kesişim alıyoruz; biri boşsa diğerini koru.
  const aa = a.availableDays || [];
  const ab = b.availableDays || [];
  let availableDays: number[] | undefined;
  if (aa.length && ab.length) {
    const set = new Set(aa);
    availableDays = ab.filter((d) => set.has(d)).sort((x, y) => x - y);
    if (availableDays.length === 0) availableDays = undefined;
  } else if (aa.length) {
    availableDays = [...aa].sort((x, y) => x - y);
  } else if (ab.length) {
    availableDays = [...ab].sort((x, y) => x - y);
  }
  return {
    ...a,
    name,
    schedule: hasSchedule ? schedule : undefined,
    email: (a.email && a.email.trim()) || (b.email && b.email.trim()) || undefined,
    dutyType:
      a.dutyType === 'nobetDisi' || b.dutyType === 'nobetDisi'
        ? 'nobetDisi'
        : a.dutyType === 'hareketli' || b.dutyType === 'hareketli'
          ? 'hareketli'
          : a.dutyType || b.dutyType || 'sabit',
    unavailableDays,
    availableDays,
  };
}

/**
 * Listede birebir VEYA fuzzy (kısaltma) eşleşen kayıtları birleştirir.
 * Daha "tam" isim olan kaydın id'si ve adı korunur.
 */
function dedupeTeachersList(list: Teacher[]): { teachers: Teacher[]; idRemap: Record<string, string> } {
  return unifyTeachers(list);
}

interface ComparisonEntry {
  day: number;
  hour: number;
  teacherName: string;
  teacherValue: string;
  className: string | null;
  classValue: string | null;
  status: 'match' | 'mismatch' | 'class_not_found' | 'class_slot_empty';
}

interface ConflictEntry {
  day: number;
  hour: number;
  className: string;
  teacherNames: string[];
}

interface ReverseIssue {
  day: number;
  hour: number;
  className: string;
  classValue: string;
  status: 'teacher_not_found' | 'teacher_slot_empty' | 'teacher_mismatch';
  teacherName?: string;
  teacherValue?: string;
}

interface ValidationReport {
  comparisons: ComparisonEntry[];
  conflicts: ConflictEntry[];
  reverseIssues: ReverseIssue[];
}

function validateSchedules(teachers: Teacher[], classes: ClassInfo[]): ValidationReport {
  const comparisons: ComparisonEntry[] = [];
  const reverseIssues: ReverseIssue[] = [];

  const twSchedule = teachers.filter(t => t.schedule && Object.keys(t.schedule).length > 0);
  const cwSchedule = classes.filter(c => c.schedule && Object.keys(c.schedule).length > 0);

  // Build class name lookup: normalized name → ClassInfo
  const classMap = new Map<string, ClassInfo>();
  for (const cls of cwSchedule) {
    classMap.set(normalizeForMatch(cls.name), cls);
  }

  // Build teacher name lookup: normalized name → Teacher
  const teacherMap = new Map<string, Teacher>();
  for (const t of twSchedule) {
    teacherMap.set(normalizeForMatch(t.name), t);
  }

  // Forward check: teacher schedule → class schedule
  // Also track (day-hour-className) for conflict detection
  const classSlotTeachers = new Map<string, string[]>();

  for (const teacher of twSchedule) {
    if (!teacher.schedule) continue;
    for (const [dayStr, hours] of Object.entries(teacher.schedule)) {
      const day = parseInt(dayStr);
      for (const [hourStr, value] of Object.entries(hours)) {
        const hour = parseInt(hourStr);
        const normalized = normalizeForMatch(value);

        // Track for conflict detection
        const conflictKey = `${day}-${hour}-${normalized}`;
        if (!classSlotTeachers.has(conflictKey)) classSlotTeachers.set(conflictKey, []);
        classSlotTeachers.get(conflictKey)!.push(teacher.name);

        // Try to find matching class
        const matchedClass = classMap.get(normalized);

        if (!matchedClass) {
          comparisons.push({
            day, hour, teacherName: teacher.name, teacherValue: value,
            className: null, classValue: null, status: 'class_not_found',
          });
          continue;
        }

        const classValueAtSlot = matchedClass.schedule?.[day]?.[hour];

        if (!classValueAtSlot) {
          comparisons.push({
            day, hour, teacherName: teacher.name, teacherValue: value,
            className: matchedClass.name, classValue: null, status: 'class_slot_empty',
          });
          continue;
        }

        const isMatch = teacherNameMatches(teacher.name, classValueAtSlot);
        comparisons.push({
          day, hour, teacherName: teacher.name, teacherValue: value,
          className: matchedClass.name, classValue: classValueAtSlot,
          status: isMatch ? 'match' : 'mismatch',
        });
      }
    }
  }

  // Conflict detection: multiple teachers claiming same class at same time
  const conflicts: ConflictEntry[] = [];
  for (const [key, names] of classSlotTeachers) {
    if (names.length > 1) {
      const [dayStr, hourStr, ...classNameParts] = key.split('-');
      conflicts.push({
        day: parseInt(dayStr),
        hour: parseInt(hourStr),
        className: classNameParts.join('-'),
        teacherNames: names,
      });
    }
  }

  // Reverse check: class schedule → teacher schedule
  for (const cls of cwSchedule) {
    if (!cls.schedule) continue;
    for (const [dayStr, hours] of Object.entries(cls.schedule)) {
      const day = parseInt(dayStr);
      for (const [hourStr, value] of Object.entries(hours)) {
        const hour = parseInt(hourStr);

        let matchedTeacher: Teacher | undefined;
        for (const [, t] of teacherMap) {
          if (teacherNameMatches(t.name, value)) {
            matchedTeacher = t;
            break;
          }
        }

        if (!matchedTeacher) {
          // Value might be a subject name, not a teacher name — only flag if it looks like a name
          const looksLikeName = value.split(/\s+/).length >= 2
            || value.match(/[A-ZÇŞÜÖĞİ]{2,}/);
          if (looksLikeName) {
            reverseIssues.push({
              day, hour, className: cls.name, classValue: value,
              status: 'teacher_not_found',
            });
          }
          continue;
        }

        const teacherValueAtSlot = matchedTeacher.schedule?.[day]?.[hour];

        if (!teacherValueAtSlot) {
          reverseIssues.push({
            day, hour, className: cls.name, classValue: value,
            status: 'teacher_slot_empty',
            teacherName: matchedTeacher.name,
          });
          continue;
        }

        // Check if teacher's value references this class
        const classNorm = normalizeForMatch(cls.name);
        const teacherValNorm = normalizeForMatch(teacherValueAtSlot);
        if (classNorm !== teacherValNorm) {
          reverseIssues.push({
            day, hour, className: cls.name, classValue: value,
            status: 'teacher_mismatch',
            teacherName: matchedTeacher.name,
            teacherValue: teacherValueAtSlot,
          });
        }
      }
    }
  }

  return { comparisons, conflicts, reverseIssues };
}

/* ─── Schedule Table Component ─── */

function ScheduleTable({
  schedule,
  schoolDays,
  lessonCount,
  lessonTimes,
  editable,
  onCellChange,
}: {
  schedule: Record<number, Record<number, string>>;
  schoolDays: number[];
  lessonCount: number;
  lessonTimes: { lesson: number; start: string; end: string }[];
  editable?: boolean;
  onCellChange?: (day: number, hour: number, value: string) => void;
}) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const sortedDays = useMemo(() =>
    [...schoolDays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)),
    [schoolDays]
  );
  const hours = Array.from({ length: lessonCount }, (_, i) => i + 1);

  const totalLessons = useMemo(() => {
    let count = 0;
    for (const day of sortedDays) {
      for (const h of hours) {
        if (schedule[day]?.[h]) count++;
      }
    }
    return count;
  }, [schedule, sortedDays, hours]);

  // Disable cell merging in editable mode for easier per-cell editing
  const cellBlocks = useMemo(() => {
    const blocks: Record<string, { render: boolean; span: number }> = {};
    let blockCount = 0;

    if (editable) {
      for (const day of sortedDays) {
        for (const h of hours) {
          blocks[`${day}-${h}`] = { render: true, span: 1 };
        }
      }
      return { blocks, blockCount: 0 };
    }

    for (const day of sortedDays) {
      let i = 0;
      while (i < hours.length) {
        const h = hours[i];
        const val = schedule[day]?.[h] || '';

        if (!val) {
          blocks[`${day}-${h}`] = { render: true, span: 1 };
          i++;
          continue;
        }

        let span = 1;
        while (i + span < hours.length) {
          const nextVal = schedule[day]?.[hours[i + span]] || '';
          if (nextVal === val) span++;
          else break;
        }

        blocks[`${day}-${h}`] = { render: true, span };
        if (span > 1) {
          blockCount++;
          for (let s = 1; s < span; s++) {
            blocks[`${day}-${hours[i + s]}`] = { render: false, span: 0 };
          }
        }

        i += span;
      }
    }

    return { blocks, blockCount };
  }, [schedule, sortedDays, hours, editable]);

  const startEdit = (day: number, hour: number) => {
    if (!editable) return;
    const key = `${day}-${hour}`;
    setEditingCell(key);
    setEditValue(schedule[day]?.[hour] || '');
  };

  const commitEdit = (day: number, hour: number) => {
    const trimmed = editValue.trim();
    onCellChange?.(day, hour, trimmed);
    setEditingCell(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="py-2.5 px-3 text-left font-semibold text-slate-600 border-b border-r border-slate-200 w-28">
                Ders
              </th>
              {sortedDays.map(d => (
                <th key={d} className="py-2.5 px-3 text-center font-semibold text-slate-600 border-b border-r border-slate-200 last:border-r-0 min-w-[100px]">
                  {DAY_NUM_TO_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map(h => {
              const lt = lessonTimes.find(l => l.lesson === h);
              return (
                <tr key={h} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 border-b border-r border-slate-200 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                        {h}
                      </span>
                      {lt && (
                        <span className="text-[11px] text-slate-400 leading-tight">
                          {lt.start}<br />{lt.end}
                        </span>
                      )}
                    </div>
                  </td>
                  {sortedDays.map(d => {
                    const cellKey = `${d}-${h}`;
                    const block = cellBlocks.blocks[cellKey];
                    if (block && !block.render) return null;
                    const val = schedule[d]?.[h];
                    const span = block?.span || 1;
                    const isEditing = editingCell === cellKey;

                    if (editable && isEditing) {
                      return (
                        <td key={d} className="p-0.5 border-b border-r border-slate-200 last:border-r-0">
                          <input
                            autoFocus
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(d, h)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(d, h);
                              if (e.key === 'Escape') cancelEdit();
                              if (e.key === 'Tab') {
                                e.preventDefault();
                                commitEdit(d, h);
                                // Move to next cell
                                const dayIdx = sortedDays.indexOf(d);
                                const nextDayIdx = dayIdx + 1;
                                if (nextDayIdx < sortedDays.length) {
                                  setTimeout(() => startEdit(sortedDays[nextDayIdx], h), 0);
                                } else if (h < lessonCount) {
                                  setTimeout(() => startEdit(sortedDays[0], h + 1), 0);
                                }
                              }
                            }}
                            className="w-full px-2 py-1.5 text-center text-sm border-2 border-indigo-400 rounded focus:outline-none focus:border-indigo-600 bg-indigo-50"
                          />
                        </td>
                      );
                    }

                    return (
                      <td
                        key={d}
                        rowSpan={span > 1 ? span : undefined}
                        onClick={() => startEdit(d, h)}
                        className={`py-2 px-3 text-center border-b border-r border-slate-200 last:border-r-0 ${
                          editable ? 'cursor-pointer hover:bg-indigo-50/50' : ''
                        } ${
                          val
                            ? span > 1
                              ? 'text-slate-800 font-semibold bg-indigo-50/70 align-middle'
                              : 'text-slate-800 font-medium'
                            : 'text-slate-300'
                        }`}
                      >
                        {val || (editable ? '—' : '—')}
                        {span > 1 && (
                          <span className="block text-[10px] text-indigo-500 font-normal mt-0.5">
                            {span} saat
                          </span>
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
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        {editable && (
          <span className="text-indigo-500 flex items-center gap-1">
            <PenLine className="w-3 h-3" />
            Hücreye tıklayarak düzenleyin. Tab ile ileri, Enter ile kaydedin.
          </span>
        )}
        <span className="ml-auto">
          Toplam <span className="font-semibold text-slate-600">{totalLessons}</span> saat
          {cellBlocks.blockCount > 0 && (
            <span className="ml-1.5">
              (<span className="font-semibold text-indigo-600">{cellBlocks.blockCount}</span> blok ders)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function SchedulesTab({
  teachers,
  setTeachers,
  onTeacherIdsMerged,
  classes,
  setClasses,
  schoolInfo,
}: Props) {
  const settings = schoolInfo.settings ?? DEFAULT_SCHOOL_SETTINGS;
  const lessonTimes = useMemo(() => calculateLessonTimes(settings), [settings]);
  const teacherFileInputRef = useRef<HTMLInputElement>(null);
  const classFileInputRef = useRef<HTMLInputElement>(null);

  const [teacherStatus, setTeacherStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [classStatus, setClassStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successDetail, setSuccessDetail] = useState('');

  const [viewTab, setViewTab] = useState<'teachers' | 'classes'>('teachers');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [checkedTeacherIds, setCheckedTeacherIds] = useState<Set<string>>(new Set());
  const [checkedClassIds, setCheckedClassIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  const teachersWithSchedule = useMemo(() =>
    teachers
      .filter(t => t.schedule && Object.keys(t.schedule).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teachers]
  );
  const teachersWithoutSchedule = useMemo(() =>
    teachers
      .filter(t => !t.schedule || Object.keys(t.schedule).length === 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [teachers]
  );
  const classesWithSchedule = useMemo(() =>
    classes
      .filter(c => c.schedule && Object.keys(c.schedule).length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [classes]
  );

  const selectedTeacher = useMemo(() =>
    teachers.find(t => t.id === selectedTeacherId),
    [teachers, selectedTeacherId]
  );
  const selectedClass = useMemo(() =>
    classes.find(c => c.id === selectedClassId),
    [classes, selectedClassId]
  );

  /* ─── Upload Handlers ─── */

  const handleTeacherUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseExcelSchedule(ws, TEACHER_NAME_FIELDS, settings.lessonCount);

        if (parsed.length === 0) {
          setTeacherStatus('error');
          setErrorMessage('Excel dosyasında uygun formatta öğretmen verisi bulunamadı. Sütun başlıklarını kontrol edin.');
          setTimeout(() => setTeacherStatus('idle'), 4000);
          return;
        }

        const mergedParsed = mergeParsedTeacherRows(parsed);

        const updatedTeachers = [...teachers];
        let updatedCount = 0;
        let createdCount = 0;
        const matchedNames: string[] = [];

        mergedParsed.forEach(({ name, schedule }) => {
          const matchIdx = findBestTeacherMatch(updatedTeachers, name);

          if (matchIdx >= 0) {
            if (turkishLower(updatedTeachers[matchIdx].name.trim()) !== turkishLower(name.trim())) {
              matchedNames.push(`${name} → ${updatedTeachers[matchIdx].name}`);
            }
            updatedTeachers[matchIdx] = {
              ...updatedTeachers[matchIdx],
              schedule: mergeScheduleOverlay(updatedTeachers[matchIdx].schedule, schedule),
            };
            updatedCount++;
          } else {
            updatedTeachers.push({
              id: uuidv4(),
              name,
              dutyType: 'sabit',
              schedule,
            });
            createdCount++;
          }
        });

        const { teachers: dedupedTeachers, idRemap } = dedupeTeachersList(updatedTeachers);
        setTeachers(dedupedTeachers);
        if (Object.keys(idRemap).length > 0) {
          onTeacherIdsMerged?.(idRemap);
        }
        setTeacherStatus('success');
        const detectedDays = new Set<number>();
        mergedParsed.forEach(({ schedule }) => {
          for (const d of Object.keys(schedule)) detectedDays.add(parseInt(d));
        });
        const dayNames = [...detectedDays]
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
          .map(d => DAY_NUM_TO_SHORT[d])
          .join(', ');
        const parts: string[] = [];
        const excelRowMerged = parsed.length - mergedParsed.length;
        if (excelRowMerged > 0) {
          parts.push(`Excel'de ${excelRowMerged} satır aynı öğretmende birleştirildi`);
        }
        const listDeduped = Object.keys(idRemap).length;
        if (listDeduped > 0) {
          parts.push(`${listDeduped} mükerrer öğretmen kaydı birleştirildi`);
        }
        if (updatedCount > 0) parts.push(`${updatedCount} öğretmen güncellendi`);
        if (createdCount > 0) parts.push(`${createdCount} yeni öğretmen eklendi`);
        if (matchedNames.length > 0) parts.push(`Eşleştirilen: ${matchedNames.slice(0, 3).join(', ')}${matchedNames.length > 3 ? ` (+${matchedNames.length - 3})` : ''}`);
        if (dayNames) parts.push(`Günler: ${dayNames}`);
        setSuccessDetail(parts.join(' · '));
        setTimeout(() => setTeacherStatus('idle'), 6000);
      } catch {
        setTeacherStatus('error');
        setErrorMessage('Öğretmen programı yüklenirken bir hata oluştu. Dosya formatını kontrol edin.');
        setTimeout(() => setTeacherStatus('idle'), 4000);
      }
      if (teacherFileInputRef.current) teacherFileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClassUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const parsed = parseExcelSchedule(ws, CLASS_NAME_FIELDS, settings.lessonCount);

        if (parsed.length === 0) {
          setClassStatus('error');
          setErrorMessage('Excel dosyasında uygun formatta sınıf verisi bulunamadı. Sütun başlıklarını kontrol edin.');
          setTimeout(() => setClassStatus('idle'), 4000);
          return;
        }

        const updatedClasses = [...classes];
        let updatedCount = 0;
        let createdCount = 0;

        parsed.forEach(({ name, schedule }) => {
          const existingIndex = updatedClasses.findIndex(
            c => turkishLower(c.name.trim()) === turkishLower(name.trim())
          );

          if (existingIndex >= 0) {
            updatedClasses[existingIndex] = {
              ...updatedClasses[existingIndex],
              schedule,
            };
            updatedCount++;
          } else {
            updatedClasses.push({
              id: uuidv4(),
              name,
              schedule,
            });
            createdCount++;
          }
        });

        setClasses(updatedClasses);
        setClassStatus('success');
        const detectedDays = new Set<number>();
        parsed.forEach(({ schedule }) => {
          for (const d of Object.keys(schedule)) detectedDays.add(parseInt(d));
        });
        const dayNames = [...detectedDays]
          .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
          .map(d => DAY_NUM_TO_SHORT[d])
          .join(', ');
        const parts: string[] = [];
        if (updatedCount > 0) parts.push(`${updatedCount} sınıf güncellendi`);
        if (createdCount > 0) parts.push(`${createdCount} yeni sınıf eklendi`);
        if (dayNames) parts.push(`Günler: ${dayNames}`);
        setSuccessDetail(parts.join(' · '));
        setTimeout(() => setClassStatus('idle'), 6000);
      } catch {
        setClassStatus('error');
        setErrorMessage('Sınıf programı yüklenirken bir hata oluştu. Dosya formatını kontrol edin.');
        setTimeout(() => setClassStatus('idle'), 4000);
      }
      if (classFileInputRef.current) classFileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDeleteTeacherSchedule = (teacherId: string) => {
    setTeachers(prev => prev.map(t =>
      t.id === teacherId ? { ...t, schedule: undefined } : t
    ));
    if (selectedTeacherId === teacherId) setSelectedTeacherId('');
  };

  const handleDeleteClassSchedule = (classId: string) => {
    setClasses(prev => prev.filter(c => c.id !== classId));
    if (selectedClassId === classId) setSelectedClassId('');
  };

  const toggleCheckedTeacher = (id: string) => {
    setCheckedTeacherIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCheckedClass = (id: string) => {
    setCheckedClassIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllTeachers = () => {
    if (checkedTeacherIds.size === teachersWithSchedule.length) {
      setCheckedTeacherIds(new Set());
    } else {
      setCheckedTeacherIds(new Set(teachersWithSchedule.map(t => t.id)));
    }
  };

  const toggleAllClasses = () => {
    if (checkedClassIds.size === classesWithSchedule.length) {
      setCheckedClassIds(new Set());
    } else {
      setCheckedClassIds(new Set(classesWithSchedule.map(c => c.id)));
    }
  };

  const handleBulkDeleteTeacherSchedules = () => {
    setTeachers(prev => prev.map(t =>
      checkedTeacherIds.has(t.id) ? { ...t, schedule: undefined } : t
    ));
    if (checkedTeacherIds.has(selectedTeacherId)) setSelectedTeacherId('');
    setCheckedTeacherIds(new Set());
  };

  const handleBulkDeleteClassSchedules = () => {
    setClasses(prev => prev.filter(c => !checkedClassIds.has(c.id)));
    if (checkedClassIds.has(selectedClassId)) setSelectedClassId('');
    setCheckedClassIds(new Set());
  };

  const handleTeacherCellChange = useCallback((teacherId: string, day: number, hour: number, value: string) => {
    setTeachers(prev => prev.map(t => {
      if (t.id !== teacherId) return t;
      const schedule = { ...(t.schedule || {}) };
      if (!value) {
        if (schedule[day]) {
          const daySchedule = { ...schedule[day] };
          delete daySchedule[hour];
          if (Object.keys(daySchedule).length === 0) {
            delete schedule[day];
          } else {
            schedule[day] = daySchedule;
          }
        }
      } else {
        schedule[day] = { ...(schedule[day] || {}), [hour]: value };
      }
      return { ...t, schedule };
    }));
  }, [setTeachers]);

  const handleClassCellChange = useCallback((classId: string, day: number, hour: number, value: string) => {
    setClasses(prev => prev.map(c => {
      if (c.id !== classId) return c;
      const schedule = { ...c.schedule };
      if (!value) {
        if (schedule[day]) {
          const daySchedule = { ...schedule[day] };
          delete daySchedule[hour];
          if (Object.keys(daySchedule).length === 0) {
            delete schedule[day];
          } else {
            schedule[day] = daySchedule;
          }
        }
      } else {
        schedule[day] = { ...(schedule[day] || {}), [hour]: value };
      }
      return { ...c, schedule };
    }));
  }, [setClasses]);

  const handleCreateTeacherSchedule = (teacherId: string) => {
    setTeachers(prev => prev.map(t =>
      t.id === teacherId ? { ...t, schedule: {} } : t
    ));
    setSelectedTeacherId(teacherId);
    setEditMode(true);
  };

  const handleCreateClassSchedule = () => {
    const name = newClassName.trim();
    if (!name) return;
    const existing = classes.find(c => turkishLower(c.name) === turkishLower(name));
    if (existing) {
      setSelectedClassId(existing.id);
      setEditMode(true);
      setNewClassName('');
      return;
    }
    const id = uuidv4();
    setClasses(prev => [...prev, { id, name, schedule: {} }]);
    setSelectedClassId(id);
    setEditMode(true);
    setNewClassName('');
  };

  const dayLabels = settings.schoolDays
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map(d => DAY_NUM_TO_SHORT[d] + '-1')
    .join('", "');

  return (
    <div className="w-full mx-auto space-y-6">
      {/* Upload Section */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Ders Programı Yükleme</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Birleştirilmiş hücreler, boş satır ve sütunlar otomatik algılanır
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Teacher Upload */}
          <div className="space-y-4 p-6 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-lg font-medium text-slate-800">Öğretmen Ders Programı</h3>
            <p className="text-sm text-slate-600">
              Excel'de "Ad Soyad" sütunu + gün-ders sütunları olmalı.
              Örnek: <span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-slate-200">"Ad Soyad", "{dayLabels}", ...</span>
            </p>
            <p className="text-xs text-slate-400">
              Alternatif: İlk satırda gün adları (Pazartesi, Salı...), ikinci satırda ders saatleri (1, 2, 3...) olan iki satırlı başlık da desteklenir.
            </p>

            <input type="file" accept=".xlsx,.xls" className="hidden" ref={teacherFileInputRef} onChange={handleTeacherUpload} />

            <button
              onClick={() => teacherFileInputRef.current?.click()}
              className="w-full bg-surface border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 py-8 rounded-xl flex flex-col items-center justify-center gap-3 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="font-medium">Öğretmen Programı Yükle</span>
            </button>

            {teacherStatus === 'success' && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 p-3 rounded-lg">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Başarılı! {successDetail}</span>
              </div>
            )}
            {teacherStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Class Upload */}
          <div className="space-y-4 p-6 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-lg font-medium text-slate-800">Sınıf Ders Programı</h3>
            <p className="text-sm text-slate-600">
              Excel'de "Sınıf" sütunu + gün-ders sütunları olmalı.
              Örnek: <span className="font-mono text-xs bg-surface px-1.5 py-0.5 rounded border border-slate-200">"Sınıf", "{dayLabels}", ...</span>
            </p>
            <p className="text-xs text-slate-400">
              Alternatif: İlk satırda gün adları, ikinci satırda ders saatleri olan format da desteklenir.
            </p>

            <input type="file" accept=".xlsx,.xls" className="hidden" ref={classFileInputRef} onChange={handleClassUpload} />

            <button
              onClick={() => classFileInputRef.current?.click()}
              className="w-full bg-surface border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50 text-slate-700 py-8 rounded-xl flex flex-col items-center justify-center gap-3 transition-colors"
            >
              <Upload className="w-8 h-8 text-slate-400" />
              <span className="font-medium">Sınıf Programı Yükle</span>
            </button>

            {classStatus === 'success' && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium bg-emerald-50 p-3 rounded-lg">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>Başarılı! {successDetail}</span>
              </div>
            )}
            {classStatus === 'error' && (
              <div className="flex items-center gap-2 text-red-600 text-sm font-medium bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation Section */}
      {teachersWithSchedule.length > 0 && classesWithSchedule.length > 0 && (
        <div className="bg-surface rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-violet-100 p-2 rounded-lg text-violet-600">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Program Karşılaştırma</h2>
                  <p className="text-sm text-slate-500">
                    Öğretmen ve sınıf programlarının birbiriyle uyumunu kontrol edin
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const report = validateSchedules(teachers, classes);
                  setValidationReport(report);
                  setShowValidation(true);
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-colors shadow-sm text-sm"
              >
                <Scale className="w-4 h-4" />
                Karşılaştır
              </button>
            </div>

            {showValidation && validationReport && (() => {
              const matches = validationReport.comparisons.filter(c => c.status === 'match').length;
              const mismatches = validationReport.comparisons.filter(c => c.status === 'mismatch').length;
              const classEmpty = validationReport.comparisons.filter(c => c.status === 'class_slot_empty').length;
              const classNotFound = validationReport.comparisons.filter(c => c.status === 'class_not_found').length;
              const conflicts = validationReport.conflicts.length;
              const reverseProblems = validationReport.reverseIssues.length;
              const totalChecked = validationReport.comparisons.length;
              const totalProblems = mismatches + classEmpty + conflicts + reverseProblems;
              const isFullyValid = totalProblems === 0 && matches > 0;

              return (
                <div className="mt-6 space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-emerald-700">{matches}</div>
                      <div className="text-xs text-emerald-600 font-medium">Eşleşme</div>
                    </div>
                    <div className={`border rounded-xl p-3 text-center ${mismatches > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-2xl font-bold ${mismatches > 0 ? 'text-red-700' : 'text-slate-400'}`}>{mismatches}</div>
                      <div className={`text-xs font-medium ${mismatches > 0 ? 'text-red-600' : 'text-slate-400'}`}>Uyumsuzluk</div>
                    </div>
                    <div className={`border rounded-xl p-3 text-center ${classEmpty + classNotFound > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-2xl font-bold ${classEmpty + classNotFound > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{classEmpty + classNotFound}</div>
                      <div className={`text-xs font-medium ${classEmpty + classNotFound > 0 ? 'text-amber-600' : 'text-slate-400'}`}>Eksik Veri</div>
                    </div>
                    <div className={`border rounded-xl p-3 text-center ${conflicts > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-2xl font-bold ${conflicts > 0 ? 'text-red-700' : 'text-slate-400'}`}>{conflicts}</div>
                      <div className={`text-xs font-medium ${conflicts > 0 ? 'text-red-600' : 'text-slate-400'}`}>Çakışma</div>
                    </div>
                  </div>

                  {/* Overall Status */}
                  {isFullyValid ? (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-emerald-800">Programlar Birebir Uyumlu</p>
                        <p className="text-sm text-emerald-600">
                          {totalChecked} kontrol yapıldı, {matches} eşleşme onaylandı. Tüm veriler tutarlı.
                        </p>
                      </div>
                    </div>
                  ) : totalProblems > 0 ? (
                    <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-amber-800">
                          {totalProblems} Sorun Tespit Edildi
                        </p>
                        <p className="text-sm text-amber-600">
                          {totalChecked} kontrol yapıldı. Aşağıdaki detayları inceleyerek düzeltme yapabilirsiniz.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Conflicts */}
                  {validationReport.conflicts.length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                        <XIcon className="w-4 h-4" />
                        Çakışmalar (aynı sınıfa aynı anda birden fazla öğretmen)
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {validationReport.conflicts.map((c, i) => (
                          <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm">
                            <XIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <span className="text-red-800">
                              <span className="font-medium">{DAY_NUM_TO_SHORT[c.day]} {c.hour}. ders</span>
                              {' — '}
                              <span className="font-semibold">{c.className}</span> sınıfına birden fazla öğretmen atanmış:{' '}
                              {c.teacherNames.join(', ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Mismatches */}
                  {validationReport.comparisons.filter(c => c.status === 'mismatch').length > 0 && (
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        Uyumsuzluklar (öğretmen ve sınıf programı tutarsız)
                      </h4>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {validationReport.comparisons
                          .filter(c => c.status === 'mismatch')
                          .map((c, i) => (
                            <div key={i} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm">
                              <XIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                              <span className="text-red-800">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[c.day]} {c.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{c.teacherName}</span> programında "{c.teacherValue}",
                                ancak <span className="font-semibold">{c.className}</span> programında "{c.classValue}"
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Data */}
                  {(classEmpty + classNotFound > 0 || reverseProblems > 0) && (
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Eksik Veriler
                      </h4>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {validationReport.comparisons
                          .filter(c => c.status === 'class_slot_empty')
                          .map((c, i) => (
                            <div key={`e-${i}`} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-amber-800">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[c.day]} {c.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{c.teacherName}</span> → {c.teacherValue},
                                ancak <span className="font-semibold">{c.className}</span> programında bu saat boş
                              </span>
                            </div>
                          ))}
                        {validationReport.comparisons
                          .filter(c => c.status === 'class_not_found')
                          .slice(0, 20)
                          .map((c, i) => (
                            <div key={`nf-${i}`} className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                              <span className="text-slate-600">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[c.day]} {c.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{c.teacherName}</span> → "{c.teacherValue}"
                                (sınıf programı yüklenmemiş)
                              </span>
                            </div>
                          ))}
                        {validationReport.reverseIssues
                          .filter(r => r.status === 'teacher_slot_empty')
                          .map((r, i) => (
                            <div key={`re-${i}`} className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-amber-800">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[r.day]} {r.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{r.className}</span> → {r.classValue},
                                ancak <span className="font-semibold">{r.teacherName}</span> programında bu saat boş
                              </span>
                            </div>
                          ))}
                        {validationReport.reverseIssues
                          .filter(r => r.status === 'teacher_mismatch')
                          .map((r, i) => (
                            <div key={`rm-${i}`} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm">
                              <XIcon className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                              <span className="text-red-800">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[r.day]} {r.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{r.className}</span> → "{r.classValue}",
                                ancak <span className="font-semibold">{r.teacherName}</span> programında "{r.teacherValue}" (farklı sınıf)
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Matches detail (collapsible) */}
                  {matches > 0 && (
                    <details className="group">
                      <summary className="text-sm font-semibold text-emerald-700 cursor-pointer flex items-center gap-1.5 select-none">
                        <CheckCircle2 className="w-4 h-4" />
                        Onaylanan Eşleşmeler ({matches})
                        <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                        {validationReport.comparisons
                          .filter(c => c.status === 'match')
                          .map((c, i) => (
                            <div key={i} className="flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-sm">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span className="text-emerald-800">
                                <span className="font-medium">{DAY_NUM_TO_SHORT[c.day]} {c.hour}. ders</span>
                                {' — '}
                                <span className="font-semibold">{c.teacherName}</span> → {c.teacherValue}
                                {' '}|{' '}
                                <span className="font-semibold">{c.className}</span> → {c.classValue}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => { setShowValidation(false); setValidationReport(null); }}
                      className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      Sonuçları Kapat
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Schedule Viewer */}
      {(teachers.length > 0 || classesWithSchedule.length > 0) && (
        <div className="bg-surface rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Viewer Tab Bar */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setViewTab('teachers')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                viewTab === 'teachers'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              Öğretmen Programları
              {teachersWithSchedule.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {teachersWithSchedule.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewTab('classes')}
              className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                viewTab === 'classes'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Sınıf Programları
              {classesWithSchedule.length > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {classesWithSchedule.length}
                </span>
              )}
            </button>
          </div>

          <div className="p-6">
            {/* Teacher Schedules */}
            {viewTab === 'teachers' && (
              <>
                {teachersWithSchedule.length === 0 && teachersWithoutSchedule.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p>Henüz öğretmen eklenmemiş.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Selector + Edit Toggle */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Öğretmen Seç:</label>
                      <div className="relative flex-1 max-w-sm">
                        <select
                          value={selectedTeacherId}
                          onChange={(e) => { setSelectedTeacherId(e.target.value); }}
                          className="w-full appearance-none px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          <option value="">— Öğretmen seçin —</option>
                          {teachersWithSchedule.length > 0 && (
                            <optgroup label="Programı Olan">
                              {teachersWithSchedule.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {teachersWithoutSchedule.length > 0 && (
                            <optgroup label="Programı Olmayan">
                              {teachersWithoutSchedule.map(t => (
                                <option key={t.id} value={t.id}>{t.name} (program yok)</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      <button
                        onClick={() => setEditMode(!editMode)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          editMode
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <PenLine className="w-4 h-4" />
                        {editMode ? 'Düzenleme Açık' : 'Elle Düzenle'}
                      </button>
                    </div>

                    {/* Manual creation for teacher without schedule */}
                    {selectedTeacherId && !selectedTeacher?.schedule && (
                      <div className="p-4 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 flex items-center justify-between">
                        <p className="text-sm text-indigo-700">
                          <span className="font-semibold">{selectedTeacher?.name}</span> için henüz program girilmemiş.
                        </p>
                        <button
                          onClick={() => handleCreateTeacherSchedule(selectedTeacherId)}
                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Manuel Program Oluştur
                        </button>
                      </div>
                    )}

                    {/* Selected Teacher Schedule */}
                    {selectedTeacher?.schedule && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-slate-800">{selectedTeacher.name}</h4>
                          <button
                            onClick={() => handleDeleteTeacherSchedule(selectedTeacher.id)}
                            className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Programı Sil
                          </button>
                        </div>
                        <ScheduleTable
                          schedule={selectedTeacher.schedule}
                          schoolDays={settings.schoolDays}
                          lessonCount={settings.lessonCount}
                          lessonTimes={lessonTimes}
                          editable={editMode}
                          onCellChange={(day, hour, value) => handleTeacherCellChange(selectedTeacher.id, day, hour, value)}
                        />
                      </div>
                    )}

                    {/* Summary List */}
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-slate-600">
                          Tüm Öğretmenler ({teachersWithSchedule.length})
                        </h4>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none hover:text-slate-700">
                            <input
                              type="checkbox"
                              checked={checkedTeacherIds.size === teachersWithSchedule.length && teachersWithSchedule.length > 0}
                              onChange={toggleAllTeachers}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            Tümünü Seç
                          </label>
                          {checkedTeacherIds.size > 0 && (
                            <button
                              onClick={handleBulkDeleteTeacherSchedules}
                              className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Seçilenleri Sil ({checkedTeacherIds.size})
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {teachersWithSchedule.map(t => {
                          const totalLessons = Object.values(t.schedule || {}).reduce(
                            (sum: number, daySchedule: any) => sum + Object.keys(daySchedule).length, 0
                          );
                          const isViewing = t.id === selectedTeacherId;
                          const isChecked = checkedTeacherIds.has(t.id);
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                                isViewing
                                  ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
                                  : isChecked
                                    ? 'bg-red-50/50 border-red-200'
                                    : 'bg-surface border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCheckedTeacher(t.id)}
                                className="rounded border-slate-300 text-red-500 focus:ring-red-400 w-4 h-4 shrink-0 cursor-pointer"
                              />
                              <button
                                onClick={() => setSelectedTeacherId(t.id)}
                                className="flex items-center justify-between flex-1 min-w-0 text-left"
                              >
                                <span className={`font-medium truncate ${isViewing ? 'text-indigo-700' : 'text-slate-700'}`}>
                                  {t.name}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                                  isViewing ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {totalLessons} ders
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Class Schedules */}
            {viewTab === 'classes' && (
              <>
                <div className="space-y-4">
                  {/* Selector + New Class */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Sınıf Seç:</label>
                    <div className="relative flex-1 max-w-sm">
                      <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        className="w-full appearance-none px-4 py-2.5 pr-10 border border-slate-300 rounded-lg bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      >
                        <option value="">— Sınıf seçin —</option>
                        {classesWithSchedule.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        editMode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <PenLine className="w-4 h-4" />
                      {editMode ? 'Düzenleme Açık' : 'Elle Düzenle'}
                    </button>
                  </div>

                  {/* Add New Class */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleCreateClassSchedule(); }}
                      placeholder="Yeni sınıf adı (Örn: 5-A)"
                      className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleCreateClassSchedule}
                      disabled={!newClassName.trim()}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Sınıf Ekle
                    </button>
                  </div>

                  {classesWithSchedule.length === 0 && !selectedClassId ? (
                    <div className="text-center py-8 text-slate-400">
                      <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p>Henüz sınıf ders programı yüklenmedi. Yukarıdan yeni sınıf ekleyebilirsiniz.</p>
                    </div>
                  ) : null}

                  {/* Selected Class Schedule */}
                  {selectedClass?.schedule && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-slate-800">{selectedClass.name}</h4>
                        <button
                          onClick={() => handleDeleteClassSchedule(selectedClass.id)}
                          className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Programı Sil
                        </button>
                      </div>
                      <ScheduleTable
                        schedule={selectedClass.schedule}
                        schoolDays={settings.schoolDays}
                        lessonCount={settings.lessonCount}
                        lessonTimes={lessonTimes}
                        editable={editMode}
                        onCellChange={(day, hour, value) => handleClassCellChange(selectedClass.id, day, hour, value)}
                      />
                    </div>
                  )}

                  {/* Summary List */}
                  {classesWithSchedule.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-slate-600">
                          Tüm Sınıflar ({classesWithSchedule.length})
                        </h4>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none hover:text-slate-700">
                            <input
                              type="checkbox"
                              checked={checkedClassIds.size === classesWithSchedule.length && classesWithSchedule.length > 0}
                              onChange={toggleAllClasses}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            Tümünü Seç
                          </label>
                          {checkedClassIds.size > 0 && (
                            <button
                              onClick={handleBulkDeleteClassSchedules}
                              className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-200 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Seçilenleri Sil ({checkedClassIds.size})
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {classesWithSchedule.map(c => {
                          const totalLessons = Object.values(c.schedule || {}).reduce(
                            (sum: number, daySchedule: any) => sum + Object.keys(daySchedule).length, 0
                          );
                          const isViewing = c.id === selectedClassId;
                          const isChecked = checkedClassIds.has(c.id);
                          return (
                            <div
                              key={c.id}
                              className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                                isViewing
                                  ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
                                  : isChecked
                                    ? 'bg-red-50/50 border-red-200'
                                    : 'bg-surface border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleCheckedClass(c.id)}
                                className="rounded border-slate-300 text-red-500 focus:ring-red-400 w-4 h-4 shrink-0 cursor-pointer"
                              />
                              <button
                                onClick={() => setSelectedClassId(c.id)}
                                className="flex items-center justify-between flex-1 min-w-0 text-left"
                              >
                                <span className={`font-medium truncate ${isViewing ? 'text-indigo-700' : 'text-slate-700'}`}>
                                  {c.name}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                                  isViewing ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {totalLessons} ders
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
