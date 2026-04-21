import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Loader2,
  Target as TargetIcon,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi } from '../api/client';
import type { Task, Todo } from '../api/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function isoDay(d: Date): string { return d.toISOString().split('T')[0]; }
function parseDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function daysBetween(a: Date, b: Date): number { return Math.round((+b - +a) / 86_400_000); }

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

// ─── Generic pie chart ───────────────────────────────────────────────────────
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
                <Tooltip contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '12px' }} />
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
    min.setHours(0, 0, 0, 0); max.setHours(0, 0, 0, 0);
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

  const sorted = [...rangedTasks].sort((a, b) => +parseDate(a.due_date!) - +parseDate(b.due_date!));
  const nowPct = (daysBetween(range.start, now) / range.days) * 100;
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
          <div className="relative h-6 mb-2 border-b border-border">
            {ticks.map((t) => (
              <div key={t.pct} className="absolute top-0 text-[10px] text-muted-foreground" style={{ left: `${t.pct}%`, transform: 'translateX(-50%)' }}>
                {t.label}
              </div>
            ))}
            {nowPct >= 0 && nowPct <= 100 && (
              <div className="absolute top-0 bottom-0 w-px bg-primary" style={{ left: `${nowPct}%` }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] text-primary font-medium whitespace-nowrap">Today</div>
              </div>
            )}
          </div>

          <div className="space-y-2 relative">
            {nowPct >= 0 && nowPct <= 100 && (
              <div className="absolute top-0 bottom-0 w-px bg-primary/40 pointer-events-none z-10" style={{ left: `${nowPct}%` }} />
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

// ─── Progress trend (line chart over 30 days based on daily todo completion) ─
function ProgressTrend({ tasks }: { tasks: Task[] }) {
  const [mode, setMode] = useState<'combined' | 'per'>('combined');

  // Collect all todos
  const allTodos: { task: Task; todo: Todo }[] = [];
  tasks.forEach((t) => t.todos.forEach((td) => allTodos.push({ task: t, todo: td })));

  if (allTodos.length === 0) {
    return (
      <div className="p-5 bg-card border border-border rounded-xl">
        <h3 className="text-sm font-semibold">Productivity trend</h3>
        <p className="text-xs text-muted-foreground mb-3">Daily progress across all todos</p>
        <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
          No todos yet
        </div>
      </div>
    );
  }

  const DAYS = 30;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayList: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayList.push(isoDay(d));
  }

  type Row = { date: string; dateLabel: string; combined: number | null; [key: string]: string | number | null };

  // For each todo compute per-day score (0..1)
  function scoreTodo(t: Todo, val: number | undefined): number | null {
    if (val === undefined) return null;
    if (t.kind === 'boolean') return val > 0 ? 1 : 0;
    // numeric
    const target = t.target_value ?? 0;
    if (target > 0) return Math.min(1, val / target);
    const max = Math.max(1, ...t.entries.map((e) => e.value));
    return val / max;
  }

  const rows: Row[] = dayList.map((date) => {
    const d = parseDate(date);
    const row: Row = {
      date,
      dateLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      combined: null,
    };
    const scores: number[] = [];
    for (const { todo } of allTodos) {
      const entry = todo.entries.find((e) => e.date === date);
      const s = scoreTodo(todo, entry?.value);
      row[`t_${todo.id}`] = s === null ? null : Math.round(s * 100);
      if (s !== null) scores.push(s);
    }
    row.combined = scores.length > 0 ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) : null;
    return row;
  });

  const filled = rows.map((r) => r.combined).filter((v): v is number => v !== null);
  const avg = filled.length > 0 ? Math.round(filled.reduce((s, v) => s + v, 0) / filled.length) : 0;
  const last7 = rows.slice(-7).map((r) => r.combined).filter((v): v is number => v !== null);
  const last7Avg = last7.length > 0 ? Math.round(last7.reduce((s, v) => s + v, 0) / last7.length) : 0;
  const trend = last7Avg - avg;

  return (
    <div className="p-5 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between mb-2 gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Productivity trend</h3>
          <p className="text-xs text-muted-foreground">Last {DAYS} days — average completion across todos</p>
        </div>
        <div className="flex text-xs bg-muted rounded-md p-0.5">
          <button onClick={() => setMode('combined')} className={`px-2.5 h-7 rounded ${mode === 'combined' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Combined</button>
          <button onClick={() => setMode('per')} className={`px-2.5 h-7 rounded ${mode === 'per' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Per todo</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">30-day avg</div>
          <div className="text-lg font-semibold">{avg}%</div>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Last 7 days</div>
          <div className="text-lg font-semibold">{last7Avg}%</div>
        </div>
        <div className="p-2.5 rounded-lg bg-muted/40">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Trend</div>
          <div className={`text-lg font-semibold ${trend > 0 ? 'text-chart-5' : trend < 0 ? 'text-destructive' : ''}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={Math.max(1, Math.floor(DAYS / 8))} stroke="var(--border)" />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} domain={[0, 100]} stroke="var(--border)" tickFormatter={(v) => `${v}%`} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '12px' }}
              formatter={(value: number | null, name: string) => {
                if (value === null || value === undefined) return ['—', name];
                return [`${value}%`, name];
              }}
            />
            {mode === 'combined' ? (
              <Line type="monotone" dataKey="combined" name="Productivity" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#4f46e5' }} activeDot={{ r: 5 }} connectNulls />
            ) : (
              <>
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                {allTodos.map(({ todo }) => (
                  <Line key={todo.id} type="monotone" dataKey={`t_${todo.id}`} name={todo.title} stroke={todo.color} strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: todo.color }} activeDot={{ r: 4 }} connectNulls />
                ))}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
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

  const analytics = useMemo(() => {
    const byStatus: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
    tasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; });

    const allTodos: { task: Task; todo: Todo }[] = [];
    tasks.forEach((t) => t.todos.forEach((td) => allTodos.push({ task: t, todo: td })));

    const statusByStatus = Object.entries(byStatus)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: STATUS_LABEL[k], value: v, color: STATUS_COLORS[k] }));

    const statusByPriority: { name: string; value: number; color: string }[] = [];
    for (const p of ['high', 'medium', 'low'] as const) {
      const count = tasks.filter((t) => t.priority === p).length;
      if (count > 0) statusByPriority.push({ name: PRIORITY_LABEL[p], value: count, color: PRIORITY_COLORS[p] });
    }

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
      allTodos,
      statusByStatus, statusByPriority, statusByTag,
    };
  }, [tasks]);

  const completionRate = analytics.totalTasks > 0 ? (analytics.completedTasks / analytics.totalTasks) * 100 : 0;

  if (loading) {
    return <div className="size-full flex items-center justify-center"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="size-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visual breakdown of your work</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatTile icon={TargetIcon} label="Total tasks" value={analytics.totalTasks} sub={`${analytics.backlogTasks} in backlog`} />
          <StatTile icon={Clock} label="In progress" value={analytics.inProgressTasks} sub="currently working on" tone="warning" />
          <StatTile icon={CheckCircle2} label="Completed" value={analytics.completedTasks} sub={`${completionRate.toFixed(0)}% done`} tone="success" />
          <StatTile icon={Activity} label="Todos" value={analytics.allTodos.length} sub="total tracked" />
        </div>

        {analytics.totalTasks === 0 && analytics.allTodos.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <BarChart3 size={28} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">Create tasks and todos to see analytics.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <StatusPie title="Tasks by tag" subtitle="Distribution across tags" data={analytics.statusByTag} />
              <StatusPie title="Tasks by priority" subtitle="Distribution by priority" data={analytics.statusByPriority} />
              <StatusPie title="Tasks by status" subtitle="Distribution by status" data={analytics.statusByStatus} />
            </div>

            <div className="mb-6">
              <TaskTimeline tasks={tasks} />
            </div>

            <div className="mb-6">
              <ProgressTrend tasks={tasks} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
