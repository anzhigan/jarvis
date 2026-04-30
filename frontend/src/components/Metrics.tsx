/**
 * Analysis page — adapted for the new model (Goals / Routines / Sprints).
 *
 * Sections:
 *  - KPI row (Active Goals, Done Goals, Routines today, Active Sprints)
 *  - Productivity trend (overall routine completion % by day)
 *  - Goal status distribution (donut)
 *  - Per-Routine 30-day execution circles
 *  - Active sprints with progress
 *  - Year heatmap of routine entries
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Loader2, Target as TargetIcon, CheckCircle2, Repeat as RepeatIcon, Zap,
  TrendingUp, TrendingDown, Minus, Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

import { tasksApi, routinesApi, focusSprintsApi } from '../api/client';
import type { Task, Routine, FocusSprint, RoutineScheduleType } from '../api/types';
import { useT } from '../store/i18n';
import PullToRefresh from './PullToRefresh';

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Same logic as backend _routine_due_on. */
function isRoutineDueOn(r: Routine, target: Date): boolean {
  if (r.is_paused) return false;
  if (r.start_date) {
    const s = new Date(r.start_date); s.setHours(0, 0, 0, 0);
    if (target < s) return false;
  }
  if (r.end_date) {
    const e = new Date(r.end_date); e.setHours(0, 0, 0, 0);
    if (target > e) return false;
  }
  switch (r.schedule_type) {
    case 'daily': return true;
    case 'weekly_on_days': {
      const dow = target.getDay();
      const allowed = (r.schedule_days || '').split(',').filter(Boolean).map((s) => parseInt(s, 10));
      return allowed.includes(dow);
    }
    case 'every_n_days': {
      const created = new Date(r.created_at); created.setHours(0, 0, 0, 0);
      const diff = Math.floor((target.getTime() - created.getTime()) / 86400000);
      return diff >= 0 && diff % Math.max(1, r.schedule_n_days) === 0;
    }
    case 'times_per_week': {
      const start = new Date(target);
      start.setDate(start.getDate() - target.getDay());
      const startMs = start.getTime();
      const targetMs = target.getTime();
      const done = r.entries.filter((e) => {
        if (e.value <= 0) return false;
        const d = new Date(e.date); d.setHours(0, 0, 0, 0);
        const ms = d.getTime();
        return ms >= startMs && ms <= targetMs;
      }).length;
      return done < r.schedule_count_per_period;
    }
  }
  return false;
}

