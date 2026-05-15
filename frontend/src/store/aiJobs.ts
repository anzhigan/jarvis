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
}

export interface BgAIJob {
  jobId: string;
  kind: AIJobKind;
  source: AIJobSource;
}

interface State {
  /** Order matters — newest job on top of the stack. */
  jobs: BgAIJob[];
  add: (job: BgAIJob) => void;
  remove: (jobId: string) => void;
  has: (jobId: string) => boolean;
}

export const useAIJobsStore = create<State>((set, get) => ({
  jobs: [],
  add: (job) => set((s) => {
    // De-dupe: a single job id may be re-added if the user toggles drawer
    // open/closed several times. Latest source info wins.
    const idx = s.jobs.findIndex((j) => j.jobId === job.jobId);
    if (idx >= 0) {
      const next = s.jobs.slice();
      next[idx] = job;
      return { jobs: next };
    }
    // Newest on top.
    return { jobs: [job, ...s.jobs] };
  }),
  remove: (jobId) => set((s) => ({ jobs: s.jobs.filter((j) => j.jobId !== jobId) })),
  has: (jobId) => get().jobs.some((j) => j.jobId === jobId),
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
