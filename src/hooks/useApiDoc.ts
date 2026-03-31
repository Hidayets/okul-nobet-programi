import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';

export function useApiDoc<T>(path: string, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const { user } = useAuth();

  const [collectionName, docId] = path.split('/');

  const fetchData = useCallback(async () => {
    if (!user || !collectionName || !docId) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/doc/${collectionName}/${docId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const item = await res.json();
        setData(item);
      }
    } catch (err) {
      console.error(`Error fetching ${path}:`, err);
    }
  }, [path, user, collectionName, docId]);

  useEffect(() => {
    fetchData();

    // Listen for cross-tab synchronization
    const channel = new BroadcastChannel('app-sync');
    channel.onmessage = (event) => {
      if (event.data.type === 'SYNC' && event.data.collection === collectionName && event.data.docId === docId) {
        fetchData();
      }
    };

    return () => {
      channel.close();
    };
  }, [fetchData, collectionName, docId]);

  const updateData = async (newData: T | ((prev: T) => T)) => {
    const nextData = typeof newData === 'function' ? (newData as any)(data) : newData;
    
    // Optimistic update
    setData(nextData);

    const token = localStorage.getItem('token');
    try {
      await fetch(`/api/data/${collectionName}/${docId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nextData)
      });

      // Notify other tabs
      const channel = new BroadcastChannel('app-sync');
      channel.postMessage({ type: 'SYNC', collection: collectionName, docId });
      channel.close();
    } catch (err) {
      console.error(`Error syncing ${path}:`, err);
    }
  };

  return [data, updateData] as const;
}
