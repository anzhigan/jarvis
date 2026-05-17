/**
 * Global state for backgrounded AI generations.
 *
 * The toast that shows "Generating X · 22s elapsed" needs to outlive view
 * unmounts (user navigates Notes → Goals while a quiz is generating). To
 * achieve that, the toast is mounted at the app shell level and reads from
 * this store. Views call `add()` when starting + auto-when-drawer-closes,
 * and `remove()` when dismissing.
 *
 * Each job carries a `source` payload — enough to navigate back to the view
 * that triggered it and reopen the drawer on its "Open →" click.
 */
import { create } from 'zustand';
import type { AIJobKind } from '../api/types';

export interface AIJobSource {
  /** Which top-level section opens the result. */
  section: 'notes' | 'goals' | 'analysis';
  /** For quiz/tasks_extract — the note this job belongs to. */
  noteId?: string;
  /** Pretty title for the AI jobs panel ("Quiz · note name"). Optional;
   *  panel falls back to the generic kind label when missing. */
  noteTitle?: string;
}

export interface BgAIJob {
  jobId: string;
  kind: AIJobKind;
  source: AIJobSource;
  /** Bumped (ms timestamp) when the user re-triggers the same kind while it
   *  is still in flight — the toast watches this to play a shake animation. */
  bumpedAt?: number;
  /** User X'd the bottom toast for this job. Soft dismissal — the job stays
   *  in the AI tasks panel; only the toast slot is hidden. Re-triggering via
   *  `bump` (or a fresh `add`) clears the flag so the toast can reappear. */
  hideFromToast?: boolean;
}

interface State {
  /** Order matters — oldest visible first; new jobs go to the end of the
   *  queue. Only the head is rendered as a toast; subsequent ones surface as
   *  a "+N" badge until the head dismisses. */
  jobs: BgAIJob[];
  add: (job: BgAIJob) => void;
  remove: (jobId: string) => void;
  has: (jobId: string) => boolean;
  /** Find a queued / running job by kind. Used to detect same-kind re-triggers. */
  findByKind: (kind: AIJobKind) => BgAIJob | undefined;
  /** Same-task lookup: matches kind AND source (so two quizzes on different
   *  notes are NOT considered the same task — each queues independently). */
  findSame: (kind: AIJobKind, noteId: string | undefined) => BgAIJob | undefined;
  /** Re-trigger of the same kind: punch the existing toast (shake) instead of
   *  enqueueing another. Idempotent — the toast keys off the latest timestamp. */
  bump: (jobId: string) => void;
  /** Replace the entire queue. Used to rehydrate from the backend on boot so
   *  refreshing the page doesn't drop the user's in-flight / recent jobs. */
  hydrate: (jobs: BgAIJob[]) => void;
  /** Soft dismiss for the bottom toast — keeps the job in the panel. Cleared
   *  on the next `bump` so re-triggering revives the toast. */
  dismissToast: (jobId: string) => void;
}

export const useAIJobsStore = create<State>((set, get) => ({
  jobs: [],
  add: (job) => set((s) => {
    // De-dupe: a single job id may be re-added if the user toggles drawer
    // open/closed several times. Latest source info wins. A fresh add also
    // un-dismisses the toast — re-triggering should bring it back.
    const idx = s.jobs.findIndex((j) => j.jobId === job.jobId);
    if (idx >= 0) {
      const next = s.jobs.slice();
      next[idx] = { ...next[idx], ...job, hideFromToast: false };
      return { jobs: next };
    }
    // Append to the tail — the head is the "currently visible" toast and
    // shouldn't be replaced just because a new background job spun up.
    return { jobs: [...s.jobs, { ...job, hideFromToast: false }] };
  }),
  remove: (jobId) => set((s) => ({ jobs: s.jobs.filter((j) => j.jobId !== jobId) })),
  has: (jobId) => get().jobs.some((j) => j.jobId === jobId),
  findByKind: (kind) => get().jobs.find((j) => j.kind === kind),
  findSame: (kind, noteId) => get().jobs.find(
    (j) => j.kind === kind && (j.source.noteId ?? null) === (noteId ?? null),
  ),
  bump: (jobId) => set((s) => {
    const idx = s.jobs.findIndex((j) => j.jobId === jobId);
    if (idx < 0) return s;
    const next = s.jobs.slice();
    // Re-trigger revives the toast (in case it was previously X'd) and
    // animates with the fresh timestamp.
    next[idx] = { ...next[idx], bumpedAt: Date.now(), hideFromToast: false };
    return { jobs: next };
  }),
  dismissToast: (jobId) => set((s) => {
    const idx = s.jobs.findIndex((j) => j.jobId === jobId);
    if (idx < 0) return s;
    const next = s.jobs.slice();
    next[idx] = { ...next[idx], hideFromToast: true };
    return { jobs: next };
  }),
  hydrate: (jobs) => set((s) => {
    // Keep any in-memory entries the user added during this session that
    // the server hasn't returned yet (race during boot). Server is the
    // source of truth for everything else.
    const serverIds = new Set(jobs.map((j) => j.jobId));
    const localOnly = s.jobs.filter((j) => !serverIds.has(j.jobId));
    return { jobs: [...jobs, ...localOnly] };
  }),
}));


/**
 * Custom event dispatched when the user clicks "Open →" on a toast.
 * The target view listens for this and opens its drawer with the job id.
 *
 * Why event vs prop-drilling: views are deeply nested under DesktopShell;
 * passing an "openJobId" prop down through several layers is more invasive
 * than a single window event listener at the view level.
 */
export const AI_JOB_OPEN_EVENT = 'jarvnote:openAIJob';

export interface AIJobOpenDetail {
  jobId: string;
  kind: AIJobKind;
  source: AIJobSource;
}

export function dispatchOpenAIJob(detail: AIJobOpenDetail): void {
  window.dispatchEvent(new CustomEvent<AIJobOpenDetail>(AI_JOB_OPEN_EVENT, { detail }));
}

/**
 * Fired by a view when it closes an AI-job drawer (quiz / schedule / etc.).
 * AIToastStack listens so that "panel → pick job → close" returns the user
 * to the panel they came from instead of stranding them in an empty section.
 */
export const AI_JOB_DRAWER_CLOSED_EVENT = 'jarvnote:closedAIJob';

export function dispatchAIJobDrawerClosed(jobId: string): void {
  window.dispatchEvent(new CustomEvent<string>(AI_JOB_DRAWER_CLOSED_EVENT, { detail: jobId }));
}
