import { useCallback, useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Pause, Play, RotateCcw, Plus, Minus, X, ChevronDown, Check } from 'lucide-react';
import { Tooltip } from '../ui';
import { tasksApi } from '../../api/client';
import type { Task } from '../../api/types';
import { recordSession } from '../../features/analytics/lib/pomodoroLog';

type Mode = 'focus' | 'break';

const STORAGE_KEY = 'jarvnote:pomodoro';

interface SlotState {
  totalSec: number;
  /** Epoch ms when the current run started. null = idle or paused. */
  startedAt: number | null;
  /** When paused, the remaining seconds at pause time. null when running/idle. */
  pausedRemainingSec: number | null;
}

interface Persisted {
  mode: Mode;
  /** Independent state per mode — switching Focus↔Break preserves the
      other slot's elapsed time. Previously a mode switch wiped everything. */
  slots: { focus: SlotState; break: SlotState };
  /** Task the user is focusing on. Cached title so we don't need the API just to render. */
  taskId: string | null;
  taskTitle: string | null;
}

const FOCUS_PRESETS = [15, 25, 45, 60];
const BREAK_PRESETS = [5, 10, 15];
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

const FRESH_FOCUS_SLOT: SlotState = {
  totalSec: DEFAULT_FOCUS_MIN * 60, startedAt: null, pausedRemainingSec: null,
};
const FRESH_BREAK_SLOT: SlotState = {
  totalSec: DEFAULT_BREAK_MIN * 60, startedAt: null, pausedRemainingSec: null,
};

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const p = JSON.parse(raw) as Partial<Persisted> & {
      // Old single-slot shape, kept for one-time migration.
      totalSec?: number;
      startedAt?: number | null;
      pausedRemainingSec?: number | null;
    };
    if (p.mode !== 'focus' && p.mode !== 'break') throw new Error('mode');

    // Migration: old shape had {mode, totalSec, startedAt, pausedRemainingSec}
    // at top level. Promote that into the matching slot, leave the other slot fresh.
    if (!p.slots && typeof p.totalSec === 'number') {
      const slot: SlotState = {
        totalSec: p.totalSec,
        startedAt: p.startedAt ?? null,
        pausedRemainingSec: p.pausedRemainingSec ?? null,
      };
      return {
        mode: p.mode,
        slots: p.mode === 'focus'
          ? { focus: slot, break: FRESH_BREAK_SLOT }
          : { focus: FRESH_FOCUS_SLOT, break: slot },
        taskId: p.taskId ?? null,
        taskTitle: p.taskTitle ?? null,
      };
    }

    if (!p.slots || !p.slots.focus || !p.slots.break) throw new Error('slots');
    return {
      mode: p.mode,
      slots: {
        focus: { ...FRESH_FOCUS_SLOT, ...p.slots.focus },
        break: { ...FRESH_BREAK_SLOT, ...p.slots.break },
      },
      taskId: p.taskId ?? null,
      taskTitle: p.taskTitle ?? null,
    };
  } catch {
    return {
      mode: 'focus',
      slots: { focus: FRESH_FOCUS_SLOT, break: FRESH_BREAK_SLOT },
      taskId: null,
      taskTitle: null,
    };
  }
}

function saveState(s: Persisted) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/**
 * Two-note "ding" via Web Audio — no asset shipped.
 * Gentle bell, drops a fifth.
 */
function playDing() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const note = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };
    note(880, 0,    0.35);
    note(660, 0.18, 0.45);
    setTimeout(() => { void ctx.close(); }, 1200);
  } catch { /* audio unavailable */ }
}

/** Tomato icon — round rust body, moss-green crown. Used on the rail trigger. */
function TomatoIcon({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {/* Body */}
      <ellipse cx="12" cy="14.5" rx="7" ry="6.5" fill="var(--rust)" />
      {/* Soft highlight, top-left */}
      <ellipse cx="9.2" cy="12" rx="1.2" ry="1.7" fill="rgba(255, 255, 255, 0.32)" />
      {/* Crown — five leaves */}
      <path
        d="M5.8 8.3 C 8 7, 10 7.5, 12 8 C 14 7.5, 16 7, 18.2 8.3
           C 17.2 9.5, 15.5 10.2, 13.5 9.8
           C 13 10.4, 12.5 10.6, 12 10.6
           C 11.5 10.6, 11 10.4, 10.5 9.8
           C 8.5 10.2, 6.8 9.5, 5.8 8.3 Z"
        fill="var(--moss)"
      />
      {/* Stem */}
      <line
        x1="12" y1="8" x2="12" y2="5.5"
        stroke="var(--moss)" strokeWidth="1.4" strokeLinecap="round"
      />
    </svg>
  );
}

