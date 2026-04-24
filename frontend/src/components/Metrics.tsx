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
import { useT } from '../store/i18n';
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
// ─── 4 Specialized KPI cards — each visually different ─────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// Card 1: Active tasks — dominated by a stacked bar of task statuses
function ActiveTasksCard({ stats }: {
  stats: { totalTasks: number; done: number; inProgress: number; backlog: number; background: number; activeSprints: number; totalSprints: number };
}) {
  const active = stats.inProgress + stats.backlog + stats.background;
  const total = stats.totalTasks || 1;
  const segs = [
    { key: 'in_progress', value: stats.inProgress, color: '#f59e0b', label: 'In progress' },
    { key: 'todo',        value: stats.backlog,    color: '#94a3b8', label: 'Backlog' },
    { key: 'background',  value: stats.background, color: '#a78bfa', label: 'Background' },
    { key: 'done',        value: stats.done,       color: '#10b981', label: 'Done' },
  ].filter((s) => s.value > 0);

  return (
    <div className="relative p-4 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 via-blue-400/5 to-transparent overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">Active tasks</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-500/15">
          <TargetIcon size={17} />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-4xl font-semibold tracking-tight">{active}</span>
        <span className="text-xs text-muted-foreground">/ {stats.totalTasks} total</span>
      </div>
      {/* Stacked bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden flex mb-2">
        {segs.map((s) => (
          <div
            key={s.key}
            className="h-full transition-all"
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
        {stats.activeSprints > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-400 font-medium">
            <Zap size={9} /> {stats.activeSprints} sprint{stats.activeSprints !== 1 ? 's' : ''} active
          </span>
        )}
        {stats.totalSprints > stats.activeSprints && (
          <span>· {stats.totalSprints - stats.activeSprints} queued</span>
        )}
        {stats.totalSprints === 0 && <span>no sprints yet</span>}
      </div>
    </div>
  );
}

// Card 2: Completed — big semi-circular progress arc
function CompletedCard({ stats }: {
  stats: { done: number; totalTasks: number; completionRate: number };
}) {
  // Semi-circular arc: svg path from left to right across top
  // r=48, stroke-dasharray based on completion
  const r = 48;
  const circumference = Math.PI * r;
  const offset = circumference * (1 - stats.completionRate / 100);

  return (
    <div className="relative p-4 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-transparent overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">Completed</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-emerald-600 dark:text-emerald-400 bg-emerald-500/15">
          <CheckCircle2 size={17} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Circular gauge */}
        <div className="relative w-[72px] h-[72px] flex-shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
            <circle
              cx="60" cy="60" r={r}
              fill="none"
              stroke="#10b981"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <div className="text-xl font-semibold leading-none">{stats.completionRate}%</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">done</div>
          </div>
        </div>
        <div>
          <div className="text-3xl font-semibold leading-none">{stats.done}</div>
          <div className="text-[11px] text-muted-foreground mt-1">tasks completed</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">of {stats.totalTasks} total</div>
        </div>
      </div>
    </div>
  );
}

