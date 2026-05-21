import express from 'express';
import path from 'path';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { config as loadDotenv } from 'dotenv';

// CJS (pkg/esbuild) ve ESM (tsx dev) ortamlarında güvenle çalışır
const __dirname = process.cwd();

// .env dosyasını hem cwd'den hem de exe'nin bulunduğu klasörden yüklemeyi dene.
// Bu sayede pkg ile paketlendiğinde de exe'nin yanına bir .env konulabilir.
(() => {
  const candidates: string[] = [];
  candidates.push(path.join(process.cwd(), '.env'));
  try {
    const execDir = path.dirname((process as any).execPath || '');
    if (execDir) candidates.push(path.join(execDir, '.env'));
  } catch {}
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        loadDotenv({ path: p, override: false });
      }
    } catch {}
  }
})();

// Üretimde varsayılan sırlar kullanılıyorsa görünür şekilde uyar.
if (!process.env.LICENSE_SECRET) {
  console.warn('[license] LICENSE_SECRET çevresel değişkeni bulunamadı, varsayılan değer kullanılıyor. Üretimde mutlaka .env dosyasında ayarlayın.');
}
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET çevresel değişkeni bulunamadı, varsayılan değer kullanılıyor. Üretimde mutlaka .env dosyasında ayarlayın.');
}

// Sürüm bilgisi: package.json'dan oku, başarısızsa fallback
let APP_VERSION = '0.0.0';
try {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  APP_VERSION = pkg.version || APP_VERSION;
} catch {
  // pkg ile paketlendiğinde package.json okunamayabilir
  try {
    const pkgPath = path.join(path.dirname((process as any).execPath || ''), 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    APP_VERSION = pkg.version || APP_VERSION;
  } catch {}
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-local-dev';

// ---- Lisans Sistemi ----
// Bu değeri kendinize özel bir şeyle değiştirin ve kimseyle paylaşmayın.
// generate-license.cjs dosyasındaki değerle aynı olmalıdır.
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'okul-nobet-2025-BURAYA-KENDI-GIZLI-ANAHTARINIZI-YAZIN';

// Özel giriş anahtarı - Login.tsx ile aynı olmalı
const SUPER_ADMIN_KEY = '342665';

function generateLicenseKey(kurumKodu: string): string {
  const hmac = crypto.createHmac('sha256', LICENSE_SECRET);
  hmac.update(kurumKodu);
  const hex = hmac.digest('hex').substring(0, 16).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

function validateLicenseKey(kurumKodu: string, key: string): boolean {
  const cleanKey = key.trim().replace(/-/g, '').toUpperCase();
  const expected = generateLicenseKey(kurumKodu).replace(/-/g, '');
  // Eşit uzunlukta zaman-sabit karşılaştırma
  if (cleanKey.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cleanKey), Buffer.from(expected));
  } catch {
    return false;
  }
}

function parseSchoolCodeFromYol(yol?: string): string | null {
  if (!yol) return null;
  const parts = String(yol).split('/');
  const last = parts[parts.length - 1]?.trim();
  if (!last) return null;
  const clean = last.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return clean || null;
}

async function fetchSchoolFromGithubByKurumKodu(kurumKodu: string): Promise<{
  kurumKodu: string;
  okulAdi: string;
  il?: string;
  ilce?: string;
  kaynak: string;
} | null> {
  try {
    const q = encodeURIComponent(`${kurumKodu} repo:MehmetHuseyinDelipalta/MEB-Okul-Veritabani path:"Tüm Okullar" extension:json`);
    const searchRes = await fetch(`https://api.github.com/search/code?q=${q}&per_page=5`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'okul-nobet-programi',
      },
    });
    if (!searchRes.ok) return null;
    const searchData: any = await searchRes.json();
    const items: any[] = Array.isArray(searchData?.items) ? searchData.items : [];
    if (items.length === 0) return null;

    for (const item of items) {
      if (!item?.url) continue;
      const metaRes = await fetch(item.url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'okul-nobet-programi',
        },
      });
      if (!metaRes.ok) continue;
      const meta: any = await metaRes.json();
      const downloadUrl = meta?.download_url;
      if (!downloadUrl) continue;

      const fileRes = await fetch(downloadUrl, { headers: { 'User-Agent': 'okul-nobet-programi' } });
      if (!fileRes.ok) continue;
      const schools: any = await fileRes.json();
      if (!Array.isArray(schools)) continue;

      const found = schools.find((s) => {
        const code = parseSchoolCodeFromYol(s?.YOL);
        return code === kurumKodu;
      });
      if (found) {
        return {
          kurumKodu,
          okulAdi: String(found.OKUL_ADI || '').trim(),
          il: typeof found.IL === 'string' ? found.IL : undefined,
          ilce: typeof found.ILCE === 'string' ? found.ILCE : undefined,
          kaynak: 'github:MehmetHuseyinDelipalta/MEB-Okul-Veritabani',
        };
      }
    }
  } catch (err) {
    console.warn('[school-lookup] GitHub sorgusunda hata:', err);
  }
  return null;
}

