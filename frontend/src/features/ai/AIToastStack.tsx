import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi } from '../../api/client';
import type { AIJobBrief, AIJobKind, AIJobStatus } from '../../api/types';
import {
  AI_JOB_DRAWER_CLOSED_EVENT,
  AI_JOB_DRAWER_OPENED_EVENT,
  dispatchOpenAIJob,
  useAIJobsStore,
  type AIJobSource,
  type BgAIJob,
} from '../../store/aiJobs';
import { AIGenerationToast } from './AIGenerationToast';
import { AIJobsPanel } from './AIJobsPanel';

/** Map a server-side job into the UI's lightweight "background job" shape.
 *  Source (section / noteId / noteTitle) is derived from input_json since
 *  the server doesn't store the UI's routing hints separately. */
function deriveBgJob(j: AIJobBrief): BgAIJob {
  return {
    jobId: j.id,
    kind: j.kind as AIJobKind,
    source: deriveSource(j),
  };
}

function deriveSource(j: AIJobBrief): AIJobSource {
  if (j.kind === 'schedule') return { section: 'goals' };
  if (j.kind === 'insights') return { section: 'analysis' };
  // quiz: noteId only when scope.kind='note'; noteTitle comes from
  // server-resolved display_title (real note name for single-note quizzes,
  // "all notes" / "N notes" for cross-notes ones).
  const input = (j.input_json ?? {}) as Record<string, unknown>;
  const scope = (input.scope ?? {}) as Record<string, unknown>;
  const noteId = scope.kind === 'note' ? (scope.id as string | undefined) : undefined;
  const noteTitle = j.display_title ?? undefined;
  return { section: 'notes', noteId, noteTitle };
}

// ─── Dismissed-job memory (localStorage) ─────────────────────────────────
// User-X'd job ids are persisted so a page refresh doesn't bring them back
// from the server's history list. We cap the set so it can't grow forever.
const DISMISSED_KEY = 'jarvnote:ai-jobs:dismissed';
const DISMISSED_MAX = 200;

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    const arr = Array.from(set);
    const trimmed = arr.length > DISMISSED_MAX ? arr.slice(arr.length - DISMISSED_MAX) : arr;
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full / disabled — best-effort, dismissals just won't persist
  }
}

/**
 * Mounted at the app shell level (outside DesktopApp's section routing) so it
 * survives navigation between Notes/Goals/Analysis. Renders the head of the
 * queue as a single toast with a "+N" badge; tapping the toast opens a panel
 * listing every backgrounded job, from which the user can pick one to reopen.
 */
