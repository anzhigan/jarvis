import type { AnalyticsLibrary } from '../hooks/useAnalytics';

interface Props {
  grid: AnalyticsLibrary['yearGrid'];
}

export function YearHeatmap({ grid }: Props) {
  // Render as 53 columns × 7 rows, oldest week first.
  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Year heatmap</div>
          <div className="an-card-sub">All routines + completed goals — last 12 months</div>
        </div>
      </div>
      <div className="year-heatmap">
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
      <div className="heatmap-foot">
        <span>Less</span>
        <span className="heatmap-scale">
          <span className="scale-cell" style={{ background: 'var(--heat-0)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-1)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-2)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-3)' }} />
          <span className="scale-cell" style={{ background: 'var(--heat-4)' }} />
        </span>
        <span>More</span>
      </div>
    </div>
  );
}
