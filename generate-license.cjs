#!/usr/bin/env node
/**
 * Lisans Anahtarı Üretim Aracı
 * =============================
 * Kullanım:
 *   node generate-license.cjs <kurumKodu>
 *   node generate-license.cjs 123456
 *   node generate-license.cjs 750012
 *
 * Birden fazla kurum kodu için:
 *   node generate-license.cjs 123456 750012 890001
 *
 * ÖNEMLİ: Aşağıdaki LICENSE_SECRET değeri, server.ts dosyasındaki
 * değerle BİREBİR AYNI olmalıdır. Değiştirdiyseniz burada da değiştirin.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// .env dosyasını cwd'den ya da bu script'in bulunduğu klasörden yükle (varsa).
try {
  const dotenv = require('dotenv');
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: false });
    }
  }
} catch {
  // dotenv paketi bulunamazsa sessizce devam et — fallback değer kullanılır.
}

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'okul-nobet-2025-BURAYA-KENDI-GIZLI-ANAHTARINIZI-YAZIN';

if (!process.env.LICENSE_SECRET) {
  console.warn('  UYARI: LICENSE_SECRET ayarlı değil, varsayılan değer kullanılıyor.');
  console.warn('         server.ts ile aynı .env dosyasını kullandığınızdan emin olun.');
  console.warn('');
}

function generateLicenseKey(kurumKodu) {
  const clean = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(clean);
  const hex = hmac.digest('hex').substring(0, 16).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('');
  console.log('  Lisans Anahtari Uretim Araci');
  console.log('  ============================');
  console.log('');
  console.log('  Kullanim:');
  console.log('    node generate-license.cjs <kurumKodu> [kurumKodu2] ...');
  console.log('');
  console.log('  Ornek:');
  console.log('    node generate-license.cjs 123456');
  console.log('    node generate-license.cjs 750012 890001');
  console.log('');
  process.exit(0);
}

console.log('');
console.log('  Kurum Kodu          Lisans Anahtari');
console.log('  ─────────────────   ───────────────────');

for (const raw of args) {
  const clean = raw.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const key = generateLicenseKey(clean);
  console.log(`  ${clean.padEnd(20)}${key}`);
}

console.log('');
