import React, { useState, useEffect, useMemo } from 'react';
import { Shield, LogOut, Plus, Trash2, Copy, CheckCircle, XCircle, Building2, Key, Calendar, RefreshCw, Search, AlertTriangle, AlertOctagon, Clock, ArrowUpDown, PenLine } from 'lucide-react';
import { License } from '../types';
import { getLicenseDaysRemaining, formatLicenseDateLongTr, licenseEndOfDayMs } from '../lib/licenseDates';

interface Props {
  onLogout: () => void;
}

export default function SuperAdminPanel({ onLogout }: Props) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Yeni lisans formu
  const [showNewForm, setShowNewForm] = useState(false);
  const [newKurumKodu, setNewKurumKodu] = useState('');
  const [newOkulAdi, setNewOkulAdi] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupInfo, setLookupInfo] = useState('');
  const [lookupError, setLookupError] = useState('');

  const parseSchoolCodeFromYol = (yol?: string): string | null => {
    if (!yol) return null;
    const parts = String(yol).split('/');
    const last = parts[parts.length - 1]?.trim();
    if (!last) return null;
    const clean = last.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return clean || null;
  };

  const lookupSchoolFromGithub = async (kurumKodu: string): Promise<{
    okulAdi: string;
    il?: string;
    ilce?: string;
    kaynak: string;
  } | null> => {
    const q = encodeURIComponent(`${kurumKodu} repo:MehmetHuseyinDelipalta/MEB-Okul-Veritabani path:"Tüm Okullar" extension:json`);
    const searchRes = await fetch(`https://api.github.com/search/code?q=${q}&per_page=5`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const items = Array.isArray(searchData?.items) ? searchData.items : [];
    if (items.length === 0) return null;

    for (const item of items) {
      if (!item?.url) continue;
      const metaRes = await fetch(item.url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!metaRes.ok) continue;
      const meta = await metaRes.json();
      if (!meta?.download_url) continue;
      const fileRes = await fetch(meta.download_url);
      if (!fileRes.ok) continue;
      const rows = await fileRes.json();
      if (!Array.isArray(rows)) continue;

      const found = rows.find((s: any) => parseSchoolCodeFromYol(s?.YOL) === kurumKodu);
      if (found?.OKUL_ADI) {
        return {
          okulAdi: String(found.OKUL_ADI).trim(),
          il: typeof found.IL === 'string' ? found.IL : undefined,
          ilce: typeof found.ILCE === 'string' ? found.ILCE : undefined,
          kaynak: 'github-yedek-sorgu',
        };
      }
    }
    return null;
  };

  // Arama
  const [searchTerm, setSearchTerm] = useState('');

  // Sıralama / filtre
  type SortMode = 'expiring' | 'created' | 'name';
  const [sortMode, setSortMode] = useState<SortMode>('expiring');
  const [filterMode, setFilterMode] = useState<'all' | 'expiring' | 'expired' | 'active' | 'inactive'>('all');

  // Kopyalama feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Lisans uzatma / düzenleme
  const [editLicense, setEditLicense] = useState<License | null>(null);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editOkulAdi, setEditOkulAdi] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/licenses', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLicenses(data);
      } else {
        setError('Lisanslar yüklenemedi.');
      }
    } catch {
      setError('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKurumKodu.trim() || !newOkulAdi.trim()) {
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          kurumKodu: newKurumKodu.trim(),
          okulAdi: newOkulAdi.trim(),
          expiresAt: newExpiresAt || null
        })
      });

      if (res.ok) {
        const newLicense = await res.json();
        setLicenses(prev => [newLicense, ...prev]);
        setNewKurumKodu('');
        setNewOkulAdi('');
        setNewExpiresAt('');
        setShowNewForm(false);
      } else {
        const data = await res.json();
        alert(data.error || 'Lisans oluşturulamadı.');
      }
    } catch {
      alert('Bağlantı hatası.');
    } finally {
      setCreating(false);
    }
  };

  const handleLookupSchool = async () => {
    const cleanKurumKodu = newKurumKodu.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (!cleanKurumKodu) return;
    setLookupLoading(true);
    setLookupError('');
    setLookupInfo('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/schools/lookup/${encodeURIComponent(cleanKurumKodu)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        // Eski sunucu sürümünde endpoint yoksa HTML dönebilir.
      }

      if (!data) {
        const fallback = await lookupSchoolFromGithub(cleanKurumKodu);
        if (fallback?.okulAdi) {
          setNewOkulAdi(fallback.okulAdi);
          const region = [fallback.il, fallback.ilce].filter(Boolean).join(' / ');
          setLookupInfo(region ? `${region} - Okul bulundu` : 'Okul bulundu');
          return;
        }
        setLookupError('Okul bilgisi bulunamadı. Kurum kodunu kontrol edin veya okul adını manuel girin.');
        return;
      }

      if (!res.ok) {
        const fallback = await lookupSchoolFromGithub(cleanKurumKodu);
        if (fallback?.okulAdi) {
          setNewOkulAdi(fallback.okulAdi);
          const region = [fallback.il, fallback.ilce].filter(Boolean).join(' / ');
          setLookupInfo(region ? `${region} - Okul bulundu` : 'Okul bulundu');
          return;
        }
        setLookupError(data.error || 'Okul bilgisi bulunamadı.');
        return;
      }
      if (data?.okulAdi) {
        setNewOkulAdi(data.okulAdi);
        const region = [data.il, data.ilce].filter(Boolean).join(' / ');
        setLookupInfo(region ? `${region} - Okul bulundu` : 'Okul bulundu');
      } else {
        setLookupError('Bu kurum kodu için okul adı bulunamadı.');
      }
    } catch {
      setLookupError('Okul sorgusu sırasında bağlantı hatası oluştu.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleDeleteLicense = async (id: string) => {
    if (!confirm('Bu lisansı silmek istediğinizden emin misiniz?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/licenses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        setLicenses(prev => prev.filter(l => l.id !== id));
      }
    } catch {
      alert('Silme hatası.');
    }
  };

  const openEditLicense = (lic: License) => {
    setEditLicense(lic);
    setEditOkulAdi(lic.okulAdi);
    setEditExpiresAt(lic.expiresAt ? lic.expiresAt.split('T')[0] : '');
  };

  const handleSaveLicenseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLicense) return;
    if (!editOkulAdi.trim()) {
      alert('Okul adı boş olamaz.');
      return;
    }
    setSavingEdit(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/licenses/${editLicense.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          expiresAt: editExpiresAt.trim() === '' ? null : editExpiresAt.trim(),
          okulAdi: editOkulAdi.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setLicenses((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)));
        setEditLicense(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Güncellenemedi.');
      }
    } catch {
      alert('Bağlantı hatası.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/licenses/${id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const updated = await res.json();
        setLicenses(prev => prev.map(l => l.id === id ? { ...l, isActive: updated.isActive } : l));
      }
    } catch {
      alert('Güncelleme hatası.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getDaysRemaining = (expiresAt?: string): number | null => getLicenseDaysRemaining(expiresAt);

  type ExpiryStatus = 'none' | 'expired' | 'soon' | 'warning' | 'ok';
  const getExpiryStatus = (expiresAt?: string): { status: ExpiryStatus; days: number | null } => {
    const days = getDaysRemaining(expiresAt);
    if (days === null) return { status: 'none', days: null };
    if (days < 0) return { status: 'expired', days };
    if (days <= 30) return { status: 'soon', days };
    if (days <= 90) return { status: 'warning', days };
    return { status: 'ok', days };
  };

  // İstatistikler
  const stats = useMemo(() => {
    let expired = 0, soon = 0, warning = 0, noExpiry = 0;
    for (const l of licenses) {
      const { status } = getExpiryStatus(l.expiresAt);
      if (status === 'expired') expired++;
      else if (status === 'soon') soon++;
      else if (status === 'warning') warning++;
      else if (status === 'none') noExpiry++;
    }
    return { expired, soon, warning, noExpiry };
  }, [licenses]);

  /** Yönetici paneli: hangi kurumun lisansı ne zaman bitecek — net liste */
  const expiryBoard = useMemo(() => {
    const withDays = licenses.map((lic) => ({
      lic,
      days: getLicenseDaysRemaining(lic.expiresAt),
    }));
    const expiringSoon = withDays
      .filter((x) => !!x.lic.isActive && x.days !== null && x.days >= 0 && x.days <= 30)
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
    const expired = withDays
      .filter((x) => x.days !== null && x.days < 0)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    return { expiringSoon, expired };
  }, [licenses]);

  const filteredLicenses = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const filtered = licenses.filter(l => {
      if (q && !l.kurumKodu.toLowerCase().includes(q) && !l.okulAdi.toLowerCase().includes(q)) {
        return false;
      }
      const { status } = getExpiryStatus(l.expiresAt);
      switch (filterMode) {
        case 'expiring': return status === 'soon';
        case 'expired': return status === 'expired';
        case 'active': return !!l.isActive;
        case 'inactive': return !l.isActive;
        default: return true;
      }
    });

    const sorted = [...filtered];
    if (sortMode === 'expiring') {
      sorted.sort((a, b) => {
        const da = getDaysRemaining(a.expiresAt);
        const db = getDaysRemaining(b.expiresAt);
        // Süresi dolmuş olanlar en üstte, sonra en yakın bitenler, sonra süresizler
        if (da === null && db === null) return a.okulAdi.localeCompare(b.okulAdi, 'tr');
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      });
    } else if (sortMode === 'name') {
      sorted.sort((a, b) => a.okulAdi.localeCompare(b.okulAdi, 'tr'));
    } else if (sortMode === 'created') {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [licenses, searchTerm, filterMode, sortMode]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Lisans bitiş tarihi (YYYY-MM-DD) için saat dilimi kayması yaşamayan formatlama.
  // `new Date('YYYY-MM-DD')` UTC olarak parse edilir; yerel günün sonuna çevirip biçimlendiriyoruz.
  const formatDateShort = (dateStr?: string) => {
    if (!dateStr) return '-';
    const ms = licenseEndOfDayMs(dateStr);
    if (ms === null) return dateStr;
    return new Date(ms).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-purple-600 p-2 rounded-lg">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Yönetim Paneli</h1>
                <p className="text-xs text-slate-400">Lisans Yönetimi</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="bg-purple-600/20 p-3 rounded-lg">
                <Building2 className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{licenses.length}</p>
                <p className="text-sm text-slate-400">Toplam Lisans</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600/20 p-3 rounded-lg">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{licenses.filter(l => l.isActive).length}</p>
                <p className="text-sm text-slate-400">Aktif Lisans</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setFilterMode(stats.soon > 0 ? 'expiring' : 'all'); setSortMode('expiring'); }}
            className={`text-left bg-slate-800 rounded-xl p-5 border transition-colors ${
              stats.soon > 0 ? 'border-amber-500/60 hover:border-amber-400 ring-1 ring-amber-500/30' : 'border-slate-700 hover:border-slate-600'
            }`}
            title={stats.soon > 0 ? 'Yakında dolacak lisansları göster' : ''}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${stats.soon > 0 ? 'bg-amber-600/20 animate-pulse' : 'bg-slate-700/50'}`}>
                <Clock className={`w-6 h-6 ${stats.soon > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stats.soon > 0 ? 'text-amber-300' : ''}`}>{stats.soon}</p>
                <p className="text-sm text-slate-400">≤ 30 gün kaldı</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => { setFilterMode(stats.expired > 0 ? 'expired' : 'all'); setSortMode('expiring'); }}
            className={`text-left bg-slate-800 rounded-xl p-5 border transition-colors ${
              stats.expired > 0 ? 'border-red-500/60 hover:border-red-400 ring-1 ring-red-500/30' : 'border-slate-700 hover:border-slate-600'
            }`}
            title={stats.expired > 0 ? 'Süresi dolan lisansları göster' : ''}
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${stats.expired > 0 ? 'bg-red-600/20' : 'bg-slate-700/50'}`}>
                <AlertOctagon className={`w-6 h-6 ${stats.expired > 0 ? 'text-red-400' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${stats.expired > 0 ? 'text-red-300' : ''}`}>{stats.expired}</p>
                <p className="text-sm text-slate-400">Süresi dolmuş</p>
              </div>
            </div>
          </button>
        </div>

        {/* Acil durum bandı */}
        {(stats.expired > 0 || stats.soon > 0) && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-200">
                Dikkat gerektiren lisanslar var
              </p>
              <p className="text-slate-300 mt-0.5">
                {stats.expired > 0 && (
                  <>
                    <button
                      onClick={() => { setFilterMode('expired'); setSortMode('expiring'); }}
                      className="inline-flex items-center gap-1 text-red-300 hover:text-red-200 underline-offset-2 hover:underline font-semibold"
                    >
                      {stats.expired} lisansın süresi dolmuş
                    </button>
                    {stats.soon > 0 ? ', ' : '.'}
                  </>
                )}
                {stats.soon > 0 && (
                  <>
                    <button
                      onClick={() => { setFilterMode('expiring'); setSortMode('expiring'); }}
                      className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline font-semibold"
                    >
                      {stats.soon} lisans 30 gün içinde sona eriyor
                    </button>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Kurum bazlı lisans bitiş özeti (sahip görünümü) */}
        {(expiryBoard.expired.length > 0 || expiryBoard.expiringSoon.length > 0) && (
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {expiryBoard.expired.length > 0 && (
              <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4">
                <h3 className="text-sm font-bold text-red-200 flex items-center gap-2 mb-3">
                  <AlertOctagon className="w-4 h-4" />
                  Süresi dolmuş lisanslar ({expiryBoard.expired.length})
                </h3>
                <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {expiryBoard.expired.map(({ lic, days }) => (
                    <li
                      key={lic.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-lg bg-red-900/30 border border-red-500/25 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-semibold text-white">{lic.okulAdi}</span>
                        <span className="text-slate-400 mx-2">·</span>
                        <code className="text-xs text-red-200">{lic.kurumKodu}</code>
                      </div>
                      <div className="text-xs text-red-100/90 sm:text-right">
                        <span className="font-medium">{formatLicenseDateLongTr(lic.expiresAt!)}</span>
                        <span className="text-red-200/80"> ({Math.abs(days!)} gün önce doldu)</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {expiryBoard.expiringSoon.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4">
                <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" />
                  30 gün içinde sona erecek ({expiryBoard.expiringSoon.length})
                </h3>
                <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {expiryBoard.expiringSoon.map(({ lic, days }) => (
                    <li
                      key={lic.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-lg bg-amber-900/25 border border-amber-500/25 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-semibold text-white">{lic.okulAdi}</span>
                        <span className="text-slate-400 mx-2">·</span>
                        <code className="text-xs text-amber-200">{lic.kurumKodu}</code>
                      </div>
                      <div className="text-xs text-amber-100/95 sm:text-right">
                        <span className="font-medium">{formatLicenseDateLongTr(lic.expiresAt!)}</span>
                        <span className="text-amber-200/90 font-semibold"> — {days === 0 ? 'bugün son gün' : `${days} gün kaldı`}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Kurum kodu veya okul adı ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchLicenses}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Yenile
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Yeni Lisans
            </button>
          </div>
        </div>

        {/* Filter & sort chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
          <span className="text-xs text-slate-400 mr-1">Filtre:</span>
          {([
            { id: 'all', label: `Tümü (${licenses.length})` },
            { id: 'expiring', label: `Yakında dolacak (${stats.soon})`, color: 'amber' },
            { id: 'expired', label: `Süresi dolmuş (${stats.expired})`, color: 'red' },
            { id: 'active', label: 'Aktif' },
            { id: 'inactive', label: 'Pasif' },
          ] as const).map(chip => (
            <button
              key={chip.id}
              onClick={() => setFilterMode(chip.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                filterMode === chip.id
                  ? (chip as any).color === 'amber'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                    : (chip as any).color === 'red'
                      ? 'bg-red-500/20 border-red-500 text-red-200'
                      : 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
          <div className="mx-2 w-px h-5 bg-slate-700" />
          <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" /> Sırala:
          </span>
          {([
            { id: 'expiring', label: 'Süreye göre' },
            { id: 'name', label: 'Okul adı' },
            { id: 'created', label: 'Yeni eklenen' },
          ] as const).map(chip => (
            <button
              key={chip.id}
              onClick={() => setSortMode(chip.id as SortMode)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                sortMode === chip.id
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* New License Form */}
        {showNewForm && (
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-400" />
              Yeni Lisans Oluştur
            </h3>
            <form onSubmit={handleCreateLicense} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Kurum Kodu</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newKurumKodu}
                      onChange={(e) => setNewKurumKodu(e.target.value)}
                      placeholder="Örn: 123456"
                      className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleLookupSchool}
                      disabled={lookupLoading || !newKurumKodu.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg text-sm font-medium whitespace-nowrap"
                    >
                      {lookupLoading ? 'Sorgulanıyor...' : 'Kodu Sorgula'}
                    </button>
                  </div>
                  {lookupInfo && <p className="mt-1 text-xs text-emerald-300">{lookupInfo}</p>}
                  {lookupError && <p className="mt-1 text-xs text-red-300">{lookupError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Okul Adı</label>
                  <input
                    type="text"
                    value={newOkulAdi}
                    onChange={(e) => setNewOkulAdi(e.target.value)}
                    placeholder="Örn: Atatürk İlkokulu"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Bitiş Tarihi (Opsiyonel)</label>
                <input
                  type="date"
                  value={newExpiresAt}
                  onChange={(e) => setNewExpiresAt(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {creating ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Licenses Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400">{error}</div>
        ) : filteredLicenses.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            {searchTerm ? 'Arama sonucu bulunamadı.' : 'Henüz lisans oluşturulmamış.'}
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Okul</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Kurum Kodu</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Lisans Anahtarı</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Durum</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Lisans Bitişi</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Son Giriş</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Oluşturulma</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-300">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredLicenses.map((license) => {
                    const { status, days } = getExpiryStatus(license.expiresAt);
                    // Satır arkaplanı: süresi dolmuş için kırmızımsı, yaklaşan için sarımsı vurgu
                    const rowHighlight =
                      status === 'expired' ? 'bg-red-900/20 hover:bg-red-900/30 border-l-4 border-red-500/70' :
                      status === 'soon' ? 'bg-amber-900/15 hover:bg-amber-900/25 border-l-4 border-amber-500/60' :
                      'hover:bg-slate-700/30';
                    return (
                    <tr key={license.id} className={rowHighlight}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{license.okulAdi}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="bg-slate-700 px-2 py-1 rounded text-sm">{license.kurumKodu}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-sm font-mono">
                            {license.licenseKey}
                          </code>
                          <button
                            onClick={() => copyToClipboard(license.licenseKey, license.id)}
                            className="p-1 hover:bg-slate-600 rounded transition-colors"
                            title="Kopyala"
                          >
                            {copiedId === license.id ? (
                              <CheckCircle className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(license.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            license.isActive
                              ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-900'
                              : 'bg-red-900/50 text-red-300 hover:bg-red-900'
                          }`}
                        >
                          {license.isActive ? (
                            <>
                              <CheckCircle className="w-3 h-3" /> Aktif
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" /> Pasif
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {!license.expiresAt ? (
                          <span className="text-slate-500 italic">Süresiz</span>
                        ) : status === 'expired' ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 font-semibold text-xs w-fit">
                              <AlertOctagon className="w-3.5 h-3.5" /> Süresi doldu
                            </span>
                            <span className="text-xs text-slate-400 mt-0.5 font-mono">
                              {formatDateShort(license.expiresAt)}
                              {days !== null && ` (${Math.abs(days)} gün önce)`}
                            </span>
                          </div>
                        ) : status === 'soon' ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold text-xs w-fit">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {days === 0 ? 'Bugün sona eriyor' : `${days} gün kaldı`}
                            </span>
                            <span className="text-xs text-slate-400 mt-0.5 font-mono">
                              {formatDateShort(license.expiresAt)}
                            </span>
                          </div>
                        ) : status === 'warning' ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 text-xs w-fit">
                              <Clock className="w-3.5 h-3.5" />
                              {days} gün
                            </span>
                            <span className="text-xs text-slate-400 mt-0.5 font-mono">
                              {formatDateShort(license.expiresAt)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs w-fit">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {days} gün
                            </span>
                            <span className="text-xs text-slate-400 mt-0.5 font-mono">
                              {formatDateShort(license.expiresAt)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {license.lastLoginAt ? formatDate(license.lastLoginAt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatDate(license.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditLicense(license)}
                            className="p-2 text-violet-300 hover:bg-violet-900/40 rounded-lg transition-colors"
                            title="Bitiş tarihi uzat / düzenle"
                          >
                            <PenLine className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLicense(license.id)}
                            className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {editLicense && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-violet-400" />
              Lisans uzat / düzenle
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Kurum kodu: <code className="text-violet-300">{editLicense.kurumKodu}</code> — lisans anahtarı değişmez.
            </p>
            <form onSubmit={handleSaveLicenseEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Okul adı</label>
                <input
                  type="text"
                  value={editOkulAdi}
                  onChange={(e) => setEditOkulAdi(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Lisans bitiş tarihi</label>
                <input
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-xs text-slate-500 mt-1">Boş bırakırsanız süresiz lisans olur.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {savingEdit ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditLicense(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