export function PomodoroPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Persisted>(loadState);
  // Tick — re-renders the panel every second while running. Storing `now`
  // in state (rather than computing remaining via useMemo on `state` only)
  // is what actually makes the countdown move; with useMemo on [state] the
  // memoized value would freeze at the value computed at click time.
  const [now, setNow] = useState(() => Date.now());
  const dingPlayedFor = useRef<number | null>(null);

  // Picker
  const [activeTasks, setActiveTasks] = useState<Task[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  // Active slot — single read used throughout. Switching mode swaps which
  // slot is "active" without touching the other (so elapsed time of a
  // paused focus survives a peek at Break).
  const slot = state.slots[state.mode];

  // 1Hz tick while the active slot is running. Idle slot = no interval.
  useEffect(() => {
    if (slot.startedAt === null) return;
    setNow(Date.now()); // sync immediately
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [slot.startedAt]);

  // Load active tasks the first time the panel opens. The list is small and
  // refreshes per-open so a goal created/closed elsewhere shows up next time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const tasks = await tasksApi.list();
        if (cancelled) return;
        setActiveTasks(tasks.filter((t) => t.status === 'active'));
      } catch {
        if (!cancelled) setActiveTasks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  let remainingSec: number;
  if (slot.startedAt !== null) {
    remainingSec = slot.totalSec - (now - slot.startedAt) / 1000;
  } else if (slot.pausedRemainingSec !== null) {
    remainingSec = slot.pausedRemainingSec;
  } else {
    remainingSec = slot.totalSec;
  }

  const isRunning = slot.startedAt !== null;
  const isPaused = slot.pausedRemainingSec !== null;
  const isIdle = !isRunning && !isPaused;

  // Mutate just the active slot — leaves the other slot alone so mode-switches
  // don't reset elapsed time.
  const updateSlot = useCallback(
    (mut: (s: SlotState) => SlotState) => {
      setState((s) => ({
        ...s,
        slots: { ...s.slots, [s.mode]: mut(s.slots[s.mode]) },
      }));
    },
    [],
  );

  // Suggest the first active task when none is selected (purely informational
  // — doesn't write to state until the user actually picks).
  const suggested = !state.taskId && activeTasks && activeTasks.length > 0
    ? activeTasks[0]
    : null;
  const selectedTitle = state.taskTitle ?? suggested?.title ?? null;

  // Completion — fires once per run; auto-resets the active slot to fresh
  // idle. Logs focus sessions for the Analysis time-per-task chart.
  useEffect(() => {
    if (!isRunning) return;
    if (remainingSec > 0) return;
    if (dingPlayedFor.current === slot.startedAt) return;
    dingPlayedFor.current = slot.startedAt;
    playDing();
    if (state.mode === 'focus') {
      recordSession({
        taskId: state.taskId,
        taskTitle: state.taskTitle,
        mode: 'focus',
        durationSec: slot.totalSec,
        completedAt: Date.now(),
      });
    }
    updateSlot(() =>
      state.mode === 'focus' ? { ...FRESH_FOCUS_SLOT } : { ...FRESH_BREAK_SLOT });
  }, [remainingSec, isRunning, slot.startedAt, slot.totalSec, state.mode,
      state.taskId, state.taskTitle, updateSlot]);

  // Mode switch — just change which slot is active. No reset.
  const setMode = useCallback((mode: Mode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const setMinutes = useCallback((min: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(min)));
    updateSlot(() => ({
      totalSec: clamped * 60, startedAt: null, pausedRemainingSec: null,
    }));
  }, [updateSlot]);

  const start = useCallback(() => {
    updateSlot((sl) => {
      if (sl.pausedRemainingSec !== null) {
        return {
          ...sl,
          startedAt: Date.now() - (sl.totalSec - sl.pausedRemainingSec) * 1000,
          pausedRemainingSec: null,
        };
      }
      return { ...sl, startedAt: Date.now() };
    });
  }, [updateSlot]);

  const pause = useCallback(() => {
    updateSlot((sl) => {
      if (sl.startedAt === null) return sl;
      const elapsed = (Date.now() - sl.startedAt) / 1000;
      return {
        ...sl, startedAt: null,
        pausedRemainingSec: Math.max(0, sl.totalSec - elapsed),
      };
    });
  }, [updateSlot]);

  const reset = useCallback(() => {
    updateSlot((sl) => ({ ...sl, startedAt: null, pausedRemainingSec: null }));
  }, [updateSlot]);

  const pickTask = useCallback((t: Task | null) => {
    setState((s) => ({
      ...s,
      taskId: t?.id ?? null,
      taskTitle: t?.title ?? null,
    }));
    setPickerOpen(false);
  }, []);

  const progressPct = slot.totalSec > 0
    ? Math.max(0, Math.min(100, (1 - remainingSec / slot.totalSec) * 100))
    : 0;

  const presets = state.mode === 'focus' ? FOCUS_PRESETS : BREAK_PRESETS;
  const minutesField = isIdle
    ? Math.round(slot.totalSec / 60)
    : Math.ceil(remainingSec / 60);

  const ringDash = 2 * Math.PI * 54;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip
        content={isRunning ? `${fmt(remainingSec)} left` : 'Pomodoro'}
        side="right"
      >
        <Popover.Trigger asChild>
          <button
            className="rail-btn pomo-rail-btn"
            aria-label="Pomodoro timer"
            data-active={isRunning || undefined}
            data-running={isRunning || undefined}
          >
            {isRunning ? (
              /* When the panel is hidden the user still needs to see how
                 long is left. Showing the remaining minutes in place of
                 the tomato is more useful than the icon + a pulse dot. */
              <span className="pomo-rail-mins">
                {Math.max(1, Math.ceil(remainingSec / 60))}<em>m</em>
              </span>
            ) : (
              <TomatoIcon />
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={10}
          className="pomo-popover"
          collisionPadding={12}
        >
          <header className="pomo-head">
            <div className="pomo-seg" role="tablist" aria-label="Mode">
              <button
                role="tab"
                aria-selected={state.mode === 'focus'}
                className="pomo-seg-btn"
                data-active={state.mode === 'focus' || undefined}
                onClick={() => setMode('focus')}
              >Focus</button>
              <button
                role="tab"
                aria-selected={state.mode === 'break'}
                className="pomo-seg-btn"
                data-active={state.mode === 'break' || undefined}
                onClick={() => setMode('break')}
              >Break</button>
            </div>
            <button
              type="button"
              className="pomo-close"
              aria-label="Hide"
              onClick={() => setOpen(false)}
            ><X size={14} /></button>
          </header>

          {/* Task picker — what you're focusing on. Suggests the first active
              goal when nothing's selected; opens an inline list to choose. */}
          <div className="pomo-task">
            <button
              type="button"
              className="pomo-task-trigger"
              onClick={() => setPickerOpen((v) => !v)}
              data-empty={selectedTitle === null || undefined}
              data-suggested={!state.taskId && suggested !== null || undefined}
            >
              <span className="pomo-task-label">
                {selectedTitle
                  ? (state.taskId ? 'Working on' : 'Suggested')
                  : 'Pick a task'}
              </span>
              <span className="pomo-task-title">
                {selectedTitle ?? 'No active goals'}
              </span>
              <ChevronDown size={13} className="pomo-task-chev" data-open={pickerOpen || undefined} />
            </button>
            {pickerOpen && (
              <div className="pomo-task-list" role="listbox" aria-label="Active goals">
                {activeTasks === null ? (
                  <div className="pomo-task-empty">Loading…</div>
                ) : activeTasks.length === 0 ? (
                  <div className="pomo-task-empty">No active goals.</div>
                ) : (
                  <>
                    {activeTasks.map((t) => {
                      const selected = state.taskId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className="pomo-task-item"
                          data-selected={selected || undefined}
                          onClick={() => pickTask(t)}
                        >
                          <span className="pomo-task-item-title">{t.title}</span>
                          {selected && <Check size={12} className="pomo-task-item-check" />}
                        </button>
                      );
                    })}
                    {state.taskId && (
                      <button
                        type="button"
                        className="pomo-task-item pomo-task-clear"
                        onClick={() => pickTask(null)}
                      >Clear selection</button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="pomo-display">
            <svg className="pomo-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="pomo-ring-bg" cx="60" cy="60" r="54"
                      fill="none" strokeWidth="6" />
              <circle
                className="pomo-ring-fg"
                cx="60" cy="60" r="54" fill="none" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={ringDash}
                strokeDashoffset={ringDash * (1 - progressPct / 100)}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="pomo-time">{fmt(remainingSec)}</div>
          </div>

          {/* Presets row — fixed single line, height stable across modes.
              Break has fewer presets than Focus; previously they wrapped
              differently and the panel jumped in size. */}
          <div className="pomo-presets">
            {presets.map((m) => (
              <button
                key={m}
                className="pomo-chip"
                data-active={(!isRunning && !isPaused && slot.totalSec === m * 60) || undefined}
                onClick={() => setMinutes(m)}
                disabled={isRunning}
              >{m}m</button>
            ))}
          </div>
          {/* Stepper sits on its own row — guaranteed not to wrap and not
              to push presets onto a second line. */}
          <div className="pomo-stepper-row">
            <div className="pomo-stepper" aria-label="Custom minutes">
              <button
                type="button"
                className="pomo-step-btn"
                aria-label="Decrease minutes"
                onClick={() => setMinutes(minutesField - 1)}
                disabled={isRunning || minutesField <= 1}
              ><Minus size={12} /></button>
              <span className="pomo-step-val">{minutesField}m</span>
              <button
                type="button"
                className="pomo-step-btn"
                aria-label="Increase minutes"
                onClick={() => setMinutes(minutesField + 1)}
                disabled={isRunning || minutesField >= 180}
              ><Plus size={12} /></button>
            </div>
          </div>

          <div className="pomo-actions">
            {isRunning ? (
              <button className="pomo-btn pomo-btn-primary" onClick={pause}>
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button className="pomo-btn pomo-btn-primary" onClick={start}>
                <Play size={14} /> {isPaused ? 'Resume' : 'Start'}
              </button>
            )}
            <button
              className="pomo-btn pomo-btn-plain"
              onClick={reset}
              disabled={isIdle}
            >
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
