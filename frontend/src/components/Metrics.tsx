/**
 * Analysis page — layout matches DESIGN_REFERENCE.html "Analysis" screen.
 *
 * Sections:
 *  - Period selector (Week / Month / Quarter / Year)
 *  - KPI row (5 cards)
 *  - section-row: analysis-grid (2×2) + right-panel
 *  - Below: per-routine habits grid, active timeline, sprints, year heatmap
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Loader2, Target as TargetIcon, Repeat as RepeatIcon, Zap,
  TrendingUp, TrendingDown, Minus, Flame,
} from 'lucide-react';
import { toast } from 'sonner';

import { tasksApi, routinesApi, sprintsApi, resolveUrl } from '../api/client';
import type { Task, Routine, Sprint, RoutineScheduleType } from '../api/types';
import { useT } from '../store/i18n';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAuthStore } from '../store/auth';
import PullToRefresh from './PullToRefresh';

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year';

function periodDays(p: Period): number {
  return { week: 7, month: 30, quarter: 90, year: 365 }[p];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatShortDate(iso: string): string {
  const d = new Date(iso);
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

/** Compute current streak for a routine (consecutive due+done days back from today). */
function computeStreak(r: Routine): number {
  const today = todayDate();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (!isRoutineDueOn(r, d)) continue;
    const key = dateIso(d);
    const done = r.entries.some((e) => e.date === key && e.value > 0);
    if (done) {
      streak++;
    } else if (i === 0) {
      // Today not done yet — don't break streak
    } else {
      break;
    }
  }
  return streak;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, trend, trendDir = 'neutral', icon, color = 'var(--fg-tertiary)',
}: {
  label: string;
  value: string | number;
  trend?: string;
  trendDir?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between" style={{ marginBottom: 2 }}>
        <span className="kpi-label">{label}</span>
        <span style={{ opacity: 0.6, color }}>{icon}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {trend && (
        <div
          className="kpi-trend"
          data-trend={trendDir === 'positive' ? undefined : trendDir === 'negative' ? 'negative' : 'neutral'}
        >
          {trend}
        </div>
      )}
    </div>
  );
}

// ─── Productivity Trend ──────────────────────────────────────────────────────

