import React, { useState } from 'react';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Location } from '../types';

interface Props {
  locations: Location[];
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
}

export default function LocationsTab({ locations, setLocations }: Props) {
  const [newLocationName, setNewLocationName] = useState('');

  const handleAddLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim()) return;

    const newLocation: Location = {
      id: uuidv4(),
      name: newLocationName.trim(),
    };

    setLocations([...locations, newLocation]);
    setNewLocationName('');
  };

  const handleDeleteLocation = (id: string) => {
    setLocations(locations.filter((l) => l.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">Yeni Nöbet Yeri Ekle</h2>
        <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="Nöbet Yeri (Örn: Bahçe, 1. Kat)"
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

      <div className="bg-surface rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold">Kayıtlı Nöbet Yerleri ({locations.length})</h2>
        </div>
        
        {locations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            Henüz nöbet yeri eklenmemiş.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {locations.map((location) => (
              <li key={location.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 block">{location.name}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteLocation(location.id)}
                  className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                  title="Sil"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
