// Shared mini-card content blocks rendered inside expanded sections of
// Sprint disc cards and Goal kanban cards. They produce only the *body*
// of the card; the parent supplies the wrapping `<article class="m-mc ...">`
// element so it can layer on its own state (data-done, kind label, expand
// toggles, nested children).

import { Check, Flag } from 'lucide-react';
import type { Go, Routine, Task } from '../../../api/types';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MiniGoalContent({ goal }: { goal: Task }) {
  const pct = Math.round(goal.progress ?? 0);
  const flagBg = goal.priority === 'high' ? 'var(--rust-soft)'
    : goal.priority === 'medium' ? 'var(--ochre-soft)' : 'var(--cream)';
  const flagFg = goal.priority === 'high' ? 'var(--rust)'
    : goal.priority === 'medium' ? 'var(--ochre)' : 'var(--ink-5)';
  return (
    <>
      <div className="m-mc-head">
        <h4 className="m-mc-title">{goal.title}</h4>
        <span className="m-mc-flag" style={{ background: flagBg, color: flagFg }}>
          <Flag size={9} />
        </span>
      </div>
      <div className="m-mc-bar-row">
        <div className="m-mc-bar"><i style={{ width: `${pct}%` }} /></div>
        <span className="m-mc-pct">{pct}%</span>
      </div>
      {goal.due_date && (
        <div className="m-mc-meta">Due {fmtDate(goal.due_date)}</div>
      )}
    </>
  );
}

export function MiniGoContent({ go, onLog }: {
  go: Go;
  onLog?: (next: number) => void;
}) {
  const today = ymd(new Date());
  const todayEntry = go.entries.find((e) => e.date === today);
  const value = todayEntry?.value ?? 0;
  const target = go.target_value ?? 1;
  const targetMet = go.kind === 'numeric'
    ? (go.target_value !== null && value >= go.target_value)
    : value > 0;
  const pct = go.kind === 'numeric' && go.target_value
    ? Math.min(100, Math.round((value / go.target_value) * 100))
    : (value > 0 ? 100 : 0);
  const round = (n: number) => Math.round(n * 10) / 10;

  // Period (matches the period pill of the full TgCard in Go tab).
  let periodLabel: string | null = null;
  if (go.start_date && go.due_date) periodLabel = `${fmtDate(go.start_date)} – ${fmtDate(go.due_date)}`;
  else if (go.due_date)             periodLabel = `due ${fmtDate(go.due_date)}`;
  else if (go.start_date)           periodLabel = `from ${fmtDate(go.start_date)}`;

  const handleBool = onLog
    ? (e: React.MouseEvent) => { e.stopPropagation(); onLog(targetMet ? 0 : 1); }
    : undefined;
  return (
    <>
      {periodLabel && (
        <div className="m-mc-meta-row">
          <span className="m-mc-pill">{periodLabel}</span>
        </div>
      )}
      <h4 className="m-mc-title">{go.title}</h4>

      {go.kind === 'numeric' ? (
        <>
          <div className="m-mc-num">
            <span>{round(value)}</span>
            <span className="div">/</span>
            <span>{round(target)}</span>
            {go.unit && <span className="unit">{go.unit}</span>}
          </div>
          <div className="m-mc-bar-row" style={{ marginTop: 8 }}>
            <div className="m-mc-bar"><i style={{ width: `${pct}%` }} /></div>
            <span className="m-mc-pct">{pct}%</span>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={`m-mc-bool${targetMet ? ' m-mc-bool-done' : ''}`}
          onClick={handleBool}
          disabled={!onLog}
          style={onLog ? { cursor: 'pointer' } : { cursor: 'default' }}
        >
          <span className="check">{targetMet && <Check size={9} />}</span>
          {targetMet ? 'Done' : 'Mark as done'}
        </button>
      )}
    </>
  );
}

export function MiniRoutineContent({ routine }: { routine: Routine }) {
  const entries = new Map(routine.entries.map((e) => [e.date, e.value]));
  // Streak: walk back from today until we hit a missed day.
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i++) {
    const key = ymd(cursor);
    if ((entries.get(key) ?? 0) > 0) streak++;
    else if (i > 0) break;
    cursor.setDate(cursor.getDate() - 1);
  }
  // History strip: last 14 days, oldest first.
  const cells: { key: string; on: boolean }[] = [];
  const c2 = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(c2);
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    cells.push({ key, on: (entries.get(key) ?? 0) > 0 });
  }
  const scheduleLabel = routine.schedule_type === 'daily' ? 'DAILY'
    : routine.schedule_type === 'weekly_on_days' ? 'WEEKLY'
    : routine.schedule_type === 'every_n_days' ? `EVERY ${routine.schedule_n_days}D`
    : `${routine.schedule_count_per_period}× / ${routine.schedule_period === 'week' ? 'WK' : 'MO'}`;
  return (
    <>
      <div className="m-mc-head">
        <h4 className="m-mc-title">{routine.title}</h4>
      </div>
      <div className="m-mc-meta">{scheduleLabel} · {streak}d streak</div>
      <div className="m-mc-hist">
        {cells.map((c) => (
          <span key={c.key} className={`m-mc-cell${c.on ? ' on' : ''}`} />
        ))}
      </div>
    </>
  );
}