function scheduleLabel(t: RoutineScheduleType): string {
  return { daily: 'daily', weekly_on_days: 'weekdays', every_n_days: 'every N days', times_per_week: 'X×/week' }[t];
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, color = 'text-primary',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="p-4 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Per-Routine 30-day grid (now circles!) ──────────────────────────────────

function PerRoutineGrid({ routines }: { routines: Routine[] }) {
  if (routines.length === 0) {
    return (
      <div className="p-6 bg-card border border-border rounded-xl text-center text-muted-foreground">
        <RepeatIcon size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No routines yet. Create some on the Routines page.</p>
      </div>
    );
  }

  const today = todayDate();
  const DAYS = 30;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <RepeatIcon size={14} className="text-primary" />
            Daily habits — last {DAYS} days
          </h3>
          <p className="text-xs text-muted-foreground">Each row is a routine. Today on the left.</p>
        </div>
      </div>

      <div className="space-y-3 overflow-x-auto">
        {routines.map((r) => {
          const created = new Date(r.created_at);
          created.setHours(0, 0, 0, 0);
          const entryMap = new Map<string, number>();
          for (const e of r.entries) entryMap.set(e.date, e.value);

          // LEFT = today, RIGHT = past — same as Routines streak
          const cells: { date: string; value: number; isToday: boolean; before: boolean; due: boolean }[] = [];
          for (let i = 0; i < DAYS; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = dateIso(d);
            cells.push({
              date: key,
              value: entryMap.get(key) ?? 0,
              isToday: i === 0,
              before: d < created,
              due: isRoutineDueOn(r, d),
            });
          }
          const eligible = cells.filter((c) => !c.before && c.due).length;
          const done = cells.filter((c) => !c.before && c.value > 0).length;

          return (
            <div key={r.id} className="flex items-center gap-3">
              <div className="w-32 md:w-40 flex-shrink-0 min-w-0">
                <div className="text-xs font-medium truncate flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="truncate">{r.title}</span>
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                  <span>{scheduleLabel(r.schedule_type)}</span>
                  {!r.is_paused && eligible > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-foreground">{done}/{eligible}</span>
                    </>
                  )}
                  {r.is_paused && <span className="text-amber-600 dark:text-amber-400">paused</span>}
                </div>
              </div>
              {/* Circles (matches Go DailyStreak style) */}
              <div className="flex gap-1 items-center min-w-0">
                {cells.map((c) => {
                  let cls = 'bg-muted/40';
                  let inner: React.ReactNode = null;
                  let style: React.CSSProperties | undefined;
                  if (c.before) cls = 'bg-muted/20';
                  else if (c.value > 0) {
                    cls = '';
                    inner = <span className="text-white text-[8px]">✓</span>;
                    style = { backgroundColor: r.color };
                  } else if (c.isToday) cls = 'bg-card border-2 border-primary';
                  else if (c.due) cls = 'bg-rose-400/40 dark:bg-rose-600/30';
                  else cls = 'bg-muted/30';
                  return (
                    <div
                      key={c.date}
                      title={`${c.date}${c.before ? ' — before start' : (c.value > 0 ? ' — done' : c.due ? ' — missed' : ' — not due')}`}
                      className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${cls} ${c.isToday ? 'scale-110' : ''}`}
                      style={style}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-muted-foreground mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-emerald-500" /> done
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-rose-400/40 dark:bg-rose-600/30" /> missed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-muted/30" /> not due
        </span>
      </div>
    </div>
  );
}

// ─── Productivity Trend ──────────────────────────────────────────────────────

function ProductivityTrend({ routines }: { routines: Routine[] }) {
  // For each day, compute overall % AND per-routine done (1=done, 0=not, -1=not due)
  const data = useMemo(() => {
    const today = todayDate();
    const points: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dKey = dateIso(d);
      let dueCount = 0;
      let doneCount = 0;
      const point: any = { date: `${d.getMonth() + 1}/${d.getDate()}` };
      for (const r of routines) {
        const created = new Date(r.created_at);
        created.setHours(0, 0, 0, 0);
        if (d < created) {
          point[`r_${r.id}`] = null;
          continue;
        }
        if (!isRoutineDueOn(r, d)) {
          point[`r_${r.id}`] = null;
          continue;
        }
        dueCount += 1;
        const entry = r.entries.find((e) => e.date === dKey);
        const isDone = entry && entry.value > 0;
        if (isDone) doneCount += 1;
        // For per-routine line: cumulative completion rate (last 7 days)
        // Or just done = 100, not done = 0
        point[`r_${r.id}`] = isDone ? 100 : 0;
      }
      point.pct = dueCount > 0 ? Math.round(100 * doneCount / dueCount) : 0;
      point.done = doneCount;
      point.total = dueCount;
      points.push(point);
    }
    return points;
  }, [routines]);

  const recentAvg = data.slice(-7).reduce((s, d) => s + d.pct, 0) / 7;
  const olderAvg = data.slice(0, 7).reduce((s, d) => s + d.pct, 0) / 7;
  const trend = recentAvg > olderAvg + 5 ? 'up' : recentAvg < olderAvg - 5 ? 'down' : 'flat';

  // Top routines to show as separate lines (limit to 4 to avoid clutter)
  const topRoutines = useMemo(() => routines.filter((r) => !r.is_paused).slice(0, 4), [routines]);

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Productivity trend</h3>
          <p className="text-xs text-muted-foreground">Overall % + individual habits (30 days)</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          {trend === 'up' && <><TrendingUp size={14} className="text-emerald-500" /><span className="text-emerald-500 font-medium">{Math.round(recentAvg)}%</span></>}
          {trend === 'down' && <><TrendingDown size={14} className="text-rose-500" /><span className="text-rose-500 font-medium">{Math.round(recentAvg)}%</span></>}
          {trend === 'flat' && <><Minus size={14} className="text-muted-foreground" /><span className="text-muted-foreground font-medium">{Math.round(recentAvg)}%</span></>}
          <span className="text-muted-foreground">last 7d avg</span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
            <defs>
              <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={4} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '12px' }}
              formatter={(v: number, _: string, ctx: any) => [`${v}% (${ctx.payload.done}/${ctx.payload.total})`, 'Done']}
            />
            {/* Per-routine subtle lines */}
            {topRoutines.map((r) => (
              <Area
                key={r.id}
                type="monotone"
                dataKey={`r_${r.id}`}
                stroke={r.color}
                strokeWidth={1}
                strokeOpacity={0.5}
                fill="none"
                connectNulls={false}
                dot={false}
              />
            ))}
            {/* Main overall line */}
            <Area type="monotone" dataKey="pct" stroke="var(--primary)" strokeWidth={2.5} fill="url(#prodFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {topRoutines.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px]">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-0.5 bg-primary rounded" />
            <span className="text-muted-foreground font-medium">Overall</span>
          </span>
          {topRoutines.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1">
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: r.color, opacity: 0.6 }} />
              <span className="text-muted-foreground truncate max-w-[80px]">{r.title}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goal status distribution ────────────────────────────────────────────────

function GoalDistribution({ goals }: { goals: Task[] }) {
  const data = useMemo(() => {
    const counts = { backlog: 0, active: 0, paused: 0, done: 0 };
    for (const g of goals) {
      const k = g.status as keyof typeof counts;
      if (k in counts) counts[k] += 1;
      else counts.backlog += 1;
    }
    return [
      { name: 'Backlog', value: counts.backlog, color: '#94a3b8' },
      { name: 'Active', value: counts.active, color: '#4f46e5' },
      { name: 'Paused', value: counts.paused, color: '#f59e0b' },
      { name: 'Done', value: counts.done, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [goals]);

  if (data.length === 0) {
    return (
      <div className="p-5 bg-card border border-border rounded-xl text-center text-muted-foreground">
        <TargetIcon size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No goals yet.</p>
      </div>
    );
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold mb-3">Goals by status</h3>
      <div className="flex items-center gap-4">
        <div className="w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={35} outerRadius={55} paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span>{d.name}</span>
              </div>
              <span className="font-medium">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Active timeline (timeline of active goals + sprints with dates) ─────────

function ActiveTimeline({ goals, sprints }: { goals: Task[]; sprints: FocusSprint[] }) {
  const today = todayDate();
  const activeGoals = goals.filter((g) => g.status === 'active' && (g.start_date || g.due_date));
  const activeSprints = sprints.filter((s) => {
    const e = new Date(s.end_date); e.setHours(0, 0, 0, 0);
    return e >= today;
  });

  if (activeGoals.length === 0 && activeSprints.length === 0) {
    return null;
  }

  // Compute a visual range — 30 days back, 60 days forward
  const rangeStart = new Date(today); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(today); rangeEnd.setDate(rangeEnd.getDate() + 60);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  type Item = { id: string; title: string; color: string; start: Date; end: Date; type: 'goal' | 'sprint' };
  const items: Item[] = [];
  for (const g of activeGoals) {
    const start = g.start_date ? new Date(g.start_date) : today;
    const end = g.due_date ? new Date(g.due_date) : new Date(today.getTime() + 7 * 86400000);
    items.push({ id: g.id, title: g.title, color: '#4f46e5', start, end, type: 'goal' });
  }
  for (const s of activeSprints) {
    items.push({ id: s.id, title: s.title, color: s.color, start: new Date(s.start_date), end: new Date(s.end_date), type: 'sprint' });
  }

  // Sort by start date
  items.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Build day labels for header (every 7 days)
  const dayLabels: { offset: number; label: string }[] = [];
  for (let d = 0; d <= 60; d += 7) {
    const dt = new Date(today); dt.setDate(dt.getDate() + d);
    const offset = ((dt.getTime() - rangeStart.getTime()) / totalMs) * 100;
    dayLabels.push({ offset, label: fmtDay(dt) });
  }

  const todayPct = ((today.getTime() - rangeStart.getTime()) / totalMs) * 100;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold mb-3">Active timeline</h3>

      {/* Header with date labels */}
      <div className="relative h-5 mb-2 text-[10px] text-muted-foreground">
        {dayLabels.map((dl, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${dl.offset}%` }}
          >
            {dl.label}
          </span>
        ))}
      </div>

      <div className="relative space-y-1.5">
        {/* Today indicator */}
        <div
          className="absolute top-0 bottom-0 w-px bg-primary z-10"
          style={{ left: `${todayPct}%` }}
        >
          <span className="absolute -top-4 -translate-x-1/2 text-[9px] font-semibold text-primary">today</span>
        </div>

        {items.map((it) => {
          const startMs = Math.max(it.start.getTime(), rangeStart.getTime());
          const endMs = Math.min(it.end.getTime(), rangeEnd.getTime());
          if (endMs < startMs) return null;
          const left = ((startMs - rangeStart.getTime()) / totalMs) * 100;
          const width = ((endMs - startMs) / totalMs) * 100;
          return (
            <div key={`${it.type}-${it.id}`} className="relative h-7">
              <div
                className="absolute h-7 rounded-md flex items-center px-2 text-[11px] font-medium text-white truncate"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 3)}%`,
                  backgroundColor: it.color,
                  opacity: 0.9,
                }}
                title={`${it.type === 'sprint' ? '⚡ ' : '🎯 '}${it.title} (${dateIso(it.start)} → ${dateIso(it.end)})`}
              >
                <span className="truncate">{it.title}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Active sprints list ─────────────────────────────────────────────────────

function ActiveSprintsCard({ sprints }: { sprints: FocusSprint[] }) {
  const today = dateIso(todayDate());
  const active = useMemo(
    () => sprints.filter((s) => s.start_date <= today && s.end_date >= today),
    [sprints, today]
  );

  if (active.length === 0) {
    return (
      <div className="p-5 bg-card border border-border rounded-xl text-center text-muted-foreground">
        <Zap size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No active sprints.</p>
      </div>
    );
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold mb-3">Active sprints</h3>
      <div className="space-y-2.5">
        {active.map((s) => {
          const start = new Date(s.start_date);
          const end = new Date(s.end_date);
          const total = (end.getTime() - start.getTime()) / 86400000 + 1;
          const elapsed = (todayDate().getTime() - start.getTime()) / 86400000 + 1;
          const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
          const counts = { goal: 0, step: 0, go: 0, routine: 0 };
          for (const it of s.items) counts[it.item_type] = (counts[it.item_type] || 0) + 1;

          return (
            <div key={s.id} className="border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-1 h-4 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium flex-1 truncate">{s.title}</span>
                <span className="text-[10px] text-muted-foreground">{Math.round(pct)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: s.color }} />
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {counts.goal > 0 && <span>🎯 {counts.goal}</span>}
                {counts.step > 0 && <span>✓ {counts.step}</span>}
                {counts.go > 0 && <span>⊚ {counts.go}</span>}
                {counts.routine > 0 && <span>🔄 {counts.routine}</span>}
                {s.items.length === 0 && <span className="italic">empty</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Year heatmap of routine entries ─────────────────────────────────────────

function YearHeatmap({ routines }: { routines: Routine[] }) {
  const today = todayDate();
  const start = new Date(today);
  start.setDate(start.getDate() - 364);

  const entriesByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of routines) {
      for (const e of r.entries) {
        if (e.value > 0) m.set(e.date, (m.get(e.date) || 0) + 1);
      }
    }
    return m;
  }, [routines]);

  const cells = useMemo(() => {
    const list: { date: string; count: number; weekday: number; weekIdx: number }[] = [];
    let weekIdx = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = dateIso(d);
      const wd = d.getDay();
      if (i > 0 && wd === 0) weekIdx += 1;
      list.push({ date: key, count: entriesByDate.get(key) || 0, weekday: wd, weekIdx });
    }
    return list;
  }, [start, entriesByDate]);

  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const totalDone = cells.reduce((s, c) => s + (c.count > 0 ? 1 : 0), 0);

  const weeks: Record<number, typeof cells> = {};
  for (const c of cells) {
    if (!weeks[c.weekIdx]) weeks[c.weekIdx] = [];
    weeks[c.weekIdx].push(c);
  }

  function shade(count: number): string {
    if (count === 0) return 'bg-muted/40';
    const ratio = count / maxCount;
    if (ratio > 0.66) return 'bg-emerald-500';
    if (ratio > 0.33) return 'bg-emerald-500/70';
    return 'bg-emerald-500/40';
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Year activity</h3>
        <span className="text-xs text-muted-foreground">{totalDone} active days</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[2px]" style={{ minWidth: '720px' }}>
          {Object.entries(weeks).map(([wkIdx, week]) => (
            <div key={wkIdx} className="flex flex-col gap-[2px]">
              {Array.from({ length: 7 }).map((_, day) => {
                const cell = week.find((c) => c.weekday === day);
                if (!cell) return <div key={day} className="w-2.5 h-2.5" />;
                return (
                  <div
                    key={day}
                    title={`${cell.date}: ${cell.count} routine${cell.count !== 1 ? 's' : ''} done`}
                    className={`w-2.5 h-2.5 rounded-sm ${shade(cell.count)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Analysis() {
  useT();
  const [goals, setGoals] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sprints, setSprints] = useState<FocusSprint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [g, r, s] = await Promise.all([
        tasksApi.list(),
        routinesApi.list(),
        focusSprintsApi.list(),
      ]);
      setGoals(g);
      setRoutines(r);
      setSprints(s);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, []);

  const today = dateIso(todayDate());

  const kpis = useMemo(() => {
    const activeGoals = goals.filter((g) => g.status === 'active').length;
    const doneGoals = goals.filter((g) => g.status === 'done').length;
    const dueToday = routines.filter((r) => isRoutineDueOn(r, todayDate())).length;
    const doneTodayCount = routines.filter((r) => {
      if (r.is_paused) return false;
      const e = r.entries.find((x) => x.date === today);
      return e && e.value > 0;
    }).length;
    const activeSprints = sprints.filter((s) => s.start_date <= today && s.end_date >= today).length;
    return { activeGoals, doneGoals, dueToday, doneTodayCount, activeSprints };
  }, [goals, routines, sprints, today]);

  const activeRoutines = useMemo(() => routines.filter((r) => !r.is_paused), [routines]);

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={load}>
      <div className="size-full">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="mb-5">
            <h1 className="text-xl font-semibold">Analysis</h1>
          </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard
            label="Active goals"
            value={kpis.activeGoals}
            sub={`${kpis.doneGoals} done`}
            icon={<TargetIcon size={16} />}
          />
          <KpiCard
            label="Done goals"
            value={kpis.doneGoals}
            sub={`out of ${goals.length}`}
            icon={<CheckCircle2 size={16} />}
            color="text-emerald-500"
          />
          <KpiCard
            label="Routines today"
            value={`${kpis.doneTodayCount}/${kpis.dueToday}`}
            sub="completed"
            icon={<RepeatIcon size={16} />}
            color="text-violet-500"
          />
          <KpiCard
            label="Active sprints"
            value={kpis.activeSprints}
            sub={`${sprints.length} total`}
            icon={<Zap size={16} />}
            color="text-amber-500"
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <ProductivityTrend routines={activeRoutines} />
          <GoalDistribution goals={goals} />
        </div>

        {/* Active timeline */}
        <div className="mb-3">
          <ActiveTimeline goals={goals} sprints={sprints} />
        </div>

        {/* Per-routine grid full width */}
        <div className="mb-3">
          <PerRoutineGrid routines={activeRoutines} />
        </div>

        {/* Active sprints */}
        <div className="mb-3">
          <ActiveSprintsCard sprints={sprints} />
        </div>

        {/* Year heatmap */}
        <div className="mb-3">
          <YearHeatmap routines={routines} />
        </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
