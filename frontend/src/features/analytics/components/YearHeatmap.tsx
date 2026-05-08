import type { AnalyticsLibrary } from '../hooks/useAnalytics';

interface Props {
  grid: AnalyticsLibrary['yearGrid'];
  /** Total entries-with-value, shown in the section meta. */
  totalEntries: number;
  /** ymd of the first non-empty cell, used as "since …" label. */
  startedOn: string | null;
}

const FMT = (s: string | null) => {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * 53-column × 7-row heatmap rendered inside a cream card. Each .year-week is
 * a vertical column of 7 days; cells colour-step via [data-level=1..4].
 */
export function YearHeatmap({ grid, totalEntries, startedOn }: Props) {
  return (
    <>
      <div className="section-head" style={{ marginTop: 48 }}>
        <span className="section-title">A year of practice</span>
        <span className="section-rule" />
        <span className="section-meta">
          {totalEntries.toLocaleString()} entries{startedOn ? ` since ${FMT(startedOn)}` : ''}
        </span>
      </div>

      <div className="year-heat-card">
        <div className="year-heat">
          {grid.map((week, ci) => (
            <div key={ci} className="year-week">
              {week.map((cell) => (
                <span
                  key={cell.date}
                  className="year-cell"
                  data-level={cell.level || undefined}
                  data-today={cell.isToday || undefined}
                  title={`${cell.date} · level ${cell.level}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="year-heat-foot">
          <span>Across all routines · darker means more completions per day</span>
          <div className="year-heat-scale">
            <span>Less</span>
            <span className="scale-cell" style={{ background: 'var(--heat-0)' }} />
            <span className="scale-cell" style={{ background: 'var(--heat-1)' }} />
            <span className="scale-cell" style={{ background: 'var(--heat-2)' }} />
            <span className="scale-cell" style={{ background: 'var(--heat-3)' }} />
            <span className="scale-cell" style={{ background: 'var(--heat-4)' }} />
            <span>More</span>
          </div>
        </div>
      </div>
    </>
  );
}
