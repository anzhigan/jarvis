import { useEffect, useMemo, useState } from 'react';
import { Trash2, Pause, Play, Calendar, Repeat, Target, Activity, Check, X } from 'lucide-react';
import { Button, Drawer, Input } from '../../../components/ui';
import type { Routine, RoutineScheduleType } from '../../../api/types';
import type { RoutinesLibrary } from '../hooks/useRoutines';
import { completionRate, currentStreak, scheduleLabel } from '../lib/heatmap';
import { todayState } from '../hooks/useRoutinesToday';

interface Props {
  routine: Routine | null;
  library: RoutinesLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEDULES: { value: RoutineScheduleType; label: string }[] = [
  { value: 'daily',          label: 'Daily'        },
  { value: 'weekly_on_days', label: 'On days'      },
  { value: 'every_n_days',   label: 'Every N days' },
  { value: 'times_per_week', label: 'Times / week' },
];

const STATE_LABEL: Record<'done' | 'skipped' | 'pending' | 'unscheduled', string> = {
  done: 'Done today',
  skipped: 'Skipped today',
  pending: 'Pending today',
  unscheduled: 'Off-day',
};

export function RoutineDetailPanel({ routine, library, open, onOpenChange }: Props) {
  const [title, setTitle] = useState(routine?.title ?? '');
  const [description, setDescription] = useState(routine?.description ?? '');
  useEffect(() => {
    setTitle(routine?.title ?? '');
    setDescription(routine?.description ?? '');
  }, [routine?.id]);

  if (!routine) return null;

  const flushTitle = async () => {
    const t = title.trim();
    if (t && t !== routine.title) await library.update(routine.id, { title: t });
  };
  const flushDescription = async () => {
    if (description !== routine.description) await library.update(routine.id, { description });
  };
  const onSchedule    = (s: RoutineScheduleType) => library.update(routine.id, { schedule_type: s });
  const onTogglePause = () => library.togglePause(routine.id, routine.is_paused);
  const onDelete = async () => {
    if (!window.confirm(`Delete "${routine.title}"? Entries are kept until you delete them manually.`)) return;
    await library.remove(routine.id);
    onOpenChange(false);
  };

  const streak = currentStreak(routine);
  const rate30 = completionRate(routine, 30);
  const state = todayState(routine);

  // All tracked days (newest first) — for the "All entries" expandable list.
  const sortedEntries = useMemo(
    () => [...routine.entries].sort((a, b) => b.date.localeCompare(a.date)),
    [routine.entries],
  );
  const [allOpen, setAllOpen] = useState(false);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      accent="routines"
      title={
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flushTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          aria-label="Routine title"
        />
      }
      description={scheduleLabel(routine)}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={13} /> Delete
          </Button>
          <span style={{ flex: 1 }} />
          <Button onClick={onTogglePause}>
            {routine.is_paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
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
          placeholder="What does this routine cover?"
        />
      </div>

      <div className="ui-field">
        <span className="ui-field-label">Schedule</span>
        <div className="pill-seg" role="radiogroup">
          {SCHEDULES.map((s) => (
            <button
              key={s.value}
              className={routine.schedule_type === s.value ? 'on' : ''}
              role="radio"
              aria-checked={routine.schedule_type === s.value}
              onClick={() => onSchedule(s.value)}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <div className="ui-field-row">
        <span className="label"><Activity size={11} /> Today</span>
        <span className="value">{STATE_LABEL[state]}</span>
      </div>
      <div className="ui-field-row">
        <span className="label"><Repeat size={11} /> Streak</span>
        <span className="value" style={{ color: streak > 0 ? 'var(--moss)' : undefined }}>
          {streak} {streak === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div className="ui-field-row">
        <span className="label"><Target size={11} /> 30 d</span>
        <span className="value">{rate30}%</span>
      </div>
      <div className="ui-field-row">
        <span className="label"><Calendar size={11} /> Started</span>
        <span className="value">
          {routine.start_date
            ? new Date(routine.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : new Date(routine.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {routine.kind === 'numeric' && (
        <div className="ui-field-row">
          <span className="label">Target</span>
          <span className="value">
            {routine.target_value ?? '—'}{routine.unit ? ` ${routine.unit}` : ''}
          </span>
        </div>
      )}

      <div className="rt-entries">
        <button
          type="button"
          className="rt-entries__head"
          onClick={() => setAllOpen((v) => !v)}
          aria-expanded={allOpen}
        >
          <span>All entries · {sortedEntries.length}</span>
          <span className="rt-entries__chev">{allOpen ? '▾' : '▸'}</span>
        </button>
        {allOpen && (
          sortedEntries.length === 0 ? (
            <p className="rt-entries__empty">No days tracked yet.</p>
          ) : (
            <ul className="rt-entries__list">
              {sortedEntries.map((e) => {
                const isDone = e.value > 0
                  && (routine.kind !== 'numeric' || !routine.target_value || e.value >= routine.target_value);
                const isSkipped = e.value === 0;
                return (
                  <li className="rt-entries__row" key={e.date} data-tone={isDone ? 'done' : isSkipped ? 'skipped' : 'partial'}>
                    <span className="rt-entries__date">{e.date}</span>
                    <span className="rt-entries__val">
                      {routine.kind === 'numeric'
                        ? `${e.value}${routine.unit ? ' ' + routine.unit : ''}`
                        : isDone ? <><Check size={12} /> done</> : <><X size={12} /> skipped</>}
                    </span>
                    <button
                      type="button"
                      className="rt-entries__clear"
                      title="Remove this entry"
                      aria-label="Clear"
                      onClick={() => library.clearOn(routine.id, e.date)}
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </Drawer>
  );
}
