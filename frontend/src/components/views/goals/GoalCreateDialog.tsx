import { useState } from 'react';
import { Dialog, Button, Input, Textarea } from '../../ui';
import { ENTITY_COLORS } from '../../../lib/colors';
import type { TaskPriority } from '../../../api/types';
import { PriorityStars } from './PriorityStars';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    description: string;
    priority: TaskPriority;
    color: string;
    due_date: string | null;
  }) => Promise<void>;
}

export function GoalCreateDialog({ open, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [color, setColor] = useState(ENTITY_COLORS[0]);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle(''); setDesc(''); setPriority('medium'); setColor(ENTITY_COLORS[0]); setDue('');
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(),
        description: desc.trim(),
        priority,
        color,
        due_date: due || null,
      });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="New goal"
      description="A goal you can break into steps and track over time."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="dt-field">
        <label className="dt-field-label">Title</label>
        <Input
          autoFocus
          placeholder="e.g. Ship the redesign"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          inputSize="lg"
        />
      </div>

      <div className="dt-field">
        <label className="dt-field-label">Description</label>
        <Textarea
          placeholder="Why does this goal matter? What does done look like?"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
        />
      </div>

      <div className="dt-field">
        <label className="dt-field-label">Priority</label>
        <div className="dt-field-row">
          <PriorityStars priority={priority} onChange={setPriority} size={20} />
          <span className="text-[var(--fg-tertiary)] text-sm capitalize">{priority}</span>
        </div>
      </div>

      <div className="dt-field">
        <label className="dt-field-label">Due date</label>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
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
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
