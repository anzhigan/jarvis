/**
 * GoalProgressTrack — editorial progress visual for a Goal card.
 *
 *   ╭────────────── today ──╮
 *   │  ░░░░░░  ▒▒▒▒  ░░░ ░░│      ← segmented track, one cell per Step
 *   ╰─────────────────────── ╯
 *   62%                  3/8 steps
 *
 * - When the goal has 1+ Steps, the track is split into N segments, one per
 *   step. Segment width is proportional to its date span (when both ends are
 *   set) or equal otherwise. Fill reflects step status:
 *     done         → solid moss
 *     in_progress  → ochre diagonal stripes (subtle "work in motion" feel)
 *     not_started  → cream (the track's own colour)
 * - When the goal has 0 steps, we fall back to a single fill bar driven by
 *   `task.progress` so old goals don't look broken.
 * - A small "today" caret floats above the bar at the % time elapsed between
 *   `start_date` and `due_date`. Shows only when both dates are set — and
 *   gives users a glance at whether step progress is leading or trailing the
 *   calendar. Out-of-range (before start / after due) is clamped to 0/100.
 *
 * `compact` (default false): tighter heights for the sidebar variant, and
 * hides the "%" footer (sidebar shows pct elsewhere). Defaults are tuned for
 * the kanban surface where this fully replaces the old `.kc-progress` block.
 */
import { useMemo } from 'react';
import type { Task } from '../../../api/types';
// Self-contained CSS dependency — the `.gpt__*` rules live in goals.css,
// which used to be imported only by the desktop GoalsView. The mobile
// kanban renders this component too; without this import the bar would
// fall through to its unstyled markup on mobile.
import './goals.css';

interface Props {
  task: Task;
  compact?: boolean;
}

export function GoalProgressTrack({ task, compact = false }: Props) {
  const steps = useMemo(
    () => [...(task.steps ?? [])].sort((a, b) => a.position - b.position),
    [task.steps],
  );
  const N = steps.length;
  const pct = Math.round(task.progress ?? 0);
  const doneCount = steps.filter((s) => s.status === 'done').length;

  // Today marker — calendar concept. Only meaningful when the goal has
  // both start_date and due_date set; the caret then sits at % time
  // elapsed in that window. For undated goals we render nothing (an
  // earlier attempt fell back to `task.progress` so every card got a
  // caret, but it jumped whenever a Step status changed — Today is
  // about the calendar, not the progress bar).
  const todayPct = useMemo(() => {
    if (!task.start_date || !task.due_date) return null;
    const start = new Date(task.start_date).getTime();
    const end   = new Date(task.due_date).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    const now = Date.now();
    if (now <= start) return 0;
    if (now >= end)   return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  }, [task.start_date, task.due_date]);

  // Grid-template-columns for segmented variant. Proportional to date span
  // when available, fallback to equal widths.
  const cols = useMemo(() => {
    if (N === 0) return '1fr';
    const widths = steps.map((s) => {
      if (s.start_date && s.end_date) {
        const ms = new Date(s.end_date).getTime() - new Date(s.start_date).getTime();
        if (!isNaN(ms) && ms > 0) return ms;
      }
      return 1;
    });
    return widths.map((w) => `${w}fr`).join(' ');
  }, [steps, N]);

  return (
    <div className={`gpt${compact ? ' gpt--compact' : ''}`}>
      {todayPct !== null && (
        <div className="gpt__marker-row">
          <div
            className="gpt__today"
            style={{ left: `clamp(8px, ${todayPct}%, calc(100% - 8px))` }}
          >
            {!compact && <span className="gpt__today-label">today</span>}
            <span className="gpt__today-caret" />
          </div>
        </div>
      )}

      {N > 0 ? (
        <div
          className="gpt__segments"
          style={{ gridTemplateColumns: cols }}
          aria-label={`${doneCount} of ${N} steps done`}
        >
          {steps.map((s) => (
            <span
              key={s.id}
              className="gpt__seg"
              data-state={s.status}
              title={`${s.title} · ${s.status.replace('_', ' ')}`}
            />
          ))}
        </div>
      ) : (
        <div className="gpt__track">
          <div className="gpt__fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      {!compact && (
        <div className="gpt__foot">
          <span className="gpt__pct">
            <b>{pct}</b><span className="gpt__pct-sym">%</span>
          </span>
          {N > 0 && (
            <span className="gpt__steps">
              {doneCount} / {N} steps
            </span>
          )}
        </div>
      )}
    </div>
  );
}
