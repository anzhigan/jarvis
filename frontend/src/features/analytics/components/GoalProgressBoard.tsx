import { ArrowRight } from 'lucide-react';
import type { GoalProgressRow } from '../hooks/useAnalytics';

interface Props {
  rows: GoalProgressRow[];
}

function dueLabel(due: string | null): string {
  if (!due) return '—';
  const d = new Date(due);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function GoalProgressBoard({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="an-card">
        <div className="an-card-head">
          <div className="an-card-title-block">
            <div className="an-card-title">Goal progress</div>
            <div className="an-card-sub">No active goals to track yet.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Goal progress</div>
          <div className="an-card-sub">Goals sorted by completion · steps and deadlines</div>
        </div>
        <button className="icon-btn" title="View all" aria-label="View all">
          <ArrowRight />
        </button>
      </div>

      <div className="goal-list">
        {rows.map(({ task, pct, steps, due, overdue }) => (
          <div
            key={task.id}
            className="goal-row"
            data-done={task.status === 'done' || undefined}
            data-paused={task.status === 'paused' || undefined}
          >
            <span className="goal-color" style={{ background: task.color || 'var(--accent-goals)' }} />
            <div>
              <div className="goal-name">{task.title}</div>
              <div className="goal-name-sub">{steps.done}/{steps.total} steps</div>
            </div>
            <div className="goal-progressbar">
              <div className="fill" style={{ width: `${pct}%`, ['--bar-color' as any]: task.color || 'var(--accent-goals)' }} />
            </div>
            <div className="goal-pct">
              {pct}<span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-xs)', fontWeight: 500 }}>%</span>
            </div>
            <span className="goal-meta-pill" data-pri={task.priority}>{task.priority}</span>
            <span className="goal-due" data-overdue={overdue || undefined}>{dueLabel(due)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
