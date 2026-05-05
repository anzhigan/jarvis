import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Repeat, Pause, Play, X, Check, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { routinesApi, tasksApi, resolveUrl } from '../api/client';
import type { Routine, RoutineEntry, RoutineScheduleType } from '../api/types';
import PullToRefresh from './PullToRefresh';
import SwipeRow from './SwipeRow';
import { useT } from '../store/i18n';
import { useAuthStore } from '../store/auth';
import CreateSheet, { FormField } from './CreateSheet';
import { ENTITY_COLORS } from '../lib/colors';

const ROUTINE_COLORS = ENTITY_COLORS;

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun..Sat
const WEEKDAY_LABELS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Is this routine due today based on its schedule? */
function isRoutineDueToday(r: Routine): boolean {
  if (r.is_paused) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (r.start_date) {
    const s = new Date(r.start_date); s.setHours(0, 0, 0, 0);
    if (today < s) return false;
  }
  if (r.end_date) {
    const e = new Date(r.end_date); e.setHours(0, 0, 0, 0);
    if (today > e) return false;
  }
  switch (r.schedule_type) {
    case 'daily':
      return true;
    case 'weekly_on_days': {
      const dow = today.getDay();
      const allowed = (r.schedule_days || '').split(',').filter(Boolean).map((s) => parseInt(s, 10));
      return allowed.includes(dow);
    }
    case 'every_n_days': {
      const created = new Date(r.created_at); created.setHours(0, 0, 0, 0);
      const diff = Math.floor((today.getTime() - created.getTime()) / 86400000);
      return diff >= 0 && diff % Math.max(1, r.schedule_n_days) === 0;
    }
    case 'times_per_week': {
      const start = new Date(today);
      start.setDate(start.getDate() - today.getDay()); // Sunday
      const startMs = start.getTime();
      const endMs = today.getTime();
      const doneThisWeek = r.entries.filter((e) => {
        if (e.value <= 0) return false;
        const d = new Date(e.date); d.setHours(0, 0, 0, 0);
        const ms = d.getTime();
        return ms >= startMs && ms <= endMs;
      }).length;
      return doneThisWeek < r.schedule_count_per_period;
    }
  }
}

