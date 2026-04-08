import React, { useState, useEffect } from 'react';
import { Shield, LogOut, Plus, Trash2, Copy, CheckCircle, XCircle, Building2, Key, Calendar, RefreshCw, Search } from 'lucide-react';
import { License } from '../types';

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

  // Arama
  const [searchTerm, setSearchTerm] = useState('');

  // Kopyalama feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  const filteredLicenses = licenses.filter(l =>
    l.kurumKodu.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.okulAdi.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
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
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
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
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3">
              <div className="bg-amber-600/20 p-3 rounded-lg">
                <Calendar className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {licenses.filter(l => l.lastLoginAt).length}
                </p>
                <p className="text-sm text-slate-400">Giriş Yapan Okul</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
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
                  <input
                    type="text"
                    value={newKurumKodu}
                    onChange={(e) => setNewKurumKodu(e.target.value)}
                    placeholder="Örn: 123456"
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
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
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Son Giriş</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">Oluşturulma</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-slate-300">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredLicenses.map((license) => (
                    <tr key={license.id} className="hover:bg-slate-700/30">
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
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {license.lastLoginAt ? formatDate(license.lastLoginAt) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatDate(license.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteLicense(license.id)}
                          className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
