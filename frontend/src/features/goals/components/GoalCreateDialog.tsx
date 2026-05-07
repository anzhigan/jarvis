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

const STATUSES: TaskStatus[] = ['backlog', 'active', 'paused', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];

export function GoalCreateDialog({ open, onOpenChange, library, initialStatus = 'active' }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Reset on each open.
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
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ui-field-label">Status</span>
          <div className="seg" role="tablist">
            {STATUSES.map((s) => (
              <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ui-field-label">Priority</span>
          <div className="seg" role="tablist">
            {PRIORITIES.map((p) => (
              <button key={p} className={priority === p ? 'on' : ''} onClick={() => setPriority(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="ui-field-label">Due date</span>
          <input
            type="date"
            className="ui-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {library.tags.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="ui-field-label">Tags</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {library.tags.map((tag: Tag) => {
                const on = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="filter-chip"
                    data-active={on || undefined}
                    style={on ? { background: `${tag.color}1A`, color: tag.color, borderColor: `${tag.color}55` } : undefined}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: tag.color, display: 'inline-block' }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
          {submitting ? 'Creating…' : 'Create goal'}
        </Button>
      </div>
    </Dialog>
  );
}
