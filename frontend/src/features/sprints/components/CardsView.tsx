import { Calendar, Box } from 'lucide-react';
import type { SprintWithProgress } from '../hooks/useSprints';

interface Props {
  rows: SprintWithProgress[];
  onSelect: (id: string) => void;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const BUCKET_LABEL: Record<SprintWithProgress['bucket'], string> = {
  active:   'Active',
  upcoming: 'Upcoming',
  past:     'Past',
};

export function CardsView({ rows, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <div className="content-empty">
        <div className="content-empty-title">No sprints</div>
        <div>Create one to focus on a period.</div>
      </div>
    );
  }
  return (
    <div className="sp-cards">
      {rows.map((row) => {
        const color = row.sprint.color || 'var(--accent-sprints)';
        return (
          <button
            key={row.sprint.id}
            className="sp-card"
            data-bucket={row.bucket}
            style={{ ['--sprint-color' as any]: color }}
            onClick={() => onSelect(row.sprint.id)}
          >
            <div className="sp-card-stripe" />
            <div className="sp-card-head">
              <span className="sp-card-title">{row.sprint.title}</span>
              <span className="sp-card-pill" data-bucket={row.bucket}>{BUCKET_LABEL[row.bucket]}</span>
            </div>
            {row.sprint.description && (
              <div className="sp-card-desc">{row.sprint.description}</div>
            )}
            <div className="sp-card-dates">
              <Calendar />
              <span>{fmt(row.sprint.start_date)}</span>
              <span className="arrow">→</span>
              <span>{fmt(row.sprint.end_date)}</span>
              <span style={{ flex: 1 }} />
              <span className="sp-card-duration">{row.daysTotal}d</span>
            </div>
            <div className="sp-card-progressbar">
              <span className="fill" style={{ width: `${Math.min(100, row.progress * 100)}%` }} />
            </div>
            <div className="sp-card-foot">
              <span className="sp-card-day">
                {row.bucket === 'past'    ? 'Completed'
                : row.bucket === 'upcoming' ? `Starts ${fmt(row.sprint.start_date)}`
                : `Day ${row.daysElapsed} of ${row.daysTotal}`}
              </span>
              <span className="sp-card-items">
                <Box /> {row.sprint.items.length} items
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
