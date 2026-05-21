/**
 * Lisans bitiş tarihi `YYYY-MM-DD` (HTML date) veya ISO string.
 * Bitiş gününün yerel saatte son anı (23:59:59.999) kullanılır — UTC kayması olmaz.
 */
export function licenseEndOfDayMs(expiresAt: string | undefined | null): number | null {
  if (!expiresAt) return null;
  const datePart = expiresAt.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    return new Date(y, mo, d, 23, 59, 59, 999).getTime();
  }
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) ? null : t;
}

export function getLicenseDaysRemaining(expiresAt?: string | null): number | null {
  const end = licenseEndOfDayMs(expiresAt || undefined);
  if (end === null) return null;
  const ms = end - Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Pozitif tarafta yukarı yuvarla (aynı gün içinde "1 gün kaldı"),
  // negatif tarafta aşağı yuvarla. Aksi halde Math.ceil(-0.001) = -0
  // sonuç verir ve süresi yeni dolmuş lisans 24 saat boyunca "0 gün"
  // olarak gösterilir (bug).
  return ms >= 0 ? Math.ceil(ms / dayMs) : Math.floor(ms / dayMs);
}

export function formatLicenseDateLongTr(dateStr: string): string {
  try {
    const end = licenseEndOfDayMs(dateStr);
    if (end === null) return dateStr;
    return new Date(end).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
