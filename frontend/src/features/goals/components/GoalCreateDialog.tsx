import { useEffect, useState } from 'react';
import { Button, Dialog, Input } from '../../../components/ui';
import type { Tag, TaskPriority, TaskStatus } from '../../../api/types';
import type { GoalsLibrary } from '../hooks/useGoals';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: GoalsLibrary;
  /** Status the goal lands in (used when opened from a kanban column's "+"). */
  initialStatus?: TaskStatus;
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'active',  label: 'Active'  },
  { value: 'paused',  label: 'Paused'  },
  { value: 'done',    label: 'Done'    },
];

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low',    label: 'Low'    },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High'   },
];

export function GoalCreateDialog({ open, onOpenChange, library, initialStatus = 'active' }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription('');
      setStatus(initialStatus); setPriority('medium');
      setDueDate(''); setTagIds([]);
    }
  }, [open, initialStatus]);

  const toggleTag = (id: string) => {
    setTagIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    const created = await library.createGoal({
      title: t,
      description: description.trim() || undefined,
      status,
      priority,
      due_date: dueDate || null,
      tag_ids: tagIds.length ? tagIds : undefined,
    });
    setSubmitting(false);
    if (created) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New goal"
      description="Long-running outcome with steps, Go items, and a deadline."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? 'Creating…' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Goal title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="What does success look like?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="ui-field">
          <span className="ui-field-label">Status</span>
          <div className="pill-seg" role="radiogroup">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                className={status === s.value ? 'on' : ''}
                role="radio"
                aria-checked={status === s.value}
                onClick={() => setStatus(s.value)}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">Priority</span>
          <div className="pill-seg" role="radiogroup">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                className={priority === p.value ? 'on' : ''}
                role="radio"
                aria-checked={priority === p.value}
                onClick={() => setPriority(p.value)}
              >{p.label}</button>
            ))}
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">Due date</span>
          <input
            type="date"
            className="ui-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {library.tags.length > 0 && (
          <div className="ui-field">
            <span className="ui-field-label">Tags</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {library.tags.map((tag: Tag) => {
                const on = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="ui-chip"
                    data-active={on || undefined}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color, display: 'inline-block' }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
