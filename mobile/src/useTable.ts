import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.tsx';
import type { Table } from './api.ts';

export type ServiceEntry = { id: string; service_date: string; service_type: string; attendance: number; unity: number; engagement: number; notes: string | null };
export type ProductionEntry = { id: string; service_date: string; service_type: string; slides_grade: number; slides_miss_count: number; [key: string]: unknown };

// Loads every row of a table (the server already sorts newest first) and reloads on demand.
export function useTable<T>(table: Table) {
  const { api } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await api.list<T>(table);
    if (result.data) setRows(result.data);
    setError(result.error?.message ?? null);
    setLoading(false);
  }, [api, table]);

  useEffect(() => { refresh(); }, [refresh]);
  return { rows, error, loading, refresh };
}
