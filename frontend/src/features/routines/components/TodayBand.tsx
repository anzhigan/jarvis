import { Check, X } from 'lucide-react';
import type { Routine } from '../../../api/types';
import type { TodayRoutine, TodaySummary } from '../hooks/useRoutinesToday';
import { currentStreak } from '../lib/heatmap';

interface Props {
  today: TodaySummary;
  onLog: (routine: Routine) => void;
  onSkip: (routine: Routine) => void;
}

const RING_RADIUS = 15.5;
const RING_CIRC = 2 * Math.PI * RING_RADIUS; // ≈ 97.4

function ProgressRing({ ratio }: { ratio: number }) {
  const offset = RING_CIRC * (1 - ratio);
  const pct = Math.round(ratio * 100);
  return (
    <div className="today-progress-ring">
      <svg viewBox="0 0 36 36">
        <circle className="today-progress-ring-bg" cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="3" />
        <circle
          className="today-progress-ring-fg"
          cx="18" cy="18" r={RING_RADIUS} fill="none" strokeWidth="3"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="today-progress-ring-num">{pct}%</span>
    </div>
  );
}

function TodayPill({ entry, onLog, onSkip }: { entry: TodayRoutine; onLog: (r: Routine) => void; onSkip: (r: Routine) => void }) {
  const { routine, state } = entry;
  const streak = currentStreak(routine);
  return (
    <div className="today-pill" data-done={state === 'done' || undefined} data-skipped={state === 'skipped' || undefined}>
      <span className="today-pill-actions">
        <button
          className="today-pill-btn"
          data-action="done"
          title={state === 'done' ? 'Mark not done' : 'Mark done'}
          onClick={() => onLog(routine)}
        >
          <Check />
        </button>
        <button
          className="today-pill-btn"
          data-action="skip"
          title="Skip today"
          onClick={() => onSkip(routine)}
        >
          <X />
        </button>
      </span>
      <span className="today-pill-color" style={{ background: routine.color || 'var(--accent-routines)' }} />
      <span className="today-pill-name">{routine.title}</span>
      {state === 'skipped'
        ? <span className="today-pill-skipped-tag">skipped</span>
        : streak > 0 ? <span className="today-pill-streak">🔥 {streak}</span> : null}
    </div>
  );
}

export function TodayBand({ today, onLog, onSkip }: Props) {
  const dayTitle = today.date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  if (today.scheduledCount === 0) {
    return (
      <section className="today-band">
        <div className="today-band-head">
          <div>
            <div className="today-band-eyebrow">Today</div>
            <div className="today-band-title">{dayTitle}</div>
            <div className="today-band-sub">Nothing scheduled today — enjoy the day off.</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="today-band">
      <div className="today-band-head">
        <div>
          <div className="today-band-eyebrow">Today</div>
          <div className="today-band-title">{dayTitle}</div>
          <div className="today-band-sub">
            {today.scheduledCount} scheduled · {today.doneCount} done
            {today.skippedCount > 0 && ` · ${today.skippedCount} skipped`}
            {today.pendingCount > 0 && ` · ${today.pendingCount} pending`}
          </div>
        </div>
        <div className="today-band-progress">
          <div className="today-progress-text">
            <div className="today-progress-num">
              <b>{today.doneCount}</b> / {today.scheduledCount}
            </div>
            <div className="today-progress-label">completed</div>
          </div>
          <ProgressRing ratio={today.ratio} />
        </div>
      </div>

      <div className="today-pills">
        {today.list.map((entry) => (
          <TodayPill key={entry.routine.id} entry={entry} onLog={onLog} onSkip={onSkip} />
        ))}
      </div>
    </section>
  );
}
