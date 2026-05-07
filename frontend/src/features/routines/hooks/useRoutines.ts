import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { routinesApi } from '../../../api/client';
import type { Routine, RoutineScheduleType } from '../../../api/types';
import { ymd } from '../lib/heatmap';

export type RoutineTodayState = 'done' | 'skipped' | 'pending' | 'unscheduled';

/**
 * Loads all routines, exposes refresh + mutations + today state per routine.
 *
 * Today state semantics:
 *   • `done`        — there is an entry for today with value > 0
 *   • `skipped`     — there is an entry for today with value === 0 (explicit skip)
 *   • `pending`     — scheduled today, no entry yet
 *   • `unscheduled` — not scheduled today (off-day, paused, or out of period)
 */
export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setRoutines(await routinesApi.list()); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to load routines'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const create = useCallback(
    async (data: Parameters<typeof routinesApi.create>[0]): Promise<Routine | null> => {
      try { const r = await routinesApi.create(data); await refresh(); return r; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create routine'); return null; }
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, data: Partial<Routine>) => {
      try { await routinesApi.update(id, data); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to update routine'); }
    },
    [refresh],
  );

  const remove = useCallback(async (id: string) => {
    try { await routinesApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete routine'); }
  }, [refresh]);

  const togglePause = useCallback(async (id: string, current: boolean) => {
    await update(id, { is_paused: !current });
  }, [update]);

  /** Log today's value: 1 for boolean done, given value for numeric. */
  const logToday = useCallback(async (id: string, value: number) => {
    const date = ymd(new Date());
    try {
      await routinesApi.upsertEntry(id, date, value);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to log');
    }
  }, [refresh]);

  /** Toggle done state for boolean routines (1 ↔ no entry). */
  const toggleDoneToday = useCallback(async (routine: Routine) => {
    const today = ymd(new Date());
    const todayEntry = routine.entries.find((e) => e.date === today);
    if (todayEntry && todayEntry.value > 0) {
      try { await routinesApi.deleteEntry(routine.id, today); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to clear'); }
    } else {
      const v = routine.kind === 'numeric' ? (routine.target_value ?? 1) : 1;
      await logToday(routine.id, v);
    }
  }, [logToday, refresh]);

  const skipToday = useCallback(async (id: string) => {
    const today = ymd(new Date());
    try {
      await routinesApi.upsertEntry(id, today, 0);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to skip');
    }
  }, [refresh]);

  // ── Counts (used by pane Views section) ──────────────────────────────────
  const counts = useMemo(() => {
    const all = routines.length;
    const paused = routines.filter((r) => r.is_paused).length;
    const active = all - paused;
    return { all, active, paused };
  }, [routines]);

  const scheduleCounts = useMemo(() => {
    const out: Record<RoutineScheduleType, number> = {
      daily: 0, weekly_on_days: 0, every_n_days: 0, times_per_week: 0,
    };
    for (const r of routines) out[r.schedule_type] += 1;
    return out;
  }, [routines]);

  return {
    routines, loading, refresh,
    counts, scheduleCounts,
    create, update, remove, togglePause,
    logToday, toggleDoneToday, skipToday,
  };
}

export type RoutinesLibrary = ReturnType<typeof useRoutines>;
