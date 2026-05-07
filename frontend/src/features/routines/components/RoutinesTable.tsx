import { MoreHorizontal } from 'lucide-react';
import type { Routine } from '../../../api/types';
import {
  addDays, completionRate, currentStreak, entriesByDate, scheduleLabel, startOfDay, ymd,
} from '../lib/heatmap';
import { todayState } from '../hooks/useRoutinesToday';

interface Props {
  routines: Routine[];
  onSelect: (id: string) => void;
}

const WEEKS = 13;

function levelFor(routine: Routine, value: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (routine.kind === 'boolean') return 4;
  const target = routine.target_value ?? 1;
  const ratio = Math.min(1, value / target);
  if (ratio < 0.25) return 1;
  if (ratio < 0.5)  return 2;
  if (ratio < 0.85) return 3;
  return 4;
}

/** Returns 13 columns × 7 rows of ymd dates, oldest → newest, today is the last cell. */
function heatmapGrid(weeks: number): Date[][] {
  const today = startOfDay(new Date());
  // Build flat list of 13*7 = 91 days ending today (inclusive).
  const total = weeks * 7;
  const flat: Date[] = [];
  for (let i = total - 1; i >= 0; i--) flat.push(addDays(today, -i));
  // Split into columns of 7 starting from oldest. The last column ends with `today`.
  const cols: Date[][] = [];
  for (let c = 0; c < weeks; c++) cols.push(flat.slice(c * 7, c * 7 + 7));
  return cols;
}

function MiniHeatmap({ routine }: { routine: Routine }) {
  const map = entriesByDate(routine.entries);
  const grid = heatmapGrid(WEEKS);
  const todayKey = ymd(new Date());
  return (
    <div className="mini-heatmap-c">
      {grid.map((week, ci) => (
        <div key={ci} className="mini-week-c">
          {week.map((day) => {
            const key = ymd(day);
            const entry = map.get(key);
            const level = entry ? levelFor(routine, entry.value) : 0;
            return (
              <span
                key={key}
                className="mini-cell-c"
                data-level={level || undefined}
                data-today={key === todayKey || undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TodayCell({ routine }: { routine: Routine }) {
  if (routine.is_paused) {
    return (
      <div className="today-status-cell" data-paused>
        <span className="today-status-dot" />
        <span>Paused</span>
      </div>
    );
  }
  const state = todayState(routine);
  if (state === 'unscheduled') {
    return (
      <div className="today-status-cell">
        <span className="today-status-dot" />
        <span>Off-day</span>
      </div>
    );
  }
  return (
    <div className="today-status-cell" data-state={state} data-done={state === 'done' || undefined}
         data-pending={state === 'pending' || undefined}
         data-skipped={state === 'skipped' || undefined}>
      <span className="today-status-dot" />
      <span>{state === 'done' ? 'Done' : state === 'skipped' ? 'Skipped' : 'Pending'}</span>
    </div>
  );
}

function RoutineRow({ routine, onSelect }: { routine: Routine; onSelect: (id: string) => void }) {
  const streak = currentStreak(routine);
  const rate = completionRate(routine, 30);
  const goalLabel = '';  // populate later when goals data is wired in
  const subParts = [scheduleLabel(routine), goalLabel].filter(Boolean);
  return (
    <div
      className="rt-row-c"
      data-paused={routine.is_paused || undefined}
      onClick={() => onSelect(routine.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(routine.id); }}
    >
      <span className="rt-row-color-c" style={{ background: routine.color || 'var(--accent-routines)' }} />
      <div className="rt-row-info-c">
        <div className="rt-row-title-c">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{routine.title}</span>
          {routine.is_paused && <span className="rt-row-paused-badge-c">Paused</span>}
        </div>
        <div className="rt-row-sub-c">{subParts.join(' · ')}</div>
      </div>
      <TodayCell routine={routine} />
      <div className="rt-row-stat-c" data-tone={streak > 0 ? 'success' : 'muted'}>
        {streak}<span className="rt-row-stat-sub-c">d</span>
      </div>
      <div className="rt-row-stat-c">
        {rate}<span className="rt-row-stat-sub-c">%</span>
      </div>
      <MiniHeatmap routine={routine} />
      <button
        className="rt-row-more-c"
        onClick={(e) => { e.stopPropagation(); onSelect(routine.id); }}
        aria-label="More"
      >
        <MoreHorizontal />
      </button>
    </div>
  );
}

export function RoutinesTable({ routines, onSelect }: Props) {
  return (
    <div className="rt-table-wrap-c">
      <div className="rt-table-head-c">
        <span />
        <span>Routine</span>
        <span>Today</span>
        <span className="col-num">Streak</span>
        <span className="col-num">30d</span>
        <span>Last 13 weeks</span>
        <span />
      </div>
      {routines.map((r) => (
        <RoutineRow key={r.id} routine={r} onSelect={onSelect} />
      ))}
      {routines.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)' }}>
          No routines match the current filters.
        </div>
      )}
    </div>
  );
}
