import { useMemo } from 'react';
import type { Routine } from '../../../api/types';
import { completionRate, currentStreak } from '../../routines/lib/heatmap';
import { buildDailySeries, buildPulsePaths } from '../../routines/lib/pulse';

interface Props {
  routines: Routine[];
  /** Window for the line — defaults to 30. Matches desktop PerRoutinePulse. */
  windowDays?: number;
}

type State = 'strong' | 'warm' | 'slip' | 'hold';

interface Row {
  id: string;
  title: string;
  state: State;
  streak: number;
  rate: number;
  fraction: { done: number; total: number };
  paths: ReturnType<typeof buildPulsePaths>;
}

const W = 280;
const H = 54;

/**
 * Mobile equivalent of the desktop Analysis "Per-routine pulse" — a small
 * line chart per active routine, stacked in a single column for portrait.
 * Shares the same `buildDailySeries` / `buildPulsePaths` helpers so the
 * curve shape matches the desktop card and the Routine detail sheet
 * trend exactly.
 *
 * Color tone follows the routine's recent completion rate (same buckets
 * as desktop): ≥80 → strong (moss), ≥50 → warm (ochre), <50 → slip
 * (rust); paused → hold (ink-4).
 */
export function MobilePerRoutinePulse({ routines, windowDays = 30 }: Props) {
  const rows = useMemo<Row[]>(() => {
    return routines.map<Row>((r) => {
      const series = buildDailySeries(r, windowDays);
      const done = series.filter((v) => v > 0).length;
      const rate = completionRate(r, windowDays);
      const state: State = r.is_paused ? 'hold'
        : rate >= 80 ? 'strong'
        : rate >= 50 ? 'warm'
        : 'slip';
      return {
        id: r.id,
        title: r.title,
        state,
        streak: currentStreak(r),
        rate,
        fraction: { done, total: windowDays },
        paths: buildPulsePaths(series, W, H, 4),
      };
    });
  }, [routines, windowDays]);

  if (rows.length === 0) {
    return (
      <div className="m-day-empty" style={{ padding: 20, textAlign: 'center' }}>
        No active routines to plot — start one to see its pulse.
      </div>
    );
  }

  return (
    <div className="m-prp-grid">
      {rows.map((row) => (
        <article key={row.id} className="m-prp-card" data-state={row.state}>
          <header className="m-prp-card__head">
            <span className="m-prp-card__title">{row.title}</span>
            {row.streak > 0 && (
              <span className="m-prp-card__pill">{row.streak}d</span>
            )}
          </header>
          <div className="m-prp-card__chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <line
                className="m-prp-axis"
                x1={0} x2={W}
                y1={row.paths.baselineY} y2={row.paths.baselineY}
              />
              {row.paths.area && <path className="m-prp-area" d={row.paths.area} />}
              {row.paths.line && <path className="m-prp-line" d={row.paths.line} />}
              {row.paths.pts.length > 0 && (
                <circle
                  className="m-prp-now"
                  cx={row.paths.pts[row.paths.pts.length - 1][0]}
                  cy={row.paths.pts[row.paths.pts.length - 1][1]}
                  r={2.4}
                />
              )}
            </svg>
          </div>
          <div className="m-prp-card__foot">
            <span><b>{row.rate}%</b> on track</span>
            <span>{row.fraction.done}/{row.fraction.total} days</span>
          </div>
        </article>
      ))}
    </div>
  );
}
