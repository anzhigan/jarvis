import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { routinesApi, tagsApi, tasksApi } from '../../../api/client';
import type { Routine, Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import { addDays, currentStreak, completionRate, ymd, startOfDay } from '../../routines/lib/heatmap';

export type PeriodKey = '7d' | '30d' | '90d' | '365d' | 'all';

export const PERIOD_DAYS: Record<PeriodKey, number> = {
  '7d':  7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
  'all': 365,
};

export interface KPI {
  key: 'goals_done' | 'routines_logged' | 'streaks' | 'today_rate';
  label: string;
  value: string;
  foot: string;
  color: string;
}

export interface ActivityPoint {
  date: string;       // ymd
  label: string;      // "May 1"
  goals: number;
  routines: number;
}

export interface StatusSlice {
  status: TaskStatus;
  label: string;
  count: number;
  color: string;
}

export interface GoalProgressRow {
  task: Task;
  pct: number;
  steps: { done: number; total: number };
  routines: number;
  due: string | null;
  overdue: boolean;
}

export interface StreakRow {
  routine: Routine;
  streak: number;
  rate: number;
}

export interface TagRow {
  tag: Tag;
  count: number;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  active:  'Active',
  paused:  'Paused',
  backlog: 'Backlog',
  done:    'Done',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  active:  'var(--accent-goals)',
  paused:  'var(--fg-faint)',
  backlog: 'var(--accent-sprints)',
  done:    'var(--accent-routines)',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
};

/**
 * Loads everything Analytics needs in one place and exposes pre-computed,
 * memoised derivations. UI components consume slices via destructuring.
 *
 * Period state is held inside the hook so it can drive the same data load
 * and recomputations — switching the period segmented control re-derives
 * without any extra fetches.
 */
export function useAnalytics() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>(
    () => (localStorage.getItem('jarvnote:analytics:period') as PeriodKey) || '30d',
  );

  useEffect(() => { localStorage.setItem('jarvnote:analytics:period', period); }, [period]);

  const refresh = useCallback(async () => {
    try {
      const [t, r, tg] = await Promise.all([
        tasksApi.list(),
        routinesApi.list(),
        tagsApi.list(),
      ]);
      setTasks(t); setRoutines(r); setTags(tg);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load analytics');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derivations ──────────────────────────────────────────────────────────
  const days = PERIOD_DAYS[period];
  const today = useMemo(() => startOfDay(new Date()), []);
  const periodStart = useMemo(() => addDays(today, -(days - 1)), [today, days]);

  /** Daily completion counts (goals done + routines logged), period-aware. */
  const activity = useMemo<ActivityPoint[]>(() => {
    const out: ActivityPoint[] = [];
    const goalDoneByDay = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== 'done') continue;
      const key = ymd(new Date(t.updated_at));
      goalDoneByDay.set(key, (goalDoneByDay.get(key) ?? 0) + 1);
    }
    const routineByDay = new Map<string, number>();
    for (const r of routines) {
      for (const e of r.entries) {
        if (e.value > 0) routineByDay.set(e.date, (routineByDay.get(e.date) ?? 0) + 1);
      }
    }
    for (let i = 0; i < days; i++) {
      const d = addDays(periodStart, i);
      const key = ymd(d);
      out.push({
        date: key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        goals: goalDoneByDay.get(key) ?? 0,
        routines: routineByDay.get(key) ?? 0,
      });
    }
    return out;
  }, [tasks, routines, periodStart, days]);

  /** Year heatmap (53 cols × 7 rows ending today, column-major). */
  const yearGrid = useMemo<{ date: string; level: 0 | 1 | 2 | 3 | 4; isToday: boolean }[][]>(() => {
    const all = new Map<string, number>();
    for (const r of routines) {
      for (const e of r.entries) {
        if (e.value > 0) all.set(e.date, (all.get(e.date) ?? 0) + 1);
      }
    }
    for (const t of tasks) {
      if (t.status === 'done') {
        const key = ymd(new Date(t.updated_at));
        all.set(key, (all.get(key) ?? 0) + 1);
      }
    }
    // Last 53 weeks ending in the week containing today.
    const totalDays = 53 * 7;
    const flat: { date: Date; key: string; count: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = ymd(d);
      flat.push({ date: d, key, count: all.get(key) ?? 0 });
    }
    const max = Math.max(1, ...flat.map((x) => x.count));
    const todayKey = ymd(today);
    const cols: { date: string; level: 0 | 1 | 2 | 3 | 4; isToday: boolean }[][] = [];
    for (let c = 0; c < 53; c++) {
      const week = flat.slice(c * 7, c * 7 + 7).map((cell) => {
        const ratio = cell.count / max;
        const level: 0 | 1 | 2 | 3 | 4 = cell.count === 0 ? 0
          : ratio < 0.25 ? 1
          : ratio < 0.5  ? 2
          : ratio < 0.85 ? 3
          : 4;
        return { date: cell.key, level, isToday: cell.key === todayKey };
      });
      cols.push(week);
    }
    return cols;
  }, [routines, tasks, today]);

  const kpis = useMemo<KPI[]>(() => {
    const goalsDone = tasks.filter((t) => t.status === 'done' &&
      new Date(t.updated_at) >= periodStart).length;
    const routinesLogged = routines.reduce((acc, r) => acc + r.entries
      .filter((e) => e.value > 0 && e.date >= ymd(periodStart) && e.date <= ymd(today))
      .length, 0);
    const streaks = routines.filter((r) => !r.is_paused && currentStreak(r) >= 3).length;
    const todayKey = ymd(today);
    const scheduledToday = routines.filter((r) => !r.is_paused).length;
    const doneToday = routines.filter((r) =>
      r.entries.find((e) => e.date === todayKey && e.value > 0)
    ).length;
    const todayPct = scheduledToday === 0 ? 0 : Math.round((doneToday / scheduledToday) * 100);

    return [
      {
        key: 'goals_done', label: 'Goals completed',
        value: String(goalsDone),
        foot: `in last ${days} days`,
        color: 'var(--accent-goals)',
      },
      {
        key: 'routines_logged', label: 'Routines logged',
        value: String(routinesLogged),
        foot: 'check-ins recorded',
        color: 'var(--accent-routines)',
      },
      {
        key: 'streaks', label: 'Active streaks',
        value: String(streaks),
        foot: '3+ days running',
        color: 'var(--accent-routines-fg)',
      },
      {
        key: 'today_rate', label: "Today's rate",
        value: `${todayPct}%`,
        foot: `${doneToday} of ${scheduledToday} done`,
        color: 'var(--accent-notes)',
      },
    ];
  }, [tasks, routines, periodStart, days, today]);

  const statusDonut = useMemo<StatusSlice[]>(() => {
    const counts: Record<TaskStatus, number> = { backlog: 0, active: 0, paused: 0, done: 0 };
    for (const t of tasks) counts[t.status]++;
    return (['active', 'backlog', 'paused', 'done'] as TaskStatus[]).map((s) => ({
      status: s,
      label: STATUS_LABELS[s],
      count: counts[s],
      color: STATUS_COLORS[s],
    }));
  }, [tasks]);

  const goalProgress = useMemo<GoalProgressRow[]>(() => {
    const todayStr = ymd(today);
    return tasks
      .filter((t) => t.status !== 'backlog')
      .map<GoalProgressRow>((t) => {
        const stepsTotal = t.sprints.length;
        const stepsDone = t.sprints.filter((s) => s.is_completed).length;
        const pct = t.status === 'done' ? 100
          : stepsTotal > 0 ? Math.round((stepsDone / stepsTotal) * 100)
          : Math.round(t.progress);
        return {
          task: t,
          pct,
          steps: { done: stepsDone, total: stepsTotal },
          routines: 0,
          due: t.due_date,
          overdue: !!(t.due_date && t.due_date < todayStr && t.status !== 'done'),
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [tasks, today]);

  const topStreaks = useMemo<StreakRow[]>(() => {
    return routines
      .filter((r) => !r.is_paused)
      .map((r) => ({ routine: r, streak: currentStreak(r), rate: completionRate(r, 30) }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 8);
  }, [routines]);

  const priorityCounts = useMemo(() => {
    const counts: Record<TaskPriority, number> = { high: 0, medium: 0, low: 0 };
    for (const t of tasks) {
      if (t.status !== 'done') counts[t.priority]++;
    }
    const max = Math.max(1, counts.high, counts.medium, counts.low);
    return (['high', 'medium', 'low'] as TaskPriority[]).map((p) => ({
      priority: p,
      label: PRIORITY_LABELS[p],
      count: counts[p],
      ratio: counts[p] / max,
    }));
  }, [tasks]);

  const tagRows = useMemo<TagRow[]>(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) for (const tg of t.tags) counts.set(tg.id, (counts.get(tg.id) ?? 0) + 1);
    return tags
      .map((tg) => ({ tag: tg, count: counts.get(tg.id) ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [tags, tasks]);

  return {
    loading, refresh,
    period, setPeriod,
    kpis, activity, yearGrid, statusDonut, goalProgress, topStreaks, priorityCounts, tagRows,
  };
}

export type AnalyticsLibrary = ReturnType<typeof useAnalytics>;
