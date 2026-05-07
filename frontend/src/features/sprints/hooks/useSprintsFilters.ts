import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Sprint } from '../../../api/types';
import type { SprintBucket, SprintWithProgress } from './useSprints';

export type ViewFilter = 'all' | SprintBucket;
export type TimeframeFilter = 'all' | 'month' | 'quarter' | 'year';

export interface SprintsFilters {
  view: ViewFilter;
  timeframe: TimeframeFilter;
  search: string;
}

const DEFAULT: SprintsFilters = { view: 'all', timeframe: 'all', search: '' };
const STORAGE_KEY = 'jarvnote:sprints:filters';

function read(): SprintsFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { return DEFAULT; }
}

function withinTimeframe(s: Sprint, frame: TimeframeFilter): boolean {
  if (frame === 'all') return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = frame === 'month' ? 30 : frame === 'quarter' ? 90 : 365;
  const horizon = new Date(today); horizon.setDate(horizon.getDate() + days);
  const past = new Date(today); past.setDate(past.getDate() - days);
  // Sprint overlaps [past, horizon] window
  const start = new Date(s.start_date);
  const end   = new Date(s.end_date);
  return end >= past && start <= horizon;
}

export function useSprintsFilters() {
  const [filters, setFilters] = useState<SprintsFilters>(read);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const set = useCallback(<K extends keyof SprintsFilters>(key: K, value: SprintsFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const apply = useMemo(() => {
    return (decorated: SprintWithProgress[]): SprintWithProgress[] => {
      const q = filters.search.trim().toLowerCase();
      return decorated.filter((d) => {
        if (filters.view !== 'all' && d.bucket !== filters.view) return false;
        if (!withinTimeframe(d.sprint, filters.timeframe)) return false;
        if (q && !d.sprint.title.toLowerCase().includes(q)
              && !d.sprint.description.toLowerCase().includes(q)) return false;
        return true;
      });
    };
  }, [filters]);

  return { filters, set, apply };
}