// Card 3: Avg progress — radial-ish gauge with milestones
function AvgProgressCard({ stats }: {
  stats: { avgProgress: number; totalTasks: number };
}) {
  const milestones = [25, 50, 75, 100];
  return (
    <div className="relative p-4 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">Avg progress</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-primary bg-primary/15">
          <Clock size={17} />
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-4xl font-semibold tracking-tight">{stats.avgProgress}</span>
        <span className="text-lg text-muted-foreground">%</span>
      </div>
      {/* Thick bar with milestone markers */}
      <div className="relative h-3 bg-muted rounded-full overflow-visible mb-1">
        <div
          className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full transition-all"
          style={{ width: `${stats.avgProgress}%` }}
        />
        {milestones.map((m) => (
          <div
            key={m}
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4 bg-background"
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground px-0.5">
        <span>0%</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100%</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        across {stats.totalTasks} {stats.totalTasks === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  );
}

// Card 4: Done this week — mini sparkline of last 7 days
function WeekCompletionsCard({ last7Counts, weekTrend, total }: {
  last7Counts: number[];
  weekTrend: number;
  total: number;
}) {
  const max = Math.max(1, ...last7Counts);
  const W = 120;
  const H = 38;
  const step = W / (last7Counts.length - 1 || 1);

  // Build path
  const pts = last7Counts.map((v, i) => ({ x: i * step, y: H - (v / max) * H }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${W},${H} L0,${H} Z`;

  return (
    <div className="relative p-4 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-violet-400/5 to-transparent overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">Done this week</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-violet-600 dark:text-violet-400 bg-violet-500/15">
          <Flame size={17} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div>
          <div className="text-4xl font-semibold tracking-tight leading-none">{total}</div>
          <div className="text-[10px] text-muted-foreground mt-1">Go completions</div>
        </div>
        {/* Sparkline */}
        <svg width={W} height={H} className="flex-shrink-0">
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#sparkGrad)" />
          <path d={pathD} fill="none" stroke="#8b5cf6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.5} fill="#8b5cf6" />
          ))}
        </svg>
      </div>
      <div className="flex items-center gap-1 text-[11px] mt-2">
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium ${
          weekTrend > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
          weekTrend < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' :
          'bg-muted text-muted-foreground'
        }`}>
          {weekTrend > 0 ? <TrendingUp size={10} /> :
           weekTrend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
          {weekTrend > 0 ? '+' : ''}{weekTrend}%
        </span>
        <span className="text-muted-foreground text-[10px]">vs last week</span>
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

  // Pick up to N daily Gos — each becomes a background line
  const MAX_BG_LINES = 6;
  const dailyGos = useMemo(() => {
    const ds = gos.filter((g) => g.recurrence === 'daily' && g.kind === 'boolean');
    // If too many, take first MAX_BG_LINES (by created_at ascending already)
    return ds.slice(0, MAX_BG_LINES);
  }, [gos]);

  // Each row in `rows`: { label, score, go_<id>: 0|100, ... }
  // overall "score" = avg across all gos that day (0 | 100)
  // Each daily go: 100 if done on this day else 0 (step-like line, visually it rises/falls)
  const rows = useMemo(() => {
    const result: Record<string, any>[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = isoDay(d);

      // Overall
      let completed = 0;
      let tracked = 0;
      for (const g of gos) {
        const created = new Date(g.created_at);
        created.setHours(0, 0, 0, 0);
        if (created > d) continue;
        tracked += 1;
        const entry = g.entries.find((e) => e.date === key);
        if (entry && entry.value > 0) completed += 1;
      }
      const score = tracked > 0 ? Math.round((completed / tracked) * 100) : 0;

      const row: Record<string, any> = {
        date: key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        score,
      };

      // Per-daily-go value — 100 if done on this day, otherwise undefined (recharts skips)
      for (const g of dailyGos) {
        const created = new Date(g.created_at);
        created.setHours(0, 0, 0, 0);
        if (created > d) continue;
        const entry = g.entries.find((e) => e.date === key);
        const v = entry && entry.value > 0 ? 100 : 0;
        row[`go_${g.id}`] = v;
      }

      result.push(row);
    }
    return result;
  }, [now, gos, dailyGos]);

  const scores = rows.map((r) => r.score as number).filter((v) => v > 0);
  const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
  const last7 = rows.slice(-7).map((r) => r.score as number);
  const last7Avg = last7.length > 0 ? Math.round(last7.reduce((s, v) => s + v, 0) / last7.length) : 0;
  const prev7 = rows.slice(-14, -7).map((r) => r.score as number);
  const prev7Avg = prev7.length > 0 ? Math.round(prev7.reduce((s, v) => s + v, 0) / prev7.length) : 0;
  const trend = last7Avg - prev7Avg;

  // Distinct muted colors for bg lines
  const bgColors = ['#94a3b8', '#cbd5e1', '#a8a29e', '#d4d4d8', '#a3a3a3', '#bfbfbf'];

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Activity size={14} className="text-primary" />
            Productivity trend
          </h3>
          <p className="text-xs text-muted-foreground">Overall completion rate + individual daily Go lines</p>
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
              formatter={(v: number, name: string) => {
                if (name === 'score') return [`${v}%`, 'Overall'];
                const id = name.replace('go_', '');
                const g = dailyGos.find((dg) => dg.id === id);
                return [v > 0 ? '✓ done' : '✗ missed', g?.title || 'Go'];
              }}
            />
            {/* Background per-daily-go lines (thin, step, grey tones) */}
            {dailyGos.map((g, i) => (
              <Area
                key={g.id}
                type="stepAfter"
                dataKey={`go_${g.id}`}
                stroke={bgColors[i % bgColors.length]}
                strokeWidth={1}
                strokeDasharray="2 2"
                fill="transparent"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {/* Main overall line + area */}
            <Area type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2.5} fill="url(#prodFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {dailyGos.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-border text-[10px]">
          <div className="inline-flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded-full" />
            <span className="font-medium">Overall</span>
          </div>
          {dailyGos.map((g, i) => (
            <div key={g.id} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <div className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: bgColors[i % bgColors.length] }} />
              <span className="truncate max-w-[140px]">{g.title}</span>
            </div>
          ))}
          {gos.filter((g) => g.recurrence === 'daily' && g.kind === 'boolean').length > MAX_BG_LINES && (
            <span className="text-muted-foreground italic">+ {gos.filter((g) => g.recurrence === 'daily' && g.kind === 'boolean').length - MAX_BG_LINES} more (hidden)</span>
          )}
        </div>
      )}
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
  const t = useT();
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

  const { allGos, last7Counts, stats, trend } = useMemo(() => {
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
    // Also count per-day completions for last-7 sparkline
    const last7Counts: number[] = Array(7).fill(0);
    for (const g of allGos) {
      for (const e of g.entries) {
        if (e.value <= 0) continue;
        const ed = parseDate(e.date);
        if (ed >= week1Start && ed <= week1End) {
          week1Done += 1;
          const diff = Math.floor((ed.getTime() - week1Start.getTime()) / 86_400_000);
          if (diff >= 0 && diff < 7) last7Counts[diff] += 1;
        }
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

    // Sprint stats
    let activeSprints = 0;
    let totalSprints = 0;
    tasks.forEach((t) => {
      t.sprints.forEach((s) => {
        totalSprints += 1;
        const start = parseDate(s.start_date);
        const end = parseDate(s.end_date);
        if (start <= today && today <= end) activeSprints += 1;
      });
    });

    return {
      allGos,
      last7Counts,
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
        activeSprints,
        totalSprints,
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
          <h1 className="text-2xl font-semibold tracking-tight">{t('analysis.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('analysis.subtitle')}</p>
        </div>

        {!hasData ? (
          <div className="border border-dashed border-border rounded-xl py-20 text-center">
            <Activity size={32} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-base font-medium mb-1">{t('analysis.empty')}</p>
            <p className="text-sm text-muted-foreground">{t('analysis.emptySub')}</p>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ActiveTasksCard stats={stats} />
              <CompletedCard stats={stats} />
              <AvgProgressCard stats={stats} />
              <WeekCompletionsCard
                last7Counts={last7Counts}
                weekTrend={trend.weekTrend}
                total={stats.week1Done}
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
