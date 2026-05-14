import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Input } from '../../../components/ui';
import { gosApi, routinesApi, stepsApi } from '../../../api/client';
import type { Go, GoKind, GoRecurrence, Step, StepStatus, Task } from '../../../api/types';
import type { GoalsLibrary } from '../hooks/useGoals';
import type { GosLibrary } from '../hooks/useGos';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── Go ───────────────────────────────────────────────────────────────────────

interface GoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected parent task. null = let user pick a goal inside the dialog
   *  (standalone-able). When taskId is null, supply `goals` so the picker has
   *  something to render. */
  taskId: string | null;
  gos: GosLibrary;
  /** All goals (for the picker in standalone mode). */
  goals?: Task[];
  /** Pre-selected Step within the goal (only meaningful with taskId). */
  initialStepId?: string | null;
}

export function GoCreateDialog({
  open,
  onOpenChange,
  taskId,
  gos,
  goals,
  initialStepId,
}: GoDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  /** Effective parent goal id: starts as taskId, user can change in standalone mode. */
  const [pickedGoalId, setPickedGoalId] = useState<string | null>(taskId);
  const [pickedStepId, setPickedStepId] = useState<string | null>(initialStepId ?? null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setKind('boolean');
      setTarget(''); setUnit(''); setStart(''); setDue('');
      setPickedGoalId(taskId);
      setPickedStepId(initialStepId ?? null);
    }
  }, [open, taskId, initialStepId]);

  // Reset step selection when the parent goal changes.
  useEffect(() => { setPickedStepId(null); }, [pickedGoalId]);

  const allowPickGoal = taskId === null && (goals?.length ?? 0) > 0;
  const pickedGoal = useMemo(
    () => goals?.find((g) => g.id === pickedGoalId) ?? null,
    [goals, pickedGoalId],
  );
  const stepsForGoal = useMemo<Step[]>(
    () => [...(pickedGoal?.steps ?? [])].sort((a, b) => a.position - b.position),
    [pickedGoal],
  );

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await gos.createGo({
        task_id: pickedGoalId || undefined,
        step_id: pickedStepId || undefined,
        title: t,
        description: description.trim() || undefined,
        kind,
        unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
        target_value: kind === 'numeric' && target ? Number(target) : undefined,
        start_date: start || undefined,
        due_date: due || undefined,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create go');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New go"
      description="A unit of work — single day or a period."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? 'Creating…' : 'Create go'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Go title (e.g. Read the spec)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="Notes (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Standalone mode: pick parent goal (and optionally a step). */}
        {allowPickGoal && (
          <div className="ui-form-row">
            <div className="ui-field">
              <span className="ui-field-label">Goal (optional)</span>
              <select
                className="ui-input"
                value={pickedGoalId ?? ''}
                onChange={(e) => setPickedGoalId(e.target.value || null)}
              >
                <option value="">Standalone (no goal)</option>
                {(goals ?? [])
                  .filter((g) => g.status !== 'done')
                  .sort((a, b) => a.order - b.order)
                  .map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
              </select>
            </div>
            <div className="ui-field">
              <span className="ui-field-label">Step (optional)</span>
              <select
                className="ui-input"
                value={pickedStepId ?? ''}
                onChange={(e) => setPickedStepId(e.target.value || null)}
                disabled={!pickedGoalId || stepsForGoal.length === 0}
              >
                <option value="">
                  {!pickedGoalId
                    ? 'pick a goal first'
                    : stepsForGoal.length === 0
                      ? 'no steps yet'
                      : 'no step'}
                </option>
                {stepsForGoal.map((s) => (
                  <option key={s.id} value={s.id}>
                    {String(s.position + 1).padStart(2, '0')} · {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="ui-field">
          <span className="ui-field-label">Tracking</span>
          <div className="pill-seg" role="radiogroup">
            <button
              className={kind === 'boolean' ? 'on' : ''}
              role="radio"
              aria-checked={kind === 'boolean'}
              onClick={() => setKind('boolean')}
            >Done / not</button>
            <button
              className={kind === 'numeric' ? 'on' : ''}
              role="radio"
              aria-checked={kind === 'numeric'}
              onClick={() => setKind('numeric')}
            >Numeric</button>
          </div>
        </div>

        {kind === 'numeric' && (
          <div className="ui-form-row">
            <div className="ui-field">
              <span className="ui-field-label">Target</span>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="ui-field">
              <span className="ui-field-label">Unit</span>
              <Input
                placeholder="e.g. min, km, pages"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Period: leave both blank for an undated Go, set just `due` for a
            single-day deadline, or set both to make it span a period. */}
        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start (optional)</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">Due (optional)</span>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Routine (creates routine + GoalRoutineLink) ──────────────────────────────

type RoutineSchedule = 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RoutineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  goals: GoalsLibrary;
}

export function RoutineCreateForGoalDialog({ open, onOpenChange, taskId, goals }: RoutineDialogProps) {
  const today = ymd(new Date());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<RoutineSchedule>('daily');
  const [days, setDays] = useState<Set<number>>(new Set([1, 3, 5]));
  const [nDays, setNDays] = useState(2);
  const [timesPerPeriod, setTimesPerPeriod] = useState(3);
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription('');
      setSchedule('daily'); setDays(new Set([1, 3, 5]));
      setNDays(2); setTimesPerPeriod(3);
      setKind('boolean'); setTarget(''); setUnit('');
      setStart(ymd(new Date())); setEnd('');
    }
  }, [open]);

  const toggleDay = (d: number) => setDays((p) => {
    const n = new Set(p);
    if (n.has(d)) n.delete(d); else n.add(d);
    return n;
  });

  const submit = async () => {
    const t = title.trim();
    if (!t || !taskId) return;
    setSubmitting(true);
    try {
      const routine = await routinesApi.create({
        title: t,
        description: description.trim() || undefined,
        schedule_type: schedule,
        schedule_days: schedule === 'weekly_on_days' ? Array.from(days).sort().join(',') : undefined,
        schedule_n_days: schedule === 'every_n_days' ? nDays : undefined,
        schedule_count_per_period: schedule === 'times_per_week' ? timesPerPeriod : undefined,
        schedule_period: schedule === 'times_per_week' ? 'week' : undefined,
        kind,
        unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
        target_value: kind === 'numeric' && target ? Number(target) : null,
      });
      await routinesApi.createLink({
        goal_id: taskId,
        routine_id: routine.id,
        start_date: start,
        end_date: end || null,
      });
      await goals.refresh();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create routine');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New routine"
      description="Recurring habit attached to this goal for a chosen period."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? 'Creating…' : 'Create routine'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Routine title (e.g. Morning meditation)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="Why this routine?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="ui-field">
          <span className="ui-field-label">Schedule</span>
          <div className="pill-seg" role="radiogroup">
            {([
              { v: 'daily',          l: 'Daily'        },
              { v: 'weekly_on_days', l: 'On days'      },
              { v: 'every_n_days',   l: 'Every N days' },
              { v: 'times_per_week', l: 'X / week'     },
            ] as { v: RoutineSchedule; l: string }[]).map((s) => (
              <button
                key={s.v}
                className={schedule === s.v ? 'on' : ''}
                role="radio"
                aria-checked={schedule === s.v}
                onClick={() => setSchedule(s.v)}
              >{s.l}</button>
            ))}
          </div>
        </div>

        {schedule === 'weekly_on_days' && (
          <div className="ui-field">
            <span className="ui-field-label">Days</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {DAY_LABELS.map((label, i) => {
                const on = days.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className="ui-chip"
                    data-active={on || undefined}
                    style={{ minWidth: 44, justifyContent: 'center' }}
                  >{label}</button>
                );
              })}
            </div>
          </div>
        )}

        {schedule === 'every_n_days' && (
          <div className="ui-field">
            <span className="ui-field-label">Every N days</span>
            <Input
              type="number"
              min={1}
              max={30}
              value={String(nDays)}
              onChange={(e) => setNDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
            />
          </div>
        )}

        {schedule === 'times_per_week' && (
          <div className="ui-field">
            <span className="ui-field-label">Times per week</span>
            <Input
              type="number"
              min={1}
              max={7}
              value={String(timesPerPeriod)}
              onChange={(e) => setTimesPerPeriod(Math.max(1, Math.min(7, Number(e.target.value) || 1)))}
            />
          </div>
        )}

        <div className="ui-field">
          <span className="ui-field-label">Tracking</span>
          <div className="pill-seg" role="radiogroup">
            <button
              className={kind === 'boolean' ? 'on' : ''}
              role="radio"
              aria-checked={kind === 'boolean'}
              onClick={() => setKind('boolean')}
            >Done / not</button>
            <button
              className={kind === 'numeric' ? 'on' : ''}
              role="radio"
              aria-checked={kind === 'numeric'}
              onClick={() => setKind('numeric')}
            >Numeric</button>
          </div>
        </div>

        {kind === 'numeric' && (
          <div className="ui-form-row">
            <div className="ui-field">
              <span className="ui-field-label">Target</span>
              <Input
                type="number"
                placeholder="e.g. 30"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="ui-field">
              <span className="ui-field-label">Unit</span>
              <Input
                placeholder="e.g. min, km, pages"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">End (optional)</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Step (milestone phase inside a Goal) ─────────────────────────────────────

const STEP_STATUSES: { key: StepStatus; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done',        label: 'Done'        },
];

interface StepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Goal this Step belongs to. */
  taskId: string | null;
  /** Called after the step (and optional first Go) is successfully created. */
  onCreated: () => Promise<void> | void;
}

export function StepCreateDialog({ open, onOpenChange, taskId, onCreated }: StepDialogProps) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus]           = useState<StepStatus>('not_started');
  const [start, setStart]             = useState('');
  const [end, setEnd]                 = useState('');
  /** Optional starter Go — created in the same flow with step_id pre-filled. */
  const [firstGoTitle, setFirstGoTitle] = useState('');
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setStatus('not_started');
      setStart(''); setEnd(''); setFirstGoTitle('');
    }
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t || !taskId) return;
    setSubmitting(true);
    try {
      const step = await stepsApi.create(taskId, {
        title: t,
        description: description.trim() || undefined,
        status,
        start_date: start || undefined,
        end_date: end || undefined,
      });
      const goTitle = firstGoTitle.trim();
      if (goTitle) {
        await gosApi.create({
          task_id: taskId,
          step_id: step.id,
          title: goTitle,
          kind: 'boolean',
        });
      }
      await onCreated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create step');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New step"
      description="A milestone phase inside this goal. Steps contain Gos."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
            {submitting ? 'Creating…' : 'Create step'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Step title (e.g. Build backend)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="Notes (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="ui-field">
          <span className="ui-field-label">Status</span>
          <div className="pill-seg" role="radiogroup">
            {STEP_STATUSES.map((s) => (
              <button
                key={s.key}
                className={status === s.key ? 'on' : ''}
                role="radio"
                aria-checked={status === s.key}
                onClick={() => setStatus(s.key)}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start (optional)</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">End (optional)</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">First go (optional)</span>
          <Input
            placeholder="Inline boolean go to seed this step"
            value={firstGoTitle}
            onChange={(e) => setFirstGoTitle(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

// ── Step edit dialog (with delete) ──────────────────────────────────────────

interface StepEditProps {
  step: Step | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

export function StepEditDialog({ step, onOpenChange, onSaved }: StepEditProps) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus]           = useState<StepStatus>('not_started');
  const [start, setStart]             = useState('');
  const [end, setEnd]                 = useState('');
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (step) {
      setTitle(step.title);
      setDescription(step.description ?? '');
      setStatus(step.status);
      setStart(step.start_date ?? '');
      setEnd(step.end_date ?? '');
    }
  }, [step]);

  const save = async () => {
    if (!step) return;
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await stepsApi.update(step.id, {
        title: t,
        description: description.trim(),
        status,
        start_date: start || null,
        end_date: end || null,
      });
      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save step');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!step) return;
    if (!window.confirm(`Delete step "${step.title}"? Its Gos lose their step link but stay.`)) return;
    setSubmitting(true);
    try {
      await stepsApi.delete(step.id);
      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete step');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={step !== null}
      onOpenChange={onOpenChange}
      title="Edit step"
      description="Update title, status, dates — or delete the step."
      footer={
        <>
          <Button variant="ghost" data-tone="danger" onClick={remove} disabled={submitting}>Delete</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={submitting || !title.trim()}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Step title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) save(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="Notes (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="ui-field">
          <span className="ui-field-label">Status</span>
          <div className="pill-seg" role="radiogroup">
            {STEP_STATUSES.map((s) => (
              <button
                key={s.key}
                className={status === s.key ? 'on' : ''}
                role="radio"
                aria-checked={status === s.key}
                onClick={() => setStatus(s.key)}
              >{s.label}</button>
            ))}
          </div>
        </div>
        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start (optional)</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">End (optional)</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Go edit dialog (with delete) ────────────────────────────────────────────

interface GoEditProps {
  go: Go | null;
  goals: Task[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

export function GoEditDialog({ go, goals, onOpenChange, onSaved }: GoEditProps) {
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind]               = useState<GoKind>('boolean');
  const [target, setTarget]           = useState('');
  const [unit, setUnit]               = useState('');
  const [recurrence, setRecurrence]   = useState<GoRecurrence>('none');
  const [start, setStart]             = useState('');
  const [due, setDue]                 = useState('');
  const [taskId, setTaskId]           = useState<string | null>(null);
  const [stepId, setStepId]           = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  useEffect(() => {
    if (go) {
      setTitle(go.title);
      setDescription(go.description ?? '');
      setKind(go.kind);
      setTarget(go.target_value != null ? String(go.target_value) : '');
      setUnit(go.unit ?? '');
      setRecurrence(go.recurrence);
      setStart(go.start_date ?? '');
      setDue(go.due_date ?? '');
      setTaskId(go.task_id);
      setStepId(go.step_id);
    }
  }, [go]);

  const pickedGoal = useMemo(
    () => goals.find((g) => g.id === taskId) ?? null,
    [goals, taskId],
  );
  const stepsForGoal = useMemo<Step[]>(
    () => [...(pickedGoal?.steps ?? [])].sort((a, b) => a.position - b.position),
    [pickedGoal],
  );

  const save = async () => {
    if (!go) return;
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await gosApi.update(go.id, {
        title: t,
        description: description.trim(),
        kind,
        unit: kind === 'numeric' ? unit.trim() : '',
        target_value: kind === 'numeric' && target ? Number(target) : null,
        recurrence,
        start_date: start || null,
        due_date: due || null,
        task_id: taskId,
        step_id: stepId,
      });
      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save go');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!go) return;
    if (!window.confirm(`Delete "${go.title}"? This cannot be undone.`)) return;
    setSubmitting(true);
    try {
      await gosApi.delete(go.id);
      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to delete go');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={go !== null}
      onOpenChange={onOpenChange}
      title="Edit go"
      description="Update fields — or delete the go."
      footer={
        <>
          <Button variant="ghost" data-tone="danger" onClick={remove} disabled={submitting}>Delete</Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={submitting || !title.trim()}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="ui-form">
        <Input
          autoFocus
          placeholder="Go title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) save(); }}
        />
        <textarea
          className="ui-input"
          data-size="textarea"
          placeholder="Notes (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Goal</span>
            <select
              className="ui-input"
              value={taskId ?? ''}
              onChange={(e) => { setTaskId(e.target.value || null); setStepId(null); }}
            >
              <option value="">Standalone (no goal)</option>
              {goals
                .filter((g) => g.status !== 'done')
                .sort((a, b) => a.order - b.order)
                .map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
            </select>
          </div>
          <div className="ui-field">
            <span className="ui-field-label">Step</span>
            <select
              className="ui-input"
              value={stepId ?? ''}
              onChange={(e) => setStepId(e.target.value || null)}
              disabled={!taskId || stepsForGoal.length === 0}
            >
              <option value="">
                {!taskId
                  ? 'pick a goal first'
                  : stepsForGoal.length === 0
                    ? 'no steps yet'
                    : 'no step'}
              </option>
              {stepsForGoal.map((s) => (
                <option key={s.id} value={s.id}>
                  {String(s.position + 1).padStart(2, '0')} · {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ui-field">
          <span className="ui-field-label">Tracking</span>
          <div className="pill-seg" role="radiogroup">
            <button
              className={kind === 'boolean' ? 'on' : ''}
              role="radio" aria-checked={kind === 'boolean'}
              onClick={() => setKind('boolean')}
            >Done / not</button>
            <button
              className={kind === 'numeric' ? 'on' : ''}
              role="radio" aria-checked={kind === 'numeric'}
              onClick={() => setKind('numeric')}
            >Numeric</button>
          </div>
        </div>

        {kind === 'numeric' && (
          <div className="ui-form-row">
            <div className="ui-field">
              <span className="ui-field-label">Target</span>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="ui-field">
              <span className="ui-field-label">Unit</span>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
        )}

        <div className="ui-field">
          <span className="ui-field-label">Recurrence</span>
          <div className="pill-seg" role="radiogroup">
            {(['none', 'daily', 'weekly'] as GoRecurrence[]).map((r) => (
              <button
                key={r}
                className={recurrence === r ? 'on' : ''}
                role="radio" aria-checked={recurrence === r}
                onClick={() => setRecurrence(r)}
              >{r === 'none' ? 'One-off' : r === 'daily' ? 'Daily' : 'Weekly'}</button>
            ))}
          </div>
        </div>

        <div className="ui-form-row">
          <div className="ui-field">
            <span className="ui-field-label">Start (optional)</span>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="ui-field">
            <span className="ui-field-label">Due (optional)</span>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
