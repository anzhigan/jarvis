import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  const [filter, setFilter] = useState<'past' | 'today' | 'future'>('today');
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
  // Build YYYY-MM-DD from local date components — toISOString() would give a UTC date.
  const todayIsoStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
      <div className="chips-row chips-row-fill">
        <button className="chip" data-active={filter === 'past'} onClick={() => setFilter('past')}>
          Past <span className="chip-count">{pastItems.length}</span>
        </button>
        <button className="chip" data-active={filter === 'today'} onClick={() => setFilter('today')}>
          Today <span className="chip-count">{todayItems.length}</span>
        </button>
        <button className="chip" data-active={filter === 'future'} onClick={() => setFilter('future')}>
          Future <span className="chip-count">{futureItems.length}</span>
        </button>
      </div>

      <div className="add-row">
        <AddItemButton label={t('tasks.addGo')} onClick={() => setAdding(true)} />
      </div>

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
          {filter === 'past' && (
            <section>
              {pastItems.length === 0 ? (
                <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('go.nothingPast', { days: pastDays })}</div>
              ) : pastItems.map((g) => (
                <GoRow key={g.id} go={g}
                  availableSteps={g.task_id ? stepsByTask.get(g.task_id) : undefined}
                  onReload={reload} onLocalUpdate={patchGoLocal} showMeta />
              ))}
              {pastItems.length > 0 && (
                <button onClick={() => setPastDays(pastDays + 30)} className="btn btn-ghost btn-sm w-full" style={{ marginTop: 8 }}>
                  {t('go.showOlder', { days: pastDays })}
                </button>
              )}
            </section>
          )}

          {filter === 'today' && (
            <section>
              <div className="day-head">
                <h2 className="day-head-title">{todayLabel}</h2>
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
          )}

          {filter === 'future' && (
            <section>
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
          )}
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
              {(() => {
                // Compute % done per day across all gos that existed on that day.
                const days: { iso: string; pct: number }[] = [];
                const allGos = [...todayItems, ...pastItems, ...futureItems];
                for (let offset = 13; offset >= 0; offset--) {
                  const d = new Date();
                  d.setHours(0, 0, 0, 0);
                  d.setDate(d.getDate() - offset);
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  let done = 0;
                  let total = 0;
                  for (const g of allGos) {
                    const created = new Date(g.created_at); created.setHours(0, 0, 0, 0);
                    if (created > d) continue;
                    if (g.due_date && new Date(g.due_date + 'T00:00:00') < d) continue;
                    total++;
                    if ((g.entries.find((e) => e.date === iso)?.value ?? 0) > 0) done++;
                  }
                  days.push({ iso, pct: total > 0 ? Math.round(100 * done / total) : 0 });
                }
                return days.map(({ iso, pct }, i) => {
                  const h = Math.max(8, pct);
                  const isToday = i === 13;
                  return (
                    <div key={iso} title={`${iso}: ${pct}%`} style={{
                      flex: 1, height: `${h}%`, borderRadius: 2,
                      background: isToday ? 'var(--accent-sprints)' : 'var(--success)',
                      opacity: isToday ? 1 : 0.4 + pct / 200,
                    }} />
                  );
                });
              })()}
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
