import { useEffect, useState } from 'react';
import { Button, Dialog, Input } from '../../../components/ui';
import type { RoutineScheduleType } from '../../../api/types';
import type { RoutinesLibrary } from '../hooks/useRoutines';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: RoutinesLibrary;
}

const SCHEDULES: { value: RoutineScheduleType; label: string }[] = [
  { value: 'daily',          label: 'Daily'        },
  { value: 'weekly_on_days', label: 'On days'      },
  { value: 'every_n_days',   label: 'Every N days' },
  { value: 'times_per_week', label: 'X / week'     },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function RoutineCreateDialog({ open, onOpenChange, library }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<RoutineScheduleType>('daily');
  const [days, setDays] = useState<Set<number>>(new Set([1, 3, 5])); // Mon/Wed/Fri default
  const [nDays, setNDays] = useState(2);
  const [timesPerPeriod, setTimesPerPeriod] = useState(3);
  const [kind, setKind] = useState<'boolean' | 'numeric'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(''); setDescription('');
      setSchedule('daily'); setDays(new Set([1, 3, 5]));
      setNDays(2); setTimesPerPeriod(3);
      setKind('boolean'); setTarget(''); setUnit('');
    }
  }, [open]);

  const toggleDay = (d: number) => {
    setDays((p) => {
      const next = new Set(p);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true);
    const created = await library.create({
      title: t,
      description: description.trim() || undefined,
      schedule_type: schedule,
      schedule_days: schedule === 'weekly_on_days' ? Array.from(days).sort().join(',') : undefined,
      schedule_n_days: schedule === 'every_n_days' ? nDays : undefined,
      schedule_count_per_period: schedule === 'times_per_week' ? timesPerPeriod : undefined,
      schedule_period: schedule === 'times_per_week' ? 'week' : undefined,
      kind,
      target_value: kind === 'numeric' && target ? Number(target) : null,
      unit: kind === 'numeric' ? (unit.trim() || undefined) : undefined,
    });
    setSubmitting(false);
    if (created) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New routine"
      description="Recurring habit with a schedule and optional target."
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
            {SCHEDULES.map((s) => (
              <button
                key={s.value}
                className={schedule === s.value ? 'on' : ''}
                role="radio"
                aria-checked={schedule === s.value}
                onClick={() => setSchedule(s.value)}
              >{s.label}</button>
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
      </div>
    </Dialog>
  );
}