function buildMebSchoolPayload(start: number, length: number, search = ''): URLSearchParams {
  const payload: Record<string, string> = {
    draw: '1',
    'columns[0][data]': 'OKUL_ADI',
    'columns[0][name]': '',
    'columns[0][searchable]': 'true',
    'columns[0][orderable]': 'true',
    'columns[0][search][value]': '',
    'columns[0][search][regex]': 'false',
    'columns[1][data]': 'OKUL_ADI',
    'columns[1][name]': '',
    'columns[1][searchable]': 'true',
    'columns[1][orderable]': 'true',
    'columns[1][search][value]': '',
    'columns[1][search][regex]': 'false',
    'columns[2][data]': 'OKUL_ADI',
    'columns[2][name]': '',
    'columns[2][searchable]': 'true',
    'columns[2][orderable]': 'true',
    'columns[2][search][value]': '',
    'columns[2][search][regex]': 'false',
    'order[0][column]': '0',
    'order[0][dir]': 'asc',
    'order[0][name]': '',
    start: String(start),
    length: String(length),
    'search[value]': search,
    'search[regex]': 'false',
    il: '',
    ilce: '',
  };
  return new URLSearchParams(payload);
}

type MebSchoolRow = { OKUL_ADI?: string; YOL?: string };
type SchoolLookupResult = { kurumKodu: string; okulAdi: string; il?: string; ilce?: string; kaynak: string };

function mapMebRowToSchool(row: MebSchoolRow, kurumKodu: string, kaynak: string): SchoolLookupResult | null {
  const code = parseSchoolCodeFromYol(row?.YOL);
  if (!code || code !== kurumKodu) return null;
  const raw = String(row?.OKUL_ADI || '').trim();
  if (!raw) return null;
  const parts = raw.split(' - ').map((s) => s.trim()).filter(Boolean);
  const il = parts.length >= 1 ? parts[0] : undefined;
  const ilce = parts.length >= 2 ? parts[1] : undefined;
  const okulAdi = parts.length >= 3 ? parts.slice(2).join(' - ') : raw;
  return { kurumKodu, okulAdi, il, ilce, kaynak };
}

let mebSchoolIndex: Map<string, SchoolLookupResult> | null = null;
let mebSchoolIndexUpdatedAt = 0;
let mebSchoolIndexPromise: Promise<void> | null = null;

async function fetchSchoolFromMebQuick(kurumKodu: string): Promise<SchoolLookupResult | null> {
  try {
    const res = await fetch('https://www.meb.gov.tr/baglantilar/okullar/okullar_ajax.php', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
        origin: 'https://www.meb.gov.tr',
        referer: 'https://www.meb.gov.tr/baglantilar/okullar/index.php',
        'user-agent': 'okul-nobet-programi',
      },
      body: buildMebSchoolPayload(0, 200, kurumKodu).toString(),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const data: any = JSON.parse(text);
    const rows: MebSchoolRow[] = Array.isArray(data?.data) ? data.data : [];
    for (const row of rows) {
      const mapped = mapMebRowToSchool(row, kurumKodu, 'meb-quick-search');
      if (mapped) return mapped;
    }
  } catch (err) {
    console.warn('[school-lookup] MEB hızlı arama hatası:', err);
  }
  return null;
}

