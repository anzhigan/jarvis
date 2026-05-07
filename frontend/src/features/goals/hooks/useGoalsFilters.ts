import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';

export type StatusFilter = 'all' | TaskStatus;
export type PriorityFilter = 'all' | TaskPriority;
export type SortMode = 'manual' | 'priority' | 'due' | 'recent';

export interface GoalsFilters {
  status: StatusFilter;
  priority: PriorityFilter;
  tagId: string | null;
  search: string;
  sort: SortMode;
}

const DEFAULT: GoalsFilters = {
  status: 'all',
  priority: 'all',
  tagId: null,
  search: '',
  sort: 'manual',
};

const STORAGE_KEY = 'jarvnote:goals:filters';

function readFilters(): GoalsFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT, ...parsed };
  } catch { return DEFAULT; }
}

/**
 * Stateful filter set + an `apply()` helper that returns the filtered+sorted
 * subset of tasks. Persisted across sessions.
 */
export function useGoalsFilters() {
  const [filters, setFilters] = useState<GoalsFilters>(readFilters);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const set = useCallback(<K extends keyof GoalsFilters>(key: K, value: GoalsFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);
  const reset = useCallback(() => setFilters(DEFAULT), []);

  const apply = useMemo(() => (tasks: Task[]) => applyGoalsFilters(tasks, filters), [filters]);

  return { filters, set, reset, apply };
}

/** Pure filter+sort. Exported for unit testing without React. */
export function applyGoalsFilters(tasks: Task[], filters: GoalsFilters): Task[] {
  const q = filters.search.trim().toLowerCase();
  let out = tasks.filter((t) => {
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.tagId && !t.tags.some((tg) => tg.id === filters.tagId)) return false;
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    return true;
  });
  switch (filters.sort) {
    case 'priority': {
      const order: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
      out = [...out].sort((a, b) => order[a.priority] - order[b.priority]);
      break;
    }
    case 'due':
      out = [...out].sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });
      break;
    case 'recent':
      out = [...out].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      break;
    case 'manual':
    default:
      out = [...out].sort((a, b) => a.order - b.order);
  }
  return out;
}
