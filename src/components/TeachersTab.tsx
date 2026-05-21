import React, { useState, useRef } from 'react';
import { Plus, Trash2, FileSpreadsheet, Pencil, X, Check, CheckSquare, Square, AlertTriangle, CalendarOff, Clipboard, CalendarCheck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { Teacher, DutyType } from '../types';

const CONSTRAINT_DAYS = [
  { id: 1, label: 'Pzt' },
  { id: 2, label: 'Sal' },
  { id: 3, label: 'Çar' },
  { id: 4, label: 'Per' },
  { id: 5, label: 'Cum' },
];

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
}

export default function TeachersTab({ teachers, setTeachers }: Props) {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherDutyType, setNewTeacherDutyType] = useState<DutyType>('sabit');
  const [newUnavailableDays, setNewUnavailableDays] = useState<number[]>([]);
  const [newAvailableDays, setNewAvailableDays] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDutyType, setEditDutyType] = useState<DutyType>('sabit');
  const [editUnavailableDays, setEditUnavailableDays] = useState<number[]>([]);
  const [editAvailableDays, setEditAvailableDays] = useState<number[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'selected' | 'all' }>({ open: false, type: 'selected' });

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteDutyType, setPasteDutyType] = useState<DutyType>('sabit');
  const [pastePreview, setPastePreview] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === teachers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(teachers.map(t => t.id)));
    }
  };

  const handleDeleteSelected = () => {
    setTeachers(teachers.filter(t => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
    setConfirmDialog({ open: false, type: 'selected' });
  };

  const handleDeleteAll = () => {
    setTeachers([]);
    setSelectedIds(new Set());
    setConfirmDialog({ open: false, type: 'all' });
  };

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim()) return;

    const newTeacher: Teacher = {
      id: uuidv4(),
      name: newTeacherName.trim(),
      email: newTeacherEmail.trim(),
      dutyType: newTeacherDutyType,
      unavailableDays: newUnavailableDays.length > 0 ? newUnavailableDays : undefined,
      availableDays: newAvailableDays.length > 0 ? newAvailableDays : undefined,
      schedule: {},
    };

    setTeachers([...teachers, newTeacher]);
    setNewTeacherName('');
    setNewTeacherEmail('');
    setNewTeacherDutyType('sabit');
    setNewUnavailableDays([]);
    setNewAvailableDays([]);
  };

  const parseClipboardNames = (text: string): string[] => {
    if (!text.trim()) return [];
    const lines = text
      .split(/[\r\n]+/)
      .flatMap((line) => line.split(/\t+/))
      .map((line) => line.replace(/^[-•*\d.\)\s]+/, '').trim())
      .filter((line) => line.length >= 2 && /\p{L}/u.test(line));
    const seen = new Set<string>();
    const out: string[] = [];
    const normalize = (s: string) => s.toLocaleLowerCase('tr');
    for (const name of lines) {
      const key = normalize(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  };

  const handlePasteTextChange = (text: string) => {
    setPasteText(text);
    setPastePreview(parseClipboardNames(text));
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      handlePasteTextChange(text);
    } catch (err) {
      // Tarayıcı izin vermezse kullanıcı manuel yapıştırır
      console.warn('Pano okunamadı:', err);
    }
  };

  const handleAddPastedTeachers = () => {
    if (pastePreview.length === 0) return;
    const existing = new Set(teachers.map((t) => t.name.toLocaleLowerCase('tr').trim()));
    const toAdd: Teacher[] = pastePreview
      .filter((name) => !existing.has(name.toLocaleLowerCase('tr').trim()))
      .map((name) => ({
        id: uuidv4(),
        name,
        email: '',
        dutyType: pasteDutyType,
        schedule: {},
      }));
    if (toAdd.length === 0) {
      setPasteOpen(false);
      setPasteText('');
      setPastePreview([]);
      return;
    }
    setTeachers((prev) => [...prev, ...toAdd]);
    setPasteOpen(false);
    setPasteText('');
    setPastePreview([]);
    setPasteDutyType('sabit');
  };

  const handleDeleteTeacher = (id: string) => {
    setTeachers(teachers.filter((t) => t.id !== id));
  };

  const handleEditClick = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setEditName(teacher.name);
    setEditEmail(teacher.email || '');
    setEditDutyType(teacher.dutyType || 'sabit');
    setEditUnavailableDays(teacher.unavailableDays || []);
    setEditAvailableDays(teacher.availableDays || []);
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) return;
    setTeachers(teachers.map(t => t.id === id ? {
      ...t,
      name: editName.trim(),
      email: editEmail.trim(),
      dutyType: editDutyType,
      unavailableDays: editUnavailableDays.length > 0 ? editUnavailableDays : undefined,
      availableDays: editAvailableDays.length > 0 ? editAvailableDays : undefined,
    } : t));
    setEditingTeacherId(null);
  };

  const handleCancelEdit = () => {
    setEditingTeacherId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const importedTeachers: Teacher[] = data.map((row) => {
        // Parse schedule from columns like Pzt-1, Sal-3, etc.
        const schedule: Record<number, Record<number, string>> = {};
        const dayMap: Record<string, number> = {
          'Pzt': 1, 'Sal': 2, 'Çar': 3, 'Per': 4, 'Cum': 5
        };

        Object.keys(row).forEach(key => {
          const match = key.match(/^(Pzt|Sal|Çar|Per|Cum)-(\d+)$/);
          if (match) {
            const dayStr = match[1];
            const hour = parseInt(match[2], 10);
            const day = dayMap[dayStr];
            
            if (!schedule[day]) schedule[day] = {};
            schedule[day][hour] = row[key];
          }
        });

        let dutyType: DutyType = 'sabit';
        const rawDutyType = row['Nöbet Tipi'] || row['Duty Type'];
        if (rawDutyType && typeof rawDutyType === 'string') {
          const lower = rawDutyType.toLowerCase();
          if (lower.includes('dışı') || lower.includes('disi') || lower.includes('exempt')) {
            dutyType = 'nobetDisi';
          } else if (lower.includes('hareketli')) {
            dutyType = 'hareketli';
          }
        }

        return {
          id: uuidv4(),
          name: row['Ad Soyad'] || row['Name'] || 'İsimsiz',
          email: row['E-posta'] || row['Email'] || '',
          dutyType,
          schedule,
        };
      });

      setTeachers((prev) => [...prev, ...importedTeachers]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Yeni Öğretmen Ekle</h2>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => setPasteOpen(true)}
              className="text-sm bg-sky-50 text-sky-700 hover:bg-sky-100 px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              title="Word/Excel/E-okul'dan kopyaladığınız listeyi yapıştırın"
            >
              <Clipboard className="w-4 h-4" />
              Panodan Ekle
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel'den Aktar
            </button>
          </div>
        </div>
        
        <form onSubmit={handleAddTeacher}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              placeholder="Adı Soyadı *"
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
            <input
              type="email"
              value={newTeacherEmail}
              onChange={(e) => setNewTeacherEmail(e.target.value)}
              placeholder="E-posta"
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex gap-3">
              <select
                value={newTeacherDutyType}
                onChange={(e) => setNewTeacherDutyType(e.target.value as DutyType)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-surface"
              >
                <option value="sabit">Sabit Nöbetçi</option>
                <option value="hareketli">Hareketli Nöbetçi</option>
                <option value="nobetDisi">Nöbet Dışı</option>
              </select>
              <button
                type="submit"
                disabled={!newTeacherName.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          {newTeacherDutyType !== 'nobetDisi' && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1 min-w-[180px]">
                  <CalendarOff className="w-3.5 h-3.5" />
                  Nöbet tutamayacağı günler:
                </span>
                {CONSTRAINT_DAYS.map(day => (
                  <button
                    type="button"
                    key={day.id}
                    onClick={() => setNewUnavailableDays(prev =>
                      prev.includes(day.id) ? prev.filter(d => d !== day.id) : [...prev, day.id]
                    )}
                    disabled={newAvailableDays.length > 0}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      newUnavailableDays.includes(day.id)
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-500 flex items-center gap-1 min-w-[180px]">
                  <CalendarCheck className="w-3.5 h-3.5" />
                  Sadece şu günlerde tutabilir:
                </span>
                {CONSTRAINT_DAYS.map(day => (
                  <button
                    type="button"
                    key={day.id}
                    onClick={() => setNewAvailableDays(prev =>
                      prev.includes(day.id) ? prev.filter(d => d !== day.id) : [...prev, day.id]
                    )}
                    disabled={newUnavailableDays.length > 0}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      newAvailableDays.includes(day.id)
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
                {newAvailableDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setNewAvailableDays([])}
                    className="text-xs text-slate-400 hover:text-slate-600 underline"
                  >
                    temizle
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                İki kısıt birbirini dışlar; birini kullanırken diğeri otomatik kapanır.
              </p>
            </div>
          )}
        </form>
        <p className="text-xs text-slate-500 mt-3">
          * Excel aktarımı için sütun başlıkları: "Ad Soyad", "E-posta", "Nöbet Tipi", "Pzt-1", vb. olmalıdır.
        </p>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {teachers.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-slate-500 hover:text-indigo-600 transition-colors"
                title={selectedIds.size === teachers.length ? 'Seçimi Kaldır' : 'Tümünü Seç'}
              >
                {selectedIds.size === teachers.length && teachers.length > 0 ? (
                  <CheckSquare className="w-5 h-5 text-indigo-600" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
            )}
            <h2 className="text-lg font-semibold">
              Kayıtlı Öğretmenler ({teachers.length})
              {selectedIds.size > 0 && (
                <span className="text-sm font-normal text-indigo-600 ml-2">
                  — {selectedIds.size} seçili
                </span>
              )}
            </h2>
          </div>
          {teachers.length > 0 && (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setConfirmDialog({ open: true, type: 'selected' })}
                  className="text-sm bg-red-50 text-red-700 hover:bg-red-100 px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Seçilenleri Sil ({selectedIds.size})
                </button>
              )}
              <button
                onClick={() => setConfirmDialog({ open: true, type: 'all' })}
                className="text-sm bg-red-50 text-red-700 hover:bg-red-100 px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Tümünü Sil
              </button>
            </div>
          )}
        </div>
        
        {teachers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            Henüz öğretmen eklenmemiş.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {[...teachers].sort((a, b) => a.name.localeCompare(b.name, 'tr')).map((teacher) => (
              <li key={teacher.id} className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50 transition-colors gap-4 ${selectedIds.has(teacher.id) ? 'bg-indigo-50/50' : ''}`}>
                {editingTeacherId === teacher.id ? (
                  <div className="flex-1 w-full space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Adı Soyadı *"
                        className="px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        required
                      />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="E-posta"
                        className="px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                      <div className="flex gap-2">
                        <select
                          value={editDutyType}
                          onChange={(e) => setEditDutyType(e.target.value as DutyType)}
                          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-surface text-sm"
                        >
                          <option value="sabit">Sabit</option>
                          <option value="hareketli">Hareketli</option>
                          <option value="nobetDisi">Nöbet Dışı</option>
                        </select>
                        <button
                          onClick={() => handleSaveEdit(teacher.id)}
                          disabled={!editName.trim()}
                          className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                          title="Kaydet"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="bg-slate-100 text-slate-600 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"
                          title="İptal"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {editDutyType !== 'nobetDisi' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-500 flex items-center gap-1 min-w-[120px]">
                            <CalendarOff className="w-3.5 h-3.5" />
                            Tutamaz:
                          </span>
                          {CONSTRAINT_DAYS.map(day => (
                            <button
                              key={day.id}
                              onClick={() => setEditUnavailableDays(prev =>
                                prev.includes(day.id) ? prev.filter(d => d !== day.id) : [...prev, day.id]
                              )}
                              disabled={editAvailableDays.length > 0}
                              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                editUnavailableDays.includes(day.id)
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-500 flex items-center gap-1 min-w-[120px]">
                            <CalendarCheck className="w-3.5 h-3.5" />
                            Sadece:
                          </span>
                          {CONSTRAINT_DAYS.map(day => (
                            <button
                              key={day.id}
                              onClick={() => setEditAvailableDays(prev =>
                                prev.includes(day.id) ? prev.filter(d => d !== day.id) : [...prev, day.id]
                              )}
                              disabled={editUnavailableDays.length > 0}
                              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                editAvailableDays.includes(day.id)
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                          {editAvailableDays.length > 0 && (
                            <button
                              onClick={() => setEditAvailableDays([])}
                              className="text-xs text-slate-400 hover:text-slate-600 underline"
                            >
                              temizle
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleSelect(teacher.id)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                      >
                        {selectedIds.has(teacher.id) ? (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-700 block">{teacher.name}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            teacher.dutyType === 'nobetDisi'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {teacher.dutyType === 'nobetDisi' ? 'Nöbet Dışı' : teacher.dutyType === 'hareketli' ? 'Hareketli' : 'Sabit'}
                          </span>
                          {teacher.unavailableDays && teacher.unavailableDays.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-600 border border-amber-200" title="Bu günlerde nöbet tutamaz">
                              <CalendarOff className="w-3 h-3" />
                              {teacher.unavailableDays.map(d => CONSTRAINT_DAYS.find(cd => cd.id === d)?.label).filter(Boolean).join(', ')}
                            </span>
                          )}
                          {teacher.availableDays && teacher.availableDays.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200" title="Sadece bu günlerde nöbet tutabilir">
                              <CalendarCheck className="w-3 h-3" />
                              {teacher.availableDays.map(d => CONSTRAINT_DAYS.find(cd => cd.id === d)?.label).filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                        {teacher.email && (
                          <div className="text-sm text-slate-500 mt-1">{teacher.email}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditClick(teacher)}
                        className="text-indigo-500 hover:text-indigo-700 p-2 rounded-lg hover:bg-indigo-50 transition-colors"
                        title="Düzenle"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">
                {confirmDialog.type === 'all' ? 'Tüm Öğretmenleri Sil' : 'Seçili Öğretmenleri Sil'}
              </h3>
            </div>
            <p className="text-slate-600 mb-6">
              {confirmDialog.type === 'all'
                ? `Tüm ${teachers.length} öğretmen kalıcı olarak silinecektir. Bu işlem geri alınamaz.`
                : `Seçili ${selectedIds.size} öğretmen kalıcı olarak silinecektir. Bu işlem geri alınamaz.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog({ open: false, type: 'selected' })}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmDialog.type === 'all' ? handleDeleteAll : handleDeleteSelected}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface rounded-2xl shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-sky-100 p-2 rounded-full">
                  <Clipboard className="w-6 h-6 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Panodan Öğretmen Ekle</h3>
                  <p className="text-xs text-slate-500">
                    Word, Excel, e-okul veya başka bir kaynaktan kopyaladığınız isim listesini aşağıya yapıştırın.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setPasteOpen(false); setPasteText(''); setPastePreview([]); }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">İsim listesi</label>
                  <button
                    onClick={handlePasteFromClipboard}
                    className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 px-2 py-1 rounded-md font-medium flex items-center gap-1"
                  >
                    <Clipboard className="w-3 h-3" />
                    Panodan Çek
                  </button>
                </div>
                <textarea
                  value={pasteText}
                  onChange={(e) => handlePasteTextChange(e.target.value)}
                  placeholder={"Her satıra bir öğretmen adı...\n\nÖrnek:\nAyşe Yılmaz\nMehmet Demir\nFatma Kaya"}
                  className="w-full h-56 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Nöbet tipi:</label>
                  <select
                    value={pasteDutyType}
                    onChange={(e) => setPasteDutyType(e.target.value as DutyType)}
                    className="text-xs px-2 py-1 border border-slate-300 rounded-md bg-surface"
                  >
                    <option value="sabit">Sabit</option>
                    <option value="hareketli">Hareketli</option>
                    <option value="nobetDisi">Nöbet Dışı</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Önizleme ({pastePreview.length} kişi)
                </label>
                <div className="h-56 border border-slate-200 rounded-lg overflow-y-auto bg-slate-50/50 p-2">
                  {pastePreview.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-8">
                      Yapıştırılan isimler burada listelenecek.
                    </div>
                  ) : (
                    <ul className="text-sm text-slate-700 space-y-0.5">
                      {pastePreview.map((name, idx) => {
                        const exists = teachers.some(
                          (t) => t.name.toLocaleLowerCase('tr').trim() === name.toLocaleLowerCase('tr').trim(),
                        );
                        return (
                          <li
                            key={`${name}-${idx}`}
                            className={`px-2 py-1 rounded flex items-center justify-between ${
                              exists ? 'text-slate-400 line-through' : ''
                            }`}
                            title={exists ? 'Zaten kayıtlı, atlanacak' : ''}
                          >
                            <span>{idx + 1}. {name}</span>
                            {exists && <span className="text-[10px] text-amber-600">mevcut</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  Numaralar, madde işaretleri ve fazla boşluklar otomatik temizlenir. Aynı isimden birden fazla varsa tek sefer eklenir.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setPasteOpen(false); setPasteText(''); setPastePreview([]); }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={handleAddPastedTeachers}
                disabled={pastePreview.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Listeye Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
