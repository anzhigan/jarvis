import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { gosApi, stepsApi } from '../../api/client';
import type { Go, Step, Task } from '../../api/types';
import { useT } from '../../store/i18n';
import AddItemButton from '../AddItemButton';
import SwipeRow from '../SwipeRow';
import CreateStepForm from './CreateStepForm';
import EditStepSheet from './EditStepSheet';
import StepBlock from './StepBlock';
import { formatDate, todayIso } from './helpers';

export default function StepPanel({ tasks, onReload }: { tasks: Task[]; onReload: () => Promise<void> }) {
  const t = useT();
  const [current, setCurrent] = useState<Step[]>([]);
  const [past, setPast] = useState<Step[]>([]);
  const [future, setFuture] = useState<Step[]>([]);
  const [pastDays, setPastDays] = useState(90);
  const [pastOpen, setPastOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [expandedGos, setExpandedGos] = useState<Set<string>>(new Set());
  const [busyGos, setBusyGos] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [cur, p, f] = await Promise.all([
        stepsApi.agenda('current'),
        stepsApi.agenda('past', pastDays),
        stepsApi.agenda('future'),
      ]);
      setCurrent(cur); setPast(p); setFuture(f);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [pastDays]);

  const reload = async () => { await load(); await onReload(); };

  const patchGoInStep = (patched: Go) => {
    const updStep = (s: Step): Step => {
      if (!s.gos.some((g) => g.id === patched.id)) return s;
      const newGos = s.gos.map((g) => g.id === patched.id ? patched : g);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sStart = new Date(s.start_date); sStart.setHours(0, 0, 0, 0);
      const sEnd = new Date(s.end_date); sEnd.setHours(0, 0, 0, 0);
      let totalRatio = 0;
      for (const g of newGos) {
        if (g.kind === 'boolean' && g.recurrence === 'daily') {
          let start = new Date(g.created_at); start.setHours(0, 0, 0, 0);
          if (sStart > start) start = sStart;
          let end = today;
          if (g.due_date) {
            const d = new Date(g.due_date); d.setHours(0, 0, 0, 0);
            if (d < end) end = d;
          }
          if (sEnd < end) end = sEnd;
          if (end < start) { totalRatio += 0; continue; }
          const possibleDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
          const startMs = start.getTime();
          const endMs = end.getTime();
          const doneDays = g.entries.filter((e) => {
            if (e.value <= 0) return false;
            const d = new Date(e.date); d.setHours(0, 0, 0, 0);
            const ms = d.getTime();
            return ms >= startMs && ms <= endMs;
          }).length;
          totalRatio += possibleDays > 0 ? Math.min(1, doneDays / possibleDays) : 0;
        } else if (g.kind === 'boolean') {
          totalRatio += g.entries.some((e) => e.value > 0) ? 1 : 0;
        } else {
          const total = g.entries.reduce((sum, e) => sum + e.value, 0);
          const target = g.target_value || 0;
          if (target > 0) totalRatio += Math.min(1, total / target);
          else totalRatio += total > 0 ? 1 : 0;
        }
      }
      const progress = newGos.length > 0 ? Math.round(100 * totalRatio / newGos.length) : 0;
      return { ...s, gos: newGos, progress };
    };
    const upd = (list: Step[]) => list.map(updStep);
    setCurrent(upd);
    setPast(upd);
    setFuture(upd);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;
  }

  const nowMs = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const avgProgress = current.length > 0
    ? Math.round(current.reduce((s, sp) => s + sp.progress, 0) / current.length)
    : 0;
  const dueThisWeek = current.filter((s) => {
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    return end >= nowMs && end <= nowMs + weekMs;
  }).length;
  const doneThisMonth = past.filter((s) => {
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    return end >= nowMs - monthMs;
  }).length;

  const slipping = current.filter((s) => {
    const start = new Date(s.start_date + 'T00:00:00').getTime();
    const end = new Date(s.end_date + 'T00:00:00').getTime();
    const duration = end - start;
    if (duration <= 0) return false;
    const elapsed = Math.max(0, nowMs - start);
    const expectedPct = Math.min(100, Math.round(100 * elapsed / duration));
    return s.progress < expectedPct - 10;
  });

  const renderStepCard = (s: Step, isFuture = false) => {
    const endMs = new Date(s.end_date + 'T00:00:00').getTime();
    const startMs = new Date(s.start_date + 'T00:00:00').getTime();
    const daysLeft = Math.ceil((endMs - nowMs) / 86400000);
    const daysUntilStart = Math.ceil((startMs - nowMs) / 86400000);
    const doneGos = s.gos.filter((g) => g.entries.some((e) => e.value > 0)).length;
    const tagBg = s.color ? s.color + '20' : 'var(--accent-notes-bg)';
    const tagFg = s.color || 'var(--accent-notes-fg)';
    const dateRange = `${formatDate(s.start_date) ?? ''} — ${formatDate(s.end_date) ?? ''}`;
    const daysInfo = isFuture
      ? `starts in ${daysUntilStart}d`
      : daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'due today' : `${Math.abs(daysLeft)}d overdue`;

    const today = todayIso();
    const toggleGoInCard = async (g: Go) => {
      if (busyGos.has(g.id)) return;
      setBusyGos((prev) => { const n = new Set(prev); n.add(g.id); return n; });
      try {
        const todayVal = g.entries.find((e) => e.date === today)?.value ?? 0;
        const newVal = todayVal > 0 ? 0 : 1;
        await gosApi.upsertEntry(g.id, today, newVal);
        const otherEntries = g.entries.filter((e) => e.date !== today);
        const newEntries = newVal === 0 ? otherEntries : [...otherEntries, { id: `tmp`, go_id: g.id, date: today, value: newVal }];
        patchGoInStep({ ...g, entries: newEntries, total_value: newEntries.reduce((sum, e) => sum + e.value, 0) });
      } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
      finally { setBusyGos((prev) => { const n = new Set(prev); n.delete(g.id); return n; }); }
    };

    const cardContent = (
      <div className="step-card" style={{ opacity: isFuture ? 0.85 : 1 }}>
        <button
          className="step-card-click-target"
          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
          onClick={() => setEditingStep(s)}
        >
          <div className="step-card-head">
            <span className="step-card-tag" style={{ background: tagBg, color: tagFg }}>
              {s.task_title || 'Standalone'}
            </span>
            <span className="step-card-dates">{dateRange} · {daysInfo}</span>
          </div>
          <div className="step-card-title">{s.title}</div>
        </button>
        {!isFuture && (
          <>
            <div className="step-card-progress">
              <div className="step-card-bar">
                <div className="step-card-bar-fill" style={{ width: `${s.progress}%`, backgroundColor: s.color || 'var(--success)' }} />
              </div>
              <span className="step-card-pct">{s.progress}%</span>
            </div>
            <div className="step-card-meta">{doneGos} of {s.gos.length} Gos done</div>
            {s.gos.length > 0 && (
              <>
                <div className="step-card-checks">
                  {s.gos.map((g) => (
                    <span key={g.id} className="checkpoint" data-state={g.entries.some((e) => e.value > 0) ? "done" : "pending"} />
                  ))}
                </div>
                <button
                  className="step-card-go-toggle"
                  style={{ width: '100%', background: 'none', border: 0 }}
                  onClick={() => setExpandedGos((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                    return next;
                  })}
                >
                  <span>{doneGos}/{s.gos.length} items</span>
                  <ChevronDown size={12} style={{ transition: 'transform 150ms', transform: expandedGos.has(s.id) ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>
                {expandedGos.has(s.id) && (
                  <div className="step-card-go-list">
                    {s.gos.map((g) => {
                      const todayVal = g.entries.find((e) => e.date === today)?.value ?? 0;
                      const done = g.kind === 'boolean' && g.recurrence === 'none'
                        ? g.entries.some((e) => e.value > 0)
                        : todayVal > 0;
                      const isBusy = busyGos.has(g.id);
                      return (
                        <div key={g.id} className="step-card-go-item" data-done={done ? 'true' : undefined}>
                          <button
                            className="step-card-go-btn"
                            data-state={done ? 'done' : 'outline'}
                            disabled={isBusy}
                            onClick={() => toggleGoInCard(g)}
                          >
                            {isBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : done ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : null}
                          </button>
                          <span className="step-card-go-name">{g.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {isFuture && (
          <div className="step-card-meta">Will plan Gos when this starts</div>
        )}
      </div>
    );

    return (
      <SwipeRow
        key={s.id}
        onEdit={() => setEditingStep(s)}
        onDelete={async () => {
          if (!confirm(`Delete step "${s.title}"?`)) return;
          try { await stepsApi.delete(s.id); await reload(); }
          catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
        }}
      >
        {cardContent}
      </SwipeRow>
    );
  };

  return (
    <>
      {editingStep && (
        <EditStepSheet
          step={editingStep}
          tasks={tasks}
          onClose={() => setEditingStep(null)}
          onSaved={async () => { setEditingStep(null); await reload(); }}
        />
      )}

      <AddItemButton label={t('tasks.addStep')} onClick={() => setAdding(true)} />
      <CreateStepForm
        open={adding}
        tasks={tasks}
        onCancel={() => setAdding(false)}
        onCreate={async () => { setAdding(false); await reload(); }}
      />

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Active steps</div>
          <div className="kpi-value">{current.length}</div>
          <div className="kpi-trend" data-trend="neutral">across {new Set(current.map((s) => s.task_id)).size} goals</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg progress</div>
          <div className="kpi-value">{avgProgress}%</div>
          <div className="kpi-trend" data-trend={avgProgress >= 50 ? undefined : 'negative'}>of completion</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Due this week</div>
          <div className="kpi-value">{dueThisWeek}</div>
          <div className="kpi-trend" data-trend={dueThisWeek > 0 ? 'negative' : 'neutral'}>{dueThisWeek > 0 ? 'tight' : 'clear'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Done this month</div>
          <div className="kpi-value">{doneThisMonth}</div>
          <div className="kpi-trend" data-trend="neutral">steps finished</div>
        </div>
      </div>

      <div className="section-row">
        <div style={{ minWidth: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <button className="past-bar" onClick={() => setPastOpen(!pastOpen)}>
              {pastOpen ? <ChevronDown size={11} strokeWidth={2} /> : <ChevronRight size={11} strokeWidth={2} />}
              <span>Past</span>
              <span className="past-bar-meta">{past.length} finished · {pastDays}d</span>
            </button>

            {pastOpen && (
              <div style={{ marginTop: 8 }}>
                {past.length === 0 ? (
                  <div className="py-4 text-center text-xs" style={{ color: 'var(--fg-muted)' }}>{t('step.none_past', { days: pastDays })}</div>
                ) : past.map((s) => {
                  const taskSteps = tasks.find((tk) => tk.id === s.task_id)?.sprints ?? [];
                  return <StepBlock key={s.id} step={s} allStepsOfTask={taskSteps} onReload={reload} onGoLocalUpdate={patchGoInStep} />;
                })}
                <button onClick={() => setPastDays(pastDays + 90)} className="btn btn-ghost btn-sm w-full">
                  {t('go.showOlder', { days: pastDays })}
                </button>
              </div>
            )}
          </div>

          <section style={{ marginBottom: 24 }}>
            <div className="day-head">
              <h2 className="day-head-title">Current · {current.length} active</h2>
              <span className="day-head-meta">avg {avgProgress}%</span>
            </div>
            {current.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('step.none_current')}</div>
            ) : current.map((s) => renderStepCard(s, false))}
          </section>

          <section>
            <div className="day-head">
              <h2 className="day-head-title">{t('step.future')}</h2>
              <span className="day-head-meta">{future.length} scheduled</span>
            </div>
            {future.length === 0 ? (
              <div className="py-6 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>{t('step.none_future')}</div>
            ) : future.map((s) => renderStepCard(s, true))}
          </section>
        </div>

        <aside className="right-panel">
          <div className="panel-card">
            <div className="panel-head">Step velocity</div>
            <div className="panel-row"><span className="panel-row-title">This month</span><span className="panel-row-meta">{doneThisMonth} finished</span></div>
            <div className="panel-row"><span className="panel-row-title">Active now</span><span className="panel-row-meta">{current.length} steps</span></div>
            <div className="panel-row"><span className="panel-row-title">Future</span><span className="panel-row-meta">{future.length} planned</span></div>
          </div>
          <div className="panel-card">
            <div className="panel-head">Slipping</div>
            {slipping.length === 0 ? (
              <p className="panel-empty">All steps on track</p>
            ) : slipping.map((s) => (
              <div key={s.id} className="panel-row">
                <span className="dot" style={{ background: 'var(--danger)' }} />
                <span className="panel-row-title">{s.title}</span>
                <span className="panel-row-meta" style={{ color: 'var(--danger)' }}>{s.progress}%</span>
              </div>
            ))}
          </div>
          <div className="panel-card">
            <div className="panel-head">Insight</div>
            <p className="panel-prose">Steps finish faster when limited to 5–7 Gos. Smaller scope means clearer focus.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
