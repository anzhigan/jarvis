import { useEffect, useState } from 'react';
import { Button, Dialog, Input } from '../../../components/ui';
import type { SprintsLibrary } from '../hooks/useSprints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: SprintsLibrary;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function SprintCreateDialog({ open, onOpenChange, library }: Props) {
  const today = new Date();
  const twoWeeksAhead = new Date(today); twoWeeksAhead.setDate(twoWeeksAhead.getDate() + 14);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(ymd(today));
  const [endDate, setEndDate] = useState(ymd(twoWeeksAhead));
  const [color, setColor] = useState('#06B6D4'); // cyan default
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const t = new Date();
      const e = new Date(t); e.setDate(e.getDate() + 14);
      setTitle(''); setDescription('');
      setStartDate(ymd(t)); setEndDate(ymd(e));
      setColor('#06B6D4');
    }
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t || !startDate || !endDate) return;
    if (endDate < startDate) return;
    setSubmitting(true);
    const created = await library.create({
      title: t,
      description: description.trim() || undefined,
      start_date: startDate,
      end_date: endDate,
      color,
    });
    setSubmitting(false);
    if (created) onOpenChange(false);
  };

  const PRESETS = [
    { label: '1 week',    days: 7  },
    { label: '2 weeks',   days: 14 },
    { label: '1 month',   days: 30 },
    { label: '1 quarter', days: 90 },
  ];
  const applyPreset = (days: number) => {
    const start = new Date(startDate);
    const end = new Date(start); end.setDate(end.getDate() + days - 1);
    setEndDate(ymd(end));
  };

  const COLORS = ['#06B6D4', '#6366F1', '#10B981', '#F59E0B', '#A855F7', '#EF4444', '#71717A'];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New sprint"
      description="A focused period containing goals, steps, gos, or routines."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input
          autoFocus
          placeholder="Sprint title (e.g. Q2 launch focus)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="What's the focus for this period?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="ui-field-label">Start</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="ui-field-label">End</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ui-field-label">Quick length</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRESETS.map((p) => (
              <button key={p.label} className="filter-chip" onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ui-field-label">Colour</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                style={{
                  width: 28, height: 28,
                  borderRadius: 6,
                  background: c,
                  border: c === color ? '2px solid var(--fg-primary)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {endDate < startDate && (
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>
            End date must be on or after start date.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit}
                disabled={submitting || !title.trim() || endDate < startDate}>
          {submitting ? 'Creating…' : 'Create sprint'}
        </Button>
      </div>
    </Dialog>
  );
}
