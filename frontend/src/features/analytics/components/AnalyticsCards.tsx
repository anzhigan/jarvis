import type { AnalyticsLibrary } from '../hooks/useAnalytics';

const PRI_COLOR: Record<'high' | 'medium' | 'low', string> = {
  high:   'var(--rust)',
  medium: 'var(--ochre)',
  low:    'var(--ink-5)',
};

/** Open-by-priority bars — Indigo Editorial card with hairline rows. */
export function PriorityCard({ rows }: { rows: AnalyticsLibrary['priorityCounts'] }) {
  const total = rows.reduce((acc, r) => acc + r.count, 0);
  return (
    <div className="ana-card">
      <div className="ana-card-eyebrow">Open by priority</div>
      <h3 className="ana-card-title">Backlog + active + paused</h3>

      {total === 0 ? (
        <div className="ana-card-empty">All goals are done — nothing open.</div>
      ) : (
        rows.map((p) => (
          <div key={p.priority} className="ana-bar-row">
            <span>{p.label}</span>
            <div className="ana-bar-track" style={{ ['--accent' as any]: PRI_COLOR[p.priority] }}>
              <div className="ana-bar-fill" style={{ width: `${Math.max(0, p.ratio * 100)}%` }} />
            </div>
            <span className="ana-bar-count">{p.count}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Top tags by goal count. */
export function TagsCard({ rows }: { rows: AnalyticsLibrary['tagRows'] }) {
  return (
    <div className="ana-card">
      <div className="ana-card-eyebrow">Top tags</div>
      <h3 className="ana-card-title">Goals attached per tag</h3>

      {rows.length === 0 ? (
        <div className="ana-card-empty">Tag your goals to see clusters here.</div>
      ) : (
        rows.slice(0, 8).map(({ tag, count }) => (
          <div key={tag.id} className="ana-tag-row">
            <span>{tag.name}</span>
            <span className="count">{count}</span>
          </div>
        ))
      )}
    </div>
  );
}
