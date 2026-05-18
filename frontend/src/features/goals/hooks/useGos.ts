import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { gosApi } from '../../../api/client';
import type { Go } from '../../../api/types';
import type { GoalsLibrary } from './useGoals';

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

/** Group Gos by their parent task_id ('__none__' for orphan gos). Pure. */
export function groupGosByGoal(gos: Go[]): Map<string, Go[]> {
  const out = new Map<string, Go[]>();
  for (const g of gos) {
    const k = g.task_id ?? '__none__';
    const arr = out.get(k);
    if (arr) arr.push(g); else out.set(k, [g]);
  }
  return out;
}

/** Consecutive days back from today where Go has a positive entry. Pure. */
export function goCurrentStreak(go: Go, today: Date = new Date()): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const map = new Map<string, number>();
  // Defensive: very old DB rows can have a null entries array; iterating
  // null with `for..of` throws and white-screens the whole goal view.
  for (const e of (go.entries ?? [])) map.set(e.date, e.value);
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(t0); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const v = map.get(key) ?? 0;
    if (v > 0) count++;
    else if (i > 0) break;
  }
  return count;
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
export function useGos(goals?: GoalsLibrary) {
  const [gos, setGos] = useState<Go[]>([]);
  const [loading, setLoading] = useState(true);

  const goalsRefresh = goals?.refresh;
  const refresh = useCallback(async () => {
    try {
      const [list] = await Promise.all([
        gosApi.list(),
        goalsRefresh ? goalsRefresh() : Promise.resolve(),
      ]);
      setGos(list);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load Gos');
    } finally {
      setLoading(false);
    }
  }, [goalsRefresh]);

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

  /** Log a value for a Go on its "relevant" date:
   *  - past / future gos with a due_date → that date (so completion is
   *    recorded on the proper day and the go doesn't leak into Today)
   *  - today / no-due-date gos → today
   */
  const logFor = useCallback(async (go: Go, value: number) => {
    const today = ymd(new Date());
    const date = go.due_date && go.due_date !== today ? go.due_date : today;
    try {
      await gosApi.upsertEntry(go.id, date, value);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log Go');
    }
  }, [refresh]);

  return { gos, loading, refresh, grouped, createGo, updateGo, deleteGo, logToday, logFor };
}

export type GosLibrary = ReturnType<typeof useGos>;
