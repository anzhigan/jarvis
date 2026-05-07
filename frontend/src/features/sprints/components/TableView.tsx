import { MoreHorizontal } from 'lucide-react';
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

export function TableView({ rows, onSelect }: Props) {
  return (
    <div className="sp-table-wrap">
      <div className="sp-table-head">
        <span />
        <span>Sprint</span>
        <span>Period</span>
        <span className="col-num">Items</span>
        <span>Progress</span>
        <span>Status</span>
        <span />
      </div>
      {rows.map((row) => {
        const color = row.sprint.color || 'var(--accent-sprints)';
        return (
          <div
            key={row.sprint.id}
            className="sp-table-row"
            onClick={() => onSelect(row.sprint.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect(row.sprint.id); }}
          >
            <span className="sp-table-color" style={{ background: color }} />
            <div className="sp-table-info">
              <div className="sp-table-name">{row.sprint.title}</div>
              <div className="sp-table-sub">{row.daysTotal} days</div>
            </div>
            <div className="sp-table-period">
              {fmt(row.sprint.start_date)} → {fmt(row.sprint.end_date)}
            </div>
            <div className="sp-table-num">{row.sprint.items.length}</div>
            <div className="sp-table-progress">
              <span className="bar"><span className="fill" style={{ width: `${Math.min(100, row.progress * 100)}%`, background: color }} /></span>
              <span className="num">{Math.round(row.progress * 100)}%</span>
            </div>
            <span className="sp-table-pill" data-bucket={row.bucket}>{BUCKET_LABEL[row.bucket]}</span>
            <button
              className="icon-btn"
              onClick={(e) => { e.stopPropagation(); onSelect(row.sprint.id); }}
              aria-label="More"
            >
              <MoreHorizontal />
            </button>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--fg-muted)' }}>
          No sprints match the current filters.
        </div>
      )}
    </div>
  );
}
