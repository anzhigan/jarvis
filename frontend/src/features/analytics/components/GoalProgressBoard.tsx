import type { GoalProgressRow } from '../hooks/useAnalytics';

interface Props {
  rows: GoalProgressRow[];
  onSelect?: (id: string) => void;
}

const ACCENTS = ['var(--moss)', 'var(--indigo)', 'var(--slate)', 'var(--ochre)', 'var(--rust)'] as const;
function accentFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

function dueLabel(due: string | null): string {
  if (!due) return '—';
  const d = new Date(due);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Editorial goal progress board — title with steps + due meta, slim bar,
 * percentage display. Accents derive from goal id so the same goal looks
 * the same across the board, the kanban, and the Today list.
 */
export function GoalProgressBoard({ rows, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <>
        <div className="section-head" style={{ marginTop: 48 }}>
          <span className="section-title">Goals in motion</span>
          <span className="section-rule" />
          <span className="section-meta">No active goals</span>
        </div>
        <div className="streak-list-card">
          <div className="ana-card-empty">
            Add a goal in the Goals tab and its progress will surface here.
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="section-head" style={{ marginTop: 48 }}>
        <span className="section-title">Goals in motion</span>
        <span className="section-rule" />
        <span className="section-meta">Sorted by completion</span>
      </div>

      <div className="gpb-list">
        {rows.map(({ task, pct, steps, due, overdue }) => {
          const accent = accentFor(task.id);
          return (
            <div
              key={task.id}
              className="gpb-row"
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => onSelect(task.id) : undefined}
              onKeyDown={(e) => { if (onSelect && e.key === 'Enter') onSelect(task.id); }}
            >
              <div className="gpb-text">
                <h3 className="gpb-title">{task.title}</h3>
                <div className="gpb-meta">
                  <span>{steps.done}/{steps.total} steps</span>
                  <span className="gpb-meta-sep">·</span>
                  <span className={overdue ? 'gpb-meta-overdue' : undefined}>
                    {overdue ? `Overdue · ${dueLabel(due)}` : `Due ${dueLabel(due)}`}
                  </span>
                </div>
              </div>
              <div className="gpb-bar" style={{ ['--accent' as any]: accent }}>
                <div className="gpb-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="gpb-pct">{pct}%</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
