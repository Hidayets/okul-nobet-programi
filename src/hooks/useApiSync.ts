import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../AuthContext';

export function useApiSync<T extends { id: string }>(collectionName: string, initialValue: T[] = []) {
  const [data, setData] = useState<T[]>(initialValue);
  const { user } = useAuth();

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/data/${collectionName}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const items = await res.json();
        setData(items);
      }
    } catch (err) {
      console.error(`Error fetching ${collectionName}:`, err);
    }
  }, [collectionName, user]);

  useEffect(() => {
    fetchData();

    // Listen for cross-tab synchronization
    const channel = new BroadcastChannel('app-sync');
    channel.onmessage = (event) => {
      if (event.data.type === 'SYNC' && event.data.collection === collectionName) {
        fetchData();
      }
    };

    return () => {
      channel.close();
    };
  }, [fetchData, collectionName]);

  const updateData = async (newData: T[] | ((prev: T[]) => T[])) => {
    const nextData = typeof newData === 'function' ? (newData as any)(data) : newData;
    
    // Find what changed
    const added = nextData.filter((item: T) => !data.find(d => d.id === item.id));
    const removed = data.filter(item => !nextData.find((d: T) => d.id === item.id));
    const updated = nextData.filter((item: T) => {
      const old = data.find(d => d.id === item.id);
      return old && JSON.stringify(old) !== JSON.stringify(item);
    });

    // Optimistic update
    setData(nextData);

    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    try {
      // Process additions
      for (const item of added) {
        await fetch(`/api/data/${collectionName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(item)
        });
      }

      // Process updates
      for (const item of updated) {
        await fetch(`/api/data/${collectionName}/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(item)
        });
      }

      // Process removals
      for (const item of removed) {
        await fetch(`/api/data/${collectionName}/${item.id}`, {
          method: 'DELETE',
          headers
        });
      }

      // Notify other tabs
      const channel = new BroadcastChannel('app-sync');
      channel.postMessage({ type: 'SYNC', collection: collectionName });
      channel.close();
    } catch (err) {
      console.error(`Error syncing ${collectionName}:`, err);
      // In a real app, we might want to revert the optimistic update here
    }
  };

  return [data, updateData] as const;
}
