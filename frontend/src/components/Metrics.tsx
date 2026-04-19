import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Loader2,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { tasksApi } from '../api/client';
import type { Practice, Task } from '../api/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
function pastDays(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split('T')[0]);
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
    const key = d.toISOString().split('T')[0];
    const v = byDate.get(key);
    if (v === undefined) {
      if (i === 0) continue;
      break;
    }
    if (v > 0) streak++;
    else break;
  }
  return streak;
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Backlog',
  in_progress: 'In Progress',
  done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#f59e0b',
  done: '#10b981',
};

// ─── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneCls = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-chart-5/10 text-chart-5',
    warning: 'bg-chart-3/10 text-chart-3',
    danger: 'bg-destructive/10 text-destructive',
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

// ─── Practice progress row ───────────────────────────────────────────────────
function PracticeRow({ task, practice }: { task: Task; practice: Practice }) {
  const streak = computeStreak(practice);
  const completedDays = practice.entries.filter((e) => e.value > 0).length;
  const progressPct = practice.duration_days
    ? Math.min(100, (completedDays / practice.duration_days) * 100)
    : 0;

  const last7 = pastDays(7);
  const byDate = new Map(practice.entries.map((e) => [e.date, e.value]));

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-secondary/50 transition-colors">
      <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: practice.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium truncate">{practice.title}</span>
          {practice.status === 'paused' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              paused
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">from: {task.title}</div>
      </div>

      <div className="flex gap-0.5 flex-shrink-0">
        {last7.map((d) => {
          const v = byDate.get(d);
          return (
            <div
              key={d}
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor:
                  v === undefined ? 'var(--muted)' : v > 0 ? practice.color : 'var(--destructive)',
                opacity: v === undefined ? 1 : v > 0 ? 1 : 0.4,
              }}
              title={`${d}${v !== undefined ? (v > 0 ? ' ✓' : ' ✗') : ''}`}
            />
          );
        })}
      </div>

      {streak > 0 && (
        <div className="flex items-center gap-0.5 text-xs font-medium text-orange-600 dark:text-orange-400 flex-shrink-0 w-10 justify-end">
          <Flame size={12} />
          {streak}
        </div>
      )}

      <div className="w-28 flex-shrink-0">
        {practice.duration_days ? (
          <>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
              <span>{completedDays}/{practice.duration_days}</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: practice.color }}
              />
            </div>
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground text-right">
            {completedDays} logged
          </div>
        )}
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
      const data = await tasksApi.list();
      setTasks(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Aggregations ────────────────────────────────────────────────────────
  const {
    totalTasks,
    completedTasks,
    inProgressTasks,
    backlogTasks,
    allPractices,
    activePractices,
    pausedPractices,
    totalStreak,
    totalEntries,
    tasksByStatus,
    priorityBreakdown,
    last30Activity,
  } = useMemo(() => {
    const practices: { task: Task; practice: Practice }[] = [];
    tasks.forEach((t) => t.practices.forEach((p) => practices.push({ task: t, practice: p })));

    const active = practices.filter((pp) => pp.practice.status === 'active');
    const paused = practices.filter((pp) => pp.practice.status === 'paused');

    const streaks = active.map((pp) => computeStreak(pp.practice));
    const totalStreak = streaks.reduce((s, x) => s + x, 0);

    const totalEntries = practices.reduce((s, pp) => s + pp.practice.entries.length, 0);

    const byStatus: Record<string, number> = { todo: 0, in_progress: 0, done: 0 };
    tasks.forEach((t) => { byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; });

    const priorityBreakdown = (['high', 'medium', 'low'] as const).map((p) => ({
      priority: p,
      count: tasks.filter((t) => t.priority === p && t.status !== 'done').length,
    }));

    // 30-day activity: how many practice entries each day
    const days = pastDays(30);
    const activityMap = new Map<string, number>();
    days.forEach((d) => activityMap.set(d, 0));
    practices.forEach(({ practice }) => {
      practice.entries.forEach((e) => {
        if (e.value > 0 && activityMap.has(e.date)) {
          activityMap.set(e.date, (activityMap.get(e.date) ?? 0) + 1);
        }
      });
    });
    const last30Activity = days.map((d) => ({
      date: new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: activityMap.get(d) ?? 0,
    }));

    return {
      totalTasks: tasks.length,
      completedTasks: byStatus.done,
      inProgressTasks: byStatus.in_progress,
      backlogTasks: byStatus.todo,
      allPractices: practices,
      activePractices: active,
      pausedPractices: paused,
      totalStreak,
      totalEntries,
      tasksByStatus: byStatus,
      priorityBreakdown,
      last30Activity,
    };
  }, [tasks]);

  const statusPieData = Object.entries(tasksByStatus)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: STATUS_LABEL[k] ?? k, value: v, color: STATUS_COLORS[k] }));

  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

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
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview of your tasks and practices
          </p>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatTile icon={Target} label="Total tasks" value={totalTasks} sub={`${backlogTasks} in backlog`} />
          <StatTile
            icon={Clock}
            label="In progress"
            value={inProgressTasks}
            sub="currently working on"
            tone="warning"
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={completedTasks}
            sub={`${completionRate.toFixed(0)}% done`}
            tone="success"
          />
          <StatTile
            icon={Activity}
            label="Active practices"
            value={activePractices.length}
            sub={pausedPractices.length > 0 ? `${pausedPractices.length} paused` : 'keep going'}
            tone="default"
          />
        </div>

        {totalTasks === 0 && allPractices.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl py-16 text-center">
            <BarChart3 size={28} className="mx-auto mb-3 text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">
              Create tasks and practices to see your dashboard.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {/* 30-day activity */}
              <div className="lg:col-span-2 p-5 bg-card border border-border rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold">30-day activity</h3>
                    <p className="text-xs text-muted-foreground">Practice entries logged per day</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Zap size={12} className="text-primary" />
                    {totalEntries} total entries
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last30Activity}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} interval={4} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--popover)',
                          border: '1px solid var(--border)',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status distribution */}
              <div className="p-5 bg-card border border-border rounded-xl">
                <h3 className="text-sm font-semibold mb-1">Tasks by status</h3>
                <p className="text-xs text-muted-foreground mb-3">Distribution</p>
                {statusPieData.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusPieData}
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {statusPieData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--popover)',
                            border: '1px solid var(--border)',
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                          }}
                        />
                        <Legend
                          iconSize={8}
                          wrapperStyle={{ fontSize: '11px' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
                    No data
                  </div>
                )}
              </div>
            </div>

            {/* Priority + streaks */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="p-5 bg-card border border-border rounded-xl">
                <h3 className="text-sm font-semibold mb-1">Active by priority</h3>
                <p className="text-xs text-muted-foreground mb-4">Excluding completed</p>
                <div className="space-y-2.5">
                  {priorityBreakdown.map(({ priority, count }) => {
                    const max = Math.max(...priorityBreakdown.map((p) => p.count), 1);
                    const pct = (count / max) * 100;
                    const colors = {
                      high: 'bg-destructive',
                      medium: 'bg-chart-3',
                      low: 'bg-muted-foreground',
                    }[priority];
                    return (
                      <div key={priority}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="capitalize">{priority}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${colors} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-2 p-5 bg-card border border-border rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold">Top streaks</h3>
                    <p className="text-xs text-muted-foreground">Consecutive days logged</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                    <Flame size={13} />
                    {totalStreak} total days
                  </div>
                </div>
                <div className="space-y-2">
                  {activePractices
                    .map(({ task, practice }) => ({ task, practice, streak: computeStreak(practice) }))
                    .sort((a, b) => b.streak - a.streak)
                    .slice(0, 5)
                    .map(({ task, practice, streak }) => (
                      <div key={practice.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md">
                        <div
                          className="w-1 h-8 rounded-full flex-shrink-0"
                          style={{ backgroundColor: practice.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{practice.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{task.title}</div>
                        </div>
                        <div className="flex items-center gap-0.5 text-sm font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">
                          <Flame size={13} />
                          {streak}
                        </div>
                      </div>
                    ))}
                  {activePractices.length === 0 && (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No active practices yet
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* All practices progress */}
            {allPractices.length > 0 && (
              <div className="p-5 bg-card border border-border rounded-xl mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold">All practices</h3>
                    <p className="text-xs text-muted-foreground">Last 7 days + progress</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingUp size={12} />
                    {allPractices.length} practices across {tasks.filter((t) => t.practices.length > 0).length} tasks
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {allPractices.map(({ task, practice }) => (
                    <PracticeRow key={practice.id} task={task} practice={practice} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
