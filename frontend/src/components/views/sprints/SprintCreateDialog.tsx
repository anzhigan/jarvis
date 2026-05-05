import { useState } from 'react';
import { Dialog, Button, Input, Textarea } from '../../ui';
import { ENTITY_COLORS } from '../../../lib/colors';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; description: string; start_date: string; end_date: string; color: string }) => Promise<void>;
}

function defaultDates(): { start: string; end: string } {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  return { start, end };
}

export function SprintCreateDialog({ open, onClose, onCreate }: Props) {
  const def = defaultDates();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [start, setStart] = useState(def.start);
  const [end, setEnd] = useState(def.end);
  const [color, setColor] = useState(ENTITY_COLORS[4]);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !start || !end) return;
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), description: desc, start_date: start, end_date: end, color });
      setTitle(''); setDesc(''); setColor(ENTITY_COLORS[4]);
      const d = defaultDates(); setStart(d.start); setEnd(d.end);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="New sprint"
      description="A focus period to bundle goals, steps, and routines."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create sprint'}
          </Button>
        </>
      }
    >
      <div className="dt-field">
        <label className="dt-field-label">Title</label>
        <Input autoFocus inputSize="lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q2 push" />
      </div>
      <div className="dt-field">
        <label className="dt-field-label">Description</label>
        <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What's the focus?" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="dt-field">
          <label className="dt-field-label">Start</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="dt-field">
          <label className="dt-field-label">End</label>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="dt-field">
        <label className="dt-field-label">Color</label>
        <div className="dt-field-row">
          {ENTITY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="dt-color-dot"
              style={{ background: c }}
              data-active={color === c || undefined}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