export function AIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const remove = useAIJobsStore((s) => s.remove);
  const hydrate = useAIJobsStore((s) => s.hydrate);
  const dismissToast = useAIJobsStore((s) => s.dismissToast);
  const [panelOpen, setPanelOpen] = useState(false);
  // Per-job status snapshot, refreshed at the stack level. Used only to
  // split jobs into "working" vs "completed" sub-toasts — each toast still
  // polls its own live status via useAIJob for the elapsed/progress UI.
  const [statusMap, setStatusMap] = useState<Map<string, AIJobStatus>>(new Map());
  // When the user opens a job from the panel, we close the panel so the
  // drawer can take over the right side. This ref remembers that the panel
  // *should* reappear once the drawer closes (otherwise navigation feels
  // like a one-way trip).
  const reopenPanelAfterCloseRef = useRef<string | null>(null);
  // jobIds of drawers currently mounted somewhere in the tree. Used to hide
  // the bottom toasts so they don't sit on top of the result the user just
  // opened (e.g. "Quiz ready" toast over an open QuizDrawer).
  const [openDrawerIds, setOpenDrawerIds] = useState<ReadonlySet<string>>(new Set());

  // Rehydrate from the backend on boot so refreshing the page doesn't lose
  // in-flight / recent jobs (the store is in-memory). Failures are silent
  // — worst case the user sees an empty queue and a fresh-started job
  // populates it through the normal addBgJob path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recent = await aiApi.listJobs(20);
        if (cancelled) return;
        const dismissed = loadDismissed();
        hydrate(recent
          .filter((j) => !dismissed.has(j.id))
          .map(deriveBgJob));
        const m = new Map<string, AIJobStatus>();
        for (const j of recent) m.set(j.id, j.status);
        setStatusMap(m);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [hydrate]);

  // Refresh the status map every 3s while any job exists. Matches useAIJob's
  // cadence; results feed the working-vs-completed split below.
  useEffect(() => {
    if (jobs.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const recent = await aiApi.listJobs(50);
        if (cancelled) return;
        const m = new Map<string, AIJobStatus>();
        for (const j of recent) m.set(j.id, j.status);
        setStatusMap(m);
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [jobs.length]);

  // Split into the two sub-toast slots and also produce a fully-ordered
  // list for the panel. Order: running first, then queued, then done/failed
  // /cancelled. Unknown-status (just-added, not yet in statusMap) is
  // treated as queued — the natural state of a fresh job.
  const { workingJobs, completedJobs, orderedJobs } = useMemo(() => {
    const running: BgAIJob[] = [];
    const queued: BgAIJob[] = [];
    const completed: BgAIJob[] = [];
    for (const j of jobs) {
      const s = statusMap.get(j.jobId);
      if (s === 'running') running.push(j);
      else if (s === 'done' || s === 'failed' || s === 'cancelled') completed.push(j);
      else queued.push(j);  // queued or unknown
    }
    return {
      workingJobs: [...running, ...queued],
      completedJobs: completed,
      orderedJobs: [...running, ...queued, ...completed],
    };
  }, [jobs, statusMap]);

  // Track which AI-job drawers are currently mounted. The drawers fire
  // OPENED on mount and CLOSED on unmount; we accumulate the live set and
  // also use the CLOSED event to honour `reopenPanelAfterCloseRef`.
  useEffect(() => {
    const onOpened = (e: Event) => {
      const jobId = (e as CustomEvent<string>).detail;
      setOpenDrawerIds((prev) => {
        if (prev.has(jobId)) return prev;
        const next = new Set(prev);
        next.add(jobId);
        return next;
      });
    };
    const onClosed = (e: Event) => {
      const jobId = (e as CustomEvent<string>).detail;
      setOpenDrawerIds((prev) => {
        if (!prev.has(jobId)) return prev;
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
      if (reopenPanelAfterCloseRef.current && reopenPanelAfterCloseRef.current === jobId) {
        reopenPanelAfterCloseRef.current = null;
        setPanelOpen(true);
      }
    };
    window.addEventListener(AI_JOB_DRAWER_OPENED_EVENT, onOpened);
    window.addEventListener(AI_JOB_DRAWER_CLOSED_EVENT, onClosed);
    return () => {
      window.removeEventListener(AI_JOB_DRAWER_OPENED_EVENT, onOpened);
      window.removeEventListener(AI_JOB_DRAWER_CLOSED_EVENT, onClosed);
    };
  }, []);

  const openSourceDrawer = useCallback((job: BgAIJob) => {
    // 1. Switch to the source section if we're not there.
    window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: job.source.section }));
    // 2. If this job belongs to a specific note, also select that note in
    //    the tree — otherwise NoteEditor renders the wrong (or no) note.
    if (job.source.noteId) {
      window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: job.source.noteId }));
    }
    // 3. Tell the view to reopen the drawer for this jobId. Small delay so
    //    the section actually mounts before the event fires. We do NOT
    //    remove the job from the store — it stays in the AI-jobs panel as
    //    history; the user can dismiss it explicitly via X.
    setTimeout(() => {
      dispatchOpenAIJob({ jobId: job.jobId, kind: job.kind, source: job.source });
    }, 80);
  }, []);

  const handleToastClick = useCallback(() => {
    // Always open the queue panel — even with one job the user sees full
    // status (elapsed, error message) before deciding to open it.
    if (jobs.length > 0) setPanelOpen(true);
  }, [jobs.length]);

  const handlePickFromPanel = useCallback((job: BgAIJob) => {
    // Remember the source so closing the drawer reopens the panel.
    reopenPanelAfterCloseRef.current = job.jobId;
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer]);

  /** Toast X — soft dismissal. The job stays in the AI tasks panel; only
   *  the bottom toast slot is hidden. Re-triggering via `bump` brings the
   *  toast back. Backend work is never cancelled. */
  const handleDismissToast = useCallback((jobId: string) => {
    dismissToast(jobId);
  }, [dismissToast]);

  /** Panel X — full dismissal. Removes the job from the store entirely and
   *  persists the id to localStorage so rehydrate-on-reload doesn't bring
   *  it back. Backend work is never cancelled. */
  const handleDismissFully = useCallback((jobId: string) => {
    remove(jobId);
    const dismissed = loadDismissed();
    dismissed.add(jobId);
    saveDismissed(dismissed);
  }, [remove]);

  if (jobs.length === 0) return null;
  // While any AI-job drawer is on screen, suppress the bottom toasts entirely
  // — including "Queued"/"Generating" toasts for unrelated jobs. They'd
  // otherwise sit on top of the result the user just opened. The panel still
  // surfaces those jobs when reopened.
  const anyDrawerOpen = openDrawerIds.size > 0;
  // Each visible job gets its own toast. `hideFromToast` is the user's
  // soft-dismiss; the job stays in the panel either way. Order: working
  // first, then completed — with `column-reverse` on the stack this puts
  // newer completed/working toasts visually higher.
  const visibleJobs = [
    ...workingJobs.filter((j) => !j.hideFromToast),
    ...completedJobs.filter((j) => !j.hideFromToast),
  ];

  return (
    <>
      {!panelOpen && !anyDrawerOpen && visibleJobs.length > 0 && (
        <div className="ai-toast-stack">
          {visibleJobs.map((j) => (
            <AIGenerationToast
              key={j.jobId}
              jobId={j.jobId}
              bumpedAt={j.bumpedAt}
              sourceTitle={j.source.noteTitle}
              onOpen={handleToastClick}
              onDismiss={() => handleDismissToast(j.jobId)}
            />
          ))}
        </div>
      )}
      <AIJobsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        jobs={orderedJobs}
        onPickJob={handlePickFromPanel}
        onDismissJob={handleDismissFully}
      />
    </>
  );
}
