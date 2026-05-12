import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Dialog, Input } from '../../../components/ui';
import { routinesApi } from '../../../api/client';
import type { GoalsLibrary } from '../hooks/useGoals';
import type { GosLibrary } from '../hooks/useGos';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── Go ───────────────────────────────────────────────────────────────────────

interface GoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  gos: GosLibrary;
}

export function GoCreateDialog({ open, onOpenChange, taskId, gos }: GoDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setKind('boolean');
      setTarget(''); setUnit(''); setStart(''); setDue('');
    }
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t || !taskId) return;
    setSubmitting(true);
    await gos.createGo({
      task_id: taskId,
      title: t,
      description: description.trim() || undefined,
      kind,
      unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
      target_value: kind === 'numeric' && target ? Number(target) : undefined,
      start_date: start || undefined,
      due_date: due || undefined,
    });
    setSubmitting(false);
    onOpenChange(false);
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
