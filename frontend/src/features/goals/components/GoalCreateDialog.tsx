import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, Input } from '../../../components/ui';
import { gosApi, tagsApi } from '../../../api/client';
import type { Tag, TaskPriority, TaskStatus } from '../../../api/types';
import type { GoalsLibrary } from '../hooks/useGoals';
import type { GosLibrary } from '../hooks/useGos';

type FollowUp = 'none' | 'go' | 'routine';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: GoalsLibrary;
  gos: GosLibrary;
  /** Status the goal lands in (used when opened from a kanban column's "+"). */
  initialStatus?: TaskStatus;
  /** Called after a successful create with the chosen follow-up flow + new task id. */
  onCreated?: (taskId: string, followUp: FollowUp) => void;
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

// Editorial palette — reuses the muted accents already defined in tokens.css
// (indigo / moss / ochre / rust / slate / walnut) instead of bright web hexes,
// so the swatch matches tag colors and other UI elements.
const COLORS: { value: string; name: string }[] = [
  { value: '#2C4A60', name: 'Indigo'    },
  { value: '#5A6B78', name: 'Slate'     },
  { value: '#6B7A4F', name: 'Moss'      },
  { value: '#A18030', name: 'Ochre'     },
  { value: '#A04A39', name: 'Rust'      },
  { value: '#4A3A2D', name: 'Walnut'    },
  { value: '#1B3447', name: 'Indigo-2'  },
  { value: '#6B4F3D', name: 'Walnut-2'  },
];

const FOLLOW_UPS: { value: FollowUp; label: string }[] = [
  { value: 'none',    label: 'Just save'  },
  { value: 'go',      label: '+ Go'       },
  { value: 'routine', label: '+ Routine'  },
];

export function GoalCreateDialog({
  open, onOpenChange, library, gos, initialStatus = 'active', onCreated,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [dueDate, setDueDate] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [orphanGoIds, setOrphanGoIds] = useState<Set<string>>(new Set());
  const [followUp, setFollowUp] = useState<FollowUp>('none');
  const [submitting, setSubmitting] = useState(false);

  // Inline new-tag creator
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(COLORS[0].value);
  const [savingTag, setSavingTag] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription('');
      setStatus(initialStatus); setPriority('medium');
      setColor(COLORS[0].value);
      setDueDate(''); setTagIds([]);
      setOrphanGoIds(new Set());
      setFollowUp('none');
      setCreatingTag(false); setNewTagName(''); setNewTagColor(COLORS[0].value);
    }
  }, [open, initialStatus]);

  const saveNewTag = async () => {
    const n = newTagName.trim();
    if (!n) return;
    setSavingTag(true);
    try {
      const tag = await tagsApi.create(n, newTagColor);
      await library.refresh();
      setTagIds((p) => p.includes(tag.id) ? p : [...p, tag.id]);
      setCreatingTag(false);
      setNewTagName('');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create tag');
    } finally {
      setSavingTag(false);
    }
  };

  const orphanGos = useMemo(() => gos.gos.filter((g) => !g.task_id), [gos.gos]);

  const toggleTag = (id: string) =>
    setTagIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const toggleOrphanGo = (id: string) => setOrphanGoIds((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      const created = await library.createGoal({
        title: t,
        description: description.trim() || undefined,
        status,
        priority,
        color,
        due_date: dueDate || null,
        tag_ids: tagIds.length ? tagIds : undefined,
      });
      if (!created) return;
      // Attach selected orphan gos in parallel.
      if (orphanGoIds.size > 0) {
        await Promise.all(
          Array.from(orphanGoIds).map((id) =>
            gosApi.update(id, { task_id: created.id }),
          ),
        );
        await Promise.all([library.refresh(), gos.refresh()]);
      }
      onCreated?.(created.id, followUp);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create goal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New goal"
      description="Long-running outcome with gos, routines, and a deadline."
      size="lg"
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
          <span className="ui-field-label">Color</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COLORS.map((c) => {
              const on = color === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  aria-label={c.name}
                  title={c.name}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: c.value,
                    border: 0, cursor: 'pointer',
                    boxShadow: on
                      ? `0 0 0 2px var(--bg-elevated, #fff), 0 0 0 4px ${c.value}`
                      : '0 0 0 1px var(--hairline-faint, rgba(0,0,0,0.08))',
                    transition: 'box-shadow var(--dur-fast)',
                  }}
                />
              );
            })}
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

        <div className="ui-field">
          <span className="ui-field-label">Tags</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {library.tags.map((tag: Tag) => {
              const on = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  className="ui-chip"
                  data-active={on || undefined}
                  type="button"
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: tag.color, display: 'inline-block' }} />
                  {tag.name}
                </button>
              );
            })}
            {!creatingTag && (
              <button
                type="button"
                className="ui-chip"
                data-tone="muted"
                onClick={() => setCreatingTag(true)}
              ><Plus size={11} /> New tag</button>
            )}
          </div>
          {creatingTag && (
            <div style={{
              marginTop: 8, padding: 10,
              borderRadius: 'var(--r-control)',
              background: 'var(--cream)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <Input
                autoFocus
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void saveNewTag(); }
                  if (e.key === 'Escape') { setCreatingTag(false); setNewTagName(''); }
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {COLORS.map((c) => {
                  const on = newTagColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewTagColor(c.value)}
                      title={c.name}
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: c.value, border: 0, cursor: 'pointer',
                        boxShadow: on
                          ? `0 0 0 2px var(--bg-elevated, #fff), 0 0 0 4px ${c.value}`
                          : '0 0 0 1px var(--hairline-faint, rgba(0,0,0,0.08))',
                      }}
                    />
                  );
                })}
                <span style={{ flex: 1 }} />
                <Button
                  variant="ghost"
                  onClick={() => { setCreatingTag(false); setNewTagName(''); }}
                >Cancel</Button>
                <Button
                  variant="primary"
                  onClick={saveNewTag}
                  disabled={!newTagName.trim() || savingTag}
                >{savingTag ? 'Saving…' : 'Save tag'}</Button>
              </div>
            </div>
          )}
        </div>

        {orphanGos.length > 0 && (
          <div className="ui-field">
            <span className="ui-field-label">Attach existing gos ({orphanGos.length} unassigned)</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {orphanGos.map((g) => {
                const on = orphanGoIds.has(g.id);
                return (
                  <label
                    key={g.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px',
                      borderRadius: 'var(--r-control)',
                      background: on ? 'var(--indigo-soft)' : 'transparent',
                      border: '1px solid var(--hairline-faint)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleOrphanGo(g.id)}
                    />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.title}
                    </span>
                    {g.kind === 'numeric' && g.target_value != null && (
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-4)' }}>
                        {g.target_value}{g.unit ? ` ${g.unit}` : ''}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="ui-field">
          <span className="ui-field-label">After creating</span>
          <div className="pill-seg" role="radiogroup">
            {FOLLOW_UPS.map((f) => (
              <button
                key={f.value}
                className={followUp === f.value ? 'on' : ''}
                role="radio"
                aria-checked={followUp === f.value}
                onClick={() => setFollowUp(f.value)}
              >{f.label}</button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
