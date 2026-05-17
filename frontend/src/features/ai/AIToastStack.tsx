import { useCallback, useEffect, useState } from 'react';
import { aiApi } from '../../api/client';
import type { AIJobBrief, AIJobKind } from '../../api/types';
import {
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
  const [panelOpen, setPanelOpen] = useState(false);

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
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [hydrate]);

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
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer]);

  /** Dismiss a job from the UI only — never cancels the backend job.
   *  In-flight work continues; the result lands in cache and the next
   *  re-trigger picks it up. Dismissals are persisted to localStorage so
   *  the rehydrate-on-reload doesn't bring them back. */
  const handleDismiss = useCallback((jobId: string) => {
    remove(jobId);
    const dismissed = loadDismissed();
    dismissed.add(jobId);
    saveDismissed(dismissed);
  }, [remove]);

  if (jobs.length === 0) return null;
  const head = jobs[0];

  return (
    <>
      {!panelOpen && (
        <div className="ai-toast-stack">
          <AIGenerationToast
            key={head.jobId}
            jobId={head.jobId}
            bumpedAt={head.bumpedAt}
            queueCount={jobs.length - 1}
            onOpen={handleToastClick}
            onDismiss={() => handleDismiss(head.jobId)}
          />
        </div>
      )}
      <AIJobsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        jobs={jobs}
        onPickJob={handlePickFromPanel}
        onDismissJob={handleDismiss}
      />
    </>
  );
}