/** Display string for the schedule */
function scheduleLabel(r: Routine, lang: 'en' | 'ru'): string {
  const dayLabels = lang === 'ru' ? WEEKDAY_LABELS_RU : WEEKDAY_LABELS;
  switch (r.schedule_type) {
    case 'daily':
      return lang === 'ru' ? 'Каждый день' : 'Every day';
    case 'weekly_on_days': {
      const days = (r.schedule_days || '').split(',').filter(Boolean).map((s) => parseInt(s, 10));
      if (!days.length) return lang === 'ru' ? 'По расписанию' : 'On schedule';
      return days.map((d) => dayLabels[d]).join(', ');
    }
    case 'every_n_days':
      return lang === 'ru' ? `Раз в ${r.schedule_n_days} дн.` : `Every ${r.schedule_n_days} days`;
    case 'times_per_week':
      return lang === 'ru'
        ? `${r.schedule_count_per_period} раз${r.schedule_count_per_period > 1 ? 'а' : ''} в неделю`
        : `${r.schedule_count_per_period}× per week`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Desktop streak strip — 14 days, small dots, long-press modal
// ═══════════════════════════════════════════════════════════════════════════
function RoutineStreakDesktop({ routine, onSetEntry }: {
  routine: Routine;
  onSetEntry?: (date: string, value: number | null) => Promise<void>;
}) {
  const days = 14;
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of routine.entries) m.set(e.date, e.value);
    return m;
  }, [routine.entries]);

  const entryHasMap = useMemo(() => {
    const m = new Set<string>();
    for (const e of routine.entries) m.add(e.date);
    return m;
  }, [routine.entries]);

  const created = useMemo(() => {
    const d = new Date(routine.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [routine.created_at]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: { date: string; value: number; isToday: boolean; before: boolean; hasEntry: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateIso(d);
    cells.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isToday: i === 0,
      before: d < created,
      hasEntry: entryHasMap.has(key),
    });
  }
  const ordered = [...cells].reverse();
  const eligible = cells.filter((c) => !c.before).length;
  const done = cells.filter((c) => !c.before && c.value > 0).length;

  const startLongPress = (date: string) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setActivePopover(date);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="streak-box">
      <div className="streak-count" title={`${done}/${eligible} done`}>
        {done}<span style={{ opacity: 0.4 }}>/{eligible}</span>
      </div>
      <div className="streak-strip">
        {ordered.map((c) => {
          let state: 'done' | 'fail' | 'today' | undefined;
          if (c.isToday) state = 'today';
          else if (c.before) state = undefined;
          else if (c.value > 0) state = 'done';
          else if (c.hasEntry) state = 'fail';
          else state = undefined;

          const interactive = onSetEntry && !c.before;
          return (
            <button
              key={c.date}
              title={c.date}
              disabled={!interactive}
              onMouseDown={() => interactive && startLongPress(c.date)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={() => interactive && startLongPress(c.date)}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              className="streak-dot"
              data-state={state}
            />
          );
        })}
      </div>

      {activePopover && onSetEntry && (
        <div className="modal-backdrop" onClick={() => setActivePopover(null)}>
          <div className="modal-panel" style={{ padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="text-label" style={{ textAlign: 'center', marginBottom: 12 }}>{activePopover}</div>
            <div className="flex gap-3">
              <button onClick={async () => { await onSetEntry(activePopover, 1); setActivePopover(null); }}
                className="check-circle" data-state="done" style={{ width: 56, height: 56 }}>
                <Check size={24} strokeWidth={3} />
              </button>
              <button onClick={async () => { await onSetEntry(activePopover, 0); setActivePopover(null); }}
                className="check-circle" data-state="fail" style={{ width: 56, height: 56 }}>
                <X size={24} strokeWidth={3} />
              </button>
              <button onClick={async () => { await onSetEntry(activePopover, null); setActivePopover(null); }}
                className="check-circle" style={{ width: 56, height: 56, color: 'var(--fg-muted)' }}>
                <span className="text-xl">−</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Mobile streak strip — 7 days, 22×22 tappable dots, inline popover
// ═══════════════════════════════════════════════════════════════════════════
function RoutineStreakMobile({ routine, onSetEntry }: {
  routine: Routine;
  onSetEntry?: (date: string, value: number | null) => Promise<void>;
}) {
  const [activePopover, setActivePopover] = useState<string | null>(null);

  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of routine.entries) m.set(e.date, e.value);
    return m;
  }, [routine.entries]);

  const entryHasMap = useMemo(() => {
    const m = new Set<string>();
    for (const e of routine.entries) m.add(e.date);
    return m;
  }, [routine.entries]);

  const created = useMemo(() => {
    const d = new Date(routine.created_at);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [routine.created_at]);

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Build 7-day cells: oldest → newest (left → right)
  const cells: { date: string; value: number; isToday: boolean; before: boolean; hasEntry: boolean; dayInitial: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const key = dateIso(d);
    cells.push({
      date: key,
      value: entryMap.get(key) ?? 0,
      isToday: i === 0,
      before: d < created,
      hasEntry: entryHasMap.has(key),
      dayInitial: DAY_INITIALS[d.getDay()],
    });
  }

  const handleDotClick = (date: string, isToday: boolean, before: boolean) => {
    if (isToday || before || !onSetEntry) return;
    setActivePopover((prev) => prev === date ? null : date);
  };

  const handlePopoverAction = async (date: string, action: 'done' | 'fail' | 'empty') => {
    if (!onSetEntry) return;
    const value = action === 'done' ? 1 : action === 'fail' ? 0 : null;
    await onSetEntry(date, value);
    setActivePopover(null);
  };

  return (
    <div className="streak-strip-row" onClick={() => setActivePopover(null)}>
      <span className="streak-strip-label">7d</span>
      <div className="streak-strip">
        {cells.map((c) => {
          let state: 'done' | 'fail' | 'today' | 'empty';
          if (c.isToday) {
            if (c.value > 0) state = 'done';
            else if (c.hasEntry) state = 'fail';
            else state = 'today';
          }
          else if (c.before) state = 'empty';
          else if (c.value > 0) state = 'done';
          else if (c.hasEntry) state = 'fail';
          else state = 'empty';

          const isOpen = activePopover === c.date;
          const canEdit = !c.isToday && !c.before && !!onSetEntry;

          return (
            <span key={c.date} className="streak-popover-wrap" onClick={(e) => e.stopPropagation()}>
              <button
                className="streak-dot"
                data-state={state}
                data-day={c.dayInitial}
                data-popover={isOpen ? 'open' : undefined}
                onClick={() => handleDotClick(c.date, c.isToday, c.before)}
                disabled={!canEdit}
                title={c.date}
              />
              {isOpen && (
                <div className="streak-popover" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="streak-popover-btn"
                    data-action="done"
                    onClick={() => handlePopoverAction(c.date, 'done')}
                    title="Mark done"
                  >
                    <Check size={14} strokeWidth={3.2} />
                  </button>
                  <button
                    className="streak-popover-btn"
                    data-action="fail"
                    onClick={() => handlePopoverAction(c.date, 'fail')}
                    title="Mark failed"
                  >
                    <X size={14} strokeWidth={3.2} />
                  </button>
                  <button
                    className="streak-popover-btn"
                    data-action="empty"
                    onClick={() => handlePopoverAction(c.date, 'empty')}
                    title="Clear"
                  >
                    <Minus size={14} strokeWidth={2} />
                  </button>
                </div>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RoutineCard
// ═══════════════════════════════════════════════════════════════════════════
function RoutineCard({ routine, onReload, onPatchLocal, isMobile }: {
  routine: Routine;
  onReload: () => Promise<void>;
  onPatchLocal?: (entries: RoutineEntry[]) => void;
  isMobile: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const today = todayIso();
  const todayEntry = routine.entries.find((e) => e.date === today);
  const isDoneToday = (todayEntry?.value ?? 0) > 0;
  const isSkippedToday = todayEntry !== undefined && todayEntry.value === 0;

  const setEntry = async (date: string, value: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      if (value === null) {
        await routinesApi.deleteEntry(routine.id, date);
      } else {
        await routinesApi.upsertEntry(routine.id, date, value);
      }
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleToday = async () => {
    if (routine.kind !== 'boolean' || busy) return;
    const newValue = isDoneToday ? 0 : 1;
    const otherEntries = routine.entries.filter((e) => e.date !== today);
    const optimisticEntries = newValue === 0
      ? otherEntries
      : [...otherEntries, { id: `tmp-${Date.now()}`, routine_id: routine.id, date: today, value: 1 }];
    onPatchLocal?.(optimisticEntries);
    setBusy(true);
    try {
      if (newValue === 0) await routinesApi.deleteEntry(routine.id, today);
      else await routinesApi.upsertEntry(routine.id, today, newValue);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      await onReload();
    } finally { setBusy(false); }
  };

  const markSkippedToday = async () => {
    if (routine.kind !== 'boolean' || busy) return;
    const newValue = isSkippedToday ? null : 0;
    const otherEntries = routine.entries.filter((e) => e.date !== today);
    const optimisticEntries = newValue === null
      ? otherEntries
      : [...otherEntries, { id: `tmp-${Date.now()}`, routine_id: routine.id, date: today, value: 0 }];
    onPatchLocal?.(optimisticEntries);
    setBusy(true);
    try {
      if (newValue === null) await routinesApi.deleteEntry(routine.id, today);
      else await routinesApi.upsertEntry(routine.id, today, 0);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
      await onReload();
    } finally { setBusy(false); }
  };

  const togglePause = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await routinesApi.update(routine.id, { is_paused: !routine.is_paused });
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete routine "${routine.title}"?`)) return;
    setBusy(true);
    try {
      await routinesApi.delete(routine.id);
      await onReload();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const editSheet = editing ? (
    <RoutineEditForm
      routine={routine}
      onCancel={() => setEditing(false)}
      onSaved={async () => { setEditing(false); await onReload(); }}
    />
  ) : null;

  const card = (
    <div className="routine-row" style={{ position: 'relative' }}>
      {/* Color stripe */}
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 4,
          background: routine.color,
          opacity: routine.is_paused ? 0.35 : 0.9,
          borderRadius: 'var(--r-card) 0 0 var(--r-card)',
        }}
      />

      {/* Mobile: dual check-pair */}
      {isMobile && routine.kind === 'boolean' && (
        <div className="check-pair" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={toggleToday}
            disabled={busy || routine.is_paused}
            className="check-circle"
            data-action="done"
            data-state={isDoneToday ? 'done' : 'idle'}
            title={isDoneToday ? 'Undo done' : 'Mark done'}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={3.2} />}
          </button>
          <button
            onClick={markSkippedToday}
            disabled={busy || routine.is_paused}
            className="check-circle"
            data-action="skip"
            data-state={isSkippedToday ? 'done' : 'idle'}
            title={isSkippedToday ? 'Undo skip' : 'Mark skipped'}
          >
            <X size={13} strokeWidth={3.2} />
          </button>
        </div>
      )}

      {/* Desktop: single check circle */}
      {!isMobile && routine.kind === 'boolean' && (
        <button
          onClick={toggleToday}
          disabled={busy || routine.is_paused}
          className="check-circle"
          data-state={isDoneToday ? 'done' : 'outline'}
          style={{ opacity: routine.is_paused ? 0.4 : 1 }}
        >
          {busy && isDoneToday ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3.2} />}
        </button>
      )}

      {/* Title + meta */}
      <div className="routine-info">
        <div className="routine-title" style={{ opacity: routine.is_paused ? 0.6 : 1 }}>
          {routine.title}
        </div>
        <div className="routine-sub">
          {scheduleLabel(routine, 'en')}
          {routine.is_paused && <> · paused</>}
        </div>
      </div>

      {/* Desktop-only streak strip */}
      {!isMobile && (
        <RoutineStreakDesktop routine={routine} onSetEntry={setEntry} />
      )}

      {/* Desktop-only action buttons */}
      {!isMobile && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={togglePause} className="icon-btn icon-btn-sm" title={routine.is_paused ? 'Resume' : 'Pause'}>
            {routine.is_paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button onClick={() => setEditing(true)} className="icon-btn icon-btn-sm" title="Edit">
            <Pencil size={13} />
          </button>
          <button
            onClick={markSkippedToday}
            disabled={busy || routine.is_paused}
            className="icon-btn icon-btn-sm"
            title="Mark not done"
            style={{ color: isSkippedToday ? 'var(--danger)' : undefined }}
          >
            {busy && isSkippedToday ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          </button>
          <button onClick={remove} className="icon-btn icon-btn-sm" title="Delete" style={{ color: 'var(--danger)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Mobile 7-day streak strip — wraps to next line */}
      {isMobile && (
        <RoutineStreakMobile routine={routine} onSetEntry={setEntry} />
      )}
    </div>
  );

  if (!isMobile) return <>{card}{editSheet}</>;

  // Mobile: use SwipeRow component for consistent edit/delete swipe UX
  return (
    <>
      <SwipeRow
        onEdit={() => setEditing(true)}
        onDelete={remove}
      >
        {card}
      </SwipeRow>
      {editSheet}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Edit Form
// ═══════════════════════════════════════════════════════════════════════════
function RoutineEditForm({
  routine, onCancel, onSaved,
}: { routine: Routine; onCancel: () => void; onSaved: () => Promise<void> }) {
  const t = useT();
  const [title, setTitle] = useState(routine.title);
  const [description, setDescription] = useState(routine.description);
  const [color, setColor] = useState(routine.color);
  const [scheduleType, setScheduleType] = useState<RoutineScheduleType>(routine.schedule_type);
  const [scheduleDays, setScheduleDays] = useState<string[]>(
    (routine.schedule_days || '').split(',').filter(Boolean)
  );
  const [scheduleCount, setScheduleCount] = useState(routine.schedule_count_per_period);

  const toggleDay = (idx: number) => {
    const s = String(idx);
    setScheduleDays((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s]);
  };

  const save = async () => {
    await routinesApi.update(routine.id, {
      title: title.trim() || routine.title,
      description,
      color,
      schedule_type: scheduleType,
      schedule_days: scheduleDays.join(','),
      schedule_count_per_period: scheduleCount,
    });
    await onSaved();
  };

  return (
    <CreateSheet
      open
      onClose={onCancel}
      title="Edit routine"
      primaryLabel={t('common.save') || 'Save'}
      canSubmit={!!title.trim()}
      onSubmit={save}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)} placeholder="Routine title" autoFocus />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description…" />
      </FormField>
      <FormField label="Schedule">
        <select value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as RoutineScheduleType)}
          className="select-base w-full">
          <option value="daily">Every day</option>
          <option value="weekly_on_days">On specific weekdays</option>
          <option value="times_per_week">X times per week</option>
        </select>
      </FormField>
      {scheduleType === 'weekly_on_days' && (
        <FormField label="Days">
          <div className="flex gap-1 flex-wrap">
            {WEEKDAY_LABELS.map((lbl, idx) => (
              <button key={idx} type="button"
                onClick={() => toggleDay(idx)}
                className={scheduleDays.includes(String(idx)) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ width: 36, padding: 0, justifyContent: 'center' }}>
                {lbl}
              </button>
            ))}
          </div>
        </FormField>
      )}
      {scheduleType === 'times_per_week' && (
        <FormField label="Times per week">
          <input type="number" min={1} max={7} className="input w-full"
            value={scheduleCount}
            onChange={(e) => setScheduleCount(parseInt(e.target.value || '1', 10))} />
        </FormField>
      )}
      <FormField label="Color">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 0' }}>
          {ROUTINE_COLORS.map((c) => (
            <button key={c} type="button"
              onClick={(e) => { e.preventDefault(); setColor(c); }}
              className="w-9 h-9 rounded-full transition-all active:scale-90"
              style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px var(--bg-card), 0 0 0 3.5px ${c}` : 'none' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create Form
// ═══════════════════════════════════════════════════════════════════════════
function CreateRoutineForm({ open, onCreated, onCancel, goals }: { open: boolean; onCreated: () => Promise<void>; onCancel: () => void; goals: { id: string; title: string }[] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(ROUTINE_COLORS[0]);
  const [scheduleType, setScheduleType] = useState<RoutineScheduleType>('daily');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleNDays] = useState(2);
  const [scheduleCount, setScheduleCount] = useState(2);
  const [goalId, setGoalId] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setColor(ROUTINE_COLORS[0]);
      setScheduleType('daily'); setScheduleDays([]); setScheduleCount(2); setGoalId('');
    }
  }, [open]);

  const toggleDay = (idx: number) => {
    const s = String(idx);
    setScheduleDays((d) => d.includes(s) ? d.filter((x) => x !== s) : [...d, s]);
  };

  const handleSubmit = async () => {
    await routinesApi.create({
      title: title.trim(), description: description.trim(), color,
      schedule_type: scheduleType, schedule_days: scheduleDays.join(','),
      schedule_n_days: scheduleNDays, schedule_count_per_period: scheduleCount,
      goal_id: goalId || null,
    });
    onCancel();
    await onCreated();
  };

  return (
    <CreateSheet
      open={open}
      onClose={onCancel}
      title="New routine"
      primaryLabel="Create routine"
      canSubmit={!!title.trim()}
      onSubmit={handleSubmit}
    >
      <FormField label="Title">
        <input type="text" className="input w-full" value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Routine title" />
      </FormField>
      <FormField label="Description">
        <textarea className="textarea w-full" value={description}
          onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description…" />
      </FormField>
      <FormField label="Schedule">
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as RoutineScheduleType)} className="select-base">
          <option value="daily">Every day</option>
          <option value="weekly_on_days">On specific weekdays</option>
          <option value="times_per_week">X times per week</option>
        </select>
      </FormField>
      {scheduleType === 'weekly_on_days' && (
        <FormField label="Days">
          <div className="flex gap-1 flex-wrap">
            {WEEKDAY_LABELS.map((lbl, idx) => (
              <button key={idx} type="button" onClick={() => toggleDay(idx)}
                className={scheduleDays.includes(String(idx)) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ width: 36, padding: 0, justifyContent: 'center' }}>{lbl}</button>
            ))}
          </div>
        </FormField>
      )}
      {scheduleType === 'times_per_week' && (
        <FormField label="Times per week">
          <input type="number" min={1} max={7} value={scheduleCount}
            onChange={(e) => setScheduleCount(parseInt(e.target.value || '1', 10))}
            className="input w-full" />
        </FormField>
      )}
      {goals.length > 0 && (
        <FormField label="Linked goal">
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="select-base">
            <option value="">No goal (standalone)</option>
            {goals.map((g) => <option key={g.id} value={g.id}>↳ {g.title}</option>)}
          </select>
        </FormField>
      )}
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap">
          {ROUTINE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 24, height: 24, borderRadius: 'var(--r-pill)', backgroundColor: c,
                boxShadow: color === c ? `0 0 0 2px var(--bg-elevated), 0 0 0 3.5px ${c}` : 'none',
                transition: 'all 150ms' }} />
          ))}
        </div>
      </FormField>
    </CreateSheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Routines page
// ═══════════════════════════════════════════════════════════════════════════
export default function Routines() {
  const t = useT();
  const { user } = useAuthStore();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [routines, setRoutines] = useState<Routine[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<'today' | 'all' | 'paused'>('today');

  const load = async () => {
    setLoading(true);
    try {
      const [list, ts] = await Promise.all([
        routinesApi.list(),
        tasksApi.list(),
      ]);
      setRoutines(list);
      setGoals(ts.filter((t) => t.status !== 'done').map((t) => ({ id: t.id, title: t.title })));
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load routines');
    } finally {
      setLoading(false);
    }
  };

  // Silent reload — no loading spinner, used after entry toggle to avoid flicker
  const silentLoad = async () => {
    try {
      const list = await routinesApi.list();
      setRoutines(list);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed');
    }
  };

  // Optimistic patch — immediately update entries in local state
  const patchRoutineLocal = (id: string, entries: RoutineEntry[]) => {
    setRoutines((prev) => prev.map((r) => r.id === id ? { ...r, entries } : r));
  };

  useEffect(() => { load(); }, []);

  const filteredRoutines = useMemo(() => {
    if (filter === 'today') return routines.filter((r) => isRoutineDueToday(r));
    if (filter === 'paused') return routines.filter((r) => r.is_paused);
    return routines.filter((r) => !r.is_paused);
  }, [routines, filter]);

  const counts = useMemo(() => ({
    today: routines.filter((r) => isRoutineDueToday(r)).length,
    all: routines.filter((r) => !r.is_paused).length,
    paused: routines.filter((r) => r.is_paused).length,
  }), [routines]);

  const filterLabels = { today: 'Today', all: 'All active', paused: 'Paused' } as const;

  const doneTodayCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return routines.filter((r) => {
      if (!isRoutineDueToday(r)) return false;
      return r.entries?.some((e: any) => e.date === todayStr && e.value > 0);
    }).length;
  }, [routines]);

  return (
    <div className="size-full overflow-y-auto" style={{ overflowX: 'hidden' }}>
      <PullToRefresh onRefresh={load}>
        {isMobile ? (
          /* ── Mobile layout ── */
          <div>
            <div className="big-title-row">
              <div>
                <div className="big-title">Routines</div>
                <div className="big-title-sub">
                  {doneTodayCount} of {counts.today} done today
                  {counts.paused > 0 && ` · ${counts.paused} paused`}
                </div>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'profile' }))}
                className="profile-btn"
                title="Profile"
              >
                {user?.avatar_url ? (
                  <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar">{user?.username?.charAt(0).toUpperCase() ?? '?'}</span>
                )}
              </button>
            </div>

            {/* Filter chips + create CTA */}
            <div className="chips-row">
              {(['today', 'all', 'paused'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="chip"
                  data-active={filter === f}
                >
                  {filterLabels[f]}
                  <span className="chip-count">{counts[f]}</span>
                </button>
              ))}
              <button onClick={() => setCreating(true)} className="chip" style={{ marginLeft: 'auto' }}>
                <Plus size={13} /> New
              </button>
            </div>

            <div style={{ padding: '0 16px' }}>

              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : filteredRoutines.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Repeat size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">
                    {filter === 'today' ? 'Nothing scheduled for today.' :
                     filter === 'paused' ? 'No paused routines.' :
                     'No routines yet. Create your first one above.'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredRoutines.map((r) => (
                    <RoutineCard key={r.id} routine={r} onReload={silentLoad} onPatchLocal={(e) => patchRoutineLocal(r.id, e)} isMobile={true} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Desktop layout ── */
          <div className="page-container">
            <div className="page-head">
              <div className="page-head-info">
                <h1 className="page-title">Routines</h1>
                <p className="page-subtitle">Build rhythm. Stay consistent. Reduce friction.</p>
              </div>
              <div className="page-head-actions">
                <button
                  onClick={() => setCreating(true)}
                  className="btn btn-primary btn-sm"
                >
                  <Plus size={13} /> New routine
                </button>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap" style={{ marginBottom: 14 }}>
              {(['today', 'all', 'paused'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className="pill" data-active={filter === f}>
                  {filterLabels[f]}
                  <span className="pill-count">{counts[f]}</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : filteredRoutines.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Repeat size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {filter === 'today' ? 'Nothing scheduled for today.' :
                   filter === 'paused' ? 'No paused routines.' :
                   'No routines yet. Create your first one above.'}
                </p>
              </div>
            ) : (
              <div>
                {filteredRoutines.map((r) => (
                  <RoutineCard key={r.id} routine={r} onReload={silentLoad} onPatchLocal={(e) => patchRoutineLocal(r.id, e)} isMobile={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </PullToRefresh>
      <CreateRoutineForm open={creating} onCancel={() => setCreating(false)} onCreated={load} goals={goals} />
    </div>
  );
}
