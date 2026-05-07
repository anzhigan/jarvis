import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import { isScheduledOn, ymd } from '../lib/heatmap';
import type { RoutinesLibrary, RoutineTodayState } from './useRoutines';

export interface TodayRoutine {
  routine: Routine;
  state: RoutineTodayState;
}

export interface TodaySummary {
  date: Date;
  list: TodayRoutine[];
  scheduledCount: number;
  doneCount: number;
  skippedCount: number;
  pendingCount: number;
  /** 0..1 ratio of done over scheduled (excluding skipped from numerator). */
  ratio: number;
}

export function todayState(routine: Routine, today: Date = new Date()): RoutineTodayState {
  if (!isScheduledOn(routine, today)) return 'unscheduled';
  const key = ymd(today);
  const e = routine.entries.find((entry) => entry.date === key);
  if (!e) return 'pending';
  if (e.value > 0) return 'done';
  return 'skipped';
}

/** Derives "today" view: scheduled routines with their state + summary counts. */
export function useRoutinesToday(library: RoutinesLibrary): TodaySummary {
  return useMemo<TodaySummary>(() => {
    const today = new Date();
    const list: TodayRoutine[] = [];
    let done = 0, skipped = 0, pending = 0;
    for (const r of library.routines) {
      const state = todayState(r, today);
      if (state === 'unscheduled') continue;
      list.push({ routine: r, state });
      if (state === 'done')    done++;
      if (state === 'skipped') skipped++;
      if (state === 'pending') pending++;
    }
    const scheduled = list.length;
    return {
      date: today,
      list,
      scheduledCount: scheduled,
      doneCount: done,
      skippedCount: skipped,
      pendingCount: pending,
      ratio: scheduled === 0 ? 0 : done / scheduled,
    };
  }, [library.routines]);
}