async function ensureMebSchoolIndex(): Promise<void> {
  const maxAgeMs = 24 * 60 * 60 * 1000;
  if (mebSchoolIndex && Date.now() - mebSchoolIndexUpdatedAt < maxAgeMs) return;
  if (mebSchoolIndexPromise) return mebSchoolIndexPromise;
  mebSchoolIndexPromise = (async () => {
    const next = new Map<string, SchoolLookupResult>();
    const pageSize = 10000;
    let start = 0;
    let total = 0;
    for (;;) {
      const res = await fetch('https://www.meb.gov.tr/baglantilar/okullar/okullar_ajax.php', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest',
          accept: 'application/json, text/javascript, */*; q=0.01',
          origin: 'https://www.meb.gov.tr',
          referer: 'https://www.meb.gov.tr/baglantilar/okullar/index.php',
          'user-agent': 'okul-nobet-programi',
        },
        body: buildMebSchoolPayload(start, pageSize, '').toString(),
      });
      if (!res.ok) break;
      const text = await res.text();
      const data: any = JSON.parse(text);
      const rows: MebSchoolRow[] = Array.isArray(data?.data) ? data.data : [];
      total = Number(data?.recordsTotal || 0);
      for (const row of rows) {
        const code = parseSchoolCodeFromYol(row?.YOL);
        if (!code) continue;
        const mapped = mapMebRowToSchool(row, code, 'meb-full-index');
        if (mapped) next.set(code, mapped);
      }
      start += rows.length;
      if (!rows.length || (total > 0 && start >= total)) break;
    }
    if (next.size > 0) {
      mebSchoolIndex = next;
      mebSchoolIndexUpdatedAt = Date.now();
    }
  })().finally(() => {
    mebSchoolIndexPromise = null;
  });
  return mebSchoolIndexPromise;
}

/** Lisans bitişi: YYYY-MM-DD ise o günün yerel gün sonu (bitiş günü dahil). */
function licenseEndOfDayMs(expiresAt: string): number | null {
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

// Lisans tablosundan kayıt durumunu kontrol eder.
// Dönüş: { ok: boolean, reason?: 'not-found' | 'inactive' | 'expired', license?: any }
function checkLicenseRecord(kurumKodu: string): {
  ok: boolean;
  reason?: 'not-found' | 'inactive' | 'expired';
  license?: any;
} {
  const license: any = db.prepare('SELECT * FROM licenses WHERE kurumKodu = ?').get(kurumKodu);
  if (!license) return { ok: false, reason: 'not-found' };
  if (!license.isActive) return { ok: false, reason: 'inactive', license };
  if (license.expiresAt) {
    const endMs = licenseEndOfDayMs(license.expiresAt);
    if (endMs !== null && Date.now() > endMs) {
      return { ok: false, reason: 'expired', license };
    }
  }
  return { ok: true, license };
}

// İstemciye gönderilecek özet lisans bilgisi (gizli alanlar hariç)
function getLicenseSummary(kurumKodu: string): {
  okulAdi: string | null;
  expiresAt: string | null;
  isActive: boolean;
  daysRemaining: number | null;
} | null {
  const row: any = db.prepare('SELECT okulAdi, expiresAt, isActive FROM licenses WHERE kurumKodu = ?').get(kurumKodu);
  if (!row) return null;
  let daysRemaining: number | null = null;
  if (row.expiresAt) {
    const endMs = licenseEndOfDayMs(row.expiresAt);
    if (endMs !== null) {
      const ms = endMs - Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      // Pozitif tarafta yukarı yuvarla, negatif tarafta aşağı yuvarla.
      // Aksi halde -0 → 0 olur ve süresi yeni dolmuş lisans hâlâ
      // "0 gün kaldı" olarak görünür.
      daysRemaining = ms >= 0 ? Math.ceil(ms / dayMs) : Math.floor(ms / dayMs);
    }
  }
  return {
    okulAdi: row.okulAdi || null,
    expiresAt: row.expiresAt || null,
    isActive: !!row.isActive,
    daysRemaining,
  };
}

// pkg ile paketlendiğinde process.pkg tanımlıdır
const isPkg = !!(process as any).pkg;

// Uygulama dizini: pkg'da exe'nin yanı, geliştirmede cwd
const APP_DIR = isPkg ? path.dirname(process.execPath) : process.cwd();

// Veritabanı: pkg'da AppData\Local\OkulNobetProgrami, geliştirmede cwd
const DB_DIR = isPkg
  ? path.join(homedir(), 'AppData', 'Local', 'OkulNobetProgrami')
  : process.cwd();
mkdirSync(DB_DIR, { recursive: true });

// Initialize SQLite Database
const db = new Database(path.join(DB_DIR, 'database.sqlite'));

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    kurumKodu TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    kurumKodu TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (collection, id, kurumKodu)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    kurumKodu TEXT UNIQUE NOT NULL,
    okulAdi TEXT NOT NULL,
    licenseKey TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT,
    isActive INTEGER DEFAULT 1,
    lastLoginAt TEXT
  );
