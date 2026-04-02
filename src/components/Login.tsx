import React, { useState } from 'react';
import { Building2, KeyRound, UserCircle2, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthContext';

interface Props {
  onSwitchToRegister: () => void;
}

export default function Login({ onSwitchToRegister }: Props) {
  const { setUser } = useAuth();
  const [kurumKodu, setKurumKodu] = useState('');
  const [role, setRole] = useState<'admin' | 'teacher'>('teacher');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showForgot, setShowForgot] = useState(false);
  const [forgotKurum, setForgotKurum] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    if (!cleanKurumKodu || !password) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kurumKodu: cleanKurumKodu,
          role,
          password
        })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        setUser(data.user);
      } else {
        setError(data.error || 'Giriş yapılırken bir hata oluştu.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = forgotKurum.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!clean || !forgotNewPw) {
      setForgotError('Lütfen tüm alanları doldurun.');
      return;
    }
    if (forgotNewPw.length < 6) {
      setForgotError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setForgotLoading(true);
    setForgotError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kurumKodu: clean, newPassword: forgotNewPw })
      });
      const data = await res.json();
      if (res.ok) {
        setForgotSuccess(true);
      } else {
        setForgotError(data.error || 'Şifre sıfırlanamadı.');
      }
    } catch {
      setForgotError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setForgotLoading(false);
    }
  };

  if (showForgot) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <div className="bg-amber-500 p-3 rounded-xl shadow-lg">
              <KeyRound className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
            Şifremi Unuttum
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Admin şifrenizi sıfırlamak için kurum kodunuzu girin
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
            {forgotSuccess ? (
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Şifre Sıfırlandı</h3>
                <p className="text-sm text-slate-600">Admin şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.</p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSuccess(false); setForgotKurum(''); setForgotNewPw(''); }}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Giriş Sayfasına Dön
                </button>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleForgotPassword}>
                {forgotError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                    {forgotError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700">Kurum Kodu</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building2 className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      required
                      value={forgotKurum}
                      onChange={(e) => setForgotKurum(e.target.value)}
                      className="focus:ring-amber-500 focus:border-amber-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                      placeholder="Kayıt olduğunuz kurum kodu"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Yeni Admin Şifresi</label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <KeyRound className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="password"
                      required
                      value={forgotNewPw}
                      onChange={(e) => setForgotNewPw(e.target.value)}
                      className="focus:ring-amber-500 focus:border-amber-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                      placeholder="En az 6 karakter"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-70"
                >
                  {forgotLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Şifreyi Sıfırla'}
                </button>

                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setForgotError(''); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Giriş sayfasına dön
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          Nöbet Programı Girişi
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Okulunuzun nöbet programına erişmek için giriş yapın
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="kurumKodu" className="block text-sm font-medium text-slate-700">
                Kurum Kodu
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Building2 className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="kurumKodu"
                  type="text"
                  required
                  value={kurumKodu}
                  onChange={(e) => setKurumKodu(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="Örn: 123456"
                />
              </div>
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-slate-700">
                Kullanıcı Adı
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserCircle2 className="h-5 w-5 text-slate-400" />
                </div>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'admin' | 'teacher')}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border bg-surface"
                >
                  <option value="teacher">Öğretmen</option>
                  <option value="admin">Admin (Okul İdaresi)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Şifre
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="Şifrenizi girin"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Giriş Yap'}
              </button>
            </div>

            {role === 'admin' && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
                >
                  Şifremi Unuttum
                </button>
              </div>
            )}
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-slate-500">
                  İlk defa mı kullanıyorsunuz?
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={onSwitchToRegister}
                className="w-full flex justify-center py-2 px-4 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-surface hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Yeni Okul Kaydı Oluştur (İlk Kurulum)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
