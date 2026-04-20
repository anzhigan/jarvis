import { useEffect, useMemo, useState } from 'react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Hash,
  Loader2,
  Target as TargetIcon,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi, waysApi } from '../api/client';
import type { Practice, Task, Way } from '../api/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function isoDay(d: Date): string {
  return d.toISOString().split('T')[0];
}
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((+b - +a) / 86_400_000);
}
function pastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(isoDay(d));
  }
  return out;
}
function computeStreak(p: Practice): number {
  const byDate = new Map<string, number>();
  p.entries.forEach((e) => byDate.set(e.date, e.value));
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = isoDay(d);
    const v = byDate.get(key);
    if (v === undefined) { if (i === 0) continue; break; }
    if (v > 0) streak++; else break;
  }
  return streak;
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Backlog', in_progress: 'In Progress', done: 'Done',
};
const STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8', in_progress: '#f59e0b', done: '#10b981',
};
const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8', medium: '#f59e0b', high: '#dc2626',
};

// ─── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub, tone = 'default' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneCls = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-chart-5/10 text-chart-5',
    warning: 'bg-chart-3/10 text-chart-3',
  }[tone];
  return (
    <div className="p-4 bg-card border border-border rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${toneCls}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Generic pie chart with stacked status ───────────────────────────────────
function StatusPie({ title, subtitle, data }: {
  title: string; subtitle: string;
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      {total === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">No data</div>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} innerRadius={38} outerRadius={66} paddingAngle={2} dataKey="value">
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--popover)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                <span className="flex-1 truncate text-muted-foreground">{d.name}</span>
                <span className="font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Gantt-style Task Timeline ───────────────────────────────────────────────
function TaskTimeline({ tasks }: { tasks: Task[] }) {
  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const rangedTasks = useMemo(() => tasks.filter((t) => t.due_date), [tasks]);

  const range = useMemo(() => {
    if (rangedTasks.length === 0) return null;
    let min = new Date(now); min.setDate(min.getDate() - 7);
    let max = new Date(now); max.setDate(max.getDate() + 7);
    for (const t of rangedTasks) {
      const start = new Date(t.created_at);
      const due = parseDate(t.due_date!);
      if (start < min) min = start;
      if (due > max) max = due;
    }
    // Normalize to midnight
    min.setHours(0, 0, 0, 0);
    max.setHours(0, 0, 0, 0);
    const days = Math.max(daysBetween(min, max), 14);
    return { start: min, end: new Date(min.getTime() + days * 86_400_000), days };
  }, [rangedTasks, now]);

  if (!range || rangedTasks.length === 0) {
    return (
      <div className="p-5 bg-card border border-border rounded-xl">
        <h3 className="text-sm font-semibold">Task timeline</h3>
        <p className="text-xs text-muted-foreground mb-3">Gantt chart of tasks with due dates</p>
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          Add tasks with due dates to see the timeline
        </div>
      </div>
    );
  }

  const sorted = [...rangedTasks].sort((a, b) => {
    return +parseDate(a.due_date!) - +parseDate(b.due_date!);
  });

  const nowPct = (daysBetween(range.start, now) / range.days) * 100;

  // Month labels every ~7 days
  const ticks: { label: string; pct: number }[] = [];
  for (let i = 0; i <= range.days; i += Math.max(1, Math.floor(range.days / 7))) {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    const pct = (i / range.days) * 100;
    ticks.push({
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      pct,
    });
  }

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold">Task timeline</h3>
      <p className="text-xs text-muted-foreground mb-4">{sorted.length} tasks with due dates</p>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Date axis */}
          <div className="relative h-6 mb-2 border-b border-border">
            {ticks.map((t) => (
              <div
                key={t.pct}
                className="absolute top-0 text-[10px] text-muted-foreground"
                style={{ left: `${t.pct}%`, transform: 'translateX(-50%)' }}
              >
                {t.label}
              </div>
            ))}
            {/* Current date marker */}
            {nowPct >= 0 && nowPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary"
                style={{ left: `${nowPct}%` }}
              >
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium whitespace-nowrap">
                  Today
                </div>
              </div>
            )}
          </div>

          {/* Task rows */}
          <div className="space-y-2 relative">
            {/* Today line across all rows */}
            {nowPct >= 0 && nowPct <= 100 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/40 pointer-events-none z-10"
                style={{ left: `${nowPct}%` }}
              />
            )}
            {sorted.map((task) => {
              const startDate = new Date(task.created_at);
              startDate.setHours(0, 0, 0, 0);
              const dueDate = parseDate(task.due_date!);
              const startPct = Math.max(0, (daysBetween(range.start, startDate) / range.days) * 100);
              const endPct = Math.min(100, (daysBetween(range.start, dueDate) / range.days) * 100);
              const widthPct = Math.max(1, endPct - startPct);
              const isOverdue = task.status !== 'done' && dueDate < now;
              const statusColor = STATUS_COLORS[task.status] ?? '#94a3b8';

              return (
                <div key={task.id} className="flex items-center gap-3 text-xs">
                  <div className="w-32 md:w-48 truncate flex-shrink-0 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                    <span className="truncate">{task.title}</span>
                  </div>
                  <div className="flex-1 relative h-6">
                    <div
                      className="absolute top-1 bottom-1 rounded flex items-center px-2 text-[10px] font-medium"
                      style={{
                        left: `${startPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: isOverdue ? 'var(--destructive)' : statusColor,
                        color: 'white',
                        minWidth: '20px',
                      }}
                      title={`${task.title} — ${new Date(task.created_at).toLocaleDateString()} → ${dueDate.toLocaleDateString()}`}
                    />
                  </div>
                  <div className="w-14 md:w-20 text-[10px] text-muted-foreground text-right flex-shrink-0">
                    {dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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

// ─── Practice Timeline ───────────────────────────────────────────────────────
function PracticeTimeline({ practices }: { practices: { task: Task; practice: Practice }[] }) {
  const now = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const active = practices.filter((pp) => pp.practice.status !== 'done');

  if (active.length === 0) {
    return (
      <div className="p-5 bg-card border border-border rounded-xl">
        <h3 className="text-sm font-semibold">Practice timeline</h3>
        <p className="text-xs text-muted-foreground mb-3">Daily check-ins and numeric logs</p>
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          No active practices
        </div>
      </div>
    );
  }

  // 30 days: 21 past + today + 8 future (where duration permits)
  const daysBack = 21;
  const daysForward = 8;
  const totalDays = daysBack + 1 + daysForward;
  const dayList: string[] = [];
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dayList.push(isoDay(d));
  }

  const nowIndex = daysBack;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <h3 className="text-sm font-semibold">Practice timeline</h3>
      <p className="text-xs text-muted-foreground mb-4">
        {active.length} active · past {daysBack} days, next {daysForward} days
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          {/* Header: day ticks */}
          <div className="flex gap-0.5 mb-2 text-[9px] text-muted-foreground" style={{ paddingLeft: '180px', paddingRight: '60px' }}>
            {dayList.map((d, i) => {
              const date = parseDate(d);
              const isToday = i === nowIndex;
              const isFuture = i > nowIndex;
              const isMonday = date.getDay() === 1;
              return (
                <div
                  key={d}
                  className="flex-1 text-center"
                  style={{ color: isToday ? 'var(--primary)' : isFuture ? 'var(--muted-foreground)' : undefined }}
                >
                  {isMonday || isToday ? date.getDate() : ''}
                </div>
              );
            })}
          </div>

          {active.map(({ task, practice }) => {
            const byDate = new Map(practice.entries.map((e) => [e.date, e.value]));
            const streak = computeStreak(practice);

            // For numeric: find max value for scaling
            const maxVal = practice.kind === 'numeric'
              ? Math.max(1, ...practice.entries.map((e) => e.value), practice.target_value ?? 0)
              : 1;

            return (
              <div key={practice.id} className="flex items-center gap-2 mb-2 text-xs">
                <div className="w-[170px] flex-shrink-0 flex items-center gap-2">
                  <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: practice.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{practice.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {task.title}
                      {practice.kind === 'numeric' && practice.unit ? ` · ${practice.unit}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex gap-0.5 relative items-center" style={{ height: '24px' }}>
                  {dayList.map((d, i) => {
                    const val = byDate.get(d);
                    const isToday = i === nowIndex;
                    const isFuture = i > nowIndex;

                    if (practice.kind === 'boolean') {
                      let bg = 'var(--muted)';
                      if (val !== undefined) bg = val > 0 ? practice.color : 'var(--destructive)';
                      return (
                        <div
                          key={d}
                          title={`${d}${val !== undefined ? (val > 0 ? ' ✓' : ' ✗') : ''}`}
                          className={`flex-1 rounded-sm ${isFuture ? 'opacity-30' : ''}`}
                          style={{
                            backgroundColor: bg,
                            height: '16px',
                            outline: isToday ? '2px solid var(--primary)' : undefined,
                            outlineOffset: isToday ? '1px' : undefined,
                          }}
                        />
                      );
                    } else {
                      // Numeric: bar scaled to max value
                      const height = val !== undefined && val > 0
                        ? Math.max(4, (val / maxVal) * 24)
                        : 2;
                      return (
                        <div
                          key={d}
                          title={`${d}${val !== undefined ? `: ${val} ${practice.unit}` : ''}`}
                          className={`flex-1 rounded-sm flex items-end ${isFuture ? 'opacity-30' : ''}`}
                          style={{
                            height: '24px',
                            outline: isToday ? '2px solid var(--primary)' : undefined,
                            outlineOffset: isToday ? '1px' : undefined,
                          }}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: `${height}px`,
                              backgroundColor: val !== undefined && val > 0 ? practice.color : 'var(--muted)',
                              borderRadius: '2px',
                            }}
                          />
                        </div>
                      );
                    }
                  })}
                </div>

                <div className="w-[56px] flex-shrink-0 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                  {streak > 0 ? (
                    <>
                      <Flame size={11} className="text-orange-500" />
                      <span className="font-medium">{streak}</span>
                    </>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Metrics() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [t, w] = await Promise.all([tasksApi.list(), waysApi.list()]);
      setTasks(t);
      setWays(w);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Aggregations
  const analytics = useMemo(() => {
    // Basic status counts
    const byStatus: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
    tasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; });

    // Practices
    const allPractices: { task: Task; practice: Practice }[] = [];
    tasks.forEach((t) => t.practices.forEach((p) => allPractices.push({ task: t, practice: p })));
    const activePractices = allPractices.filter((pp) => pp.practice.status === 'active');

    // Status × Status (just status counts)
    const statusByStatus = Object.entries(byStatus)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: STATUS_LABEL[k], value: v, color: STATUS_COLORS[k] }));

    // Status × Priority (count per priority)
    const statusByPriority: { name: string; value: number; color: string }[] = [];
    for (const p of ['high', 'medium', 'low'] as const) {
      const count = tasks.filter((t) => t.priority === p).length;
      if (count > 0) statusByPriority.push({ name: PRIORITY_LABEL[p], value: count, color: PRIORITY_COLORS[p] });
    }

    // Status × Tag — count tasks per tag
    const tagCounts = new Map<string, { name: string; color: string; count: number }>();
    for (const t of tasks) {
      for (const tg of t.tags ?? []) {
        const existing = tagCounts.get(tg.id);
        if (existing) existing.count += 1;
        else tagCounts.set(tg.id, { name: tg.name, color: tg.color, count: 1 });
      }
    }
    const statusByTag = [...tagCounts.values()]
      .sort((a, b) => b.count - a.count)
      .map((t) => ({ name: t.name, value: t.count, color: t.color }));

    return {
      totalTasks: tasks.length,
      completedTasks: byStatus.done,
      inProgressTasks: byStatus.in_progress,
      backlogTasks: byStatus.todo,
      allPractices, activePractices,
      statusByStatus, statusByPriority, statusByTag,
    };
  }, [tasks]);

  // Notes tag breakdown
  const tagStats = useMemo(() => {
    const notes = [];
    for (const w of ways) {
      if (w.note) notes.push(w.note);
      for (const t of w.topics) {
        if (t.inline_note) notes.push(t.inline_note);
        notes.push(...t.notes);
      }
    }
    const byTag = new Map<string, { id: string; name: string; color: string; count: number }>();
    for (const n of notes) {
      for (const tag of n.tags ?? []) {
        const existing = byTag.get(tag.id);
        if (existing) existing.count += 1;
        else byTag.set(tag.id, { id: tag.id, name: tag.name, color: tag.color, count: 1 });
      }
    }
    const breakdown = [...byTag.values()].sort((a, b) => b.count - a.count);
    const total = breakdown.reduce((s, t) => s + t.count, 0);
    return { breakdown, total, totalNotes: notes.length };
  }, [ways]);

  const completionRate = analytics.totalTasks > 0 ? (analytics.completedTasks / analytics.totalTasks) * 100 : 0;

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visual breakdown of your work</p>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatTile icon={TargetIcon} label="Total tasks" value={analytics.totalTasks} sub={`${analytics.backlogTasks} in backlog`} />
          <StatTile icon={Clock} label="In progress" value={analytics.inProgressTasks} sub="currently working on" tone="warning" />
          <StatTile icon={CheckCircle2} label="Completed" value={analytics.completedTasks} sub={`${completionRate.toFixed(0)}% done`} tone="success" />
          <StatTile icon={Activity} label="Active practices" value={analytics.activePractices.length} sub={`${analytics.allPractices.length} total`} />
        </div>

        {analytics.totalTasks === 0 && analytics.allPractices.length === 0 && tagStats.total === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <BarChart3 size={28} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">Create tasks, practices, or tag notes to see analytics.</p>
          </div>
        ) : (
          <>
            {/* Three pie charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatusPie title="Tasks by tag" subtitle="Distribution across tags" data={analytics.statusByTag} />
              <StatusPie title="Tasks by priority" subtitle="Distribution by priority level" data={analytics.statusByPriority} />
              <StatusPie title="Tasks by status" subtitle="Distribution by workflow status" data={analytics.statusByStatus} />
            </div>

            {/* Task timeline */}
            <div className="mb-6">
              <TaskTimeline tasks={tasks} />
            </div>

            {/* Practice timeline */}
            <div className="mb-6">
              <PracticeTimeline practices={analytics.allPractices} />
            </div>

            {/* Notes by tag (small) */}
            {tagStats.total > 0 && (
              <div className="p-5 bg-card border border-border rounded-xl mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">Notes by tag</h3>
                    <p className="text-xs text-muted-foreground">
                      {tagStats.total} tagged of {tagStats.totalNotes} notes
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Hash size={12} />
                    {tagStats.breakdown.length} tags
                  </div>
                </div>
                <div className="space-y-1.5">
                  {tagStats.breakdown.slice(0, 10).map((t) => {
                    const pct = (t.count / tagStats.total) * 100;
                    return (
                      <div key={t.id} className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium flex-shrink-0"
                          style={{
                            backgroundColor: `${t.color}20`,
                            color: t.color,
                            border: `1px solid ${t.color}40`,
                          }}
                        >
                          {t.name}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: t.color }} />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground w-8 text-right flex-shrink-0">
                          {t.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
