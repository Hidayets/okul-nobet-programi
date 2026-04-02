import React, { useState, useRef } from 'react';
import { Plus, Trash2, Upload, FileSpreadsheet, Pencil, X, Check, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { Teacher, DutyType } from '../types';

interface Props {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
}

export default function TeachersTab({ teachers, setTeachers }: Props) {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherDutyType, setNewTeacherDutyType] = useState<DutyType>('sabit');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDutyType, setEditDutyType] = useState<DutyType>('sabit');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'selected' | 'all' }>({ open: false, type: 'selected' });

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
      schedule: {},
    };

    setTeachers([...teachers, newTeacher]);
    setNewTeacherName('');
    setNewTeacherEmail('');
    setNewTeacherDutyType('sabit');
  };

  const handleDeleteTeacher = (id: string) => {
    setTeachers(teachers.filter((t) => t.id !== id));
  };

  const handleEditClick = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setEditName(teacher.name);
    setEditEmail(teacher.email || '');
    setEditDutyType(teacher.dutyType || 'sabit');
  };

  const handleSaveEdit = (id: string) => {
    if (!editName.trim()) return;
    setTeachers(teachers.map(t => t.id === id ? {
      ...t,
      name: editName.trim(),
      email: editEmail.trim(),
      dutyType: editDutyType
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
              onClick={() => fileInputRef.current?.click()}
              className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel'den Aktar
            </button>
          </div>
        </div>
        
        <form onSubmit={handleAddTeacher} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 block">{teacher.name}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            teacher.dutyType === 'nobetDisi'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {teacher.dutyType === 'nobetDisi' ? 'Nöbet Dışı' : teacher.dutyType === 'hareketli' ? 'Hareketli' : 'Sabit'}
                          </span>
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
    </div>
  );
}
