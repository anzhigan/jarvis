import type { Routine, RoutineEntry } from '../../../api/types';

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / (1000 * 60 * 60 * 24));
}

/** Returns N days back from today inclusive — calendar order, oldest first. */
export function lastNDays(n: number, today: Date = new Date()): Date[] {
  const t = startOfDay(today);
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(t, -i));
  return out;
}

/** Map entries by ymd date for O(1) lookup. */
export function entriesByDate(entries: RoutineEntry[] = []): Map<string, RoutineEntry> {
  const m = new Map<string, RoutineEntry>();
  for (const e of entries) m.set(e.date, e);
  return m;
}

/** Cell tone for the routine grid — drives the `hg-cell-{state}` styling so
 *  the line strip and the expanded month calendar render identically. */
export type CellState = 'done' | 'partial' | 'skipped' | 'empty';
export function cellState(
  routine: Routine, entry: RoutineEntry | undefined,
): CellState {
  // A null value means the row exists only to carry a note — the day itself
  // has no status, so it reads exactly like a day with no row at all.
  if (!entry || entry.value === null) return 'empty';
  if (entry.value === 0) return 'skipped';
  if (routine.kind === 'numeric' && routine.target_value && entry.value < routine.target_value) {
    return 'partial';
  }
  return 'done';
}

/** Heatmap cell color from value. Boolean: full or empty. Numeric: 4-step ramp. */
export function cellColor(routine: Routine, value: number, baseColor: string): string {
  if (routine.kind === 'boolean') {
    return value > 0 ? baseColor : 'var(--bg-hover)';
  }
  // Numeric: ramp 4 levels.
  const target = routine.target_value ?? 1;
  if (value <= 0) return 'var(--bg-hover)';
  const ratio = Math.min(1, value / target);
  const op = ratio < 0.25 ? 0.25 : ratio < 0.5 ? 0.5 : ratio < 0.85 ? 0.75 : 1;
  // mix with bg-card by alpha emulation via box-shadow not available; we cheat with rgba
  const m = baseColor.match(/^#([0-9a-f]{6})$/i);
  if (!m) return baseColor;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${op})`;
}

/** Compute current streak of consecutive completed days ending today (or yesterday if today is unscheduled). */
export function currentStreak(routine: Routine): number {
  const map = entriesByDate(routine.entries ?? []);
  const today = startOfDay(new Date());
  let count = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDays(today, -i);
    const e = map.get(ymd(d));
    const completed = !!e && (e.value ?? 0) > 0;
    if (completed) count++;
    else if (i > 0) break;
    else continue; // today unfinished doesn't break the streak
  }
  return count;
}

/** Completion rate over last `windowDays`. */
export function completionRate(routine: Routine, windowDays = 30): number {
  const map = entriesByDate(routine.entries ?? []);
  const today = startOfDay(new Date());
  let total = 0, done = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(today, -i);
    if (routine.start_date && diffDays(d, new Date(routine.start_date)) < 0) continue;
    if (routine.end_date && diffDays(new Date(routine.end_date), d) < 0) continue;
    if (!isScheduledOn(routine, d)) continue;
    total++;
    const e = map.get(ymd(d));
    if (e && (e.value ?? 0) > 0) done++;
  }
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

/** Whether a routine is scheduled on a given date based on schedule_type. */
export function isScheduledOn(routine: Routine, d: Date): boolean {
  if (routine.is_paused) return false;
  if (routine.start_date && diffDays(d, new Date(routine.start_date)) < 0) return false;
  if (routine.end_date && diffDays(new Date(routine.end_date), d) < 0) return false;
  switch (routine.schedule_type) {
    case 'daily': return true;
    case 'weekly_on_days': {
      const days = (routine.schedule_days || '').split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
      return days.includes(d.getDay());
    }
    case 'every_n_days': {
      if (!routine.start_date) return true;
      const delta = diffDays(d, new Date(routine.start_date));
      const n = Math.max(1, routine.schedule_n_days || 1);
      return delta >= 0 && delta % n === 0;
    }
    case 'times_per_week':
      // For heatmap purposes treat any day as scheduled; rate counts within-period.
      return true;
    default: return true;
  }
}

/** Plain-language schedule label. */
export function scheduleLabel(routine: Routine): string {
  switch (routine.schedule_type) {
    case 'daily': return 'Every day';
    case 'weekly_on_days': {
      const days = (routine.schedule_days || '').split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
      const labels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return days.map((d) => labels[d]).join(' · ') || 'Weekly';
    }
    case 'every_n_days': return `Every ${routine.schedule_n_days || 2} days`;
    case 'times_per_week': return `${routine.schedule_count_per_period}× per ${routine.schedule_period}`;
    default: return '';
  }
}
