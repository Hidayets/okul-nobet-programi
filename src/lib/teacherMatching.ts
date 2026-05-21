import { Teacher } from '../types';

/**
 * Öğretmen isim eşleştirme yardımcıları.
 *
 * Amaç: "Ahmet Adıgüzel" ile "A. Adıgüzel" gibi kısaltma içeren isimlerin
 * aynı kişi olduğunu tespit etmek ve birleştirme yapmak. Birleşme sırasında
 * daha tam (uzun, baş harf içermeyen) ad korunur — Öğretmenler sayfasındaki
 * manuel girilen kayıt bu sayede otoriter olur.
 */

export function turkishLower(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u200E\u200F]/g, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase();
}

/**
 * "A. Adıgüzel", "Ah.Yılmaz" gibi formatları "Ahmet Adıgüzel" gibi tam adlarla eşleştirir.
 * Soyad eşleşmesi şart; ad kısaltma olabilir.
 */
export function fuzzyTeacherMatch(fullName: string, abbreviated: string): boolean {
  const full = turkishLower(fullName.trim());
  const abbr = turkishLower(abbreviated.trim());

  if (!full || !abbr) return false;
  if (full === abbr) return true;

  const fullParts = full.split(/\s+/).filter(Boolean);
  const abbrClean = abbr.replace(/\./g, '. ').replace(/\s+/g, ' ').trim();
  const abbrParts = abbrClean.split(/\s+/).filter(Boolean).map((p) => p.replace(/\.$/, ''));

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

/** İki ismin aynı kişiye ait olup olmadığını döner (her iki yönde fuzzy dahil). */
export function isSameTeacherName(a: string, b: string): boolean {
  const la = turkishLower((a || '').trim());
  const lb = turkishLower((b || '').trim());
  if (!la || !lb) return false;
  if (la === lb) return true;
  return fuzzyTeacherMatch(a, b) || fuzzyTeacherMatch(b, a);
}

/** Bir ismin "tam ad" puanı: ne kadar uzun ve kısaltma içermiyorsa o kadar yüksek. */
function fullnessScore(name: string): number {
  const trimmed = (name || '').trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  let score = trimmed.length; // genel uzunluk
  for (const p of parts) {
    // "A.", "A", "Ah." gibi parçalar tam ad sayılmaz
    const noDot = p.replace(/\.$/, '');
    if (p.endsWith('.') || noDot.length <= 2) {
      score -= 5;
    } else {
      score += noDot.length;
    }
  }
  // Daha çok parça → genelde daha tam isim
  score += parts.length;
  return score;
}

/** İki kayıttan hangisi daha "tam" isim ise onun adını döner. */
export function pickFullerName(a: string, b: string): string {
  return fullnessScore(a) >= fullnessScore(b) ? a.trim() : b.trim();
}

/** Listede mevcut öğretmenler arasından verilen ada en iyi eşleşeni bulur. */
export function findTeacherFuzzy(teachers: Teacher[], name: string): number {
  if (!name) return -1;
  const target = name.trim();
  // Önce birebir
  const exact = teachers.findIndex((t) => turkishLower(t.name.trim()) === turkishLower(target));
  if (exact >= 0) return exact;
  // Sonra fuzzy
  for (let i = 0; i < teachers.length; i++) {
    if (isSameTeacherName(teachers[i].name, target)) return i;
  }
  return -1;
}

/* ── Birleştirme yardımcıları ── */

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

/**
 * İki öğretmen kaydını tek kayda birleştirir.
 * "primary" id ve dolu alanlar tercih edilir; ad seçimi tam olana göre yapılır.
 */
export function mergeTwoTeachers(primary: Teacher, secondary: Teacher): Teacher {
  const name = pickFullerName(primary.name, secondary.name);
  const schedule = mergeSchedulesPreferFirst(primary.schedule, secondary.schedule);
  const hasSchedule = Object.keys(schedule).length > 0;
  const ua = primary.unavailableDays || [];
  const ub = secondary.unavailableDays || [];
  const unavailableDays =
    ua.length || ub.length ? [...new Set([...ua, ...ub])].sort((x, y) => x - y) : undefined;
  const aa = primary.availableDays || [];
  const ab = secondary.availableDays || [];
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
    ...primary,
    name,
    schedule: hasSchedule ? schedule : undefined,
    email: (primary.email && primary.email.trim()) || (secondary.email && secondary.email.trim()) || undefined,
    dutyType:
      primary.dutyType === 'nobetDisi' || secondary.dutyType === 'nobetDisi'
        ? 'nobetDisi'
        : primary.dutyType === 'hareketli' || secondary.dutyType === 'hareketli'
          ? 'hareketli'
          : primary.dutyType || secondary.dutyType || 'sabit',
    unavailableDays,
    availableDays,
  };
}

/**
 * Öğretmen listesindeki aynı kişiyi temsil eden kayıtları birleştirir.
 * - Birebir eşleşme + fuzzy (kısaltma) eşleşme yapar
 * - Daha tam isim olan kaydın id'si korunur (Öğretmenler sayfasında manuel
 *   girilen tam ad bu sayede otoriter olur)
 * - idRemap: silinen id → korunan id
 */
export function unifyTeachers(list: Teacher[]): {
  teachers: Teacher[];
  idRemap: Record<string, string>;
} {
  const idRemap: Record<string, string> = {};
  const out: Teacher[] = [];

  for (const t of list) {
    const j = out.findIndex((o) => isSameTeacherName(o.name, t.name));
    if (j < 0) {
      out.push({ ...t });
      continue;
    }
    const existing = out[j];
    // Hangisi daha tam isim ise onun id'sini koruyalım.
    const existingFuller = fullnessScore(existing.name) >= fullnessScore(t.name);
    if (existingFuller) {
      idRemap[t.id] = existing.id;
      out[j] = mergeTwoTeachers(existing, t);
    } else {
      idRemap[existing.id] = t.id;
      out[j] = mergeTwoTeachers(t, existing);
    }
  }

  return { teachers: out, idRemap };
}
