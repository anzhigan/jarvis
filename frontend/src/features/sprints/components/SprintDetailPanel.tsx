import { useEffect, useState } from 'react';
import { Trash2, Archive, ArchiveRestore, Calendar, Box, Clock } from 'lucide-react';
import { Button, Drawer, Input } from '../../../components/ui';
import type { Sprint } from '../../../api/types';
import type { SprintsLibrary, SprintWithProgress } from '../hooks/useSprints';

interface Props {
  decorated: SprintWithProgress | null;
  library: SprintsLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BUCKET_LABEL: Record<SprintWithProgress['bucket'], string> = {
  active: 'Active', upcoming: 'Upcoming', past: 'Past',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function SprintDetailPanel({ decorated, library, open, onOpenChange }: Props) {
  const sprint = decorated?.sprint ?? null;
  const [title, setTitle] = useState(sprint?.title ?? '');
  const [description, setDescription] = useState(sprint?.description ?? '');
  const [startDate, setStartDate] = useState(sprint?.start_date ?? '');
  const [endDate, setEndDate] = useState(sprint?.end_date ?? '');
  useEffect(() => {
    setTitle(sprint?.title ?? '');
    setDescription(sprint?.description ?? '');
    setStartDate(sprint?.start_date ?? '');
    setEndDate(sprint?.end_date ?? '');
  }, [sprint?.id]);

  if (!sprint || !decorated) return null;

  const flushTitle = async () => {
    const t = title.trim();
    if (t && t !== sprint.title) await library.update(sprint.id, { title: t } as Partial<Sprint>);
  };
  const flushDescription = async () => {
    if (description !== sprint.description) {
      await library.update(sprint.id, { description } as Partial<Sprint>);
    }
  };
  const flushDates = async () => {
    if (startDate && endDate &&
        (startDate !== sprint.start_date || endDate !== sprint.end_date)) {
      await library.update(sprint.id, {
        start_date: startDate, end_date: endDate,
      } as Partial<Sprint>);
    }
  };
  const onArchiveToggle = () =>
    library.update(sprint.id, { is_archived: !sprint.is_archived } as Partial<Sprint>);
  const onDelete = async () => {
    if (!window.confirm(`Delete sprint "${sprint.title}"?`)) return;
    await library.remove(sprint.id);
    onOpenChange(false);
  };

  const dayLabel = decorated.bucket === 'past'
    ? 'Completed'
    : decorated.bucket === 'upcoming'
      ? `Starts ${fmtDate(sprint.start_date)}`
      : `Day ${decorated.daysElapsed} of ${decorated.daysTotal}`;

  const pct = Math.round(decorated.progress * 100);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      accent="sprints"
      title={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flushTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Sprint title"
        />
      }
      description={`${BUCKET_LABEL[decorated.bucket]} · ${dayLabel}`}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </Button>
          <span style={{ flex: 1 }} />
          <Button onClick={onArchiveToggle}>
            {sprint.is_archived
              ? <><ArchiveRestore size={13} /> Unarchive</>
              : <><Archive size={13} /> Archive</>}
          </Button>
        </>
      }
    >
      <div className="ui-field">
        <span className="ui-field-label">Description</span>
        <textarea
          className="ui-input"
          data-size="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={flushDescription}
          placeholder="What is this sprint focused on?"
        />
      </div>

      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> Start</span>
        <input
          type="date"
          className="value"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          onBlur={flushDates}
          style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--ink)' }}
        />
      </div>
      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> End</span>
        <input
          type="date"
          className="value"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          onBlur={flushDates}
          style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--ink)' }}
        />
      </div>
      <div className="ui-field-row">
        <span className="label"><Clock size={11} /> Duration</span>
        <span className="value">{decorated.daysTotal} days</span>
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Progress</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="gpb-bar" style={{ flex: 1, height: 4, ['--accent' as any]: sprint.color || 'var(--slate)' }}>
            <div className="gpb-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18, fontWeight: 500,
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 44, textAlign: 'right',
          }}>{pct}%</span>
        </div>
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Items ({sprint.items.length})</span>
        {sprint.items.length === 0 ? (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-4)' }}>
            No items linked yet — add goals, steps, gos or routines from their detail panels.
          </span>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sprint.items.map((it) => (
              <li
                key={it.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-control)',
                  background: 'var(--cream)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink)',
                }}
              >
                <Box size={11} style={{ color: 'var(--ink-5)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.title || `(unnamed ${it.item_type})`}
                </span>
                <span style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 'var(--text-2xs)', color: 'var(--ink-4)',
                  textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 500,
                }}>
                  {it.item_type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
