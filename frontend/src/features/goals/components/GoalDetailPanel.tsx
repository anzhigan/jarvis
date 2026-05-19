import { useEffect, useMemo, useState } from 'react';
import { Trash2, Calendar, Flag, Box, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, confirmDialog, DateInput, Drawer, Input } from '../../../components/ui';
import { tagsApi } from '../../../api/client';
import type { Tag, Task, TaskPriority, TaskStatus } from '../../../api/types';
import type { GoalsLibrary } from '../hooks/useGoals';

// Same palette as GoalCreateDialog — keeps inline tag swatch consistent with
// the rest of the editorial accents (tokens.css).
const TAG_COLORS: { value: string; name: string }[] = [
  { value: '#2C4A60', name: 'Indigo'   },
  { value: '#5A6B78', name: 'Slate'    },
  { value: '#6B7A4F', name: 'Moss'     },
  { value: '#A18030', name: 'Ochre'    },
  { value: '#A04A39', name: 'Rust'     },
  { value: '#4A3A2D', name: 'Walnut'   },
  { value: '#1B3447', name: 'Indigo-2' },
  { value: '#6B4F3D', name: 'Walnut-2' },
];

interface Props {
  goal: Task | null;
  library: GoalsLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Skip overlay/focus-trap when stacked alongside another drawer (Plan-day). */
  nonModal?: boolean;
  /** Fires the AI `dates_only` goal_plan for the current goal — parent
   *  (GoalsView) handles enqueueing + opening the GoalPlanDrawer. */
  onPlanDates?: (goalId: string) => void;
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

export function GoalDetailPanel({
  goal, library, open, onOpenChange, nonModal, onPlanDates,
}: Props) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  useEffect(() => {
    setTitle(goal?.title ?? '');
    setDescription(goal?.description ?? '');
  }, [goal?.id]);

  // Inline new-tag creator — mirrors GoalCreateDialog so adding/creating tags
  // works the same way before vs. after a goal exists.
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [savingTag, setSavingTag] = useState(false);
  const [tagBusyId, setTagBusyId] = useState<string | null>(null);

  // Close the inline creator whenever the drawer flips to a different goal —
  // otherwise the "Tag name" field carries over to the next goal.
  useEffect(() => {
    setCreatingTag(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0].value);
  }, [goal?.id]);

  const goalTagIds = useMemo(
    () => new Set((goal?.tags ?? []).map((t) => t.id)),
    [goal?.tags],
  );

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
  // Date setters: empty string clears (null). When a user shifts start past
  // due, the due_date field's `min` prop blocks the date-picker beyond it
  // — defence-in-depth so the saved row never has end < start.
  const onStart = (next: string) =>
    library.updateGoal(goal.id, { start_date: next || null });
  const onDue = (next: string) =>
    library.updateGoal(goal.id, { due_date: next || null });

  // Tag attach/detach uses dedicated M2M endpoints (attachTag/detachTag) —
  // updateGoal doesn't accept tag_ids, and toggling per-tag keeps the
  // optimistic-refresh contract identical to GoalCreateDialog.
  const toggleTag = async (tagId: string) => {
    if (!goal || tagBusyId) return;
    setTagBusyId(tagId);
    try {
      if (goalTagIds.has(tagId)) await library.detachTag(goal.id, tagId);
      else                       await library.attachTag(goal.id, tagId);
    } finally {
      setTagBusyId(null);
    }
  };
  const saveNewTag = async () => {
    if (!goal) return;
    const n = newTagName.trim();
    if (!n) return;
    setSavingTag(true);
    try {
      const tag = await tagsApi.create(n, newTagColor);
      await library.refresh();
      // Attach the freshly created tag to the current goal — otherwise the
      // user would have to click again. Matches dialog UX expectation.
      await library.attachTag(goal.id, tag.id);
      setCreatingTag(false);
      setNewTagName('');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create tag');
    } finally {
      setSavingTag(false);
    }
  };

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Delete goal?',
      body: <>«{goal.title}» This cannot be undone.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await library.deleteGoal(goal.id);
    onOpenChange(false);
  };

  const onSave = async () => {
    // Title + description save on blur, but users still expect an explicit
    // Save button. Flush both, then close — handles the "I changed text and
    // immediately clicked Save without blurring first" case.
    await flushTitle();
    await flushDescription();
    onOpenChange(false);
  };

  const gosDone   = goal.gos.filter((g) => g.is_done_today).length;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      accent="goals"
      nonModal={nonModal}
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
          <Button variant="primary" onClick={onSave}>
            <Check size={13} /> Save
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
        <span className="label"><Calendar size={11} /> Start</span>
        <span className="value" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          {/* When the user picks a start past the current due, we don't
              block it here — `max` on Start would lock the picker to an
              outdated due_date. The Due input's `min` enforces the
              ordering instead (end ≥ start). */}
          <DateInput
            value={goal.start_date ?? ''}
            onChange={onStart}
            ariaLabel="Start date"
          />
        </span>
      </div>
      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> Due</span>
        <span className="value" style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <DateInput
            value={goal.due_date ?? ''}
            onChange={onDue}
            ariaLabel="Due date"
            min={goal.start_date ?? undefined}
          />
        </span>
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Tags</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {library.tags.map((tag: Tag) => {
            const on = goalTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className="ui-chip"
                data-active={on || undefined}
                disabled={tagBusyId === tag.id}
                onClick={() => toggleTag(tag.id)}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: tag.color, display: 'inline-block',
                }} />
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
                if (e.key === 'Enter')  { e.preventDefault(); void saveNewTag(); }
                if (e.key === 'Escape') { setCreatingTag(false); setNewTagName(''); }
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {TAG_COLORS.map((c) => {
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
                        ? `0 0 0 2px var(--paper), 0 0 0 4px ${c.value}`
                        : '0 0 0 1px var(--hairline-faint)',
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

      <div className="ui-field-row">
        <span className="label"><Box size={11} /> Gos</span>
        <span className="value">
          {goal.gos.length === 0
            ? <span style={{ color: 'var(--ink-4)' }}>None</span>
            : <>{gosDone} / {goal.gos.length} done today</>}
        </span>
      </div>

      {/* AI CTA — only meaningful when there's actually something to date.
          The handler is parent-provided so it can wire into the existing
          AI-job + drawer plumbing in GoalsView. */}
      {onPlanDates && goal.steps.length > 0 && (
        <div className="ui-field" style={{ marginTop: 8 }}>
          <Button
            variant="ghost"
            onClick={() => onPlanDates(goal.id)}
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
          >
            <span aria-hidden>✨</span> Auto-place dates with AI
          </Button>
          <p style={{
            margin: '6px 2px 0', fontSize: 'var(--text-2xs)',
            color: 'var(--ink-5)', fontStyle: 'italic',
          }}>
            Proposes start/end for each step and due dates for their gos —
            balanced across the goal window and your other active deadlines.
          </p>
        </div>
      )}
    </Drawer>
  );
}
