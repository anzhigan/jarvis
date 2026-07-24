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

  /** Drop a day back to "no status". The row is deleted outright unless it
   *  carries a note — that we keep, storing a null value so the note survives
   *  un-marking the day and the square renders empty again. */
  const unmark = useCallback(async (id: string, date: string, note: string) => {
    if (note) await routinesApi.upsertEntry(id, date, null);
    else await routinesApi.deleteEntry(id, date);
  }, []);

  /** Toggle done state for boolean routines (1 ↔ no entry). */
  const toggleDoneToday = useCallback(async (routine: Routine) => {
    const today = ymd(new Date());
    const todayEntry = routine.entries.find((e) => e.date === today);
    if (todayEntry && (todayEntry.value ?? 0) > 0) {
      try { await unmark(routine.id, today, todayEntry.note); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to clear'); }
    } else {
      const v = routine.kind === 'numeric' ? (routine.target_value ?? 1) : 1;
      await logToday(routine.id, v);
    }
  }, [logToday, refresh, unmark]);

  const skipToday = useCallback(async (id: string) => {
    const today = ymd(new Date());
    try {
      await routinesApi.upsertEntry(id, today, 0);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to skip');
    }
  }, [refresh]);

  /** Generic per-date toggle for boolean routines. Date is YYYY-MM-DD.
   *  Same logic as toggleDoneToday: existing positive entry → delete; otherwise → log value 1. */
  const toggleDoneOn = useCallback(async (routine: Routine, date: string) => {
    const existing = routine.entries.find((e) => e.date === date);
    if (existing && (existing.value ?? 0) > 0) {
      try { await unmark(routine.id, date, existing.note); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to clear'); }
    } else {
      const v = routine.kind === 'numeric' ? (routine.target_value ?? 1) : 1;
      try { await routinesApi.upsertEntry(routine.id, date, v); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to log'); }
    }
  }, [refresh, unmark]);

  /** Generic per-date skip (value=0). */
  const skipOn = useCallback(async (id: string, date: string) => {
    try {
      await routinesApi.upsertEntry(id, date, 0);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to skip');
    }
  }, [refresh]);

  /** Save the free-text note for a day *without* touching its status — a note
   *  works on any square (empty, skipped, partial, done). Omitting `value`
   *  leaves an existing day alone; a day with no row yet gets one with a null
   *  value ("has a note, no status"), so the square stays empty.
   *  Clearing the note on such a status-less day removes the row entirely. */
  const saveNoteOn = useCallback(async (routine: Routine, date: string, note: string) => {
    const existing = routine.entries.find((e) => e.date === date);
    try {
      if (!note && (!existing || existing.value === null)) {
        if (existing) await routinesApi.deleteEntry(routine.id, date);
      } else {
        await routinesApi.upsertEntry(routine.id, date, undefined, note);
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save note');
    }
  }, [refresh]);

  /** Remove a day's entry entirely (back to "empty" state). */
  const clearOn = useCallback(async (id: string, date: string) => {
    try {
      await routinesApi.deleteEntry(id, date);
      await refresh();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to clear');
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
    toggleDoneOn, skipOn, clearOn, saveNoteOn,
  };
}

export type RoutinesLibrary = ReturnType<typeof useRoutines>;
