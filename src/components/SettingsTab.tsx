import React, { useState, useEffect, useMemo } from 'react';
import { Save, Plus, Trash2, Building2, CheckCircle2, Clock, CalendarDays, Palette, Check, KeyRound, ShieldCheck, Users, Eye, EyeOff } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { SchoolInfo, VicePrincipal, SchoolSettings, DEFAULT_SCHOOL_SETTINGS, calculateLessonTimes } from '../types';
import { useTheme, THEMES } from '../ThemeContext';
import { cn } from '../lib/utils';

interface Props {
  schoolInfo: SchoolInfo;
  setSchoolInfo: React.Dispatch<React.SetStateAction<SchoolInfo>>;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Pazartesi', short: 'Pzt' },
  { id: 2, label: 'Salı', short: 'Sal' },
  { id: 3, label: 'Çarşamba', short: 'Çar' },
  { id: 4, label: 'Perşembe', short: 'Per' },
  { id: 5, label: 'Cuma', short: 'Cum' },
  { id: 6, label: 'Cumartesi', short: 'Cmt' },
  { id: 0, label: 'Pazar', short: 'Paz' },
];

export default function SettingsTab({ schoolInfo, setSchoolInfo }: Props) {
  const { theme, setTheme } = useTheme();
  const [info, setInfo] = useState<SchoolInfo>(schoolInfo);
  const [newVpName, setNewVpName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [adminCurrentPw, setAdminCurrentPw] = useState('');
  const [adminNewPw, setAdminNewPw] = useState('');
  const [teacherNewPw, setTeacherNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [showTeacherPw, setShowTeacherPw] = useState(false);

  const handleChangePassword = async (targetRole: 'admin' | 'teacher') => {
    const newPassword = targetRole === 'admin' ? adminNewPw : teacherNewPw;
    if (!newPassword || newPassword.length < 6) {
      setPwMessage({ type: 'error', text: 'Yeni şifre en az 6 karakter olmalıdır.' });
      return;
    }
    if (targetRole === 'admin' && !adminCurrentPw) {
      setPwMessage({ type: 'error', text: 'Mevcut admin şifresini girin.' });
      return;
    }

    setPwLoading(true);
    setPwMessage(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          targetRole,
          currentPassword: targetRole === 'admin' ? adminCurrentPw : undefined,
          newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwMessage({ type: 'success', text: targetRole === 'admin' ? 'Admin şifresi değiştirildi.' : 'Öğretmen şifresi değiştirildi.' });
        setAdminCurrentPw('');
        setAdminNewPw('');
        setTeacherNewPw('');
      } else {
        setPwMessage({ type: 'error', text: data.error || 'Şifre değiştirilemedi.' });
      }
    } catch {
      setPwMessage({ type: 'error', text: 'Bağlantı hatası. Lütfen tekrar deneyin.' });
    } finally {
      setPwLoading(false);
    }
  };

  const settings: SchoolSettings = info.settings ?? DEFAULT_SCHOOL_SETTINGS;

  const updateSettings = (patch: Partial<SchoolSettings>) => {
    setInfo({ ...info, settings: { ...settings, ...patch } });
  };

  const lessonTimes = useMemo(() => calculateLessonTimes(settings), [settings]);

  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const handleSave = () => {
    setSchoolInfo(info);
    setShowSuccess(true);
  };

  const handleAddVp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVpName.trim()) return;

    const newVp: VicePrincipal = {
      id: uuidv4(),
      name: newVpName.trim(),
    };

    setInfo({
      ...info,
      mudurYardimcilari: [...info.mudurYardimcilari, newVp],
    });
    setNewVpName('');
  };

  const handleDeleteVp = (id: string) => {
    setInfo({
      ...info,
      mudurYardimcilari: info.mudurYardimcilari.filter((vp) => vp.id !== id),
    });
  };

  const toggleDay = (dayId: number) => {
    const current = settings.schoolDays;
    const updated = current.includes(dayId)
      ? current.filter(d => d !== dayId)
      : [...current, dayId];
    updateSettings({ schoolDays: updated });
  };

  return (
    <div className="w-full mx-auto space-y-6">
      {showSuccess && (
        <div className="bg-emerald-50 text-emerald-700 px-5 py-3 rounded-xl flex items-center gap-2 border border-emerald-200 shadow-sm">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Tüm ayarlar başarıyla kaydedildi</span>
        </div>
      )}

      {/* Tema */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Palette className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Tema</h2>
            <p className="text-sm text-slate-500 mt-0.5">Uygulama genelinde kullanılacak renk temasını seçin</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative p-4 rounded-xl border-2 transition-all text-left group",
                theme === t.id
                  ? "border-indigo-500 ring-2 ring-indigo-500/30"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="rounded-lg overflow-hidden mb-3 border border-slate-200/50">
                <div className="h-5" style={{ backgroundColor: t.colors.page }}>
                  <div className="h-1.5 mx-1 mt-1 rounded-full" style={{ backgroundColor: t.colors.accent, opacity: 0.8 }} />
                </div>
                <div className="p-1.5" style={{ backgroundColor: t.colors.page }}>
                  <div className="rounded p-1.5" style={{ backgroundColor: t.colors.card }}>
                    <div className="flex gap-1 mb-1">
                      <div className="h-1 w-6 rounded-full" style={{ backgroundColor: t.colors.text, opacity: 0.7 }} />
                      <div className="h-1 w-3 rounded-full" style={{ backgroundColor: t.colors.accent }} />
                    </div>
                    <div className="h-1 w-full rounded-full mb-0.5" style={{ backgroundColor: t.colors.text, opacity: 0.15 }} />
                    <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: t.colors.text, opacity: 0.1 }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">{t.label}</span>
                {theme === t.id && (
                  <Check className="w-4 h-4 text-indigo-500" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Şifre Yönetimi */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Şifre Yönetimi</h2>
            <p className="text-sm text-slate-500 mt-0.5">Admin ve öğretmen şifrelerini değiştirin</p>
          </div>
        </div>

        {pwMessage && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            pwMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {pwMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : null}
            {pwMessage.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Admin Password */}
          <div className="p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              Admin Şifresi
            </h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-500">Mevcut Şifre</label>
                <div className="relative">
                  <input
                    type={showAdminPw ? 'text' : 'password'}
                    value={adminCurrentPw}
                    onChange={(e) => setAdminCurrentPw(e.target.value)}
                    placeholder="Mevcut admin şifresi"
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPw(!showAdminPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-500">Yeni Şifre</label>
                <input
                  type="password"
                  value={adminNewPw}
                  onChange={(e) => setAdminNewPw(e.target.value)}
                  placeholder="En az 6 karakter"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={() => handleChangePassword('admin')}
                disabled={pwLoading || !adminCurrentPw || !adminNewPw}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pwLoading ? 'Değiştiriliyor...' : 'Admin Şifresini Değiştir'}
              </button>
            </div>
          </div>

          {/* Teacher Password */}
          <div className="p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" />
              Öğretmen Şifresi (Ortak)
            </h3>
            <p className="text-xs text-slate-500">
              Öğretmenlerin programa erişimi için kullanacağı ortak şifreyi değiştirin.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-500">Yeni Öğretmen Şifresi</label>
                <div className="relative">
                  <input
                    type={showTeacherPw ? 'text' : 'password'}
                    value={teacherNewPw}
                    onChange={(e) => setTeacherNewPw(e.target.value)}
                    placeholder="En az 6 karakter"
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTeacherPw(!showTeacherPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showTeacherPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleChangePassword('teacher')}
                disabled={pwLoading || !teacherNewPw}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {pwLoading ? 'Değiştiriliyor...' : 'Öğretmen Şifresini Değiştir'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Okul Bilgileri */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Okul Bilgileri</h2>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Valilik</label>
              <input
                type="text"
                value={info.valilik}
                onChange={(e) => setInfo({ ...info, valilik: e.target.value })}
                placeholder="Örn: İSTANBUL"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Kaymakamlık</label>
              <input
                type="text"
                value={info.kaymakamlik}
                onChange={(e) => setInfo({ ...info, kaymakamlik: e.target.value })}
                placeholder="Örn: KADIKÖY"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Okul Adı</label>
              <input
                type="text"
                value={info.okulAdi}
                onChange={(e) => setInfo({ ...info, okulAdi: e.target.value })}
                placeholder="Örn: ATATÜRK İLKOKULU"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Okul Müdürü</label>
              <input
                type="text"
                value={info.okulMuduru}
                onChange={(e) => setInfo({ ...info, okulMuduru: e.target.value })}
                placeholder="Örn: Ahmet YILMAZ"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-md font-medium text-slate-800 mb-4">Müdür Yardımcıları</h3>
            
            <form onSubmit={handleAddVp} className="flex gap-3 mb-4">
              <input
                type="text"
                value={newVpName}
                onChange={(e) => setNewVpName(e.target.value)}
                placeholder="Müdür Yardımcısı Adı Soyadı"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={!newVpName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Ekle
              </button>
            </form>

            {info.mudurYardimcilari.length > 0 && (
              <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                {info.mudurYardimcilari.map((vp) => (
                  <li key={vp.id} className="px-4 py-3 flex items-center justify-between bg-slate-50">
                    <span className="font-medium text-slate-700">{vp.name}</span>
                    <button
                      onClick={() => handleDeleteVp(vp.id)}
                      className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Ders Saatleri ve Zaman Ayarları */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Ders Saatleri ve Zaman Ayarları</h2>
            <p className="text-sm text-slate-500 mt-0.5">Ders süreleri, teneffüsler ve öğle arası ayarları</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Günlük Ders Sayısı</label>
              <input
                type="number"
                min={1}
                max={12}
                value={settings.lessonCount}
                onChange={(e) => updateSettings({ lessonCount: Math.max(1, Math.min(12, parseInt(e.target.value) || 1)) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-slate-400">1-12 arası</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">İlk Ders Başlama Saati</label>
              <input
                type="time"
                value={settings.firstLessonStart}
                onChange={(e) => updateSettings({ firstLessonStart: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Ders Süresi (dk)</label>
              <input
                type="number"
                min={20}
                max={60}
                value={settings.lessonDuration}
                onChange={(e) => updateSettings({ lessonDuration: Math.max(20, Math.min(60, parseInt(e.target.value) || 40)) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-slate-400">20-60 dakika</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Teneffüs Süresi (dk)</label>
              <input
                type="number"
                min={5}
                max={30}
                value={settings.breakDuration}
                onChange={(e) => updateSettings({ breakDuration: Math.max(5, Math.min(30, parseInt(e.target.value) || 10)) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-slate-400">5-30 dakika</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Öğle Arası (kaçıncı dersten sonra)</label>
              <input
                type="number"
                min={1}
                max={settings.lessonCount - 1 || 1}
                value={settings.lunchAfterLesson}
                onChange={(e) => updateSettings({ lunchAfterLesson: Math.max(1, Math.min(settings.lessonCount - 1, parseInt(e.target.value) || 4)) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-slate-400">{settings.lunchAfterLesson}. ders ile {settings.lunchAfterLesson + 1}. ders arası</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Öğle Arası Süresi (dk)</label>
              <input
                type="number"
                min={20}
                max={90}
                value={settings.lunchDuration}
                onChange={(e) => updateSettings({ lunchDuration: Math.max(20, Math.min(90, parseInt(e.target.value) || 40)) })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-xs text-slate-400">20-90 dakika</p>
            </div>
          </div>

          {/* Ders Saatleri Önizleme */}
          <div className="pt-6 border-t border-slate-100">
            <h3 className="text-md font-medium text-slate-800 mb-4">Ders Saatleri Çizelgesi</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-3">Ders</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-3">Başlangıç</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-3">Bitiş</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider py-2 px-3">Ara</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lessonTimes.map((lt, idx) => {
                    const isBeforeLunch = lt.lesson === settings.lunchAfterLesson;
                    const isLast = idx === lessonTimes.length - 1;
                    return (
                      <tr key={lt.lesson} className={isBeforeLunch ? 'bg-amber-50/50' : ''}>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-sm font-semibold">
                            {lt.lesson}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{lt.start}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-700">{lt.end}</td>
                        <td className="py-2.5 px-3">
                          {!isLast && (
                            isBeforeLunch ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                Öğle Arası — {settings.lunchDuration} dk
                              </span>
                            ) : (
                              <span className="text-sm text-slate-500">{settings.breakDuration} dk teneffüs</span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Okul Günleri */}
      <div className="bg-surface p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Okul Günleri</h2>
            <p className="text-sm text-slate-500 mt-0.5">Haftada kaç gün ve hangi günler ders yapılıyor</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {DAYS_OF_WEEK.map(day => (
              <button
                key={day.id}
                onClick={() => toggleDay(day.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  settings.schoolDays.includes(day.id)
                    ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600 ring-offset-2'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">
            Haftada <span className="font-semibold text-slate-700">{settings.schoolDays.length}</span> gün ders yapılıyor.
            Bu ayar nöbet programı oluşturma ve diğer hesaplamalarda otomatik kullanılacaktır.
          </p>
        </div>
      </div>

      {/* Kaydet Butonu */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-8 rounded-xl font-semibold flex items-center gap-2 transition-colors shadow-sm"
        >
          <Save className="w-5 h-5" />
          Tüm Ayarları Kaydet
        </button>
      </div>
    </div>
  );
}
