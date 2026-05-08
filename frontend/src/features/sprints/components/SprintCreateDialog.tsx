import { useEffect, useState } from 'react';
import { Button, Dialog, Input } from '../../../components/ui';
import type { SprintsLibrary } from '../hooks/useSprints';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: SprintsLibrary;
  /** Pre-selected length in days when opened from a "Templates" pane row. */
  templateDays?: number | null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PRESETS: { label: string; days: number }[] = [
  { label: '1 week',    days: 7  },
  { label: '2 weeks',   days: 14 },
  { label: '1 month',   days: 30 },
  { label: '1 quarter', days: 90 },
];

const COLORS = ['#3A5364', '#6B7A4F', '#A18030', '#A04A39', '#6F7A82', '#4A3A2D', '#71717A'];

export function SprintCreateDialog({ open, onOpenChange, library, templateDays }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Reset on every open and apply the requested template length when present.
  useEffect(() => {
    if (!open) return;
    const t = new Date();
    const days = templateDays && templateDays > 0 ? templateDays : 14;
    const e = new Date(t); e.setDate(e.getDate() + days - 1);
    setTitle(''); setDescription('');
    setStartDate(ymd(t)); setEndDate(ymd(e));
    setColor(COLORS[0]);
  }, [open, templateDays]);

  const applyPreset = (days: number) => {
    const start = new Date(startDate || ymd(new Date()));
    const end = new Date(start); end.setDate(end.getDate() + days - 1);
    setEndDate(ymd(end));
  };

  // Days currently between start and end (inclusive). Used to highlight the matching preset.
  const currentDays = (() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate); const e = new Date(endDate);
    return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
  })();

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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New sprint"
      description="A focused period containing goals, steps, gos, or routines."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={submitting || !title.trim() || endDate < startDate}
          >
            {submitting ? 'Creating…' : 'Create sprint'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
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

        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">End</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">Quick length</span>
          <div className="pill-seg" role="radiogroup">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={currentDays === p.days ? 'on' : ''}
                role="radio"
                aria-checked={currentDays === p.days}
                onClick={() => applyPreset(p.days)}
              >{p.label}</button>
            ))}
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">Colour</span>
          <div className="ui-color-grid">
            {COLORS.map((c) => (
              <button
                key={c}
                className="ui-color-swatch"
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                data-active={c === color || undefined}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {endDate < startDate && (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--rust)' }}>
            End date must be on or after start date.
          </span>
        )}
      </div>
    </Dialog>
  );
}
