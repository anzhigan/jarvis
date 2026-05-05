import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Target, Repeat, BookOpen, Flame, TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { tasksApi, routinesApi, waysApi } from '../../api/client';
import type { Routine, Task, Way } from '../../api/types';
import { Segmented } from '../ui';
import { currentStreak, ymd } from './routines/heatmap';

type Period = '7d' | '30d' | '90d' | '365d';

const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '365d': 365 };

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default function AnalysisView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');

  useEffect(() => {
    const load = async () => {
      try {
        const [t, r, w] = await Promise.all([
          tasksApi.list(),
          routinesApi.list(),
          waysApi.list().catch(() => [] as Way[]),
        ]);
        setTasks(t); setRoutines(r); setWays(w);
      } catch (e: any) {
        toast.error(e?.detail ?? 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const days = PERIOD_DAYS[period];

  const noteCount = useMemo(() => {
    let c = 0;
    for (const w of ways) {
      c += w.notes.length;
      for (const t of w.topics) c += t.notes.length;
    }
    return c;
  }, [ways]);

  const goalKpi = useMemo(() => {
    const active = tasks.filter((t) => t.status === 'active').length;
    const done   = tasks.filter((t) => t.status === 'done').length;
    const total  = tasks.length;
    return { active, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  const routineKpi = useMemo(() => {
    const active = routines.filter((r) => !r.is_paused).length;
    return { total: routines.length, active };
  }, [routines]);

  const topStreak = useMemo(() => {
    let best = 0;
    for (const r of routines) {
      const s = currentStreak(r);
      if (s > best) best = s;
    }
    return best;
  }, [routines]);

  // ─── Activity timeline: completions per day across goals + routines ────
  const activitySeries = useMemo(() => {
    const out: { date: string; goals: number; routines: number; total: number; label: string }[] = [];
    const today = startOfDay(new Date());
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(today, -i);
      const key = ymd(d);
      const goalsDone = tasks.filter((t) => t.status === 'done' && t.updated_at && ymd(new Date(t.updated_at)) === key).length;
      let routinesDone = 0;
      for (const r of routines) {
        if (r.entries?.some((e) => e.date === key && e.value > 0)) routinesDone++;
      }
      out.push({
        date: key,
        goals: goalsDone,
        routines: routinesDone,
        total: goalsDone + routinesDone,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      });
    }
    return out;
  }, [tasks, routines, days]);

  // ─── Status pie ────────────────────────────────────────────────────────
  const statusPie = useMemo(() => {
    const counts = { backlog: 0, active: 0, paused: 0, done: 0 };
    for (const t of tasks) counts[t.status as keyof typeof counts]++;
    return [
      { name: 'Backlog', value: counts.backlog, color: 'var(--fg-faint)' },
      { name: 'Active',  value: counts.active,  color: '#F59E0B' },
      { name: 'On hold', value: counts.paused,  color: '#71717A' },
      { name: 'Done',    value: counts.done,    color: '#10B981' },
    ].filter((d) => d.value > 0);
  }, [tasks]);

  // ─── Priority bar ──────────────────────────────────────────────────────
  const priorityData = useMemo(() => {
    const c = { low: 0, medium: 0, high: 0 };
    for (const t of tasks) if (t.status !== 'done') c[t.priority]++;
    return [
      { name: 'Low',    count: c.low },
      { name: 'Medium', count: c.medium },
      { name: 'High',   count: c.high },
    ];
  }, [tasks]);

  // ─── Top streaks ───────────────────────────────────────────────────────
  const topStreaks = useMemo(() => {
    return routines
      .map((r) => ({ id: r.id, title: r.title, streak: currentStreak(r) }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 5);
  }, [routines]);

  if (loading) {
    return (
      <div className="dt-page" data-visible="true">
        <div className="size-full flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dt-page" data-visible="true">
      <div className="dt-vw">
        <header className="dt-vw-head">
          <div className="dt-vw-head-text">
            <h1 className="dt-vw-title">Analysis</h1>
            <p className="dt-vw-subtitle">Overview of your goals, routines, and notes</p>
          </div>
          <div className="dt-vw-head-actions">
            <Segmented<Period>
              value={period}
              onChange={setPeriod}
              options={[
                { value: '7d',   label: '7 days' },
                { value: '30d',  label: '30 days' },
                { value: '90d',  label: '90 days' },
                { value: '365d', label: '1 year' },
              ]}
            />
          </div>
        </header>

        <div className="dt-vw-body">
          <div className="an-grid">
            <div className="an-card" data-span="3">
              <span className="an-kpi-label">Goals</span>
              <span className="an-kpi-value">{goalKpi.total}</span>
              <span className="an-kpi-trend"><Target size={11} /> {goalKpi.active} active · {goalKpi.done} done</span>
            </div>
            <div className="an-card" data-span="3">
              <span className="an-kpi-label">Completion rate</span>
              <span className="an-kpi-value">{goalKpi.pct}%</span>
              <span className="an-kpi-trend" data-tone={goalKpi.pct >= 50 ? 'up' : undefined}>
                <TrendingUp size={11} /> done / total
              </span>
            </div>
            <div className="an-card" data-span="3">
              <span className="an-kpi-label">Routines</span>
              <span className="an-kpi-value">{routineKpi.active}</span>
              <span className="an-kpi-trend"><Repeat size={11} /> {routineKpi.total} total</span>
            </div>
            <div className="an-card" data-span="3">
              <span className="an-kpi-label">Top streak</span>
              <span className="an-kpi-value">{topStreak}</span>
              <span className="an-kpi-trend" data-tone={topStreak > 0 ? 'up' : undefined}>
                <Flame size={11} /> consecutive days
              </span>
            </div>

            <div className="an-card" data-span="8">
              <div className="an-card-title">Activity over time</div>
              <div className="an-card-sub">Goals completed & routines done per day</div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={activitySeries}>
                    <defs>
                      <linearGradient id="g-goals" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-rout" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--fg-muted)" fontSize={11} interval={Math.max(0, Math.floor(days / 7) - 1)} />
                    <YAxis stroke="var(--fg-muted)" fontSize={11} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'var(--bg-elevated)',
                        border: 0,
                        borderRadius: 'var(--r-control)',
                        boxShadow: 'var(--sh-popover)',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="goals" stroke="#F59E0B" fillOpacity={1} fill="url(#g-goals)" name="Goals" />
                    <Area type="monotone" dataKey="routines" stroke="#10B981" fillOpacity={1} fill="url(#g-rout)" name="Routines" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="an-card" data-span="4">
              <div className="an-card-title">Goal status</div>
              <div className="an-card-sub">Distribution across kanban</div>
              <div style={{ width: '100%', height: 240 }}>
                {statusPie.length === 0 ? (
                  <div className="dt-empty"><span className="dt-empty-desc">No goals yet</span></div>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={statusPie} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                        {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          background: 'var(--bg-elevated)',
                          border: 0,
                          borderRadius: 'var(--r-control)',
                          boxShadow: 'var(--sh-popover)',
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="an-card" data-span="6">
              <div className="an-card-title">Open goals by priority</div>
              <div className="an-card-sub">Active + paused + backlog</div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={priorityData} layout="vertical">
                    <CartesianGrid stroke="var(--line)" horizontal={false} />
                    <XAxis type="number" stroke="var(--fg-muted)" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="var(--fg-muted)" fontSize={11} width={70} />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'var(--bg-elevated)',
                        border: 0,
                        borderRadius: 'var(--r-control)',
                        boxShadow: 'var(--sh-popover)',
                        fontSize: 12,
                      }}
                      cursor={{ fill: 'var(--bg-hover)' }}
                    />
                    <Bar dataKey="count" fill="var(--accent-goals)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="an-card" data-span="6">
              <div className="an-card-title">Top streaks</div>
              <div className="an-card-sub">Your strongest routines right now</div>
              <div className="mt-2">
                {topStreaks.length === 0 || topStreaks.every((s) => s.streak === 0) ? (
                  <div className="dt-empty"><span className="dt-empty-desc">Nothing on a streak yet</span></div>
                ) : topStreaks.map((s) => (
                  <div key={s.id} className="an-streak-row" data-tone={s.streak === 0 ? 'muted' : undefined}>
                    <Flame size={13} style={{ color: s.streak > 0 ? 'var(--success)' : 'var(--fg-faint)' }} />
                    <span className="an-streak-name">{s.title}</span>
                    <span className="an-streak-value">{s.streak}d</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="an-card" data-span="4">
              <span className="an-kpi-label">Notes</span>
              <span className="an-kpi-value">{noteCount}</span>
              <span className="an-kpi-trend"><BookOpen size={11} /> across {ways.length} ways</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
