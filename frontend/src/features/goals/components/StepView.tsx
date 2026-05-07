import { Plus, Calendar, Target, Box, Check } from 'lucide-react';
import type { GroupedSteps, StepBucket, StepWithGoal } from '../hooks/useSteps';

interface Props {
  grouped: GroupedSteps;
  onToggleDone: (step: StepWithGoal) => void;
  onSelect: (id: string) => void;
  onAdd: (bucket: StepBucket) => void;
}

const COLS: { key: StepBucket; title: string }[] = [
  { key: 'overdue',  title: 'Overdue'     },
  { key: 'active',   title: 'In progress' },
  { key: 'upcoming', title: 'Upcoming'    },
  { key: 'done',     title: 'Done'        },
];

function shortId(id: string): string { return `JV-S${id.slice(0, 3).toUpperCase()}`; }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function relativeEnd(end: string): string | null {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  const days = Math.round((e.getTime() - today.getTime()) / 86400_000);
  if (days < 0)   return `${-days}d ago`;
  if (days === 0) return 'today';
  if (days < 14)  return `in ${days}d`;
  return null;
}

function durationLabel(start: string, end: string): string {
  const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400_000) + 1);
  if (days % 7 === 0 && days >= 14) return `${days / 7} weeks`;
  return `${days} days`;
}

/** Returns 0..1 (or >1 if overdue) for "how far through the period today is". */
function progressRatio(start: string, end: string): { fill: number; today: number } {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const t = Date.now();
  const span = Math.max(1, e - s);
  const ratio = Math.max(0, Math.min(1, (t - s) / span));
  const todayRatio = (t - s) / span;
  return { fill: ratio, today: Math.max(0, todayRatio) };
}

function StepCard({ step, onToggleDone, onSelect }: { step: StepWithGoal; onToggleDone: (s: StepWithGoal) => void; onSelect: (id: string) => void }) {
  const color = step.color || step.goal.color || 'var(--accent-goals)';
  const pr = progressRatio(step.start_date, step.end_date);
  const endRel = relativeEnd(step.end_date);
  const isOverdue = pr.today > 1 && !step.is_completed;
  const goCount = step.gos.length;
  const goDoneCount = step.gos.filter((g) => g.is_done_today).length;
  const childState = step.is_completed ? 'done' : isOverdue ? 'overdue' : undefined;

  return (
    <div
      className="step-card"
      style={{ ['--step-color' as any]: isOverdue ? 'var(--danger)' : color }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(step.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(step.id); }}
    >
      <div className="step-row1">
        <span className="step-id">{shortId(step.id)}</span>
        <span className="step-parent" onClick={(e) => e.stopPropagation()}>
          <Target />
          <span className="pname">{step.task_title ?? step.goal.title}</span>
        </span>
        <span className="step-spacer" />
        <button
          className="step-checkbox"
          data-checked={step.is_completed || undefined}
          onClick={(e) => { e.stopPropagation(); onToggleDone(step); }}
          aria-label={step.is_completed ? 'Mark in progress' : 'Mark done'}
        >
          {step.is_completed && <Check size={10} />}
        </button>
      </div>

      <div className={`step-title${step.is_completed ? ' step-title-done' : ''}`}>{step.title}</div>

      <div className="step-dates">
        <Calendar />
        <span className="from">{fmtDate(step.start_date)}</span>
        <span className="arrow">→</span>
        <span
          className="to"
          style={isOverdue ? { color: 'var(--danger)', fontWeight: 500 } : undefined}
        >
          {fmtDate(step.end_date)}{endRel ? ` · ${endRel}` : ''}
        </span>
      </div>

      <div className="step-track">
        <span className="step-track-fill" style={{ width: `${pr.fill * 100}%` }} />
        <span className="step-track-today" style={{ left: `${Math.min(100, pr.today * 100)}%` }} />
      </div>

      <div className="step-meta-row">
        {goCount > 0 && (
          <span className="step-children-chip" data-state={childState}>
            <Box />
            <b>{goDoneCount}</b> / {goCount} Go
          </span>
        )}
        <span className="step-meta-spacer" />
        <span className="step-duration">{durationLabel(step.start_date, step.end_date)}</span>
      </div>
    </div>
  );
}

export function StepView({ grouped, onToggleDone, onSelect, onAdd }: Props) {
  return (
    <div className="board">
      {COLS.map(({ key, title }) => (
        <div key={key} className="col" data-status={key}>
          <div className="col-head">
            <span className="dot" />
            <span className="col-title">{title}</span>
            <span className="col-count">{grouped[key].length}</span>
            <button className="col-add" onClick={() => onAdd(key)} aria-label={`Add ${title}`}>
              <Plus />
            </button>
          </div>
          <div className="col-body">
            {grouped[key].map((step) => (
              <StepCard key={step.id} step={step} onToggleDone={onToggleDone} onSelect={onSelect} />
            ))}
            <button className="col-add-card" onClick={() => onAdd(key)}>
              <Plus /> Add step
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
