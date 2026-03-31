import React, { useState } from 'react';
import { Building2, KeyRound, ArrowLeft, Loader2, ShieldCheck, Users } from 'lucide-react';

interface Props {
  onBackToLogin: () => void;
}

export default function Register({ onBackToLogin }: Props) {
  const [kurumKodu, setKurumKodu] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanKurumKodu = kurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    if (!cleanKurumKodu || !adminPassword || !teacherPassword) {
      setError('Lütfen tüm alanları doldurun. Kurum kodu sadece harf ve rakamlardan oluşmalıdır.');
      return;
    }
    if (adminPassword.length < 6 || teacherPassword.length < 6) {
      setError('Şifreler en az 6 karakter olmalıdır.');
      return;
    }
    if (adminPassword === teacherPassword) {
      setError('Admin şifresi ile öğretmen şifresi aynı olamaz.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kurumKodu: cleanKurumKodu,
          adminPassword,
          teacherPassword
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onBackToLogin();
        }, 3000);
      } else {
        setError(data.error || 'Kayıt oluşturulurken bir hata meydana geldi.');
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(`Kayıt oluşturulurken bir hata meydana geldi: ${err.message || err.code || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 mb-4">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Kurulum Başarılı!</h2>
          <p className="text-slate-600 mb-6">
            Okulunuz için nöbet sistemi başarıyla kuruldu. Giriş ekranına yönlendiriliyorsunuz...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <button 
            onClick={onBackToLogin}
            className="absolute top-8 left-8 text-slate-500 hover:text-slate-700 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Girişe Dön
          </button>
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          İlk Kurulum (Okul Kaydı)
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 px-4">
          Okulunuzun nöbet programını oluşturmak ve öğretmenlerinizle paylaşmak için kurum kodunuzu ve şifrelerinizi belirleyin.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
          <form className="space-y-6" onSubmit={handleRegister}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="kurumKodu" className="block text-sm font-medium text-slate-700">
                Kurum Kodu (MEB Kurum Kodu)
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

            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Yönetici (Admin) Şifresi
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Programı hazırlamak, öğretmen ve nöbet yeri eklemek için sizin kullanacağınız şifre.
              </p>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="adminPassword"
                  type="password"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="En az 6 karakter"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                Öğretmen Şifresi (Ortak)
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Öğretmenlerin programı sadece görüntüleyebilmesi için onlara vereceğiniz tek ve ortak şifre.
              </p>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyRound className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="teacherPassword"
                  type="password"
                  required
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-md py-2 border"
                  placeholder="En az 6 karakter"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Kurulumu Tamamla'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
