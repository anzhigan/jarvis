import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Target as TargetIcon,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Calendar,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi } from '../api/client';
import type { Task, Go, Sprint } from '../api/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8',
  background: '#a78bfa',
  in_progress: '#f59e0b',
  done: '#10b981',
};
const STATUS_LABEL: Record<string, string> = {
  todo: 'Backlog',
  background: 'Background',
  in_progress: 'In Progress',
  done: 'Done',
};
const PRIORITY_COLORS: Record<string, string> = { low: '#94a3b8', medium: '#f59e0b', high: '#dc2626' };
const PRIORITY_LABEL: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' };

// ═══════════════════════════════════════════════════════════════════════════
// KPI tile — large number + trend
// ═══════════════════════════════════════════════════════════════════════════
function KPI({ icon: Icon, label, value, sub, trend, tone = 'default' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; label: string };
  tone?: 'default' | 'success' | 'warning' | 'info' | 'accent';
}) {
  const toneBg = {
    default: 'from-primary/10 to-primary/5',
    success: 'from-emerald-500/10 to-emerald-500/5',
    warning: 'from-amber-500/10 to-amber-500/5',
    info:    'from-blue-500/10 to-blue-500/5',
    accent:  'from-violet-500/10 to-violet-500/5',
  }[tone];
  const iconCls = {
    default: 'text-primary bg-primary/15',
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-500/15',
    info:    'text-blue-600 dark:text-blue-400 bg-blue-500/15',
    accent:  'text-violet-600 dark:text-violet-400 bg-violet-500/15',
  }[tone];

  return (
    <div className={`relative p-4 rounded-xl border border-border bg-gradient-to-br ${toneBg} overflow-hidden`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconCls}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className="text-3xl font-semibold tracking-tight">{value}</div>
      <div className="flex items-center gap-2 mt-1">
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
            trend.value > 0 ? 'text-emerald-600 dark:text-emerald-400' :
            trend.value < 0 ? 'text-destructive' : 'text-muted-foreground'
          }`}>
            {trend.value > 0 ? <TrendingUp size={11} /> :
             trend.value < 0 ? <TrendingDown size={11} /> : <Minus size={11} />}
            {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GitHub-style year heatmap
// ═══════════════════════════════════════════════════════════════════════════
function YearHeatmap({ gos }: { gos: Go[] }) {
  const days = 365;
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  // Build value map per day: count of completed gos on that day (boolean=1, numeric=1 if value>0)
  const dayValues = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of gos) {
      for (const e of g.entries) {
        if (e.value > 0) {
          map.set(e.date, (map.get(e.date) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [gos]);

  // Build 7×53 grid, starting from (today - 364 days) adjusted to Monday
  const cells = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - days + 1);
    // Align start to previous Monday
    const startDayOfWeek = (start.getDay() + 6) % 7; // 0=Mon, 6=Sun
    start.setDate(start.getDate() - startDayOfWeek);

    const weeks: { date: Date; value: number; inRange: boolean }[][] = [];
    const cur = new Date(start);
    while (cur <= today) {
      const week: { date: Date; value: number; inRange: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const inRange = cur >= new Date(today.getTime() - days * 86_400_000) && cur <= today;
        const v = inRange ? (dayValues.get(isoDay(cur)) ?? 0) : 0;
        week.push({ date: new Date(cur), value: v, inRange });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }, [today, dayValues]);

  // Intensity scale
  const maxValue = useMemo(() => {
    let m = 0;
    for (const v of dayValues.values()) if (v > m) m = v;
    return m;
  }, [dayValues]);

  const colorFor = (v: number, inRange: boolean) => {
    if (!inRange) return 'transparent';
    if (v === 0) return 'var(--muted)';
    if (maxValue <= 1) return '#34d399';
    const ratio = v / maxValue;
    if (ratio > 0.75) return '#059669';
    if (ratio > 0.5) return '#10b981';
    if (ratio > 0.25) return '#34d399';
    return '#6ee7b7';
  };

  const totalDone = Array.from(dayValues.values()).reduce((s, v) => s + v, 0);
  const activeDays = Array.from(dayValues.values()).filter((v) => v > 0).length;

  // Current streak
  const streak = useMemo(() => {
    let s = 0;
    const d = new Date(today);
    while (dayValues.has(isoDay(d)) && (dayValues.get(isoDay(d)) ?? 0) > 0) {
      s += 1;
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [today, dayValues]);

  // Month labels
  const monthLabels: { label: string; col: number }[] = [];
  let prevMonth = -1;
  cells.forEach((week, wi) => {
    const month = week[0].date.getMonth();
    if (month !== prevMonth && week[0].inRange) {
      monthLabels.push({ label: new Date(2000, month, 1).toLocaleString(undefined, { month: 'short' }), col: wi });
      prevMonth = month;
    }
  });

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Flame size={14} className="text-amber-500" />
            Activity heatmap
          </h3>
          <p className="text-xs text-muted-foreground">Last 365 days of your productivity</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Current streak</div>
            <div className="font-semibold text-base">{streak} <span className="text-xs font-normal text-muted-foreground">days</span></div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Active days</div>
            <div className="font-semibold text-base">{activeDays}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total completions</div>
            <div className="font-semibold text-base">{totalDone}</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Month labels */}
          <div className="flex gap-[3px] mb-1 pl-6 relative h-3">
            {cells.map((_, wi) => {
              const label = monthLabels.find((m) => m.col === wi);
              return (
                <div key={wi} className="w-[11px] text-[9px] text-muted-foreground">
                  {label?.label}
                </div>
              );
            })}
          </div>
          {/* Grid */}
          <div className="flex gap-[3px]">
            {/* Day labels column */}
            <div className="flex flex-col gap-[3px] mr-1 text-[9px] text-muted-foreground pt-[1px]">
              {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
                <div key={i} className="h-[11px] leading-[11px]">{d}</div>
              ))}
            </div>
            {cells.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day, di) => (
                  <div
                    key={di}
                    className="w-[11px] h-[11px] rounded-[2px]"
                    style={{ backgroundColor: colorFor(day.value, day.inRange), border: day.inRange ? undefined : 'none' }}
                    title={day.inRange ? `${isoDay(day.date)} — ${day.value} completion${day.value !== 1 ? 's' : ''}` : ''}
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
            <span>Less</span>
            <div className="w-[10px] h-[10px] rounded-[2px] bg-muted" />
            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: '#6ee7b7' }} />
            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: '#34d399' }} />
            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: '#10b981' }} />
            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: '#059669' }} />
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Active sprints list with time remaining
// ═══════════════════════════════════════════════════════════════════════════
function ActiveSprints({ tasks }: { tasks: Task[] }) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const activeSprints: (Sprint & { taskTitle: string })[] = [];
  for (const t of tasks) {
    for (const s of t.sprints) {
      const start = parseDate(s.start_date);
      const end = parseDate(s.end_date);
      if (start <= today && today <= end) {
        activeSprints.push({ ...s, taskTitle: t.title });
      }
    }
  }
  activeSprints.sort((a, b) => +parseDate(a.end_date) - +parseDate(b.end_date));

  if (activeSprints.length === 0) return null;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Zap size={14} className="text-violet-500" />
        Active sprints
      </h3>
      <p className="text-xs text-muted-foreground mb-4">{activeSprints.length} sprint{activeSprints.length !== 1 ? 's' : ''} currently running</p>

      <div className="space-y-3">
        {activeSprints.map((s) => {
          const daysLeft = daysBetween(today, parseDate(s.end_date));
          const totalDays = daysBetween(parseDate(s.start_date), parseDate(s.end_date)) + 1;
          const elapsed = totalDays - daysLeft;
          const timePct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
          const behind = timePct > s.progress + 10;

          return (
            <div key={s.id} className="p-3 rounded-lg bg-background border border-border">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{s.taskTitle}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-xs font-semibold">{s.progress}%</div>
                  <div className={`text-[10px] ${daysLeft < 3 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {daysLeft === 0 ? 'ends today' : `${daysLeft}d left`}
                  </div>
                </div>
              </div>
              {/* Dual-bar: progress vs time elapsed */}
              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${timePct}%`, backgroundColor: behind ? 'rgba(239, 68, 68, 0.2)' : 'rgba(148, 163, 184, 0.2)' }} />
                <div className="absolute inset-y-0 left-0 transition-all rounded-full" style={{ width: `${s.progress}%`, backgroundColor: s.color }} />
              </div>
              {behind && (
                <div className="text-[10px] text-destructive mt-1">⚠ behind schedule</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Distribution — pie chart with tab switcher
// ═══════════════════════════════════════════════════════════════════════════
function DistributionCard({ tasks }: { tasks: Task[] }) {
  const [mode, setMode] = useState<'status' | 'priority' | 'tag'>('status');

  const data = useMemo(() => {
    if (mode === 'status') {
      const counts: Record<string, number> = { todo: 0, background: 0, in_progress: 0, done: 0 };
      tasks.forEach((t) => { counts[t.status] = (counts[t.status] ?? 0) + 1; });
      return Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: STATUS_LABEL[k], value: v, color: STATUS_COLORS[k] }));
    }
    if (mode === 'priority') {
      const result: { name: string; value: number; color: string }[] = [];
      for (const p of ['high', 'medium', 'low'] as const) {
        const c = tasks.filter((t) => t.priority === p).length;
        if (c > 0) result.push({ name: PRIORITY_LABEL[p], value: c, color: PRIORITY_COLORS[p] });
      }
      return result;
    }
    // tag
    const byTag = new Map<string, { name: string; color: string; count: number }>();
    for (const t of tasks) {
      for (const tag of t.tags ?? []) {
        const ex = byTag.get(tag.id);
        if (ex) ex.count += 1;
        else byTag.set(tag.id, { name: tag.name, color: tag.color, count: 1 });
      }
    }
    return [...byTag.values()].sort((a, b) => b.count - a.count)
      .map((t) => ({ name: t.name, value: t.count, color: t.color }));
  }, [tasks, mode]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Breakdown</h3>
          <p className="text-xs text-muted-foreground">Tasks distribution</p>
        </div>
        <div className="flex text-[11px] bg-muted rounded-md p-0.5">
          <button onClick={() => setMode('status')}
            className={`px-2.5 h-6 rounded ${mode === 'status' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
            Status
          </button>
          <button onClick={() => setMode('priority')}
            className={`px-2.5 h-6 rounded ${mode === 'priority' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
            Priority
          </button>
          <button onClick={() => setMode('tag')}
            className={`px-2.5 h-6 rounded ${mode === 'tag' ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground'}`}>
            Tags
          </button>
        </div>
      </div>

      {total === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-40 h-40 flex-shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={50} outerRadius={72} paddingAngle={2} dataKey="value">
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-2xl font-semibold">{total}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-[180px] space-y-1.5">
            {data.map((d) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-muted-foreground text-[11px]">{pct.toFixed(0)}%</span>
                  <span className="font-medium w-6 text-right">{d.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Productivity area chart (30 days)
// ═══════════════════════════════════════════════════════════════════════════
function ProductivityTrend({ gos }: { gos: Go[] }) {
  const DAYS = 30;
  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const rows = useMemo(() => {
    const result: { date: string; label: string; score: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = isoDay(d);
      // Count completions per day
      let completed = 0;
      let tracked = 0;
      for (const g of gos) {
        // Only count if go was "active" on that day (created before or on this day)
        const created = new Date(g.created_at);
        created.setHours(0, 0, 0, 0);
        if (created > d) continue;
        tracked += 1;
        const entry = g.entries.find((e) => e.date === key);
        if (entry && entry.value > 0) completed += 1;
      }
      const score = tracked > 0 ? Math.round((completed / tracked) * 100) : 0;
      result.push({
        date: key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score,
      });
    }
    return result;
  }, [now, gos]);

  const scores = rows.map((r) => r.score).filter((v) => v > 0);
  const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
  const last7 = rows.slice(-7).map((r) => r.score);
  const last7Avg = last7.length > 0 ? Math.round(last7.reduce((s, v) => s + v, 0) / last7.length) : 0;
  const prev7 = rows.slice(-14, -7).map((r) => r.score);
  const prev7Avg = prev7.length > 0 ? Math.round(prev7.reduce((s, v) => s + v, 0) / prev7.length) : 0;
  const trend = last7Avg - prev7Avg;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Activity size={14} className="text-primary" />
            Productivity trend
          </h3>
          <p className="text-xs text-muted-foreground">Daily completion rate across all Gos</p>
        </div>
        <div className="flex items-end gap-4 text-right">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">30-day avg</div>
            <div className="text-lg font-semibold">{avg}%</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last 7 days</div>
            <div className="text-lg font-semibold">
              {last7Avg}%{' '}
              <span className={`text-xs font-medium ${trend > 0 ? 'text-emerald-500' : trend < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {trend > 0 ? '+' : ''}{trend}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="prodFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.35} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={Math.max(1, Math.floor(DAYS / 8))} stroke="var(--border)" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} domain={[0, 100]} stroke="var(--border)" tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '12px' }}
              formatter={(v: number) => [`${v}%`, 'Completion']}
            />
            <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} fill="url(#prodFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Compact Gantt — only active tasks, cleaner design
// ═══════════════════════════════════════════════════════════════════════════
function CompactGantt({ tasks }: { tasks: Task[] }) {
  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const activeTasks = useMemo(() =>
    tasks.filter((t) => t.status !== 'done' && (t.due_date || t.start_date))
  , [tasks]);

  const range = useMemo(() => {
    if (activeTasks.length === 0) return null;
    let min = new Date(now); min.setDate(min.getDate() - 3);
    let max = new Date(now); max.setDate(max.getDate() + 14);
    for (const t of activeTasks) {
      if (t.start_date) {
        const s = parseDate(t.start_date);
        if (s < min) min = s;
      }
      if (t.due_date) {
        const d = parseDate(t.due_date);
        if (d > max) max = d;
      }
    }
    min.setHours(0, 0, 0, 0); max.setHours(0, 0, 0, 0);
    const days = Math.max(daysBetween(min, max), 7);
    return { start: min, end: new Date(min.getTime() + days * 86_400_000), days };
  }, [activeTasks, now]);

  if (!range || activeTasks.length === 0) return null;

  const sorted = [...activeTasks].sort((a, b) => {
    const ad = a.due_date ? +parseDate(a.due_date) : Infinity;
    const bd = b.due_date ? +parseDate(b.due_date) : Infinity;
    return ad - bd;
  });
  const nowPct = (daysBetween(range.start, now) / range.days) * 100;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Calendar size={14} className="text-blue-500" />
        Active timeline
      </h3>
      <p className="text-xs text-muted-foreground mb-4">{sorted.length} task{sorted.length !== 1 ? 's' : ''} in progress</p>

      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Today line + position label */}
          <div className="relative h-5 mb-1">
            {nowPct >= 0 && nowPct <= 100 && (
              <div className="absolute top-0 text-[10px] text-primary font-medium" style={{ left: `calc(${nowPct}% + 128px)`, transform: 'translateX(-50%)' }}>
                Today
              </div>
            )}
          </div>

          <div className="space-y-2 relative">
            {/* Vertical today-line across all rows */}
            {nowPct >= 0 && nowPct <= 100 && (
              <div className="absolute top-0 bottom-0 w-[2px] bg-primary/40 z-10 pointer-events-none rounded-full" style={{ left: `calc(${nowPct}% + 128px)` }} />
            )}
            {sorted.map((task) => {
              const startDate = task.start_date ? parseDate(task.start_date) : new Date(task.created_at);
              startDate.setHours(0, 0, 0, 0);
              const dueDate = task.due_date ? parseDate(task.due_date) : now;
              const startPct = Math.max(0, (daysBetween(range.start, startDate) / range.days) * 100);
              const endPct = Math.min(100, (daysBetween(range.start, dueDate) / range.days) * 100);
              const widthPct = Math.max(1, endPct - startPct);
              const isOverdue = dueDate < now;
              const statusColor = STATUS_COLORS[task.status] ?? '#94a3b8';

              return (
                <div key={task.id} className="flex items-center gap-3 text-xs">
                  <div className="w-32 flex-shrink-0 flex items-center gap-1.5 truncate">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                    <span className="truncate">{task.title}</span>
                  </div>
                  <div className="flex-1 relative h-7">
                    <div
                      className="absolute top-1 bottom-1 rounded-md flex items-center px-2 text-[10px] font-medium transition-all"
                      style={{
                        left: `${startPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: isOverdue ? 'rgb(239, 68, 68)' : statusColor,
                        color: 'white',
                        minWidth: '20px',
                      }}
                      title={`${task.title} — ${startDate.toLocaleDateString()} → ${dueDate.toLocaleDateString()}`}
                    >
                      {task.progress > 0 && widthPct > 10 && (
                        <span className="text-[9px] opacity-90">{task.progress}%</span>
                      )}
                    </div>
                    {/* Progress overlay inside bar */}
                    {task.progress > 0 && (
                      <div
                        className="absolute top-1 bottom-1 rounded-md bg-white/25"
                        style={{
                          left: `${startPct}%`,
                          width: `${(widthPct * task.progress) / 100}%`,
                          minWidth: task.progress > 0 ? '2px' : 0,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════
export default function Metrics() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const t = await tasksApi.list();
      setTasks(t);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const { allGos, stats, trend } = useMemo(() => {
    const allGos: Go[] = [];
    tasks.forEach((t) => {
      t.gos.forEach((g) => allGos.push(g));
      t.sprints.forEach((s) => s.gos.forEach((g) => allGos.push(g)));
    });

    const statusCounts = { todo: 0, background: 0, in_progress: 0, done: 0 };
    tasks.forEach((t) => { statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1; });

    // Trend: week-over-week completion
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const week1End = today;
    const week1Start = new Date(today); week1Start.setDate(week1Start.getDate() - 6);
    const week2End = new Date(week1Start); week2End.setDate(week2End.getDate() - 1);
    const week2Start = new Date(week2End); week2Start.setDate(week2Start.getDate() - 6);

    let week1Done = 0; let week2Done = 0;
    for (const g of allGos) {
      for (const e of g.entries) {
        if (e.value <= 0) continue;
        const ed = parseDate(e.date);
        if (ed >= week1Start && ed <= week1End) week1Done += 1;
        else if (ed >= week2Start && ed <= week2End) week2Done += 1;
      }
    }
    const weekTrend = week2Done > 0
      ? Math.round(((week1Done - week2Done) / week2Done) * 100)
      : (week1Done > 0 ? 100 : 0);

    const avgProgress = tasks.length > 0
      ? Math.round(tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / tasks.length)
      : 0;

    const completionRate = tasks.length > 0
      ? Math.round((statusCounts.done / tasks.length) * 100)
      : 0;

    return {
      allGos,
      stats: {
        totalTasks: tasks.length,
        done: statusCounts.done,
        inProgress: statusCounts.in_progress,
        backlog: statusCounts.todo,
        background: statusCounts.background,
        totalGos: allGos.length,
        avgProgress,
        completionRate,
        week1Done,
      },
      trend: { weekTrend },
    };
  }, [tasks]);

  if (loading) {
    return <div className="size-full flex items-center justify-center"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  const hasData = stats.totalTasks > 0 || stats.totalGos > 0;

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your productivity at a glance</p>
        </div>

        {!hasData ? (
          <div className="border border-dashed border-border rounded-xl py-20 text-center">
            <Activity size={32} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-base font-medium mb-1">Nothing to analyze yet</p>
            <p className="text-sm text-muted-foreground">Create tasks and Go items, check them off, come back</p>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                icon={TargetIcon}
                label="Active tasks"
                value={stats.inProgress + stats.backlog + stats.background}
                sub={`${stats.totalTasks} total`}
                tone="info"
              />
              <KPI
                icon={CheckCircle2}
                label="Completed"
                value={stats.done}
                sub={`${stats.completionRate}% completion rate`}
                tone="success"
              />
              <KPI
                icon={Clock}
                label="Avg progress"
                value={`${stats.avgProgress}%`}
                sub="across all tasks"
                tone="default"
              />
              <KPI
                icon={Flame}
                label="Done this week"
                value={stats.week1Done}
                sub="Go completions"
                trend={{ value: trend.weekTrend, label: 'vs prev week' }}
                tone="accent"
              />
            </div>

            {/* Heatmap full width */}
            <YearHeatmap gos={allGos} />

            {/* Two-column: trends + active sprints */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ProductivityTrend gos={allGos} />
              </div>
              <div>
                <ActiveSprints tasks={tasks} />
                {/* fallback when no active sprints */}
                {tasks.every((t) => t.sprints.every((s) => {
                  const tod = new Date(); tod.setHours(0,0,0,0);
                  return parseDate(s.end_date) < tod || parseDate(s.start_date) > tod;
                })) && (
                  <div className="p-5 bg-card border border-border rounded-xl text-center">
                    <Zap size={20} className="mx-auto mb-2 text-muted-foreground opacity-60" />
                    <p className="text-sm text-muted-foreground">No active sprints</p>
                  </div>
                )}
              </div>
            </div>

            {/* Gantt full width */}
            <CompactGantt tasks={tasks} />

            {/* Distribution */}
            <DistributionCard tasks={tasks} />
          </>
        )}
      </div>
    </div>
  );
}
