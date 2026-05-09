import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  Go, Note, Routine, RoutineScheduleType, Sprint, Step, Task,
  TaskPriority, TaskStatus, Topic, Way,
} from '../../../api/types';
import { MobileBottomSheet } from './MobileBottomSheet';
import type { GoalsLibrary } from '../../goals/hooks/useGoals';
import type { GosLibrary } from '../../goals/hooks/useGos';
import type { useSteps } from '../../goals/hooks/useSteps';
import type { RoutinesLibrary } from '../../routines/hooks/useRoutines';
import type { SprintsLibrary } from '../../sprints/hooks/useSprints';
import type { NotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { gosApi, routinesApi, stepsApi } from '../../../api/client';
import { Plus, X } from 'lucide-react';
import { MobilePickerSheet } from './MobilePickerSheet';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const COLORS: { value: string; name: string }[] = [
  { value: '#2C4A60', name: 'Indigo' },
  { value: '#5A6B78', name: 'Slate'  },
  { value: '#6B7A4F', name: 'Moss'   },
  { value: '#A18030', name: 'Ochre'  },
  { value: '#A04A39', name: 'Rust'   },
  { value: '#4A3A2D', name: 'Walnut' },
];

// ── Way ─────────────────────────────────────────────────────────────────────

interface WayFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: NotesLibrary;
  /** Provide to switch into edit mode. */
  editing?: Way | null;
  onCreated?: (wayId: string) => void;
}

export function WayForm({ open, onOpenChange, library, editing, onCreated }: WayFormProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setName(editing?.name ?? ''); setBusy(false); }
  }, [open, editing?.id, editing?.name]);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    if (editing) {
      await library.renameWay(editing.id, n);
      setBusy(false);
      onOpenChange(false);
    } else {
      const w = await library.createWay(n);
      setBusy(false);
      if (w) { onCreated?.(w.id); onOpenChange(false); }
    }
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Rename way' : 'New way'}
      description={editing ? undefined : 'A top-level folder for your notes.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Name</label>
          <input
            autoFocus
            className="m-form-input"
            placeholder="e.g. Running"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </MobileBottomSheet>
  );
}

// ── Topic ───────────────────────────────────────────────────────────────────

interface TopicFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: NotesLibrary;
  wayId: string;
  wayName: string;
  editing?: Topic | null;
  onCreated?: (topicId: string) => void;
}

export function TopicForm({ open, onOpenChange, library, wayId, wayName, editing, onCreated }: TopicFormProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setName(editing?.name ?? ''); setBusy(false); }
  }, [open, editing?.id, editing?.name]);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    if (editing) {
      await library.renameTopic(editing.id, n);
      setBusy(false);
      onOpenChange(false);
    } else {
      const t = await library.createTopic(wayId, n);
      setBusy(false);
      if (t) { onCreated?.(t.id); onOpenChange(false); }
    }
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Rename topic' : 'New topic'}
      description={editing ? undefined : `Inside ${wayName}.`}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !name.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Name</label>
          <input
            autoFocus
            className="m-form-input"
            placeholder="e.g. Plans"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </MobileBottomSheet>
  );
}

// ── Note ────────────────────────────────────────────────────────────────────

interface NoteFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: NotesLibrary;
  /** Either way_id or topic_id is required for creation. */
  target?: { way_id?: string; topic_id?: string };
  parentName?: string;
  editing?: Note | null;
  onCreated?: (noteId: string) => void;
}

export function NoteForm({ open, onOpenChange, library, target, parentName, editing, onCreated }: NoteFormProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) { setName(editing?.name ?? ''); setBusy(false); }
  }, [open, editing?.id, editing?.name]);

  const submit = async () => {
    const n = name.trim() || 'Untitled';
    setBusy(true);
    if (editing) {
      await library.renameNote(editing.id, n);
      setBusy(false);
      onOpenChange(false);
    } else if (target) {
      const note = await library.createNote(target, n);
      setBusy(false);
      if (note) { onCreated?.(note.id); onOpenChange(false); }
    }
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Rename note' : 'New note'}
      description={editing ? undefined : (parentName ? `In ${parentName}.` : undefined)}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Title</label>
          <input
            autoFocus
            className="m-form-input"
            placeholder="Untitled"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </form>
    </MobileBottomSheet>
  );
}

