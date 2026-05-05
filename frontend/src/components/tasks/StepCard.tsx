/**
 * StepCard — compact visual that matches the Step page (StepPanel).
 * Used in two places now:
 *   • Goals → Step subpage list (`StepPanel.renderStepCard`)
 *   • Inside an expanded Goal card (`TaskExpanded`)
 * so the same step looks identical wherever it appears.
 *
 * Behavior:
 *   • Click anywhere on the card → triggers `onEdit` (parent opens edit sheet).
 *   • Mobile: wrapped in <SwipeRow> for swipe-to-edit / swipe-to-delete.
 */
import { memo } from 'react';
import type { Step } from '../../api/types';
import SwipeRow from '../SwipeRow';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatDate } from './helpers';

export interface StepCardProps {
  step: Step;
  /** Show the parent goal title in the header tag. Set false when the
   *  card is rendered inside that goal already (TaskExpanded). */
  showGoalTag?: boolean;
  /** Future steps render slightly faded and skip progress bar / checkpoints. */
  isFuture?: boolean;
  onEdit: () => void;
  onDelete?: () => void;
}

function StepCardComponent({ step, showGoalTag = true, isFuture = false, onEdit, onDelete }: StepCardProps) {
  const isMobile = useIsMobile();
  const tagBg = step.color ? step.color + '20' : 'var(--accent-notes-bg)';
  const tagFg = step.color || 'var(--accent-notes-fg)';
  const dateRange = `${formatDate(step.start_date) ?? ''} — ${formatDate(step.end_date) ?? ''}`;

  const nowMs = Date.now();
  const startMs = new Date(step.start_date + 'T00:00:00').getTime();
  const endMs = new Date(step.end_date + 'T00:00:00').getTime();
  const daysLeft = Math.ceil((endMs - nowMs) / 86400000);
  const daysUntilStart = Math.ceil((startMs - nowMs) / 86400000);
  const daysInfo = isFuture
    ? `starts in ${daysUntilStart}d`
    : daysLeft > 0 ? `${daysLeft} days left`
      : daysLeft === 0 ? 'due today'
        : `${Math.abs(daysLeft)}d overdue`;

  const doneGos = step.gos.filter((g) => g.entries.some((e) => e.value > 0)).length;

  const card = (
    <div className="step-card" style={{ opacity: isFuture ? 0.85 : 1 }}>
      <button
        type="button"
        className="step-card-click-target"
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
        onClick={onEdit}
      >
        <div className="step-card-head">
          {showGoalTag && (
            <span className="step-card-tag" style={{ background: tagBg, color: tagFg }}>
              {step.task_title || 'Standalone'}
            </span>
          )}
          <span className="step-card-dates">{dateRange} · {daysInfo}</span>
        </div>
        <div className="step-card-title">{step.title}</div>
      </button>

      {!isFuture && (
        <>
          <div className="step-card-progress">
            <div className="step-card-bar">
              <div className="step-card-bar-fill" style={{ width: `${step.progress}%`, backgroundColor: step.color || 'var(--success)' }} />
            </div>
            <span className="step-card-pct">{step.progress}%</span>
          </div>
          {step.gos.length > 0 && (
            <>
              <div className="step-card-meta">{doneGos} of {step.gos.length} Gos done</div>
              <div className="step-card-checks">
                {step.gos.map((g) => (
                  <span key={g.id} className="checkpoint" data-state={g.entries.some((e) => e.value > 0) ? 'done' : 'pending'} />
                ))}
              </div>
            </>
          )}
        </>
      )}
      {isFuture && <div className="step-card-meta">Will plan Gos when this starts</div>}
    </div>
  );

  if (isMobile && onDelete) {
    return <SwipeRow onEdit={onEdit} onDelete={onDelete}>{card}</SwipeRow>;
  }
  return card;
}

export default memo(StepCardComponent, (prev, next) =>
  prev.step === next.step &&
  prev.step.updated_at === next.step.updated_at &&
  prev.showGoalTag === next.showGoalTag &&
  prev.isFuture === next.isFuture,
);
