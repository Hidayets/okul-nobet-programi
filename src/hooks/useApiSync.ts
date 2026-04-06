import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';

export function useApiSync<T extends { id: string }>(collectionName: string, initialValue: T[] = []) {
  const [data, setData] = useState<T[]>(initialValue);
  const { user } = useAuth();
  const dataRef = useRef(data);
  dataRef.current = data;

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
  }, [fetchData]);

  const updateData = useCallback(async (newData: T[] | ((prev: T[]) => T[])) => {
    const current = dataRef.current;
    const nextData = typeof newData === 'function' ? (newData as (prev: T[]) => T[])(current) : newData;

    const added = nextData.filter((item: T) => !current.find(d => d.id === item.id));
    const removed = current.filter(item => !nextData.find((d: T) => d.id === item.id));
    const updated = nextData.filter((item: T) => {
      const old = current.find(d => d.id === item.id);
      return old && JSON.stringify(old) !== JSON.stringify(item);
    });

    setData(nextData);
    dataRef.current = nextData;

    const token = localStorage.getItem('token');
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    let hasError = false;

    try {
      for (const item of added) {
        const res = await fetch(`/api/data/${collectionName}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(item)
        });
        if (!res.ok) hasError = true;
      }

      for (const item of updated) {
        const res = await fetch(`/api/data/${collectionName}/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(item)
        });
        if (!res.ok) hasError = true;
      }

      for (const item of removed) {
        const res = await fetch(`/api/data/${collectionName}/${item.id}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) hasError = true;
      }

      if (hasError) {
        console.error(`Sync error for ${collectionName}, refetching...`);
        await fetchData();
      }
    } catch (err) {
      console.error(`Error syncing ${collectionName}:`, err);
      await fetchData();
    }
  }, [collectionName, fetchData]);

  return [data, updateData] as const;
}
