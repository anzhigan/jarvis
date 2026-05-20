import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Pause, Play, Calendar, Repeat, Target, Activity, Check, X } from 'lucide-react';
import { Button, confirmDialog, Drawer, Input } from '../../../components/ui';
import type { Routine, RoutineScheduleType } from '../../../api/types';
import type { RoutinesLibrary } from '../hooks/useRoutines';
import {
  addDays, cellColor, completionRate, currentStreak, entriesByDate,
  scheduleLabel, startOfDay, ymd,
} from '../lib/heatmap';
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
    const ok = await confirmDialog({
      title: 'Delete routine?',
      body: <>«{routine.title}» Entries are kept until you delete them manually.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
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

  // Scroll the heatmap to "today" (right edge) when the panel opens or the
  // routine changes. Long histories grow rightward, so the user wants to see
  // the present first, not the start months ago.
  const heatmapScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const el = heatmapScrollRef.current;
    if (!el) return;
    // Wait one frame so the grid has laid out before measuring scrollWidth.
    const id = requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; });
    return () => cancelAnimationFrame(id);
  }, [open, routine.id]);

  // Full observation period as a heatmap — columns are weeks, rows are
  // weekdays (Sun-Sat). Spans from the routine's start date to today (or to
  // `end_date` when set). The user asked to see "the squares for the whole
  // observation period" — i.e. not just the last fortnight on the list.
  const heatmap = useMemo(() => {
    const startISO = routine.start_date
      ?? (routine.created_at ? routine.created_at.slice(0, 10) : null);
    if (!startISO) return { weeks: [], months: [], todayKey: ymd(new Date()) };
    const startD = startOfDay(new Date(startISO));
    // Pad left so the grid starts on a Sunday — keeps columns aligned with
    // weekdays so reading "did I work out on Fridays?" is one row scan.
    const dow = startD.getDay();
    const gridStart = addDays(startD, -dow);
    const endD = routine.end_date
      ? startOfDay(new Date(routine.end_date))
      : startOfDay(new Date());
    const totalDays = Math.max(
      0,
      Math.round((endD.getTime() - gridStart.getTime()) / 86_400_000) + 1,
    );
    const weeksCount = Math.max(1, Math.ceil(totalDays / 7));
    const map = entriesByDate(routine.entries ?? []);
    const todayKey = ymd(new Date());

    interface Cell { date: string; value: number; inWindow: boolean; isToday: boolean }
    const weeks: Cell[][] = [];
    // Month labels: one short label per column where that week contains the
    // 1st of a new month. Gives a top axis that doesn't repeat.
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeksCount; w++) {
      const col: Cell[] = [];
      let weekStartMonth = -1;
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        if (d === 0) weekStartMonth = date.getMonth();
        const k = ymd(date);
        const inWindow = date >= startD && date <= endD;
        const e = map.get(k);
        col.push({
          date: k,
          value: e?.value ?? 0,
          inWindow,
          isToday: k === todayKey,
        });
      }
      if (weekStartMonth !== lastMonth) {
        const refDate = addDays(gridStart, w * 7);
        months.push({
          col: w,
          label: refDate.toLocaleDateString(undefined, { month: 'short' }),
        });
        lastMonth = weekStartMonth;
      }
      weeks.push(col);
    }
    return { weeks, months, todayKey };
  }, [routine.start_date, routine.end_date, routine.created_at, routine.entries]);

  // Format the value for the cell tooltip — matches the "All entries" list.
  const tipForCell = (value: number): string => {
    if (value <= 0) return 'no entry';
    if (routine.kind === 'numeric') {
      return `${value}${routine.unit ? ' ' + routine.unit : ''}`;
    }
    return 'done';
  };

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

      {heatmap.weeks.length > 0 && (
        <div className="rt-heatmap">
          <div className="rt-heatmap__head">
            <span>Full history</span>
            <span className="rt-heatmap__sub">
              {sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          {/* Horizontal scroller — long histories grow rightward but never
              push the drawer wider. Reading newest is one scroll-end away. */}
          <div className="rt-heatmap__scroller" ref={heatmapScrollRef}>
            <div
              className="rt-heatmap__grid"
              style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 11px)` }}
            >
              {/* Month axis row — one label per first-of-month week. */}
              <div
                className="rt-heatmap__months"
                style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 11px)` }}
              >
                {heatmap.months.map((m) => (
                  <span
                    key={m.col}
                    className="rt-heatmap__month"
                    style={{ gridColumn: `${m.col + 1} / span 1` }}
                  >{m.label}</span>
                ))}
              </div>
              {heatmap.weeks.map((week, wi) => (
                <div key={wi} className="rt-heatmap__week">
                  {week.map((cell) => (
                    <span
                      key={cell.date}
                      className="rt-heatmap__cell"
                      data-empty={!cell.inWindow || undefined}
                      data-today={cell.isToday || undefined}
                      title={`${cell.date} · ${tipForCell(cell.value)}`}
                      style={cell.inWindow
                        ? { background: cellColor(routine, cell.value, routine.color) }
                        : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="rt-heatmap__legend">
            <span>Less</span>
            <span className="rt-heatmap__sw" style={{ background: 'var(--bg-hover)' }} />
            <span className="rt-heatmap__sw" style={{ background: cellColor(routine, (routine.target_value ?? 1) * 0.25, routine.color) }} />
            <span className="rt-heatmap__sw" style={{ background: cellColor(routine, (routine.target_value ?? 1) * 0.5, routine.color) }} />
            <span className="rt-heatmap__sw" style={{ background: cellColor(routine, (routine.target_value ?? 1) * 0.85, routine.color) }} />
            <span className="rt-heatmap__sw" style={{ background: routine.color }} />
            <span>More</span>
          </div>
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
