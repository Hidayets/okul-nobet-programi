import express from 'express';
import path from 'path';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

// CJS (pkg/esbuild) ve ESM (tsx dev) ortamlarında güvenle çalışır
const __dirname = process.cwd();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-local-dev';

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
`);

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

  // Auth: Register
  app.post('/api/auth/register', (req, res) => {
    const { kurumKodu, adminPassword, teacherPassword } = req.body;

    if (!kurumKodu || !adminPassword || !teacherPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
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
        insertUser.run(adminId, cleanKurumKodu, 'admin', adminEmail, adminHash);
        insertUser.run(teacherId, cleanKurumKodu, 'teacher', teacherEmail, teacherHash);

        // Initialize School Info
        const insertDoc = db.prepare('INSERT INTO documents (collection, id, kurumKodu, data) VALUES (?, ?, ?, ?)');
        insertDoc.run('schoolInfo', 'info', cleanKurumKodu, JSON.stringify({
          valilik: '',
          kaymakamlik: '',
          okulAdi: '',
          okulMuduru: '',
          mudurYardimcilari: [],
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

      const token = jwt.sign({ id: user.id, kurumKodu: user.kurumKodu, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      
      res.json({
        token,
        user: {
          uid: user.id,
          kurumKodu: user.kurumKodu,
          role: user.role
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Giriş yapılırken bir hata oluştu.' });
    }
  });

  // Auth: Change Password
  app.post('/api/auth/change-password', authenticateToken, (req: any, res) => {
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
    res.json({
      user: {
        uid: req.user.id,
        kurumKodu: req.user.kurumKodu,
        role: req.user.role
      }
    });
  });

  // CRUD: Get Collection
  app.get('/api/data/:collection', authenticateToken, (req: any, res) => {
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
  app.post('/api/data/:collection', authenticateToken, (req: any, res) => {
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
  app.put('/api/data/:collection/:id', authenticateToken, (req: any, res) => {
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
  app.delete('/api/data/:collection/:id', authenticateToken, (req: any, res) => {
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
  app.get('/api/doc/:collection/:id', authenticateToken, (req: any, res) => {
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
