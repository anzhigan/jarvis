import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { gosApi } from '../../../api/client';
import type { Go } from '../../../api/types';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type GoBucket = 'overdue' | 'today' | 'upcoming' | 'done';

/** Bucket a single Go into one of four deadline categories (pure). */
export function bucketOfGo(go: Go, today: string): GoBucket {
  if (go.is_done_today) return 'done';
  const due = go.due_date;
  if (!due) return 'upcoming';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'upcoming';
}

/** Group an array of Gos by deadline bucket relative to `today` (pure). */
export function groupGos(gos: Go[], today: string): GroupedGos {
  const out: GroupedGos = { overdue: [], today: [], upcoming: [], done: [] };
  for (const g of gos) out[bucketOfGo(g, today)].push(g);
  return out;
}

export interface GroupedGos {
  overdue: Go[];
  today: Go[];
  upcoming: Go[];
  done: Go[];
}

/**
 * Loads Gos and groups them by deadline relative to today. The "done" bucket
 * collects items completed today (boolean) or hitting their target (numeric).
 */
export function useGos() {
  const [gos, setGos] = useState<Go[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setGos(await gosApi.list());
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load Gos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const grouped = useMemo<GroupedGos>(() => groupGos(gos, ymd(new Date())), [gos]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const createGo = useCallback(
    async (data: Parameters<typeof gosApi.create>[0]): Promise<Go | null> => {
      try { const g = await gosApi.create(data); await refresh(); return g; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create Go'); return null; }
    },
    [refresh],
  );

  const updateGo = useCallback(
    async (id: string, data: Parameters<typeof gosApi.update>[1]) => {
      try { await gosApi.update(id, data); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to update Go'); }
    },
    [refresh],
  );

  const deleteGo = useCallback(async (id: string) => {
    try { await gosApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete Go'); }
  }, [refresh]);

  /** Mark today's value: 1 for boolean toggle, given value for numeric. */
  const logToday = useCallback(async (goId: string, value: number) => {
    const date = ymd(new Date());
    try {
      await gosApi.upsertEntry(goId, date, value);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log Go');
    }
  }, [refresh]);

  return { gos, loading, refresh, grouped, createGo, updateGo, deleteGo, logToday };
}

export type GosLibrary = ReturnType<typeof useGos>;
