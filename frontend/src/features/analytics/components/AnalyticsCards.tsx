import { Flame } from 'lucide-react';
import type { AnalyticsLibrary } from '../hooks/useAnalytics';

export function TopStreaksCard({ rows }: { rows: AnalyticsLibrary['topStreaks'] }) {
  if (rows.length === 0) {
    return (
      <div className="an-card">
        <div className="an-card-head">
          <div className="an-card-title-block">
            <div className="an-card-title">Top streaks</div>
            <div className="an-card-sub">No active routines yet.</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Top streaks</div>
          <div className="an-card-sub">Active routines ranked</div>
        </div>
      </div>
      <div className="streak-list">
        {rows.map((r, i) => {
          const rank = i + 1;
          return (
            <div
              key={r.routine.id}
              className="streak-row"
              data-rank={rank}
              data-zero={r.streak === 0 || undefined}
            >
              <span className="streak-rank">#{rank}</span>
              <span className="streak-color" style={{ background: r.routine.color || 'var(--accent-routines)' }} />
              <span className="streak-name">{r.routine.title}</span>
              <span className="streak-flame">
                <Flame size={11} style={{ verticalAlign: -1, color: 'var(--accent-routines)' }} />
                {' '}{r.streak}d
              </span>
              <span className="streak-rate">{r.rate}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PriorityCard({ rows }: { rows: AnalyticsLibrary['priorityCounts'] }) {
  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Open by priority</div>
          <div className="an-card-sub">Backlog + active + paused goals</div>
        </div>
      </div>
      <div className="prio-list">
        {rows.map((p) => (
          <div key={p.priority} className="prio-row">
            <span className="prio-name">{p.label}</span>
            <div className="prio-bar" data-pri={p.priority}>
              <div className="fill" style={{ width: `${Math.max(0, p.ratio * 100)}%` }} />
            </div>
            <span className="prio-num">{p.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TagsCard({ rows }: { rows: AnalyticsLibrary['tagRows'] }) {
  if (rows.length === 0) {
    return (
      <div className="an-card">
        <div className="an-card-head">
          <div className="an-card-title-block">
            <div className="an-card-title">Tags</div>
            <div className="an-card-sub">Tag your goals to see clusters here.</div>
          </div>
        </div>
      </div>
    );
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="an-card">
      <div className="an-card-head">
        <div className="an-card-title-block">
          <div className="an-card-title">Top tags</div>
          <div className="an-card-sub">Goals attached per tag</div>
        </div>
      </div>
      <div className="tag-cloud">
        {rows.map(({ tag, count }) => {
          const ratio = count / max;
          const size: 'lg' | 'md' | 'sm' = ratio >= 0.7 ? 'lg' : ratio >= 0.4 ? 'md' : 'sm';
          return (
            <span key={tag.id} className="tag-pill" data-size={size}>
              <span className="dot" style={{ background: tag.color }} />
              {tag.name}
              <span className="count">{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