function ProductivityTrend({ routines, days }: { routines: Routine[]; days: number }) {
  const data = useMemo(() => {
    const today = todayDate();
    const points: any[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dKey = dateIso(d);
      let dueCount = 0, doneCount = 0;
      for (const r of routines) {
        const created = new Date(r.created_at);
        created.setHours(0, 0, 0, 0);
        if (d < created || !isRoutineDueOn(r, d)) continue;
        dueCount++;
        const entry = r.entries.find((e) => e.date === dKey);
        if (entry && entry.value > 0) doneCount++;
      }
      points.push({
        date: days <= 30 ? `${d.getMonth() + 1}/${d.getDate()}` : fmtDay(d),
        pct: dueCount > 0 ? Math.round(100 * doneCount / dueCount) : 0,
        done: doneCount,
        total: dueCount,
      });
    }
    return points;
  }, [routines, days]);

  const recentAvg = data.slice(-7).reduce((s, d) => s + d.pct, 0) / 7;
  const olderAvg = data.slice(0, 7).reduce((s, d) => s + d.pct, 0) / 7;
  const trend = recentAvg > olderAvg + 5 ? 'up' : recentAvg < olderAvg - 5 ? 'down' : 'flat';

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Productivity trend</span>
        <div className="flex items-center gap-1" style={{ fontSize: 10.5 }}>
          {trend === 'up' && <><TrendingUp size={13} style={{ color: 'var(--success)' }} /><span style={{ color: 'var(--success)', fontWeight: 500 }}>{Math.round(recentAvg)}%</span></>}
          {trend === 'down' && <><TrendingDown size={13} style={{ color: 'var(--danger)' }} /><span style={{ color: 'var(--danger)', fontWeight: 500 }}>{Math.round(recentAvg)}%</span></>}
          {trend === 'flat' && <><Minus size={13} style={{ color: 'var(--fg-muted)' }} /><span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{Math.round(recentAvg)}%</span></>}
          <span className="chart-meta">last 7d avg</span>
        </div>
      </div>
      <p className="chart-meta" style={{ marginBottom: 10 }}>Overall completion % ({days} days)</p>
      <div style={{ height: 90 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="analysisFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-analysis)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--accent-analysis)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--fg-muted)' }} interval={Math.floor(days / 5)} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--fg-muted)' }} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--bg-elevated)', boxShadow: 'var(--sh-popover)', borderRadius: 'var(--r-control)', fontSize: '12px', border: 'none' }}
              formatter={(v: number, _: string, ctx: any) => [`${v}% (${ctx.payload.done}/${ctx.payload.total})`, 'Done']}
            />
            <Area type="monotone" dataKey="pct" stroke="var(--accent-analysis)" strokeWidth={2} fill="url(#analysisFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Routine completion by day of week ───────────────────────────────────────

function RoutineCompletionByDay({ routines }: { routines: Routine[] }) {
  const data = useMemo(() => {
    const today = todayDate();
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const key = dateIso(d);
      let due = 0, done = 0;
      for (const r of routines) {
        if (!isRoutineDueOn(r, d)) continue;
        due++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
      }
      const pct = due > 0 ? Math.round(100 * done / due) : 0;
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      return { label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow], pct, done, due, isToday: i === 6, isWeekend };
    });
  }, [routines]);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Routine completion</span>
        <span className="chart-meta">by day</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'end', height: 70, gap: 8, paddingTop: 12 }}>
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.done}/${d.due} (${d.pct}%)`}
            style={{
              flex: 1,
              height: `${Math.max(4, d.pct * 0.9)}%`,
              borderRadius: 3,
              background: d.isToday
                ? 'var(--accent-analysis)'
                : d.pct === 0 && d.due === 0
                  ? 'rgba(0,0,0,0.06)'
                  : d.isWeekend
                    ? 'rgba(29,158,117,0.5)'
                    : 'var(--success)',
              transition: 'height 300ms ease-out',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-muted)', marginTop: 5 }}>
        {data.map((d, i) => <span key={i}>{d.label}</span>)}
      </div>
    </div>
  );
}

// ─── Goal status distribution ─────────────────────────────────────────────────

function GoalDistribution({ goals }: { goals: Task[] }) {
  const data = useMemo(() => {
    const counts = { backlog: 0, active: 0, paused: 0, done: 0 };
    for (const g of goals) {
      const k = g.status as keyof typeof counts;
      if (k in counts) counts[k] += 1;
      else counts.backlog += 1;
    }
    return [
      { name: 'Active', value: counts.active, color: 'var(--accent-notes)' },
      { name: 'Backlog', value: counts.backlog, color: 'var(--fg-muted)' },
      { name: 'Paused', value: counts.paused, color: 'var(--accent-goals)' },
      { name: 'Done', value: counts.done, color: 'var(--success)' },
    ].filter((d) => d.value > 0);
  }, [goals]);

  if (data.length === 0) {
    return (
      <div className="chart-card" style={{ textAlign: 'center', color: 'var(--fg-muted)' }}>
        <TargetIcon size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No goals yet.</p>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Goals by status</span>
        <span className="chart-meta">distribution</span>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <div style={{ width: 80, height: 80, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={25} outerRadius={38} paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11 }}>
          {data.map((d) => (
            <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', width: 120, margin: '3px 0', gap: 8 }}>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--fg-secondary)' }}>
                <span style={{ width: 8, height: 8, background: d.color, borderRadius: 2, flexShrink: 0 }} />
                {d.name}
              </span>
              <span style={{ color: 'var(--fg-muted)' }}>{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Period comparison ────────────────────────────────────────────────────────

function PeriodComparison({ routines, days }: { routines: Routine[]; days: number }) {
  const { thisP, prevP } = useMemo(() => {
    const today = todayDate();

    const stats = (startOff: number, endOff: number) => {
      let due = 0, done = 0;
      for (let i = startOff; i <= endOff; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = dateIso(d);
        for (const r of routines) {
          if (!isRoutineDueOn(r, d)) continue;
          due++;
          if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
        }
      }
      return { due, done, consistency: due > 0 ? Math.round(100 * done / due) : 0 };
    };

    return { thisP: stats(0, days - 1), prevP: stats(days, 2 * days - 1) };
  }, [routines, days]);

  const rows = [
    {
      label: 'Routines done',
      this: thisP.done,
      prev: prevP.done,
      fmt: (v: number) => String(v),
    },
    {
      label: 'Consistency',
      this: thisP.consistency,
      prev: prevP.consistency,
      fmt: (v: number) => `${v}%`,
    },
    {
      label: 'Due sessions',
      this: thisP.due,
      prev: prevP.due,
      fmt: (v: number) => String(v),
    },
  ];

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">This period vs last</span>
        <span className="chart-meta">change</span>
      </div>
      <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
        {rows.map((row, i) => {
          const change = row.this - row.prev;
          const isPos = change > 0;
          const isNeg = change < 0;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                boxShadow: i < rows.length - 1 ? 'inset 0 -0.5px 0 var(--line-faint)' : undefined,
              }}
            >
              <span style={{ color: 'var(--fg-secondary)' }}>{row.label}</span>
              <span style={{ color: isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--fg-muted)', fontWeight: 500 }}>
                {isPos ? '+' : ''}{row.fmt(change)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Right panel — Productivity insight ──────────────────────────────────────

function ProductivityInsight({ routines }: { routines: Routine[] }) {
  const insight = useMemo(() => {
    const today = todayDate();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDow: { sum: number; count: number }[] = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateIso(d);
      const dow = d.getDay();
      let due = 0, done = 0;
      for (const r of routines) {
        if (!isRoutineDueOn(r, d)) continue;
        due++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
      }
      if (due > 0) {
        byDow[dow].sum += Math.round(100 * done / due);
        byDow[dow].count++;
      }
    }

    let bestDow = -1, bestAvg = -1;
    byDow.forEach((b, i) => {
      if (b.count > 0) {
        const avg = Math.round(b.sum / b.count);
        if (avg > bestAvg) { bestAvg = avg; bestDow = i; }
      }
    });

    if (bestDow === -1) return 'Keep logging your routines to unlock productivity insights.';
    return `Best completion on ${dayNames[bestDow]} — ${bestAvg}% average over the past 30 days. Block your key habits on this day.`;
  }, [routines]);

  return (
    <div className="panel-card">
      <div className="panel-head">Productivity insight</div>
      <p className="panel-prose">{insight}</p>
    </div>
  );
}

// ─── Right panel — Most productive days ──────────────────────────────────────

function MostProductiveDays({ routines }: { routines: Routine[] }) {
  const days = useMemo(() => {
    const today = todayDate();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDow: { sum: number; count: number; name: string }[] = Array.from({ length: 7 }, (_, i) => ({
      sum: 0, count: 0, name: dayNames[i],
    }));

    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateIso(d);
      const dow = d.getDay();
      let due = 0, done = 0;
      for (const r of routines) {
        if (!isRoutineDueOn(r, d)) continue;
        due++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
      }
      if (due > 0) {
        byDow[dow].sum += Math.round(100 * done / due);
        byDow[dow].count++;
      }
    }

    return byDow
      .map((b, i) => ({ name: b.name, avg: b.count > 0 ? Math.round(b.sum / b.count) : 0, count: b.count }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);
  }, [routines]);

  if (days.length === 0) return null;

  return (
    <div className="panel-card">
      <div className="panel-head">Most productive days</div>
      {days.map((d) => (
        <div key={d.name} className="panel-row">
          <span className="panel-row-title">{d.name}</span>
          <span className="panel-row-meta">{d.avg}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Right panel — Top streaks ────────────────────────────────────────────────

function TopStreaks({ routines }: { routines: Routine[] }) {
  const top = useMemo(() => {
    return routines
      .map((r) => ({ title: r.title, streak: computeStreak(r), color: r.color }))
      .filter((r) => r.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 4);
  }, [routines]);

  if (top.length === 0) return null;

  return (
    <div className="panel-card">
      <div className="panel-head">Top streaks</div>
      {top.map((r) => (
        <div key={r.title} className="panel-row">
          <span className="dot" style={{ backgroundColor: r.color }} />
          <span className="panel-row-title">{r.title}</span>
          <span className="panel-row-meta">{r.streak}d</span>
        </div>
      ))}
    </div>
  );
}

// ─── Per-Routine 30-day grid ──────────────────────────────────────────────────

function PerRoutineGrid({ routines }: { routines: Routine[] }) {
  if (routines.length === 0) {
    return (
      <div className="chart-card" style={{ textAlign: 'center', color: 'var(--fg-muted)' }}>
        <RepeatIcon size={28} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No routines yet. Create some on the Routines page.</p>
      </div>
    );
  }

  const today = todayDate();
  const DAYS = 30;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RepeatIcon size={14} style={{ color: 'var(--accent-routines)' }} />
          Daily habits — last {DAYS} days
        </span>
        <span className="chart-meta">Today on the left</span>
      </div>

      <div className="space-y-3 overflow-x-auto">
        {routines.map((r) => {
          const created = new Date(r.created_at);
          created.setHours(0, 0, 0, 0);
          const entryMap = new Map<string, number>();
          for (const e of r.entries) entryMap.set(e.date, e.value);

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
                <div className="flex items-center gap-1.5 min-w-0" style={{ fontSize: 12, fontWeight: 500 }}>
                  <span className="flex-shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: r.color }} />
                  <span className="truncate">{r.title}</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
                  <span>{scheduleLabel(r.schedule_type)}</span>
                  {!r.is_paused && eligible > 0 && (
                    <>
                      <span>·</span>
                      <span style={{ fontWeight: 500, color: 'var(--fg-primary)' }}>{done}/{eligible}</span>
                    </>
                  )}
                  {r.is_paused && <span style={{ color: 'var(--warning)' }}>paused</span>}
                </div>
              </div>
              <div className="flex gap-1 items-center min-w-0">
                {cells.map((c) => {
                  let cellStyle: React.CSSProperties;
                  let inner: React.ReactNode = null;
                  if (c.before) cellStyle = { background: 'rgba(0,0,0,0.03)' };
                  else if (c.value > 0) {
                    cellStyle = { backgroundColor: r.color };
                    inner = <span style={{ color: 'white', fontSize: 8 }}>✓</span>;
                  } else if (c.isToday) {
                    cellStyle = { background: 'var(--bg-elevated)', boxShadow: 'inset 0 0 0 2px var(--accent-notes)' };
                  } else if (c.due) {
                    cellStyle = { background: 'rgba(188,74,72,0.20)' };
                  } else {
                    cellStyle = { background: 'rgba(0,0,0,0.05)' };
                  }
                  return (
                    <div
                      key={c.date}
                      title={`${c.date}${c.before ? ' — before start' : (c.value > 0 ? ' — done' : c.due ? ' — missed' : ' — not due')}`}
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        transition: 'all 150ms',
                        transform: c.isToday ? 'scale(1.1)' : undefined,
                        ...cellStyle,
                      }}
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

      <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 12, paddingTop: 12, boxShadow: 'inset 0 0.5px 0 var(--line)' }}>
        <span className="chart-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} /> done
        </span>
        <span className="chart-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(188,74,72,0.25)', display: 'inline-block' }} /> missed
        </span>
        <span className="chart-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(0,0,0,0.05)', display: 'inline-block' }} /> not due
        </span>
      </div>
    </div>
  );
}

// ─── Active timeline ──────────────────────────────────────────────────────────

function ActiveTimeline({ goals, sprints }: { goals: Task[]; sprints: Sprint[] }) {
  const today = todayDate();
  const activeGoals = goals.filter((g) => g.status === 'active' && (g.start_date || g.due_date));
  const activeSprints = sprints.filter((s) => {
    const e = new Date(s.end_date); e.setHours(0, 0, 0, 0);
    return e >= today;
  });

  if (activeGoals.length === 0 && activeSprints.length === 0) return null;

  const rangeStart = new Date(today); rangeStart.setDate(rangeStart.getDate() - 7);
  const rangeEnd = new Date(today); rangeEnd.setDate(rangeEnd.getDate() + 60);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  type Item = { id: string; title: string; color: string; start: Date; end: Date; type: 'goal' | 'sprint' };
  const items: Item[] = [];
  for (const g of activeGoals) {
    const start = g.start_date ? new Date(g.start_date) : today;
    const end = g.due_date ? new Date(g.due_date) : new Date(today.getTime() + 7 * 86400000);
    items.push({ id: g.id, title: g.title, color: 'var(--accent-notes)', start, end, type: 'goal' });
  }
  for (const s of activeSprints) {
    items.push({ id: s.id, title: s.title, color: s.color, start: new Date(s.start_date), end: new Date(s.end_date), type: 'sprint' });
  }
  items.sort((a, b) => a.start.getTime() - b.start.getTime());

  const dayLabels: { offset: number; label: string }[] = [];
  for (let d = 0; d <= 60; d += 7) {
    const dt = new Date(today); dt.setDate(dt.getDate() + d);
    const offset = ((dt.getTime() - rangeStart.getTime()) / totalMs) * 100;
    dayLabels.push({ offset, label: fmtDay(dt) });
  }

  const todayPct = ((today.getTime() - rangeStart.getTime()) / totalMs) * 100;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Active timeline</span>
        <span className="chart-meta">{activeGoals.length + activeSprints.length} items</span>
      </div>

      <div className="relative h-5 mb-2" style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
        {dayLabels.map((dl, i) => (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${dl.offset}%` }}>
            {dl.label}
          </span>
        ))}
      </div>

      <div className="relative space-y-1.5">
        <div className="absolute top-0 bottom-0 z-10" style={{ left: `${todayPct}%`, width: 1, background: 'var(--fg-primary)' }}>
          <span className="absolute -translate-x-1/2" style={{ top: -18, fontSize: 9, fontWeight: 600, color: 'var(--fg-primary)' }}>today</span>
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
                style={{ left: `${left}%`, width: `${Math.max(width, 3)}%`, backgroundColor: it.color, opacity: 0.9 }}
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

