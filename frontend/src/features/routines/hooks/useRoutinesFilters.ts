import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Routine, RoutineScheduleType } from '../../../api/types';
import { todayState } from './useRoutinesToday';
import { currentStreak } from '../lib/heatmap';

export type RoutinesViewFilter = 'all' | 'due_today' | 'streaks' | 'paused';

export interface RoutinesFilters {
  view: RoutinesViewFilter;
  schedule: RoutineScheduleType | null;
  goalId: string | null;
  search: string;
}

const DEFAULT: RoutinesFilters = {
  view: 'all',
  schedule: null,
  goalId: null,
  search: '',
};

const STORAGE_KEY = 'jarvnote:routines:filters';

function read(): RoutinesFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { return DEFAULT; }
}

export function useRoutinesFilters() {
  const [filters, setFilters] = useState<RoutinesFilters>(read);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const set = useCallback(<K extends keyof RoutinesFilters>(key: K, value: RoutinesFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const apply = useMemo(() => {
    return (routines: Routine[]): Routine[] => {
      const q = filters.search.trim().toLowerCase();
      return routines.filter((r) => {
        if (filters.schedule && r.schedule_type !== filters.schedule) return false;
        if (filters.goalId && r.goal_id !== filters.goalId) return false;
        if (q && !r.title.toLowerCase().includes(q)) return false;
        switch (filters.view) {
          case 'all':       return true;
          case 'due_today': return todayState(r) === 'pending' || todayState(r) === 'done';
          case 'streaks':   return currentStreak(r) >= 3 && !r.is_paused;
          case 'paused':    return r.is_paused;
        }
      });
    };
  }, [filters]);

  return { filters, set, apply };
}
