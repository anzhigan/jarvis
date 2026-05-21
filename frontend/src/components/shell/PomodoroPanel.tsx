import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Timer, Pause, Play, RotateCcw, Plus, Minus } from 'lucide-react';
import { Tooltip } from '../ui';

type Mode = 'focus' | 'break';

const STORAGE_KEY = 'jarvnote:pomodoro';

interface Persisted {
  mode: Mode;
  totalSec: number;
  /** Epoch ms when the current run started. null = idle or paused. */
  startedAt: number | null;
  /** When paused, the remaining seconds at pause time. null when running/idle. */
  pausedRemainingSec: number | null;
}

const FOCUS_PRESETS = [15, 25, 45, 60];
const BREAK_PRESETS = [5, 10, 15];
const DEFAULT_FOCUS_MIN = 25;
const DEFAULT_BREAK_MIN = 5;

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const p = JSON.parse(raw) as Persisted;
    if (typeof p.totalSec !== 'number' || (p.mode !== 'focus' && p.mode !== 'break')) {
      throw new Error('shape');
    }
    return p;
  } catch {
    return {
      mode: 'focus',
      totalSec: DEFAULT_FOCUS_MIN * 60,
      startedAt: null,
      pausedRemainingSec: null,
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
 * Beep on completion. Pure Web Audio so we don't ship an mp3.
 * Two short notes — gentle, not jarring.
 */
function playDing() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    const playNote = (freq: number, start: number, dur: number) => {
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
    playNote(880, 0,    0.35);  // A5
    playNote(660, 0.18, 0.45);  // E5
    setTimeout(() => { void ctx.close(); }, 1200);
  } catch { /* audio unavailable */ }
}

export function PomodoroPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Persisted>(loadState);
  // Tick state — drives re-render every second when running. We don't store
  // remaining in state; it's derived from startedAt + totalSec.
  const [, setNow] = useState(Date.now());
  const dingPlayedFor = useRef<number | null>(null);

  useEffect(() => { saveState(state); }, [state]);

  // 1Hz tick while running; idle interval when not. Cheap enough to keep
  // always-on so the user sees the countdown jump to live values when
  // they reopen the panel.
  useEffect(() => {
    if (state.startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.startedAt]);

  const remainingSec = useMemo(() => {
    if (state.startedAt !== null) {
      return state.totalSec - (Date.now() - state.startedAt) / 1000;
    }
    if (state.pausedRemainingSec !== null) return state.pausedRemainingSec;
    return state.totalSec;
  }, [state]);

  const isRunning = state.startedAt !== null;
  const isPaused = state.pausedRemainingSec !== null;
  const isIdle = !isRunning && !isPaused;

  // Completion: fire ding once per session run, then auto-reset to idle so
  // the panel is ready for the next round (don't auto-switch mode — keeps
  // the user in control).
  useEffect(() => {
    if (!isRunning) return;
    if (remainingSec > 0) return;
    if (dingPlayedFor.current === state.startedAt) return;
    dingPlayedFor.current = state.startedAt;
    playDing();
    setState((s) => ({
      ...s,
      startedAt: null,
      pausedRemainingSec: null,
      totalSec: s.mode === 'focus' ? DEFAULT_FOCUS_MIN * 60 : DEFAULT_BREAK_MIN * 60,
    }));
  }, [remainingSec, isRunning, state.startedAt]);

  const setMode = useCallback((mode: Mode) => {
    setState({
      mode,
      totalSec: (mode === 'focus' ? DEFAULT_FOCUS_MIN : DEFAULT_BREAK_MIN) * 60,
      startedAt: null,
      pausedRemainingSec: null,
    });
  }, []);

  const setMinutes = useCallback((min: number) => {
    const clamped = Math.max(1, Math.min(180, Math.round(min)));
    setState({
      mode: state.mode,
      totalSec: clamped * 60,
      startedAt: null,
      pausedRemainingSec: null,
    });
  }, [state.mode]);

  const start = useCallback(() => {
    setState((s) => {
      if (s.pausedRemainingSec !== null) {
        // Resume — adjust startedAt so the remaining time matches.
        return {
          ...s,
          startedAt: Date.now() - (s.totalSec - s.pausedRemainingSec) * 1000,
          pausedRemainingSec: null,
        };
      }
      return { ...s, startedAt: Date.now() };
    });
  }, []);

  const pause = useCallback(() => {
    setState((s) => {
      if (s.startedAt === null) return s;
      const elapsed = (Date.now() - s.startedAt) / 1000;
      return {
        ...s,
        startedAt: null,
        pausedRemainingSec: Math.max(0, s.totalSec - elapsed),
      };
    });
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      startedAt: null,
      pausedRemainingSec: null,
    }));
  }, []);

  const progressPct = state.totalSec > 0
    ? Math.max(0, Math.min(100, (1 - remainingSec / state.totalSec) * 100))
    : 0;

  const presets = state.mode === 'focus' ? FOCUS_PRESETS : BREAK_PRESETS;
  const minutesField = isIdle
    ? Math.round(state.totalSec / 60)
    : Math.ceil(remainingSec / 60);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content="Pomodoro" side="right">
        <Popover.Trigger asChild>
          <button
            className="rail-btn"
            aria-label="Pomodoro timer"
            data-active={isRunning || undefined}
          >
            <Timer />
            {isRunning && <span className="pomo-rail-dot" aria-hidden="true" />}
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
          </header>

          <div className="pomo-display">
            <svg className="pomo-ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle className="pomo-ring-bg"  cx="60" cy="60" r="54" fill="none" strokeWidth="6" />
              <circle
                className="pomo-ring-fg"
                cx="60" cy="60" r="54" fill="none" strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 54}
                strokeDashoffset={(2 * Math.PI * 54) * (1 - progressPct / 100)}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="pomo-time">{fmt(remainingSec)}</div>
          </div>

          <div className="pomo-presets">
            {presets.map((m) => (
              <button
                key={m}
                className="pomo-chip"
                data-active={!isRunning && !isPaused && state.totalSec === m * 60 || undefined}
                onClick={() => setMinutes(m)}
                disabled={isRunning}
              >{m}m</button>
            ))}
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