`);

// Migration: scope existing unscoped collections by academic year
const academicYearMigration = db.prepare("SELECT value FROM meta WHERE key = 'academic_year_migration_v1'").get();
if (!academicYearMigration) {
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const currentAcademicYear = month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  const collectionsToMigrate = ['teachers', 'classes', 'locations', 'assignments', 'absences', 'substitutions'];

  db.transaction(() => {
    for (const col of collectionsToMigrate) {
      const rows = db.prepare('SELECT * FROM documents WHERE collection = ?').all(col) as any[];
      if (rows.length === 0) continue;

      const scopedCol = `${col}__${currentAcademicYear}`;
      for (const row of rows) {
        db.prepare('INSERT OR IGNORE INTO documents (collection, id, kurumKodu, data) VALUES (?, ?, ?, ?)').run(
          scopedCol, row.id, row.kurumKodu, row.data
        );
      }
      db.prepare('DELETE FROM documents WHERE collection = ?').run(col);
    }

    const schoolInfoRows = db.prepare("SELECT * FROM documents WHERE collection = 'schoolInfo' AND id = 'info'").all() as any[];
    for (const row of schoolInfoRows) {
      const data = JSON.parse(row.data);
      data.academicYears = [...new Set([...(data.academicYears || []), currentAcademicYear])].sort();
      db.prepare("UPDATE documents SET data = ? WHERE collection = 'schoolInfo' AND id = 'info' AND kurumKodu = ?").run(
        JSON.stringify(data), row.kurumKodu
      );
    }

    db.prepare("INSERT INTO meta (key, value) VALUES ('academic_year_migration_v1', ?)").run(new Date().toISOString());
  })();

  console.log(`Migration: scoped collections to academic year ${currentAcademicYear}`);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- API Routes ---

  // Middleware to verify JWT
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    });
  };

  // Middleware: aktif/geçerli lisans gerektir.
  // - superadmin için her zaman izinli.
  // - DB'de hiç lisans kaydı olmayan eski kullanıcılar (geriye uyumluluk) izinli.
  // - inactive / expired kullanıcılar 403 + licenseStatus alanı ile reddedilir.
  // İstemci `licenseStatus` alanını görünce oturumu kapatıp uyarı gösterir.
  const requireActiveLicense = (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'superadmin') return next();
    const lic = checkLicenseRecord(req.user.kurumKodu);
    if (lic.ok || lic.reason === 'not-found') return next();
    const msg =
      lic.reason === 'inactive'
        ? 'Lisansınız pasif duruma alınmış. Lütfen yöneticiyle iletişime geçin.'
        : 'Lisansınızın süresi dolmuş. Lütfen yöneticiyle iletişime geçin.';
    return res.status(403).json({ error: msg, licenseStatus: lic.reason });
  };

  // Auth: Register
  app.post('/api/auth/register', (req, res) => {
    const { kurumKodu, adminPassword, teacherPassword, licenseKey } = req.body;

    if (!kurumKodu || !adminPassword || !teacherPassword || !licenseKey) {
      return res.status(400).json({ error: 'Lütfen tüm alanları doldurun (lisans anahtarı dahil).' });
    }

    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (!validateLicenseKey(cleanKurumKodu, licenseKey)) {
      return res.status(400).json({ error: 'Geçersiz lisans anahtarı. Lütfen size verilen anahtarı doğru girdiğinizden emin olun.' });
    }

    // Lisans anahtarı doğrulandıktan sonra lisans durumunu kontrol et.
    // not-found ise (okulun kendi lokal DB'sinde ilk kurulum), kaydı otomatik oluşturacağız.
    const lic = checkLicenseRecord(cleanKurumKodu);
    if (!lic.ok && lic.reason !== 'not-found') {
      const msg =
        lic.reason === 'inactive' ? 'Bu kurum kodu için lisans pasif durumda. Lütfen yöneticiyle iletişime geçin.' :
        'Bu kurum kodu için lisansın süresi dolmuş. Lütfen yöneticiyle iletişime geçin.';
      return res.status(403).json({ error: msg });
    }

    const adminEmail = `admin@${cleanKurumKodu}.nobet.app`;
    const teacherEmail = `teacher@${cleanKurumKodu}.nobet.app`;

    try {
      // Check if school already exists
      const existingUser = db.prepare('SELECT id FROM users WHERE kurumKodu = ?').get(cleanKurumKodu);
      if (existingUser) {
        return res.status(400).json({ error: 'Bu kurum kodu ile zaten bir kayıt oluşturulmuş.' });
      }

      const adminHash = bcrypt.hashSync(adminPassword, 10);
      const teacherHash = bcrypt.hashSync(teacherPassword, 10);

      const insertUser = db.prepare('INSERT INTO users (id, kurumKodu, role, email, passwordHash) VALUES (?, ?, ?, ?, ?)');
      
      const adminId = uuidv4();
      const teacherId = uuidv4();

      db.transaction(() => {
        // Okulun lokal veritabanında lisans kaydı yoksa, doğrulanan anahtarla ilk kaydı oluştur.
        if (lic.reason === 'not-found') {
          db.prepare(`
            INSERT INTO licenses (id, kurumKodu, okulAdi, licenseKey, createdAt, expiresAt, isActive)
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `).run(
            uuidv4(),
            cleanKurumKodu,
            `Kurum ${cleanKurumKodu}`,
            generateLicenseKey(cleanKurumKodu),
            new Date().toISOString(),
            null
          );
        }

        insertUser.run(adminId, cleanKurumKodu, 'admin', adminEmail, adminHash);
        insertUser.run(teacherId, cleanKurumKodu, 'teacher', teacherEmail, teacherHash);

        // Initialize School Info
        const insertDoc = db.prepare('INSERT INTO documents (collection, id, kurumKodu, data) VALUES (?, ?, ?, ?)');
        const m = new Date().getMonth() + 1;
        const y = new Date().getFullYear();
        const initYear = m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
        insertDoc.run('schoolInfo', 'info', cleanKurumKodu, JSON.stringify({
          valilik: '',
          kaymakamlik: '',
          okulAdi: '',
          okulMuduru: '',
          mudurYardimcilari: [],
          academicYears: [initYear],
          updatedAt: new Date().toISOString()
        }));
      })();

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: 'Kayıt oluşturulurken bir hata meydana geldi.' });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', (req, res) => {
    const { kurumKodu, role, password } = req.body;

    if (!kurumKodu || !role || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const email = `${role}@${cleanKurumKodu}.nobet.app`;

    try {
      const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(401).json({ error: 'Hatalı kurum kodu, kullanıcı adı veya şifre.' });
      }

      const validPassword = bcrypt.compareSync(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Hatalı kurum kodu, kullanıcı adı veya şifre.' });
      }

      // Lisans kontrolü: kayıt sırasında lisans olabilir ama daha sonra pasif edilmiş veya süresi geçmiş olabilir.
      // Eski kullanıcılar için lisans kaydı yoksa engellemiyoruz (geriye dönük uyumluluk).
      const lic = checkLicenseRecord(user.kurumKodu);
      if (!lic.ok && lic.reason !== 'not-found') {
        const msg =
          lic.reason === 'inactive' ? 'Lisansınız pasif durumda. Lütfen yöneticiyle iletişime geçin.' :
          'Lisansınızın süresi dolmuş. Lütfen yöneticiyle iletişime geçin.';
        return res.status(403).json({ error: msg });
      }

      const token = jwt.sign({ id: user.id, kurumKodu: user.kurumKodu, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

      // Lisans tablosunda lastLoginAt güncelle
      db.prepare('UPDATE licenses SET lastLoginAt = ? WHERE kurumKodu = ?').run(new Date().toISOString(), user.kurumKodu);

      res.json({
        token,
        user: {
          uid: user.id,
          kurumKodu: user.kurumKodu,
          role: user.role
        },
        license: getLicenseSummary(user.kurumKodu),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Giriş yapılırken bir hata oluştu.' });
    }
  });

  // Auth: Özel Giriş
  app.post('/api/auth/superadmin-login', (req, res) => {
    const { masterKey } = req.body;

    if (masterKey !== SUPER_ADMIN_KEY) {
      return res.status(401).json({ error: 'Geçersiz anahtar.' });
    }

    const token = jwt.sign({ 
      id: 'superadmin', 
      kurumKodu: '__superadmin__', 
      role: 'superadmin' 
    }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        uid: 'superadmin',
        kurumKodu: '__superadmin__',
        role: 'superadmin'
      }
    });
  });

  // Licenses: Get all
  app.get('/api/licenses', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    try {
      const licenses = db.prepare('SELECT * FROM licenses ORDER BY createdAt DESC').all();
      res.json(licenses);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lisanslar yüklenirken hata oluştu.' });
    }
  });

  // Licenses: Create new
  app.post('/api/licenses', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const { kurumKodu, okulAdi, expiresAt } = req.body;

    if (!kurumKodu || !okulAdi) {
      return res.status(400).json({ error: 'Kurum kodu ve okul adı gerekli.' });
    }

    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const licenseKey = generateLicenseKey(cleanKurumKodu);

    try {
      // Zaten var mı kontrol et
      const existing = db.prepare('SELECT id FROM licenses WHERE kurumKodu = ?').get(cleanKurumKodu);
      if (existing) {
        return res.status(400).json({ error: 'Bu kurum kodu için zaten lisans mevcut.' });
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO licenses (id, kurumKodu, okulAdi, licenseKey, createdAt, expiresAt, isActive)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `).run(id, cleanKurumKodu, okulAdi.trim(), licenseKey, new Date().toISOString(), expiresAt || null);

      res.json({ 
        id, 
        kurumKodu: cleanKurumKodu, 
        okulAdi: okulAdi.trim(), 
        licenseKey,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || null,
        isActive: 1
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lisans oluşturulurken hata oluştu.' });
    }
  });

  // Licenses: Delete
  app.delete('/api/licenses/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    try {
      db.prepare('DELETE FROM licenses WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lisans silinirken hata oluştu.' });
    }
  });

  // Licenses: Bitiş tarihi uzatma / okul adı düzeltme (süper yönetici)
  app.patch('/api/licenses/:id', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const { expiresAt, okulAdi } = req.body as { expiresAt?: string | null; okulAdi?: string };

    try {
      const license: any = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
      if (!license) {
        return res.status(404).json({ error: 'Lisans bulunamadı.' });
      }

      let nextExpires: string | null = license.expiresAt ?? null;
      if (Object.prototype.hasOwnProperty.call(req.body, 'expiresAt')) {
        if (expiresAt === null || expiresAt === undefined || String(expiresAt).trim() === '') {
          nextExpires = null;
        } else {
          nextExpires = String(expiresAt).trim();
        }
      }

      let nextOkul = license.okulAdi;
      if (typeof okulAdi === 'string' && okulAdi.trim()) {
        nextOkul = okulAdi.trim();
      }

      db.prepare('UPDATE licenses SET expiresAt = ?, okulAdi = ? WHERE id = ?').run(
        nextExpires,
        nextOkul,
        req.params.id,
      );
      const updated: any = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lisans güncellenirken hata oluştu.' });
    }
  });

  // Licenses: Toggle active
  app.patch('/api/licenses/:id/toggle', authenticateToken, (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    try {
      const license: any = db.prepare('SELECT * FROM licenses WHERE id = ?').get(req.params.id);
      if (!license) {
        return res.status(404).json({ error: 'Lisans bulunamadı.' });
      }

      const newStatus = license.isActive ? 0 : 1;
      db.prepare('UPDATE licenses SET isActive = ? WHERE id = ?').run(newStatus, req.params.id);
      res.json({ ...license, isActive: newStatus });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Lisans güncellenirken hata oluştu.' });
    }
  });

  // Auth: Reset Admin Password (forgot password)
  app.post('/api/auth/reset-password', (req, res) => {
    const { kurumKodu, newPassword } = req.body;

    if (!kurumKodu || !newPassword) {
      return res.status(400).json({ error: 'Eksik alanlar.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const email = `admin@${cleanKurumKodu}.nobet.app`;

    try {
      const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(404).json({ error: 'Bu kurum koduna ait kayıt bulunamadı.' });
      }

      const newHash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET passwordHash = ? WHERE email = ?').run(newHash, email);

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Şifre sıfırlanırken bir hata oluştu.' });
    }
  });

  // Auth: Change Password
  app.post('/api/auth/change-password', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { targetRole, currentPassword, newPassword } = req.body;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Yalnızca admin şifre değiştirebilir.' });
    }
    if (!targetRole || !newPassword) {
      return res.status(400).json({ error: 'Eksik alanlar.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    const { kurumKodu } = req.user;
    const email = `${targetRole}@${kurumKodu}.nobet.app`;

    try {
      const user: any = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
      }

      if (targetRole === 'admin' && currentPassword) {
        const valid = bcrypt.compareSync(currentPassword, user.passwordHash);
        if (!valid) {
          return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
        }
      }

      const newHash = bcrypt.hashSync(newPassword, 10);
      db.prepare('UPDATE users SET passwordHash = ? WHERE email = ?').run(newHash, email);

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Şifre değiştirilirken bir hata oluştu.' });
    }
  });

  // Auth: Me
  app.get('/api/auth/me', authenticateToken, (req: any, res) => {
    const isSuper = req.user.role === 'superadmin';
    res.json({
      user: {
        uid: req.user.id,
        kurumKodu: req.user.kurumKodu,
        role: req.user.role
      },
      license: isSuper ? null : getLicenseSummary(req.user.kurumKodu),
    });
  });

  // Public: Sürüm bilgisi (server-client uyum kontrolü için)
  app.get('/api/version', (_req, res) => {
    res.json({
      version: APP_VERSION,
      name: 'okul-nobet-programi',
      timestamp: new Date().toISOString(),
    });
  });

  // Lisans: Bir kurum kodu için aktif lisans kontrolü (kayıt formunda canlı geri bildirim için)
  app.get('/api/licenses/check/:kurumKodu', (req, res) => {
    const cleanKurumKodu = req.params.kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!cleanKurumKodu) return res.json({ exists: false });
    const lic = checkLicenseRecord(cleanKurumKodu);
    res.json({
      exists: !!lic.license,
      ok: lic.ok,
      reason: lic.reason || null,
      okulAdi: lic.license?.okulAdi || null,
      expiresAt: lic.license?.expiresAt || null,
    });
  });

  // Kurum kodundan okul bilgisi getir (superadmin lisans üretimi için).
  app.get('/api/schools/lookup/:kurumKodu', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }
    const kurumKodu = req.params.kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!kurumKodu) return res.status(400).json({ error: 'Geçersiz kurum kodu.' });

    // Öncelik: daha önce lisanslanan okul adını dön.
    const existing: any = db.prepare('SELECT kurumKodu, okulAdi FROM licenses WHERE kurumKodu = ?').get(kurumKodu);
    if (existing?.okulAdi) {
      return res.json({
        found: true,
        kurumKodu,
        okulAdi: existing.okulAdi,
        kaynak: 'local-license-db',
      });
    }

    const schoolQuick = await fetchSchoolFromMebQuick(kurumKodu);
    if (schoolQuick?.okulAdi) {
      return res.json({ found: true, ...schoolQuick });
    }

    try {
      await ensureMebSchoolIndex();
      const indexed = mebSchoolIndex?.get(kurumKodu);
      if (indexed?.okulAdi) {
        return res.json({ found: true, ...indexed });
      }
    } catch (err) {
      console.warn('[school-lookup] MEB tam indeks hatası:', err);
    }

    const school = await fetchSchoolFromGithubByKurumKodu(kurumKodu);
    if (!school || !school.okulAdi) {
      return res.status(404).json({
        found: false,
        error: 'Bu kurum kodu için okul bilgisi bulunamadı.',
      });
    }

    return res.json({
      found: true,
      ...school,
    });
  });

  // CRUD: Get Collection
  app.get('/api/data/:collection', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { collection } = req.params;
    const { kurumKodu } = req.user;

    try {
      const rows = db.prepare('SELECT id, data FROM documents WHERE collection = ? AND kurumKodu = ?').all(collection, kurumKodu);
      const items = rows.map((row: any) => ({
        id: row.id,
        ...JSON.parse(row.data)
      }));
      res.json(items);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
  });

  // CRUD: Create Document
  app.post('/api/data/:collection', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { collection } = req.params;
    const { kurumKodu } = req.user;
    const data = req.body;
    
    // Use provided id or generate one
    const id = data.id || uuidv4();
    if (!data.id) data.id = id;

    try {
      db.prepare('INSERT INTO documents (collection, id, kurumKodu, data) VALUES (?, ?, ?, ?)').run(
        collection, id, kurumKodu, JSON.stringify(data)
      );
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  // CRUD: Update Document
  app.put('/api/data/:collection/:id', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { collection, id } = req.params;
    const { kurumKodu } = req.user;
    const data = req.body;

    try {
      const result = db.prepare('UPDATE documents SET data = ? WHERE collection = ? AND id = ? AND kurumKodu = ?').run(
        JSON.stringify(data), collection, id, kurumKodu
      );
      
      if (result.changes === 0) {
        // If it doesn't exist, insert it (upsert behavior)
        db.prepare('INSERT INTO documents (collection, id, kurumKodu, data) VALUES (?, ?, ?, ?)').run(
          collection, id, kurumKodu, JSON.stringify(data)
        );
      }
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // CRUD: Delete Document
  app.delete('/api/data/:collection/:id', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { collection, id } = req.params;
    const { kurumKodu } = req.user;

    try {
      db.prepare('DELETE FROM documents WHERE collection = ? AND id = ? AND kurumKodu = ?').run(
        collection, id, kurumKodu
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // CRUD: Get Single Document
  app.get('/api/doc/:collection/:id', authenticateToken, requireActiveLicense, (req: any, res) => {
    const { collection, id } = req.params;
    const { kurumKodu } = req.user;

    try {
      const row: any = db.prepare('SELECT data FROM documents WHERE collection = ? AND id = ? AND kurumKodu = ?').get(
        collection, id, kurumKodu
      );
      
      if (row) {
        res.json(JSON.parse(row.data));
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Email: Send notifications to teachers
  app.post('/api/send-email', authenticateToken, requireActiveLicense, async (req: any, res) => {
    const { kurumKodu } = req.user;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Yalnızca admin e-posta gönderebilir.' });
    }

    const { gmailEmail, gmailAppPassword, recipients } = req.body;

    if (!gmailEmail || !gmailAppPassword) {
      return res.status(400).json({ error: 'Gmail ayarları eksik. Ayarlar sayfasından Gmail adresinizi ve uygulama şifrenizi girin.' });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Gönderilecek öğretmen listesi boş.' });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailEmail,
          pass: gmailAppPassword.replace(/\s/g, ''),
        },
      });

      await transporter.verify();

      const results: { email: string; success: boolean; error?: string }[] = [];

      for (const recipient of recipients) {
        if (!recipient.email) {
          results.push({ email: '(yok)', success: false, error: 'E-posta adresi eksik' });
          continue;
        }

        try {
          await transporter.sendMail({
            from: `"Nöbet Programı" <${gmailEmail}>`,
            to: recipient.email,
            subject: recipient.subject || 'Nöbet Görev Bilgilendirmesi',
            html: recipient.html || recipient.text || '',
          });
          results.push({ email: recipient.email, success: true });
        } catch (err: any) {
          results.push({ email: recipient.email, success: false, error: err.message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        sent: successCount,
        failed: failCount,
        details: results,
      });
    } catch (err: any) {
      console.error('Email error:', err);
      if (err.code === 'EAUTH') {
        return res.status(401).json({ error: 'Gmail kimlik doğrulama hatası. E-posta adresinizi ve uygulama şifrenizi kontrol edin.' });
      }
      res.status(500).json({ error: `E-posta gönderilirken hata oluştu: ${err.message}` });
    }
  });

  // Vite middleware for development (sadece geliştirme modunda dinamik import)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(APP_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
