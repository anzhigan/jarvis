/**
 * Pomodoro session log — append-only history of completed focus sessions,
 * persisted to localStorage so Analysis can show time-per-task.
 *
 * Storage shape (LS key `jarvnote:pomodoro:sessions`):
 *   [{ id, taskId, taskTitle, mode, durationSec, completedAt }, ...]
 *
 * Capped at MAX_SESSIONS entries (FIFO drop). 500 × ~120 bytes ≈ 60 KB.
 */

export interface PomoSession {
  id: string;
  /** Goal/task id, or null if the user ran the timer without picking one. */
  taskId: string | null;
  /** Cached task title at completion time. Survives task rename/deletion. */
  taskTitle: string | null;
  mode: 'focus' | 'break';
  /** Actual elapsed seconds — equals the planned total for completed runs. */
  durationSec: number;
  /** Epoch ms when the session ended. */
  completedAt: number;
}

const STORAGE_KEY = 'jarvnote:pomodoro:sessions';
const MAX_SESSIONS = 500;
const CHANGE_EVENT = 'jarvnote:pomodoroSessionsChanged';

export function readSessions(): PomoSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is PomoSession =>
      s && typeof s.id === 'string'
        && typeof s.durationSec === 'number'
        && typeof s.completedAt === 'number'
        && (s.mode === 'focus' || s.mode === 'break'),
    );
  } catch { return []; }
}

export function recordSession(s: Omit<PomoSession, 'id'>): void {
  try {
    const existing = readSessions();
    const next: PomoSession = {
      ...s,
      id: `${s.completedAt}-${Math.random().toString(36).slice(2, 8)}`,
    };
    const trimmed = [...existing, next].slice(-MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    // Broadcast so any mounted Analysis chart picks up the new entry
    // without polling.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* quota or serialization — silently drop */ }
}

export const POMODORO_SESSIONS_CHANGE_EVENT = CHANGE_EVENT;
