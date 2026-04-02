/**
 * Okul Nöbet Programı – Masaüstü Build Pipeline
 *
 * Çalıştırma: npm run build:desktop
 *
 * Adımlar:
 *  1. React frontend'i Vite ile derle  →  dist/
 *  2. Express server'ı esbuild ile CJS'e derle  →  _build_tmp/server.cjs
 *  3. better-sqlite3 native binding'i kopyala
 *  4. @yao-pkg/pkg ile tek .exe oluştur  →  release/OkulNobet.exe
 *  5. dist/ klasörünü release/ yanına kopyala
 *  6. electron-builder ile Electron installer oluştur
 */

import { execSync } from 'child_process';
import {
  cpSync, mkdirSync, rmSync, writeFileSync,
  existsSync, readFileSync, copyFileSync
} from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TMP   = path.join(ROOT, '_build_tmp');
const RELEASE = path.join(ROOT, 'release');

function run(cmd, cwd = ROOT) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit', cwd });
}

function clean(...dirs) {
  for (const d of dirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
}

// ─── 1. Frontend Build ───────────────────────────────────────────────────────
console.log('\n═══ Adım 1: Frontend derleniyor (vite build)…');
run('npm run build');

// ─── 2. Server Bundle ─────────────────────────────────────────────────────────
console.log('\n═══ Adım 2: Server esbuild ile derleniyor…');
clean(TMP);
mkdirSync(TMP, { recursive: true });

run(
  `npx esbuild server.ts ` +
  `--bundle --platform=node --format=cjs --target=node22 ` +
  `--define:process.env.NODE_ENV='"production"' ` +
  `--external:better-sqlite3 --external:lightningcss --external:vite ` +
  `--outfile=${path.join(TMP, 'server.cjs')}`
);

// ─── 3. Giriş noktası: better-sqlite3 native hook ────────────────────────────
console.log('\n═══ Adım 3: pkg giriş noktası (native module hook) oluşturuluyor…');
const entryCode = `
'use strict';
const path   = require('path');
const fs     = require('fs');
const Module = require('module');

if (process.pkg) {
  const _orig = Module._load.bind(Module);
  Module._load = function (request, parent, isMain) {
    if (request && request.endsWith('better_sqlite3.node')) {
      const nodeFile = path.join(path.dirname(process.execPath), 'better_sqlite3.node');
      if (fs.existsSync(nodeFile)) {
        const m = { exports: {} };
        process.dlopen(m, path.toNamespacedPath(nodeFile));
        return m.exports;
      }
    }
    return _orig(request, parent, isMain);
  };
}

require('./server.cjs');
`.trimStart();

writeFileSync(path.join(TMP, 'entry.cjs'), entryCode);
writeFileSync(path.join(TMP, 'package.json'), JSON.stringify({
  name: 'okul-nobet', version: '1.0.0'
}));

// ─── 4. better-sqlite3 native binding ────────────────────────────────────────
console.log('\n═══ Adım 4: better-sqlite3 native binding kopyalanıyor…');
const bindingSrc = path.join(
  ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'
);
if (!existsSync(bindingSrc)) {
  console.error('HATA: better_sqlite3.node bulunamadı. npm rebuild çalıştırın.');
  process.exit(1);
}
copyFileSync(bindingSrc, path.join(TMP, 'better_sqlite3.node'));

// ─── 5. dist/ ve .node dosyasını release/ içine önce kopyala ─────────────────
console.log('\n═══ Adım 5: dist/ ve native binding kopyalanıyor…');
mkdirSync(RELEASE, { recursive: true });
cpSync(path.join(ROOT, 'dist'), path.join(RELEASE, 'dist'), { recursive: true });
copyFileSync(bindingSrc, path.join(RELEASE, 'better_sqlite3.node'));

// ─── 6. pkg ile exe oluştur ───────────────────────────────────────────────────
console.log('\n═══ Adım 6: pkg ile Windows yürütülebilir dosyası oluşturuluyor…');
const exeOut = path.join(RELEASE, 'OkulNobet.exe');

try {
  execSync(
    `npx @yao-pkg/pkg "${path.join(TMP, 'entry.cjs')}" ` +
    `--targets node22-win-x64 --no-bytecode --public ` +
    `--output "${exeOut}"`,
    { stdio: 'inherit', cwd: ROOT }
  );
} catch (e) {
  if (!existsSync(exeOut)) {
    console.error('HATA: OkulNobet.exe oluşturulamadı.', e);
    process.exit(1);
  }
  console.warn('⚠ pkg tamamlandı (uyarıyla çıktı ama exe oluşturuldu).');
}

// ─── 7. Electron-builder ile installer oluştur ──────────────────────────────
console.log('\n═══ Adım 7: Electron-builder ile kurulum paketi oluşturuluyor…');
try {
  run('npx electron-builder --win --config');
  console.log('\n✔ Electron installer oluşturuldu: release/ klasörüne bakın.');
} catch (e) {
  console.error('⚠ electron-builder hatası:', e.message);
  console.log('  release/ klasöründeki OkulNobet.exe doğrudan kullanılabilir.');
}

// ─── Temizlik ─────────────────────────────────────────────────────────────────
clean(TMP);

console.log('\n═══════════════════════════════════════════════════');
console.log('  Build tamamlandı!');
console.log(`  Server EXE: ${exeOut}`);
console.log('  Installer: release/ klasörüne bakın');
console.log('═══════════════════════════════════════════════════\n');
