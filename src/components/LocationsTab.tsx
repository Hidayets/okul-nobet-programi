import React, { useState } from 'react';
import { Plus, Trash2, MapPin, UserPlus, X, ChevronDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Location, LocationDuty, Teacher } from '../types';

const DAYS = [
  { id: 1, label: 'Pazartesi', short: 'Pzt' },
  { id: 2, label: 'Salı', short: 'Sal' },
  { id: 3, label: 'Çarşamba', short: 'Çar' },
  { id: 4, label: 'Perşembe', short: 'Per' },
  { id: 5, label: 'Cuma', short: 'Cum' },
];

interface Props {
  locations: Location[];
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  teachers: Teacher[];
}

export default function LocationsTab({ locations, setLocations, teachers }: Props) {
  const [newLocationName, setNewLocationName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const eligibleTeachers = teachers.filter(t => t.dutyType !== 'nobetDisi');

  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    const newLocation: Location = {
      id: uuidv4(),
      name: newLocationName.trim(),
      duties: [],
    };

    setLocations([...locations, newLocation]);
    setNewLocationName('');
    setExpandedId(newLocation.id);
  };

  const handleDeleteLocation = (id: string) => {
    setLocations(locations.filter((l) => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleAddDuty = (locationId: string, teacherId: string, day: number) => {
    setLocations(prev => prev.map(loc => {
      if (loc.id !== locationId) return loc;
      if (loc.duties.length >= 3) return loc;
      if (loc.duties.some(d => d.teacherId === teacherId && d.day === day)) return loc;
      return { ...loc, duties: [...loc.duties, { teacherId, day }] };
    }));
  };

  const handleRemoveDuty = (locationId: string, teacherId: string, day: number) => {
    setLocations(prev => prev.map(loc => {
      if (loc.id !== locationId) return loc;
      return {
        ...loc,
        duties: loc.duties.filter(d => !(d.teacherId === teacherId && d.day === day)),
      };
    }));
  };

  const getTeacherName = (teacherId: string) => {
    return teachers.find(t => t.id === teacherId)?.name || 'Bilinmeyen';
  };

  const getDayLabel = (day: number) => {
    return DAYS.find(d => d.id === day)?.label || '';
  };

  const getDayShort = (day: number) => {
    return DAYS.find(d => d.id === day)?.short || '';
  };

  return (
    <div className="space-y-6">
      {/* Yeni Nöbet Yeri Ekle */}
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">Yeni Nöbet Yeri Ekle</h2>
        <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="Nöbet Yeri Adı (Örn: Bahçe, 1. Kat)"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!newLocationName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-5 h-5" />
            Ekle
          </button>
        </form>
      </div>

      {/* Kayıtlı Nöbet Yerleri */}
      <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold">Kayıtlı Nöbet Yerleri ({locations.length})</h2>
          <p className="text-sm text-slate-500 mt-1">Her nöbet yerine en fazla 3 kişi atanabilir.</p>
        </div>

        {locations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            Henüz nöbet yeri eklenmemiş.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {locations.map((location) => {
              const isExpanded = expandedId === location.id;
              const dutyCount = location.duties?.length || 0;

              return (
                <div key={location.id}>
                  {/* Location Header */}
                  <div
                    className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : location.id)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600 flex-shrink-0">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700 block">{location.name}</span>
                        {dutyCount > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {(location.duties || []).map((duty, i) => (
                              <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                                {getTeacherName(duty.teacherId)} - {getDayShort(duty.day)}
                              </span>
                            ))}
                          </div>
                        )}
                        {dutyCount === 0 && (
                          <span className="text-xs text-amber-600">Henüz görevli atanmadı</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        dutyCount >= 3 ? 'bg-emerald-100 text-emerald-700' : dutyCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {dutyCount}/3
                      </span>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteLocation(location.id); }}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: Duty Assignments */}
                  {isExpanded && (
                    <div className="px-6 pb-5 bg-slate-50/50">
                      {/* Existing duties */}
                      {(location.duties || []).length > 0 && (
                        <div className="space-y-2 mb-4">
                          <h4 className="text-sm font-medium text-slate-600">Atanmış Görevliler</h4>
                          {(location.duties || []).map((duty, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                              <div className="flex items-center gap-3">
                                <div className="bg-indigo-50 w-8 h-8 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
                                  {i + 1}
                                </div>
                                <div>
                                  <span className="font-medium text-slate-700">{getTeacherName(duty.teacherId)}</span>
                                  <span className="text-slate-400 mx-2">•</span>
                                  <span className="text-sm text-indigo-600 font-medium">{getDayLabel(duty.day)}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRemoveDuty(location.id, duty.teacherId, duty.day)}
                                className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add new duty */}
                      {dutyCount < 3 && (
                        <DutyAdder
                          locationId={location.id}
                          existingDuties={location.duties || []}
                          eligibleTeachers={eligibleTeachers}
                          onAdd={handleAddDuty}
                        />
                      )}

                      {dutyCount >= 3 && (
                        <p className="text-sm text-emerald-600 font-medium text-center py-2">
                          Bu nöbet yerine maksimum 3 kişi atandı.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DutyAdder({
  locationId,
  existingDuties,
  eligibleTeachers,
  onAdd,
}: {
  locationId: string;
  existingDuties: LocationDuty[];
  eligibleTeachers: Teacher[];
  onAdd: (locationId: string, teacherId: string, day: number) => void;
}) {
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(0);

  const handleAdd = () => {
    if (!selectedTeacher || !selectedDay) return;
    onAdd(locationId, selectedTeacher, selectedDay);
    setSelectedTeacher('');
    setSelectedDay(0);
  };

  const isDuplicate = selectedTeacher && selectedDay
    ? existingDuties.some(d => d.teacherId === selectedTeacher && d.day === selectedDay)
    : false;

  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-4 bg-white">
      <h4 className="text-sm font-medium text-slate-600 mb-3 flex items-center gap-2">
        <UserPlus className="w-4 h-4" />
        Görevli Ekle
      </h4>
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selectedTeacher}
          onChange={(e) => setSelectedTeacher(e.target.value)}
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">Öğretmen seçin...</option>
          {eligibleTeachers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={selectedDay || ''}
          onChange={(e) => setSelectedDay(Number(e.target.value))}
          className="sm:w-40 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          <option value="">Gün seçin...</option>
          {DAYS.map(d => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>

        <button
          onClick={handleAdd}
          disabled={!selectedTeacher || !selectedDay || isDuplicate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ata
        </button>
      </div>
      {isDuplicate && (
        <p className="text-xs text-amber-600 mt-2">Bu öğretmen bu güne zaten atanmış.</p>
      )}
    </div>
  );
}
