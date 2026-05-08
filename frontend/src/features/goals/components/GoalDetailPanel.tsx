import { useEffect, useState } from 'react';
import { Trash2, Calendar, Flag, Tag as TagIcon, Box, ListChecks } from 'lucide-react';
import { Button, Drawer, Input } from '../../../components/ui';
import type { Task, TaskPriority, TaskStatus } from '../../../api/types';
import type { GoalsLibrary } from '../hooks/useGoals';

interface Props {
  goal: Task | null;
  library: GoalsLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'active',  label: 'Active'  },
  { value: 'paused',  label: 'Paused'  },
  { value: 'done',    label: 'Done'    },
];

const PRIORITIES: { value: TaskPriority; label: string; tone: string }[] = [
  { value: 'low',    label: 'Low',    tone: 'var(--ink-5)' },
  { value: 'medium', label: 'Medium', tone: 'var(--ochre)' },
  { value: 'high',   label: 'High',   tone: 'var(--rust)'  },
];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function GoalDetailPanel({ goal, library, open, onOpenChange }: Props) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  useEffect(() => {
    setTitle(goal?.title ?? '');
    setDescription(goal?.description ?? '');
  }, [goal?.id]);

  if (!goal) return null;

  const flushTitle = async () => {
    const t = title.trim();
    if (t && t !== goal.title) await library.updateGoal(goal.id, { title: t });
  };
  const flushDescription = async () => {
    if (description !== goal.description) await library.updateGoal(goal.id, { description });
  };
  const onStatus   = (s: TaskStatus)   => library.updateGoal(goal.id, { status: s });
  const onPriority = (p: TaskPriority) => library.updateGoal(goal.id, { priority: p });
  const onDue = (e: React.ChangeEvent<HTMLInputElement>) =>
    library.updateGoal(goal.id, { due_date: e.target.value || null });

  const onDelete = async () => {
    if (!window.confirm(`Delete "${goal.title}"? This cannot be undone.`)) return;
    await library.deleteGoal(goal.id);
    onOpenChange(false);
  };

  const stepsDone = goal.sprints.filter((s) => s.is_completed).length;
  const gosDone   = goal.gos.filter((g) => g.is_done_today).length;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      accent="goals"
      title={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flushTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Goal title"
        />
      }
      description={`JV-${goal.id.slice(0, 8).toUpperCase()}`}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
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
          placeholder="Describe the goal…"
        />
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Status</span>
        <div className="pill-seg" role="radiogroup">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              className={goal.status === s.value ? 'on' : ''}
              role="radio"
              aria-checked={goal.status === s.value}
              onClick={() => onStatus(s.value)}
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
              className={goal.priority === p.value ? 'on' : ''}
              role="radio"
              aria-checked={goal.priority === p.value}
              onClick={() => onPriority(p.value)}
              style={goal.priority === p.value ? { color: p.tone } : undefined}
            >
              <Flag size={11} /> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> Due</span>
        <input
          type="date"
          className="value"
          value={goal.due_date ?? ''}
          onChange={onDue}
          style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--ink)' }}
        />
      </div>
      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> Start</span>
        <span className="value">{fmtDate(goal.start_date)}</span>
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Tags</span>
        {goal.tags.length === 0 ? (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-4)' }}>No tags</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {goal.tags.map((tag) => (
              <span
                key={tag.id}
                className="ui-chip"
                data-tone="muted"
              >
                <TagIcon size={10} style={{ color: tag.color }} /> {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="ui-field-row">
        <span className="label"><ListChecks size={11} /> Steps</span>
        <span className="value">
          {goal.sprints.length === 0
            ? <span style={{ color: 'var(--ink-4)' }}>None yet</span>
            : <>{stepsDone} / {goal.sprints.length} done</>}
        </span>
      </div>
      <div className="ui-field-row">
        <span className="label"><Box size={11} /> Gos</span>
        <span className="value">
          {goal.gos.length === 0
            ? <span style={{ color: 'var(--ink-4)' }}>None</span>
            : <>{gosDone} / {goal.gos.length} done today</>}
        </span>
      </div>
    </Drawer>
  );
}
