import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { gosApi } from '../../api/client';
import type { Go, Step, Task } from '../../api/types';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import CreateGoForm from './CreateGoForm';
import GoRow from './GoRow';

export default function GoPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const t = useT();
  const [todayItems, setTodayItems] = useState<Go[]>([]);
  const [pastItems, setPastItems] = useState<Go[]>([]);
  const [futureItems, setFutureItems] = useState<Go[]>([]);
  const [pastDays, setPastDays] = useState(30);
  const [pastOpen, setPastOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [today, past, future] = await Promise.all([
        gosApi.agenda('today'),
        gosApi.agenda('past', pastDays),
        gosApi.agenda('future'),
      ]);
      setTodayItems(today);
      setPastItems(past);
      setFutureItems(future);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pastDays]);

  const reload = async () => { await load(); await onReload(); };

  const futureGroups = useMemo(() => {
    const groups = new Map<string, Go[]>();
    for (const item of futureItems) {
      const key = item.due_date || 'no-date';
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [futureItems]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLabel = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const todayIsoStr = today.toISOString().split('T')[0];
  const completedToday = todayItems.filter((g) => (g.entries.find((e) => e.date === todayIsoStr)?.value ?? 0) > 0).length;

  // API field name is `sprints`; on the FE these are Steps.
  const stepsByTask = useMemo(() => {
    const m = new Map<string, Step[]>();
    tasks.forEach((tk) => m.set(tk.id, tk.sprints));
    return m;
  }, [tasks]);

  const patchGoLocal = (patched: Go) => {
    const upd = (list: Go[]) => list.map((g) => g.id === patched.id ? patched : g);
    setTodayItems(upd);
    setPastItems(upd);
    setFutureItems(upd);
  };

  const focusByTask = useMemo(() => {
    const m = new Map<string, { done: number; total: number; color: string }>();
    for (const g of todayItems) {
      const key = g.task_title || 'Standalone';
      const entry = m.get(key) ?? { done: 0, total: 0, color: g.color };
      entry.total++;
      const val = g.entries.find((e) => e.date === todayIsoStr)?.value ?? 0;
      if (val > 0) entry.done++;
      m.set(key, entry);
    }
    return [...m.entries()];
  }, [todayItems, todayIsoStr]);

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }

  const donePct = todayItems.length > 0 ? Math.round(100 * completedToday / todayItems.length) : 0;

  return (
    <>
      {!adding && <AddItemButton label={t('tasks.addGo')} onClick={() => setAdding(true)} />}

      <CreateGoForm
        open={adding}
        tasks={tasks}
        onCancel={() => setAdding(false)}
        onCreate={async (data) => {
          await gosApi.create(data);
          setAdding(false);
          await reload();
        }}
      />

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Done today</div>
          <div className="kpi-value">{completedToday}<span style={{ fontSize: 14, color: 'var(--fg-muted)', fontWeight: 400 }}> / {todayItems.length}</span></div>
          <div className="kpi-trend" data-trend={donePct > 0 ? undefined : 'neutral'}>{donePct}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Streak</div>
          <div className="kpi-value">—</div>
          <div className="kpi-trend" data-trend="neutral">days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Upcoming</div>
          <div className="kpi-value">{futureItems.length}</div>
          <div className="kpi-trend" data-trend="neutral">next 7 days</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Past {pastDays} days</div>
          <div className="kpi-value">{pastItems.length}</div>
          <div className="kpi-trend" data-trend="neutral">items</div>
        </div>
      </div>

      <div className="section-row">
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <button className="past-bar" onClick={() => setPastOpen(!pastOpen)}>
              {pastOpen ? <ChevronDown size={11} strokeWidth={2} /> : <ChevronRight size={11} strokeWidth={2} />}
              <span>Past</span>
              <span className="past-bar-meta">{pastItems.length} items · {pastDays}d</span>
            </button>

            {pastOpen && (
              <div style={{ marginTop: 8 }}>
                {pastItems.length === 0 ? (
                  <div className="py-4 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>{t('go.nothingPast', { days: pastDays })}</div>
                ) : pastItems.map((g) => (
                  <GoRow key={g.id} go={g}
                    availableSteps={g.task_id ? stepsByTask.get(g.task_id) : undefined}
                    onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
                ))}
                <button onClick={() => setPastDays(pastDays + 30)} className="btn btn-ghost btn-sm w-full">
                  {t('go.showOlder', { days: pastDays })}
                </button>
              </div>
            )}
          </div>

          <section style={{ marginBottom: 24 }}>
            <div className="day-head">
              <h2 className="day-head-title">{t('go.today')} · {todayLabel}</h2>
              <span className="day-head-meta">{completedToday} of {todayItems.length} done</span>
            </div>
            {todayItems.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('go.nothingToday')}</div>
            ) : todayItems.map((g) => (
              <GoRow key={g.id} go={g}
                availableSteps={g.task_id ? stepsByTask.get(g.task_id) : undefined}
                onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
            ))}
          </section>

          <section>
            <div className="day-head">
              <h2 className="day-head-title">{t('go.future')}</h2>
              <span className="day-head-meta">{futureItems.length} upcoming</span>
            </div>
            {futureGroups.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('go.noFuture')}</div>
            ) : futureGroups.map(([date, list]) => (
              <div key={date} style={{ marginBottom: 14 }}>
                <div className="date-label">
                  {date === 'no-date' ? 'No date' :
                    new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                {list.map((g) => (
                  <GoRow key={g.id} go={g}
                    availableSteps={g.task_id ? stepsByTask.get(g.task_id) : undefined}
                    onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
                ))}
              </div>
            ))}
          </section>
        </div>

        <aside className="right-panel">
          <div className="panel-card">
            <div className="panel-head">Today's focus</div>
            {focusByTask.length === 0 ? (
              <p className="panel-empty">No gos today</p>
            ) : focusByTask.map(([name, { done, total, color }]) => (
              <div key={name} className="panel-row">
                <span className="dot" style={{ background: color || 'var(--fg-muted)' }} />
                <span className="panel-row-title">{name}</span>
                <span className="panel-row-meta">{done} / {total}</span>
              </div>
            ))}
          </div>
          <div className="panel-card">
            <div className="panel-head">Last 14 days</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 50, gap: 3, paddingTop: 8 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const h = 30 + Math.round(Math.random() * 60);
                const isToday = i === 13;
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h}%`, borderRadius: 2,
                    background: isToday ? 'var(--accent-sprints)' : 'var(--success)',
                    opacity: isToday ? 1 : 0.5 + (h / 200),
                  }} />
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>14d ago</span><span>today</span>
            </div>
          </div>
          <div className="panel-card">
            <div className="panel-head">Tip</div>
            <p className="panel-prose">Group your gos by goal for a clearer picture of what moves the needle most today.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