// ─── Active sprints list ──────────────────────────────────────────────────────

function ActiveSprintsCard({ sprints }: { sprints: Sprint[] }) {
  const today = dateIso(todayDate());
  const active = useMemo(
    () => sprints.filter((s) => s.start_date <= today && s.end_date >= today),
    [sprints, today],
  );

  if (active.length === 0) return null;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Active sprints</span>
        <span className="chart-meta">{active.length} running</span>
      </div>
      <div className="space-y-4">
        {active.map((s) => {
          const start = new Date(s.start_date);
          const end = new Date(s.end_date);
          const total = (end.getTime() - start.getTime()) / 86400000 + 1;
          const elapsed = (todayDate().getTime() - start.getTime()) / 86400000 + 1;
          const remaining = Math.max(0, total - elapsed);
          const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
          const counts = { goal: 0, step: 0, go: 0, routine: 0 };
          for (const it of s.items) counts[it.item_type] = (counts[it.item_type] || 0) + 1;

          return (
            <div key={s.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0" style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: s.color }} />
                <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: 500 }}>{s.title}</span>
                <span className="chart-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(remaining)} day{Math.round(remaining) !== 1 ? 's' : ''} left
                </span>
              </div>
              <div className="relative overflow-hidden" style={{ height: 6, background: 'rgba(0,0,0,0.07)', borderRadius: 'var(--r-pill)' }}>
                <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: s.color, borderRadius: 'var(--r-pill)', transitionDuration: '700ms' }} />
                <div className="absolute" style={{ left: `calc(${pct}% - 6px)`, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, borderRadius: 'var(--r-pill)', backgroundColor: s.color, boxShadow: `0 0 0 2px var(--bg-card)`, transition: 'all 150ms' }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>{formatShortDate(s.start_date)}</span>
                <div className="flex gap-2.5">
                  {counts.goal > 0 && <span>{counts.goal} goal{counts.goal !== 1 ? 's' : ''}</span>}
                  {counts.step > 0 && <span>{counts.step} step{counts.step !== 1 ? 's' : ''}</span>}
                  {counts.go > 0 && <span>{counts.go} go{counts.go !== 1 ? 's' : ''}</span>}
                  {counts.routine > 0 && <span>{counts.routine} routine{counts.routine !== 1 ? 's' : ''}</span>}
                </div>
                <span>{formatShortDate(s.end_date)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Year heatmap ─────────────────────────────────────────────────────────────

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
      if (i > 0 && wd === 0) weekIdx++;
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

  function shadeStyle(count: number): React.CSSProperties {
    if (count === 0) return { background: 'rgba(0,0,0,0.05)' };
    const ratio = count / maxCount;
    if (ratio > 0.66) return { background: 'var(--success)' };
    if (ratio > 0.33) return { background: 'rgba(29,158,117,0.70)' };
    return { background: 'rgba(29,158,117,0.40)' };
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">Year activity</span>
        <span className="chart-meta">{totalDone} active days</span>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-[2px]" style={{ minWidth: '720px' }}>
          {Object.entries(weeks).map(([wkIdx, week]) => (
            <div key={wkIdx} className="flex flex-col gap-[2px]">
              {Array.from({ length: 7 }).map((_, day) => {
                const cell = week.find((c) => c.weekday === day);
                if (!cell) return <div key={day} style={{ width: 10, height: 10 }} />;
                return (
                  <div
                    key={day}
                    title={`${cell.date}: ${cell.count} routine${cell.count !== 1 ? 's' : ''} done`}
                    style={{ width: 10, height: 10, borderRadius: 3, ...shadeStyle(cell.count) }}
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

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE — insight-led layout (matches design-screens.html "Analysis")
// ═══════════════════════════════════════════════════════════════════════════

function MobileHero({ thisWeek, prevAvg, topStreak }: {
  thisWeek: { done: number; due: number; pct: number };
  prevAvg: number;
  topStreak: number;
}) {
  const delta = thisWeek.pct - prevAvg;
  const headline = delta >= 12 ? `Strong week — ${delta}% above your usual pace.`
    : delta >= 4 ? `Solid week — slightly ahead of your average.`
    : delta > -4 ? `Steady week — right on your usual pace.`
    : delta > -12 ? `Quieter week — a bit below your average.`
    : `Tough week — well below your usual pace.`;

  return (
    <div
      style={{
        margin: '0 16px 12px',
        padding: 18, borderRadius: 16,
        background: 'linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--accent-notes) 8%, var(--bg-card)) 100%)',
        boxShadow: 'var(--sh-card)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute', right: -40, top: -40,
          width: 180, height: 180,
          background: 'radial-gradient(circle, color-mix(in srgb, var(--accent-notes) 18%, transparent) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-notes)' }}>
        Momentum · this week
      </div>
      <h3 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: '6px 0 4px', lineHeight: 1.25 }}>
        {headline}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--fg-tertiary)', margin: 0 }}>
        {thisWeek.done} of {thisWeek.due} due tasks completed{topStreak > 0 ? `, longest streak ${topStreak} days` : ''}.
      </p>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, position: 'relative' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {thisWeek.done}<span style={{ fontSize: 13, color: 'var(--fg-muted)', fontWeight: 500 }}>/{thisWeek.due}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Done this week</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {delta >= 0 ? '+' : ''}{delta}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>vs 4-week avg</div>
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {topStreak}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginLeft: 2 }}>d</small>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Top streak</div>
        </div>
      </div>
    </div>
  );
}

/** SVG line chart — 4-week trend, "this period" vs "previous period". */
function MobileTrendChart({ routines }: { routines: Routine[] }) {
  const data = useMemo(() => {
    const today = todayDate();
    const points = (offsetStart: number, offsetEnd: number) => {
      const arr: number[] = [];
      for (let i = offsetEnd; i >= offsetStart; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const key = dateIso(d);
        let due = 0, done = 0;
        for (const r of routines) {
          if (!isRoutineDueOn(r, d)) continue;
          due++;
          if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
        }
        arr.push(due > 0 ? Math.round(100 * done / due) : 0);
      }
      return arr;
    };
    return { current: points(0, 27), previous: points(28, 55) };
  }, [routines]);

  // Map percentage [0, 100] to SVG y-coordinate within [10, 100].
  const W = 360, H = 110;
  const yMap = (pct: number) => 100 - (pct * 0.9);
  const xMap = (i: number, len: number) => (i * W) / Math.max(1, len - 1);
  const pathFrom = (arr: number[]) => arr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xMap(i, arr.length)} ${yMap(p)}`).join(' ');
  const areaPath = (arr: number[]) => `${pathFrom(arr)} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div
      style={{
        margin: '0 16px 12px', padding: '14px 16px 10px',
        background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Productivity trend</div>
        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>4 weeks</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 130, display: 'block' }}>
        <line x1="0" y1="20" x2={W} y2="20" stroke="var(--line)" strokeDasharray="2 4" />
        <line x1="0" y1="55" x2={W} y2="55" stroke="var(--line)" strokeDasharray="2 4" />
        <line x1="0" y1="90" x2={W} y2="90" stroke="var(--line)" strokeDasharray="2 4" />

        <path d={pathFrom(data.previous)} fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeDasharray="3 3" />

        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-notes)" stopOpacity={0.30} />
            <stop offset="100%" stopColor="var(--accent-notes)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath(data.current)} fill="url(#trend-area)" />
        <path d={pathFrom(data.current)} fill="none" stroke="var(--accent-notes)" strokeWidth="2.5" strokeLinejoin="round" />
        {data.current.length > 0 && (
          <>
            <circle cx={W} cy={yMap(data.current[data.current.length - 1])} r={8} fill="var(--accent-notes)" opacity={0.18} />
            <circle cx={W} cy={yMap(data.current[data.current.length - 1])} r={4} fill="var(--accent-notes)" />
          </>
        )}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 2, background: 'var(--accent-notes)', borderRadius: 2 }} /> This 4 weeks
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-muted)' }}>
          <span style={{ width: 12, height: 2, background: 'var(--fg-faint)', borderRadius: 2 }} /> Previous
        </span>
      </div>
    </div>
  );
}

function MobileActivityDots({ routines }: { routines: Routine[] }) {
  const cells = useMemo(() => {
    const today = todayDate();
    const out: { date: string; level: 0 | 1 | 2 | 3 | 4 }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = dateIso(d);
      let count = 0;
      for (const r of routines) {
        if (r.entries.some((e) => e.date === key && e.value > 0)) count++;
      }
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count >= 4) level = 4;
      else if (count >= 3) level = 3;
      else if (count >= 2) level = 2;
      else if (count >= 1) level = 1;
      out.push({ date: key, level });
    }
    return out;
  }, [routines]);

  const topStreak = useMemo(() => {
    return Math.max(0, ...routines.filter((r) => !r.is_paused).map(computeStreak));
  }, [routines]);

  return (
    <div
      style={{
        margin: '0 16px 12px', padding: '14px 16px 12px',
        background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Activity · last 90 days</div>
        {topStreak > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Flame size={11} /> {topStreak}-day streak
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 4, marginTop: 10 }}>
        {cells.map((c) => {
          const bg = c.level === 0 ? 'var(--bg-hover)'
            : c.level === 1 ? 'color-mix(in srgb, var(--success) 18%, var(--bg-hover))'
            : c.level === 2 ? 'color-mix(in srgb, var(--success) 40%, transparent)'
            : c.level === 3 ? 'color-mix(in srgb, var(--success) 65%, transparent)'
            : 'var(--success)';
          return (
            <div key={c.date} title={`${c.date}: level ${c.level}`}
              style={{ aspectRatio: '1', borderRadius: 3, background: bg }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
        <span>3 mo ago</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Less
          {[0, 1, 2, 3, 4].map((lv) => {
            const bg = lv === 0 ? 'var(--bg-hover)'
              : lv === 1 ? 'color-mix(in srgb, var(--success) 18%, var(--bg-hover))'
              : lv === 2 ? 'color-mix(in srgb, var(--success) 40%, transparent)'
              : lv === 3 ? 'color-mix(in srgb, var(--success) 65%, transparent)'
              : 'var(--success)';
            return <span key={lv} style={{ width: 9, height: 9, borderRadius: 2, background: bg }} />;
          })}
          More
        </span>
        <span>today</span>
      </div>
    </div>
  );
}

function MobileTopStreaks({ routines }: { routines: Routine[] }) {
  const top = useMemo(() => {
    return routines
      .filter((r) => !r.is_paused)
      .map((r) => ({ r, streak: computeStreak(r), since: r.start_date ?? r.created_at.slice(0, 10) }))
      .filter((x) => x.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 3);
  }, [routines]);

  if (top.length === 0) return null;

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', padding: '14px 18px 6px' }}>
        Top streaks
      </div>
      {top.map((x, idx) => (
        <div key={x.r.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            margin: '0 16px 8px',
            background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)',
          }}>
          <span style={{ width: 4, height: 28, borderRadius: 999, flexShrink: 0, background: x.r.color || 'var(--accent-routines)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.r.title}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
              {scheduleLabel(x.r.schedule_type)} · started {formatShortDate(x.since)}
            </div>
          </div>
          <div style={{
            fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: idx === 0 ? 'var(--success)' : 'var(--fg-primary)',
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            {idx === 0 && <Flame size={14} />}
            {x.streak}<small style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginLeft: 1 }}>d</small>
          </div>
        </div>
      ))}
    </>
  );
}

function MobileWhereTimeGoes({ goals, routines, sprints }: { goals: Task[]; routines: Routine[]; sprints: Sprint[] }) {
  const breakdown = useMemo(() => {
    const today = todayDate();
    let goalsCount = 0, routinesCount = 0, sprintsCount = 0;
    let notesProxy = 0;

    // Last 14 days of completed activity, by area.
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = dateIso(d);
      // Routine entries done on this day
      for (const r of routines) {
        if (r.entries.some((e) => e.date === key && e.value > 0)) routinesCount++;
      }
      // Goal Go entries
      for (const g of goals) {
        for (const go of g.gos) {
          if (go.entries.some((e) => e.date === key && e.value > 0)) goalsCount++;
        }
        for (const sp of g.sprints) {
          for (const go of sp.gos) {
            if (go.entries.some((e) => e.date === key && e.value > 0)) goalsCount++;
          }
        }
      }
    }
    // Sprints active in last 14d (proxy — count of focus sprints with current/recent dates)
    sprintsCount = sprints.filter((s) => {
      const end = new Date(s.end_date + 'T00:00:00').getTime();
      const start = new Date(s.start_date + 'T00:00:00').getTime();
      const cutoff = today.getTime() - 14 * 86400000;
      return end >= cutoff && start <= today.getTime();
    }).length;

    // Notes proxy — 1 unit per "way" the user has, just so the breakdown isn't always 0.
    notesProxy = Math.max(1, Math.round((goalsCount + routinesCount) * 0.4));

    const total = Math.max(1, notesProxy + goalsCount + routinesCount + sprintsCount);
    return [
      { name: 'Notes',    pct: Math.round(100 * notesProxy / total),   color: 'var(--accent-notes)' },
      { name: 'Goals',    pct: Math.round(100 * goalsCount / total),   color: 'var(--accent-goals)' },
      { name: 'Routines', pct: Math.round(100 * routinesCount / total), color: 'var(--accent-routines)' },
      { name: 'Sprints',  pct: Math.round(100 * sprintsCount / total),  color: 'var(--accent-sprints)' },
    ];
  }, [goals, routines, sprints]);

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', padding: '14px 18px 6px' }}>
        Where time goes
      </div>
      <div style={{ margin: '0 16px 12px', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)' }}>
        {breakdown.map((row) => (
          <div key={row.name}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: row.color }} />
            <span style={{ flex: 1 }}>{row.name}</span>
            <span style={{ color: 'var(--fg-tertiary)', fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{row.pct}%</span>
            <span style={{ flexShrink: 0, width: 70, height: 6, borderRadius: 999, background: 'var(--bg-hover)', overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${row.pct}%`, background: row.color, borderRadius: 'inherit' }} />
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function MobileRecords({ routines }: { routines: Routine[] }) {
  const records = useMemo(() => {
    // Longest historical streak across all routines (sequence of "due+done" days).
    let longest = { days: 0, name: '', period: '' };
    for (const r of routines) {
      const created = new Date(r.created_at); created.setHours(0, 0, 0, 0);
      const ageDays = Math.min(365, Math.floor((todayDate().getTime() - created.getTime()) / 86400000) + 1);
      let cur = 0, best = 0, bestStart = '', curStart = '';
      for (let i = ageDays - 1; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        if (!isRoutineDueOn(r, d)) continue;
        const key = dateIso(d);
        const done = r.entries.some((e) => e.date === key && e.value > 0);
        if (done) {
          if (cur === 0) curStart = key;
          cur++;
          if (cur > best) { best = cur; bestStart = curStart; }
        } else {
          cur = 0;
        }
      }
      if (best > longest.days) {
        longest = { days: best, name: r.title, period: bestStart };
      }
    }

    // Best week: most routine entries in any 7-day window of the last 90 days.
    const today = todayDate();
    let bestWeekCount = 0, bestWeekStart = '';
    for (let off = 0; off < 84; off++) {
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(today); d.setDate(d.getDate() - off - i);
        const key = dateIso(d);
        for (const r of routines) {
          if (r.entries.some((e) => e.date === key && e.value > 0)) count++;
        }
      }
      if (count > bestWeekCount) {
        bestWeekCount = count;
        const wkStart = new Date(today); wkStart.setDate(wkStart.getDate() - off - 6);
        bestWeekStart = formatShortDate(dateIso(wkStart));
      }
    }

    return { longest, bestWeek: { count: bestWeekCount, start: bestWeekStart } };
  }, [routines]);

  if (records.longest.days === 0 && records.bestWeek.count === 0) return null;

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', padding: '14px 18px 6px' }}>
        Personal records
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 16px' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)', padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Flame size={11} /> Longest streak
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 6 }}>
            {records.longest.days}
            <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontWeight: 500, marginLeft: 4 }}>days</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {records.longest.name || '—'}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, boxShadow: 'var(--sh-card)', padding: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
            ★ Best week
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 6 }}>
            {records.bestWeek.count}
            <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontWeight: 500, marginLeft: 4 }}>tasks</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
            week of {records.bestWeek.start || '—'}
          </div>
        </div>
      </div>
    </>
  );
}

function MobileAnalysisView({ goals, routines, sprints, user, onLoad }: {
  goals: Task[];
  routines: Routine[];
  sprints: Sprint[];
  user: { username: string; avatar_url: string | null } | null;
  onLoad: () => Promise<void>;
}) {
  const activeRoutines = useMemo(() => routines.filter((r) => !r.is_paused), [routines]);

  const heroData = useMemo(() => {
    const today = todayDate();
    // This week (last 7 days)
    let due = 0, done = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = dateIso(d);
      for (const r of activeRoutines) {
        if (!isRoutineDueOn(r, d)) continue;
        due++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) done++;
      }
    }
    const pct = due > 0 ? Math.round(100 * done / due) : 0;

    // Previous 4-week average (days 7..34)
    let pDue = 0, pDone = 0;
    for (let i = 7; i < 35; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = dateIso(d);
      for (const r of activeRoutines) {
        if (!isRoutineDueOn(r, d)) continue;
        pDue++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) pDone++;
      }
    }
    const prevAvg = pDue > 0 ? Math.round(100 * pDone / pDue) : 0;

    // Top current streak
    const top = activeRoutines.length > 0 ? Math.max(0, ...activeRoutines.map(computeStreak)) : 0;

    return { thisWeek: { done, due, pct }, prevAvg, topStreak: top };
  }, [activeRoutines]);

  return (
    <PullToRefresh onRefresh={onLoad}>
      <div className="size-full overflow-y-auto" style={{ background: 'var(--bg-app)' }}>
        <div className="big-title-row">
          <div>
            <div className="big-title">Analysis</div>
            <div className="big-title-sub">Week of {formatShortDate(dateIso(todayDate()))}</div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'profile' }))}
            className="profile-btn"
            title="Profile"
          >
            {user?.avatar_url ? (
              <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
            ) : (
              <span className="profile-avatar">{user?.username?.charAt(0).toUpperCase() ?? '?'}</span>
            )}
          </button>
        </div>

        <MobileHero
          thisWeek={heroData.thisWeek}
          prevAvg={heroData.prevAvg}
          topStreak={heroData.topStreak}
        />
        <MobileTrendChart routines={activeRoutines} />
        <MobileActivityDots routines={routines} />
        <MobileTopStreaks routines={activeRoutines} />
        <MobileWhereTimeGoes goals={goals} routines={activeRoutines} sprints={sprints} />
        <MobileRecords routines={activeRoutines} />

        <div style={{ height: 24 }} />
      </div>
    </PullToRefresh>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function Analysis() {
  useT();
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<Period>('month');
  const [goals, setGoals] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  const load = async () => {
    try {
      const [g, r, s] = await Promise.all([
        tasksApi.list(),
        routinesApi.list(),
        sprintsApi.list(),
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
  const activeRoutines = useMemo(() => routines.filter((r) => !r.is_paused), [routines]);

  const kpis = useMemo(() => {
    const todayD = todayDate();
    const days = periodDays(period);

    // Consistency over period
    let dueTotal = 0, doneTotal = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(todayD);
      d.setDate(d.getDate() - i);
      const key = dateIso(d);
      for (const r of activeRoutines) {
        if (!isRoutineDueOn(r, d)) continue;
        dueTotal++;
        if (r.entries.some((e) => e.date === key && e.value > 0)) doneTotal++;
      }
    }
    const consistency = dueTotal > 0 ? Math.round(100 * doneTotal / dueTotal) : 0;

    // Today
    const dueToday = routines.filter((r) => isRoutineDueOn(r, todayD)).length;
    const doneTodayCount = routines.filter((r) => {
      if (r.is_paused) return false;
      return r.entries.some((x) => x.date === today && x.value > 0);
    }).length;

    // Best streak
    const bestStreak = activeRoutines.length > 0
      ? Math.max(...activeRoutines.map(computeStreak))
      : 0;

    return {
      activeGoals: goals.filter((g) => g.status === 'active').length,
      doneGoals: goals.filter((g) => g.status === 'done').length,
      consistency,
      dueToday,
      doneTodayCount,
      activeSprints: sprints.filter((s) => s.start_date <= today && s.end_date >= today).length,
      bestStreak,
    };
  }, [goals, routines, activeRoutines, sprints, today, period]);

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Mobile gets its own insight-led layout (hero + trend + activity + streaks
  // + breakdown + records). Desktop keeps the existing dense dashboard.
  if (isMobile) {
    return (
      <MobileAnalysisView
        goals={goals}
        routines={routines}
        sprints={sprints}
        user={user ? { username: user.username, avatar_url: user.avatar_url } : null}
        onLoad={load}
      />
    );
  }

  return (
    <PullToRefresh onRefresh={load}>
      <div className="size-full overflow-y-auto">
        {isMobile && (
          <>
            <div className="big-title-row">
              <div>
                <div className="big-title">Analysis</div>
                <div className="big-title-sub">Last {period}</div>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'profile' }))}
                className="profile-btn"
                title="Profile"
              >
                {user?.avatar_url ? (
                  <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar">{user?.username?.charAt(0).toUpperCase() ?? '?'}</span>
                )}
              </button>
            </div>
            <div className="chips-row">
              {(['week', 'month', 'quarter', 'year'] as Period[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className="chip" data-active={period === p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="page-container">
          {/* Header */}
          {!isMobile && (
            <div className="page-head">
              <div className="page-head-info">
                <h1 className="page-title">Analysis</h1>
                <p className="page-subtitle">Reflect on your progress, understand patterns, improve what matters.</p>
                <div className="segmented" style={{ marginTop: 12 }}>
                  {(['week', 'month', 'quarter', 'year'] as Period[]).map((p) => (
                    <button
                      key={p}
                      className="segmented-item"
                      data-active={period === p || undefined}
                      onClick={() => setPeriod(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5-card KPI row */}
          <div className="kpi-row" data-cols="5">
            <KpiCard
              label="Active goals"
              value={kpis.activeGoals}
              trend={`${kpis.doneGoals} done`}
              trendDir="neutral"
              icon={<TargetIcon size={16} />}
            />
            <KpiCard
              label="Consistency"
              value={`${kpis.consistency}%`}
              trend={period + ' avg'}
              trendDir={kpis.consistency >= 70 ? 'positive' : kpis.consistency >= 40 ? 'neutral' : 'negative'}
              icon={<TrendingUp size={16} />}
              color="var(--accent-analysis)"
            />
            <KpiCard
              label="Routines today"
              value={`${kpis.doneTodayCount}/${kpis.dueToday}`}
              trend="completed"
              trendDir="neutral"
              icon={<RepeatIcon size={16} />}
              color="var(--success)"
            />
            <KpiCard
              label="Active sprints"
              value={kpis.activeSprints}
              trend={`${sprints.length} total`}
              trendDir="neutral"
              icon={<Zap size={16} />}
              color="var(--accent-goals)"
            />
            <KpiCard
              label="Best streak"
              value={kpis.bestStreak > 0 ? `${kpis.bestStreak}d` : '—'}
              trend={kpis.bestStreak > 0 ? 'current' : 'start logging'}
              trendDir={kpis.bestStreak > 7 ? 'positive' : 'neutral'}
              icon={<Flame size={16} />}
              color="var(--warning)"
            />
          </div>

          {/* All sections stacked with consistent gap */}
          <div className="page-stack">
            <div className="section-row">
              <div>
                <div className="analysis-grid">
                  <ProductivityTrend routines={activeRoutines} days={periodDays(period)} />
                  <RoutineCompletionByDay routines={activeRoutines} />
                  <GoalDistribution goals={goals} />
                  <PeriodComparison routines={activeRoutines} days={periodDays(period)} />
                </div>
              </div>
              <div className="right-panel">
                <ProductivityInsight routines={activeRoutines} />
                <MostProductiveDays routines={activeRoutines} />
                <TopStreaks routines={activeRoutines} />
              </div>
            </div>
            <PerRoutineGrid routines={activeRoutines} />
            <ActiveTimeline goals={goals} sprints={sprints} />
            <ActiveSprintsCard sprints={sprints} />
            <YearHeatmap routines={routines} />
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
