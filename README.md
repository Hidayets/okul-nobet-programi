# Okul Nöbet Programı

Okullarda nöbet çizelgesi oluşturma, ders programı yönetimi ve devamsız öğretmenlerin derslerini adil dağıtma işlemlerini kolaylaştıran web tabanlı masaüstü uygulaması.

## Özellikler

- **Eğitim-Öğretim Dönemi** — Her yılın verileri birbirinden bağımsız, dönemler arası öğretmen listesi aktarma, header'dan hızlı dönem geçişi
- **Kurum Yönetimi** — Kurum kodu ile kayıt, admin/öğretmen giriş sistemi
- **Öğretmen Yönetimi** — Ekleme, düzenleme, toplu silme, Excel'den aktarma, Sabit/Hareketli/Nöbet Dışı türleri
- **Ders Programı** — Excel'den yükleme veya hücre hücre elle girme, öğretmen ve sınıf programları karşılaştırma
- **Nöbet Çizelgesi Oluşturma** — Dönerli ve merdiven rotasyon modları
- **Günlük İşlemler** — Devamsız öğretmen girişi, boş kalan derslerin nöbetçiler arasında adil otomatik dağılımı
- **Ayarlar** — Okul bilgileri, ders saatleri, tema seçimi (Açık/Koyu/Mavi/Yeşil/Mor), şifre yönetimi, eğitim-öğretim dönemi yönetimi

## Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 6 |
| Backend | Express, Node.js, better-sqlite3 |
| Auth | JWT, bcrypt |
| Masaüstü | Electron (geliştirme), pkg + Inno Setup (dağıtım) |

## Kurulum ve Çalıştırma

### Gereksinimler

- Node.js 20+
- npm

### Geliştirme

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` adresini açın.

### Electron ile Geliştirme

```bash
npm run electron:dev
```

### Masaüstü Kurulum Paketi Oluşturma

```bash
npm run build:desktop
```

Bu komut sırasıyla:
1. React frontend'i Vite ile derler
2. Express sunucuyu esbuild ile tek dosyaya paketler
3. `@yao-pkg/pkg` ile `OkulNobet.exe` oluşturur
4. Inno Setup kuruluysa `OkulNobetKurulum.exe` installer'ı üretir

Çıktılar `release/` klasöründe oluşur.

## Proje Yapısı

```
├── src/                  # React frontend
│   ├── components/       # Sayfa bileşenleri
│   ├── types.ts          # TypeScript tip tanımları
│   ├── ThemeContext.tsx   # Tema yönetimi
│   └── main.tsx          # Uygulama giriş noktası
├── server.ts             # Express API sunucusu
├── electron/             # Electron ana süreç
├── installer/            # Inno Setup betikleri
├── scripts/              # Build pipeline
├── build/                # Uygulama ikonu
└── index.html            # HTML giriş noktası
```

## Lisans