// ── Goal ────────────────────────────────────────────────────────────────────

interface GoalFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: GoalsLibrary;
  /** Optional: enables "Attach existing gos" + creating a fresh go inline. */
  gos?: GosLibrary;
  /** Optional: enables "Attach existing steps" — moves them to this goal. */
  stepsLib?: ReturnType<typeof useSteps>;
  initialStatus?: TaskStatus;
  editing?: Task | null;
  onCreated?: (taskId: string) => void;
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

export function GoalForm({
  open, onOpenChange, library, gos, stepsLib, initialStatus = 'active', editing, onCreated,
}: GoalFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [dueDate, setDueDate] = useState('');
  const [attachGoIds, setAttachGoIds] = useState<Set<string>>(new Set());
  const [attachStepIds, setAttachStepIds] = useState<Set<string>>(new Set());
  const [goPickerOpen, setGoPickerOpen] = useState(false);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Gos that can be attached.
  const attachableGos = (gos?.gos ?? []).filter((g) => {
    if (editing) return g.task_id !== editing.id;
    return !g.task_id;
  });
  // Steps that can be attached: belong to OTHER goals (will be moved).
  const attachableSteps = (stepsLib?.allSteps ?? []).filter((s) => {
    if (editing) return s.task_id !== editing.id;
    return true;
  });

  // Resolve selected entities for chips display.
  const selectedGos   = (gos?.gos ?? []).filter((g) => attachGoIds.has(g.id));
  const selectedSteps = (stepsLib?.allSteps ?? []).filter((s) => attachStepIds.has(s.id));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setStatus(editing.status);
      setPriority(editing.priority);
      setColor(editing.color || COLORS[0].value);
      setDueDate(editing.due_date || '');
    } else {
      setTitle(''); setDescription(''); setStatus(initialStatus);
      setPriority('medium'); setColor(COLORS[0].value); setDueDate('');
    }
    setAttachGoIds(new Set());
    setAttachStepIds(new Set());
    setBusy(false);
  }, [open, initialStatus, editing?.id]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    let goalId: string | null = null;
    if (editing) {
      await library.updateGoal(editing.id, {
        title: t,
        description: description.trim(),
        status, priority, color,
        due_date: dueDate || null,
      });
      goalId = editing.id;
    } else {
      const created = await library.createGoal({
        title: t,
        description: description.trim() || undefined,
        status, priority, color,
        due_date: dueDate || null,
      });
      if (created) goalId = created.id;
    }
    if (goalId) {
      const tasks: Promise<unknown>[] = [];
      for (const id of attachGoIds)   tasks.push(gosApi.update(id, { task_id: goalId }));
      for (const id of attachStepIds) tasks.push(stepsApi.update(id, { task_id: goalId }));
      if (tasks.length) {
        await Promise.all(tasks);
        await library.refresh();
        if (gos) await gos.refresh();
      }
    }
    setBusy(false);
    if (goalId && !editing) onCreated?.(goalId);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Edit goal' : 'New goal'}
      description={editing ? undefined : 'Long-running outcome with steps, gos, routines.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Title</label>
          <input autoFocus={!editing} className="m-form-input" placeholder="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Description</label>
          <textarea className="m-form-textarea" placeholder="What does success look like?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Status</label>
          <div className="m-form-pill-row">
            {STATUSES.map((s) => (
              <button key={s.value} type="button" className="m-form-pill" data-active={status === s.value} onClick={() => setStatus(s.value)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="m-form-label">Priority</label>
          <div className="m-form-pill-row">
            {PRIORITIES.map((p) => (
              <button key={p.value} type="button" className="m-form-pill" data-active={priority === p.value} onClick={() => setPriority(p.value)}>{p.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="m-form-label">Color</label>
          <div className="m-form-color-grid">
            {COLORS.map((c) => {
              const on = color === c.value;
              return (
                <button key={c.value} type="button" className="m-form-color-swatch" onClick={() => setColor(c.value)} aria-label={c.name} title={c.name}
                  style={{ background: c.value, boxShadow: on ? `0 0 0 2px var(--paper), 0 0 0 4px ${c.value}` : '0 0 0 1px var(--hairline)' }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <label className="m-form-label">Due date</label>
          <input className="m-form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {(gos || stepsLib) && (
          <div>
            <label className="m-form-label">Linked items</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {stepsLib && (
                <button type="button" className="m-attach-btn" onClick={() => setStepPickerOpen(true)}>
                  <Plus size={14} /> Step
                  {attachStepIds.size > 0 && <span className="m-attach-badge">{attachStepIds.size}</span>}
                </button>
              )}
              {gos && (
                <button type="button" className="m-attach-btn" onClick={() => setGoPickerOpen(true)}>
                  <Plus size={14} /> Go
                  {attachGoIds.size > 0 && <span className="m-attach-badge">{attachGoIds.size}</span>}
                </button>
              )}
            </div>
            {(selectedGos.length > 0 || selectedSteps.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {selectedSteps.map((s) => (
                  <span key={s.id} className="m-attach-chip">
                    Step · {s.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachStepIds((p) => { const n = new Set(p); n.delete(s.id); return n; })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {selectedGos.map((g) => (
                  <span key={g.id} className="m-attach-chip">
                    Go · {g.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachGoIds((p) => { const n = new Set(p); n.delete(g.id); return n; })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {gos && (
        <MobilePickerSheet
          open={goPickerOpen}
          onOpenChange={setGoPickerOpen}
          title="Pick a go"
          entity="Go"
          items={attachableGos}
          initialSelected={attachGoIds}
          onConfirm={(s) => setAttachGoIds(s)}
          matches={(g, q) => g.title.toLowerCase().includes(q)}
          render={(g) => (
            <>
              <div style={{ fontWeight: 500 }}>{g.title}</div>
              {g.kind === 'numeric' && g.target_value != null && (
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                  target {g.target_value}{g.unit ? ` ${g.unit}` : ''}
                </div>
              )}
            </>
          )}
        />
      )}
      {stepsLib && (
        <MobilePickerSheet
          open={stepPickerOpen}
          onOpenChange={setStepPickerOpen}
          title="Pick a step"
          entity="Step"
          items={attachableSteps}
          initialSelected={attachStepIds}
          onConfirm={(s) => setAttachStepIds(s)}
          matches={(s, q) => s.title.toLowerCase().includes(q) || (s.goal?.title?.toLowerCase().includes(q) ?? false)}
          render={(s) => (
            <>
              <div style={{ fontWeight: 500 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>from {s.goal.title}</div>
            </>
          )}
        />
      )}
    </MobileBottomSheet>
  );
}

// ── Step ────────────────────────────────────────────────────────────────────

interface StepFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: ReturnType<typeof useSteps>;
  goals: Task[];
  /** Optional: enables "Attach existing gos" inside the step. */
  gos?: GosLibrary;
  /** Pre-selected parent goal. If null and goals.length > 1, user picks one. */
  initialGoalId?: string | null;
  editing?: Step | null;
}

export function StepForm({ open, onOpenChange, steps, goals, gos, initialGoalId, editing }: StepFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState<string>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [completed, setCompleted] = useState(false);
  const [attachGoIds, setAttachGoIds] = useState<Set<string>>(new Set());
  const [goPickerOpen, setGoPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Gos available to attach: belong to the same goal AND aren't already in
  // this step. Allows pulling a free-floating go (no sprint) into a step.
  const targetGoalId = editing ? editing.task_id : goalId;
  const attachable = (gos?.gos ?? []).filter((g) => {
    if (!targetGoalId || g.task_id !== targetGoalId) return false;
    if (editing && g.sprint_id === editing.id) return false;
    return true;
  });
  const selectedGos = (gos?.gos ?? []).filter((g) => attachGoIds.has(g.id));

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setGoalId(editing.task_id);
      setStart(editing.start_date);
      setEnd(editing.end_date);
      setCompleted(editing.is_completed);
    } else {
      const today = new Date();
      const e = new Date(today); e.setDate(e.getDate() + 30);
      setTitle(''); setDescription('');
      setGoalId(initialGoalId ?? goals[0]?.id ?? '');
      setStart(ymd(today)); setEnd(ymd(e));
      setCompleted(false);
    }
    setAttachGoIds(new Set());
    setBusy(false);
  }, [open, initialGoalId, goals, editing?.id]);

  const submit = async () => {
    const t = title.trim();
    if (!t || !goalId) return;
    setBusy(true);
    let stepId: string | null = null;
    if (editing) {
      await steps.updateStep(editing.id, {
        title: t,
        description: description.trim(),
        start_date: start, end_date: end,
        is_completed: completed,
      });
      stepId = editing.id;
    } else {
      const created = await steps.createStep({
        task_id: goalId, title: t,
        description: description.trim() || undefined,
        start_date: start, end_date: end,
      });
      if (created) stepId = created.id;
    }
    if (stepId && attachGoIds.size > 0 && gos) {
      await Promise.all(
        Array.from(attachGoIds).map((id) => gosApi.update(id, { sprint_id: stepId })),
      );
      await gos.refresh();
    }
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Edit step' : 'New step'}
      description={editing ? undefined : 'A bounded milestone within a goal.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !title.trim() || !goalId} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {!editing && (
          <div>
            <label className="m-form-label">Goal</label>
            <select className="m-form-input" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {goals.length === 0 && <option value="">— no goals yet —</option>}
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="m-form-label">Title</label>
          <input autoFocus={!editing} className="m-form-input" placeholder="Step title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Description</label>
          <textarea className="m-form-textarea" placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="m-form-row">
          <div>
            <label className="m-form-label">Start</label>
            <input className="m-form-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="m-form-label">End</label>
            <input className="m-form-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {editing && (
          <div>
            <label className="m-form-label">Status</label>
            <div className="m-form-pill-row">
              <button type="button" className="m-form-pill" data-active={!completed} onClick={() => setCompleted(false)}>In progress</button>
              <button type="button" className="m-form-pill" data-active={completed}  onClick={() => setCompleted(true)}>Completed</button>
            </div>
          </div>
        )}
        {gos && (
          <div>
            <label className="m-form-label">Linked items</label>
            <button
              type="button"
              className="m-attach-btn"
              onClick={() => setGoPickerOpen(true)}
              disabled={!targetGoalId}
              style={!targetGoalId ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              <Plus size={14} /> Go
              {attachGoIds.size > 0 && <span className="m-attach-badge">{attachGoIds.size}</span>}
            </button>
            {selectedGos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {selectedGos.map((g) => (
                  <span key={g.id} className="m-attach-chip">
                    Go · {g.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachGoIds((p) => { const n = new Set(p); n.delete(g.id); return n; })}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {gos && (
        <MobilePickerSheet
          open={goPickerOpen}
          onOpenChange={setGoPickerOpen}
          title="Pick a go"
          entity="Go"
          items={attachable}
          initialSelected={attachGoIds}
          onConfirm={(s) => setAttachGoIds(s)}
          matches={(g, q) => g.title.toLowerCase().includes(q)}
          render={(g) => (
            <>
              <div style={{ fontWeight: 500 }}>{g.title}</div>
              {g.kind === 'numeric' && g.target_value != null && (
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                  target {g.target_value}{g.unit ? ` ${g.unit}` : ''}
                </div>
              )}
            </>
          )}
        />
      )}
    </MobileBottomSheet>
  );
}

// ── Go ──────────────────────────────────────────────────────────────────────

interface GoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gos: GosLibrary;
  goals: Task[];
  /** Pre-selected goal/sprint context. */
  initialTaskId?: string | null;
  initialSprintId?: string | null;
  editing?: Go | null;
}

export function GoForm({ open, onOpenChange, gos, goals, initialTaskId, initialSprintId, editing }: GoFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskId, setTaskId] = useState<string>('');
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setTaskId(editing.task_id || '');
      setKind(editing.kind);
      setTarget(editing.target_value != null ? String(editing.target_value) : '');
      setUnit(editing.unit || '');
      setDue(editing.due_date || '');
    } else {
      setTitle(''); setDescription('');
      setTaskId(initialTaskId ?? '');
      setKind('boolean'); setTarget(''); setUnit(''); setDue('');
    }
    setBusy(false);
  }, [open, initialTaskId, editing?.id]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    if (editing) {
      await gos.updateGo(editing.id, {
        title: t,
        description: description.trim(),
        task_id: taskId || null,
        kind,
        unit: kind === 'numeric' ? (unit.trim() || '') : '',
        target_value: kind === 'numeric' && target ? Number(target) : null,
        due_date: due || null,
      });
    } else {
      await gos.createGo({
        title: t,
        description: description.trim() || undefined,
        task_id: taskId || null,
        sprint_id: initialSprintId ?? null,
        kind,
        unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
        target_value: kind === 'numeric' && target ? Number(target) : undefined,
        due_date: due || undefined,
      });
    }
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Edit go' : 'New go'}
      description={editing ? undefined : 'A small unit of work — track once or with a numeric target.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Title</label>
          <input autoFocus={!editing} className="m-form-input" placeholder="Go title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Description</label>
          <textarea className="m-form-textarea" placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Goal (optional)</label>
          <select className="m-form-input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">— standalone —</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
        <div>
          <label className="m-form-label">Tracking</label>
          <div className="m-form-pill-row">
            <button type="button" className="m-form-pill" data-active={kind === 'boolean'} onClick={() => setKind('boolean')}>Done / not</button>
            <button type="button" className="m-form-pill" data-active={kind === 'numeric'} onClick={() => setKind('numeric')}>Numeric</button>
          </div>
        </div>
        {kind === 'numeric' && (
          <div className="m-form-row">
            <div>
              <label className="m-form-label">Target</label>
              <input className="m-form-input" type="number" placeholder="30" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="m-form-label">Unit</label>
              <input className="m-form-input" placeholder="km, min, pages" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
        )}
        <div>
          <label className="m-form-label">Due date (optional)</label>
          <input className="m-form-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </form>
    </MobileBottomSheet>
  );
}

// ── Routine (standalone, with optional goal link) ──────────────────────────

type RoutineSchedule = 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';
const SCHEDULES: { v: RoutineSchedule; l: string }[] = [
  { v: 'daily',          l: 'Daily'    },
  { v: 'weekly_on_days', l: 'On days'  },
  { v: 'every_n_days',   l: 'Every Nd' },
  { v: 'times_per_week', l: '×/week'   },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RoutineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: RoutinesLibrary;
  /** When set, the routine is created and linked to this goal. */
  goalId?: string | null;
  /** Used to refresh goals after creating a link. */
  goalsLibrary?: GoalsLibrary;
  editing?: Routine | null;
}

export function RoutineForm({ open, onOpenChange, library, goalId, goalsLibrary, editing }: RoutineFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<RoutineSchedule>('daily');
  const [days, setDays] = useState<Set<number>>(new Set([1, 3, 5]));
  const [nDays, setNDays] = useState(2);
  const [timesPerWeek, setTimesPerWeek] = useState(3);
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setSchedule(editing.schedule_type as RoutineSchedule);
      const ds = (editing.schedule_days || '').split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
      setDays(new Set(ds.length ? ds : [1, 3, 5]));
      setNDays(editing.schedule_n_days || 2);
      setTimesPerWeek(editing.schedule_count_per_period || 3);
      setKind(editing.kind);
      setTarget(editing.target_value != null ? String(editing.target_value) : '');
      setUnit(editing.unit || '');
      setPaused(editing.is_paused);
    } else {
      setTitle(''); setDescription(''); setSchedule('daily');
      setDays(new Set([1, 3, 5])); setNDays(2); setTimesPerWeek(3);
      setKind('boolean'); setTarget(''); setUnit('');
      setPaused(false);
    }
    setBusy(false);
  }, [open, editing?.id]);

  const toggleDay = (d: number) => setDays((p) => {
    const n = new Set(p); if (n.has(d)) n.delete(d); else n.add(d); return n;
  });

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      const payload = {
        title: t,
        description: description.trim() || '',
        schedule_type: schedule as RoutineScheduleType,
        schedule_days: schedule === 'weekly_on_days' ? Array.from(days).sort().join(',') : '',
        schedule_n_days: schedule === 'every_n_days' ? nDays : 1,
        schedule_count_per_period: schedule === 'times_per_week' ? timesPerWeek : 1,
        schedule_period: schedule === 'times_per_week' ? 'week' : 'week',
        kind,
        target_value: kind === 'numeric' && target ? Number(target) : null,
        unit: kind === 'numeric' ? (unit.trim() || '') : '',
        is_paused: paused,
      } as const;

      if (editing) {
        await library.update(editing.id, payload as any);
      } else {
        const r = await library.create({
          title: t,
          description: description.trim() || undefined,
          schedule_type: schedule,
          schedule_days: schedule === 'weekly_on_days' ? Array.from(days).sort().join(',') : undefined,
          schedule_n_days: schedule === 'every_n_days' ? nDays : undefined,
          schedule_count_per_period: schedule === 'times_per_week' ? timesPerWeek : undefined,
          schedule_period: schedule === 'times_per_week' ? 'week' : undefined,
          kind,
          target_value: kind === 'numeric' && target ? Number(target) : null,
          unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
        });
        if (r && goalId) {
          await routinesApi.createLink({ goal_id: goalId, routine_id: r.id, start_date: ymd(new Date()) });
          if (goalsLibrary) await goalsLibrary.refresh();
        }
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save routine');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Edit routine' : 'New routine'}
      description={editing ? undefined : 'Recurring habit with a schedule and optional target.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Title</label>
          <input autoFocus={!editing} className="m-form-input" placeholder="e.g. Morning meditation" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Description</label>
          <textarea className="m-form-textarea" placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Schedule</label>
          <div className="m-form-pill-row">
            {SCHEDULES.map((s) => (
              <button key={s.v} type="button" className="m-form-pill" data-active={schedule === s.v} onClick={() => setSchedule(s.v)}>{s.l}</button>
            ))}
          </div>
        </div>
        {schedule === 'weekly_on_days' && (
          <div>
            <label className="m-form-label">Days</label>
            <div className="m-form-pill-row">
              {DAYS.map((d, i) => (
                <button key={d} type="button" className="m-form-pill" data-active={days.has(i)} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
        )}
        {schedule === 'every_n_days' && (
          <div>
            <label className="m-form-label">Every N days</label>
            <input className="m-form-input" type="number" min={1} max={30} value={nDays} onChange={(e) => setNDays(Math.max(1, Math.min(30, +e.target.value || 1)))} />
          </div>
        )}
        {schedule === 'times_per_week' && (
          <div>
            <label className="m-form-label">Times per week</label>
            <input className="m-form-input" type="number" min={1} max={7} value={timesPerWeek} onChange={(e) => setTimesPerWeek(Math.max(1, Math.min(7, +e.target.value || 1)))} />
          </div>
        )}
        <div>
          <label className="m-form-label">Tracking</label>
          <div className="m-form-pill-row">
            <button type="button" className="m-form-pill" data-active={kind === 'boolean'} onClick={() => setKind('boolean')}>Done / not</button>
            <button type="button" className="m-form-pill" data-active={kind === 'numeric'} onClick={() => setKind('numeric')}>Numeric</button>
          </div>
        </div>
        {kind === 'numeric' && (
          <div className="m-form-row">
            <div>
              <label className="m-form-label">Target</label>
              <input className="m-form-input" type="number" placeholder="30" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="m-form-label">Unit</label>
              <input className="m-form-input" placeholder="km, min, pages" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
        )}
        {editing && (
          <div>
            <label className="m-form-label">Status</label>
            <div className="m-form-pill-row">
              <button type="button" className="m-form-pill" data-active={!paused} onClick={() => setPaused(false)}>Active</button>
              <button type="button" className="m-form-pill" data-active={paused}  onClick={() => setPaused(true)}>Paused</button>
            </div>
          </div>
        )}
      </form>
    </MobileBottomSheet>
  );
}

// ── Sprint ──────────────────────────────────────────────────────────────────

interface SprintFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: SprintsLibrary;
  /** Optional libraries — when supplied, the form lets the user attach
   *  existing goals / steps / gos / routines to this sprint. */
  goalsLib?: GoalsLibrary;
  gosLib?: GosLibrary;
  stepsLib?: ReturnType<typeof useSteps>;
  routinesLib?: RoutinesLibrary;
  editing?: Sprint | null;
}

export function SprintForm({
  open, onOpenChange, library, goalsLib, gosLib, stepsLib, routinesLib, editing,
}: SprintFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState<string>(COLORS[0].value);
  const [attachGoals, setAttachGoals] = useState<Set<string>>(new Set());
  const [attachSteps, setAttachSteps] = useState<Set<string>>(new Set());
  const [attachGos, setAttachGos] = useState<Set<string>>(new Set());
  const [attachRoutines, setAttachRoutines] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<'goal' | 'step' | 'go' | 'routine' | null>(null);
  const [busy, setBusy] = useState(false);

  // Existing item ids in this sprint (for excluding from the attach list).
  const existingIds = (() => {
    const out = { goal: new Set<string>(), step: new Set<string>(), go: new Set<string>(), routine: new Set<string>() };
    if (editing) {
      for (const it of editing.items) {
        if (it.item_type === 'goal'    && it.goal_id)    out.goal.add(it.goal_id);
        if (it.item_type === 'step'    && it.step_id)    out.step.add(it.step_id);
        if (it.item_type === 'go'      && it.go_id)      out.go.add(it.go_id);
        if (it.item_type === 'routine' && it.routine_id) out.routine.add(it.routine_id);
      }
    }
    return out;
  })();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || '');
      setStart(editing.start_date);
      setEnd(editing.end_date);
      setColor(editing.color || COLORS[0].value);
    } else {
      const today = new Date();
      const e = new Date(today); e.setDate(e.getDate() + 30);
      setTitle(''); setDescription('');
      setStart(ymd(today)); setEnd(ymd(e));
      setColor(COLORS[0].value);
    }
    setAttachGoals(new Set());
    setAttachSteps(new Set());
    setAttachGos(new Set());
    setAttachRoutines(new Set());
    setBusy(false);
  }, [open, editing?.id]);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    let sprintId: string | null = null;
    if (editing) {
      await library.update(editing.id, {
        title: t,
        description: description.trim(),
        start_date: start, end_date: end,
        color,
      } as any);
      sprintId = editing.id;
    } else {
      const created = await library.create({
        title: t,
        description: description.trim() || undefined,
        start_date: start, end_date: end,
        color,
      });
      if (created) sprintId = created.id;
    }
    if (sprintId) {
      const tasks: Promise<unknown>[] = [];
      for (const id of attachGoals)   tasks.push(library.addItem(sprintId, { item_type: 'goal',    goal_id:    id }));
      for (const id of attachSteps)   tasks.push(library.addItem(sprintId, { item_type: 'step',    step_id:    id }));
      for (const id of attachGos)     tasks.push(library.addItem(sprintId, { item_type: 'go',      go_id:      id }));
      for (const id of attachRoutines)tasks.push(library.addItem(sprintId, { item_type: 'routine', routine_id: id }));
      if (tasks.length) await Promise.all(tasks);
    }
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <MobileBottomSheet
      open={open} onOpenChange={onOpenChange}
      title={editing ? 'Edit sprint' : 'New sprint'}
      description={editing ? undefined : 'Time-bound period that pulls together goals, steps, gos, routines.'}
      footer={<>
        <button type="button" className="m-bs-btn m-bs-btn-ghost" onClick={() => onOpenChange(false)}>Cancel</button>
        <button type="button" className="m-bs-btn m-bs-btn-primary" disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Saving…' : (editing ? 'Save' : 'Create')}
        </button>
      </>}
    >
      <form className="m-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <label className="m-form-label">Title</label>
          <input autoFocus={!editing} className="m-form-input" placeholder="e.g. Q2 · The Aerobic Sprint" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="m-form-label">Description</label>
          <textarea className="m-form-textarea" placeholder="What's the focus?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="m-form-row">
          <div>
            <label className="m-form-label">Start</label>
            <input className="m-form-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="m-form-label">End</label>
            <input className="m-form-input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="m-form-label">Color</label>
          <div className="m-form-color-grid">
            {COLORS.map((c) => {
              const on = color === c.value;
              return (
                <button key={c.value} type="button" className="m-form-color-swatch" onClick={() => setColor(c.value)} aria-label={c.name} title={c.name}
                  style={{ background: c.value, boxShadow: on ? `0 0 0 2px var(--paper), 0 0 0 4px ${c.value}` : '0 0 0 1px var(--hairline)' }}
                />
              );
            })}
          </div>
        </div>

        {(goalsLib || stepsLib || gosLib || routinesLib) && (
          <div>
            <label className="m-form-label">Linked items</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {goalsLib && (
                  <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('goal')}>
                    <Plus size={14} /> Goal
                    {attachGoals.size > 0 && <span className="m-attach-badge">{attachGoals.size}</span>}
                  </button>
                )}
                {stepsLib && (
                  <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('step')}>
                    <Plus size={14} /> Step
                    {attachSteps.size > 0 && <span className="m-attach-badge">{attachSteps.size}</span>}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {gosLib && (
                  <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('go')}>
                    <Plus size={14} /> Go
                    {attachGos.size > 0 && <span className="m-attach-badge">{attachGos.size}</span>}
                  </button>
                )}
                {routinesLib && (
                  <button type="button" className="m-attach-btn" onClick={() => setOpenPicker('routine')}>
                    <Plus size={14} /> Routine
                    {attachRoutines.size > 0 && <span className="m-attach-badge">{attachRoutines.size}</span>}
                  </button>
                )}
              </div>
            </div>
            {(attachGoals.size + attachSteps.size + attachGos.size + attachRoutines.size > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {goalsLib && goalsLib.tasks.filter((g) => attachGoals.has(g.id)).map((g) => (
                  <span key={g.id} className="m-attach-chip">
                    Goal · {g.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachGoals((p) => { const n = new Set(p); n.delete(g.id); return n; })}><X size={12} /></button>
                  </span>
                ))}
                {stepsLib && stepsLib.allSteps.filter((s) => attachSteps.has(s.id)).map((s) => (
                  <span key={s.id} className="m-attach-chip">
                    Step · {s.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachSteps((p) => { const n = new Set(p); n.delete(s.id); return n; })}><X size={12} /></button>
                  </span>
                ))}
                {gosLib && gosLib.gos.filter((g) => attachGos.has(g.id)).map((g) => (
                  <span key={g.id} className="m-attach-chip">
                    Go · {g.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachGos((p) => { const n = new Set(p); n.delete(g.id); return n; })}><X size={12} /></button>
                  </span>
                ))}
                {routinesLib && routinesLib.routines.filter((r) => attachRoutines.has(r.id)).map((r) => (
                  <span key={r.id} className="m-attach-chip">
                    Routine · {r.title}
                    <button type="button" className="m-attach-chip-x" onClick={() => setAttachRoutines((p) => { const n = new Set(p); n.delete(r.id); return n; })}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </form>

      {goalsLib && (
        <MobilePickerSheet
          open={openPicker === 'goal'}
          onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
          title="Pick a goal"
          entity="Goal"
          items={goalsLib.tasks.filter((t) => !existingIds.goal.has(t.id))}
          initialSelected={attachGoals}
          onConfirm={(s) => setAttachGoals(s)}
          matches={(g, q) => g.title.toLowerCase().includes(q)}
          render={(g) => g.title}
        />
      )}
      {stepsLib && (
        <MobilePickerSheet
          open={openPicker === 'step'}
          onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
          title="Pick a step"
          entity="Step"
          items={stepsLib.allSteps.filter((s) => !existingIds.step.has(s.id))}
          initialSelected={attachSteps}
          onConfirm={(s) => setAttachSteps(s)}
          matches={(s, q) => s.title.toLowerCase().includes(q) || (s.goal?.title?.toLowerCase().includes(q) ?? false)}
          render={(s) => (
            <>
              <div style={{ fontWeight: 500 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>from {s.goal.title}</div>
            </>
          )}
        />
      )}
      {gosLib && (
        <MobilePickerSheet
          open={openPicker === 'go'}
          onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
          title="Pick a go"
          entity="Go"
          items={gosLib.gos.filter((g) => !existingIds.go.has(g.id))}
          initialSelected={attachGos}
          onConfirm={(s) => setAttachGos(s)}
          matches={(g, q) => g.title.toLowerCase().includes(q)}
          render={(g) => g.title}
        />
      )}
      {routinesLib && (
        <MobilePickerSheet
          open={openPicker === 'routine'}
          onOpenChange={(o) => { if (!o) setOpenPicker(null); }}
          title="Pick a routine"
          entity="Routine"
          items={routinesLib.routines.filter((r) => !existingIds.routine.has(r.id))}
          initialSelected={attachRoutines}
          onConfirm={(s) => setAttachRoutines(s)}
          matches={(r, q) => r.title.toLowerCase().includes(q)}
          render={(r) => r.title}
        />
      )}
    </MobileBottomSheet>
  );
}
