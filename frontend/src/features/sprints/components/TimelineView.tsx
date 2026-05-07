import { useMemo } from 'react';
import type { SprintWithProgress } from '../hooks/useSprints';

interface Props {
  rows: SprintWithProgress[];
  onSelect: (id: string) => void;
}

const MONTHS_BEFORE = 6;
const MONTHS_AFTER  = 3;

function buildAxis() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - MONTHS_BEFORE, 1);
  const end   = new Date(today.getFullYear(), today.getMonth() + MONTHS_AFTER + 1, 1);
  // List of months between [start, end)
  const months: { label: string; pct: number; date: Date }[] = [];
  const total = end.getTime() - start.getTime();
  let cursor = new Date(start);
  while (cursor < end) {
    const pct = ((cursor.getTime() - start.getTime()) / total) * 100;
    months.push({
      label: cursor.toLocaleDateString(undefined, { month: 'short' }) +
             (cursor.getMonth() === 0 ? ` ${cursor.getFullYear()}` : ''),
      pct,
      date: new Date(cursor),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const todayPct = ((today.getTime() - start.getTime()) / total) * 100;
  return { start, end, months, todayPct };
}

function pctOf(date: Date, start: Date, end: Date): number {
  return ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
}

export function TimelineView({ rows, onSelect }: Props) {
  const axis = useMemo(buildAxis, []);

  if (rows.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-title">No sprints in view</div>
        <div>Create one to start a focused period.</div>
      </div>
    );
  }

  return (
    <div className="sp-timeline">
      <div className="sp-axis-row">
        <div className="sp-axis-track">
          {axis.months.map((m) => (
            <span key={m.label + m.pct} className="sp-axis-tick" style={{ left: `${m.pct}%` }}>
              {m.label}
            </span>
          ))}
          {axis.todayPct >= 0 && axis.todayPct <= 100 && (
            <span className="sp-axis-today" style={{ left: `${axis.todayPct}%` }}>
              <span className="sp-axis-today-label">Today</span>
            </span>
          )}
        </div>
      </div>

      <div className="sp-rows">
        {rows.map((row) => {
          const start = new Date(row.sprint.start_date);
          const end   = new Date(row.sprint.end_date);
          const leftPct  = pctOf(start, axis.start, axis.end);
          const widthPct = Math.max(2, pctOf(end, axis.start, axis.end) - leftPct);
          const visible = leftPct < 100 && (leftPct + widthPct) > 0;
          const clampedLeft  = Math.max(0, leftPct);
          const clampedWidth = Math.min(100 - clampedLeft, widthPct - (clampedLeft - leftPct));
          const color = row.sprint.color || 'var(--accent-sprints)';
          const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          const endLabel   = end.toLocaleDateString(undefined,   { month: 'short', day: 'numeric' });

          return (
            <div className="sp-row" key={row.sprint.id}>
              <div className="sp-row-label">
                <span className="sp-row-color" style={{ background: color }} />
                <span className="sp-row-title">{row.sprint.title}</span>
              </div>
              <div className="sp-row-track">
                {visible && (
                  <button
                    className="sp-bar"
                    data-bucket={row.bucket}
                    style={{
                      left: `${clampedLeft}%`,
                      width: `${clampedWidth}%`,
                      ['--sprint-color' as any]: color,
                    }}
                    onClick={() => onSelect(row.sprint.id)}
                    title={`${row.sprint.title} · ${startLabel} → ${endLabel}`}
                  >
                    <span
                      className="sp-bar-fill"
                      style={{ width: `${Math.min(100, row.progress * 100)}%` }}
                    />
                    <span className="sp-bar-text">
                      <span className="sp-bar-name">{row.sprint.title}</span>
                      <span className="sp-bar-meta">
                        {row.bucket === 'past'
                          ? `${row.daysTotal}d · ${row.sprint.items.length} items`
                          : row.bucket === 'upcoming'
                            ? `starts in ${-row.daysElapsed + row.daysTotal - row.daysRemaining + (row.daysTotal - row.daysElapsed)}d`
                            : `Day ${row.daysElapsed} of ${row.daysTotal}`}
                      </span>
                    </span>
                  </button>
                )}
                {axis.todayPct >= 0 && axis.todayPct <= 100 && (
                  <span className="sp-row-today" style={{ left: `${axis.todayPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
