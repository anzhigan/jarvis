import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { aiApi } from '../../api/client';
import type { AIJobBrief, AIJobKind } from '../../api/types';
import {
  dispatchOpenAIJob,
  useAIJobsStore,
  type AIJobSource,
  type BgAIJob,
} from '../../store/aiJobs';
import { AIJobsPanel } from './AIJobsPanel';
import './ai.css';

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
  const input = (j.input_json ?? {}) as Record<string, unknown>;
  const scope = (input.scope ?? {}) as Record<string, unknown>;
  const noteId = scope.kind === 'note' ? (scope.id as string | undefined) : undefined;
  const noteTitle = j.display_title ?? undefined;
  return { section: 'notes', noteId, noteTitle };
}

// ─── Dismissed-job memory (localStorage) ─────────────────────────────────
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
    // best-effort
  }
}

/**
 * App-shell-level launcher for the AI jobs sidebar. Renders a tiny pill in
 * the bottom-right corner that shows the active job count and opens the
 * full panel on click. No per-job status preview, no shake — the panel
 * itself is the single visualisation of "what's running" and "what
 * finished" (toasts have been removed by design).
 */
export function AIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const remove = useAIJobsStore((s) => s.remove);
  const hydrate = useAIJobsStore((s) => s.hydrate);
  const [panelOpen, setPanelOpen] = useState(false);

  // Rehydrate from the backend on boot so refreshing the page doesn't lose
  // in-flight / recent jobs. Filters out anything the user has explicitly
  // dismissed (persisted in localStorage).
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
    // 1. Switch to the source section.
    window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: job.source.section }));
    // 2. For per-note jobs, also select the note in the tree so the editor
    //    that listens for the open event is showing the right note.
    if (job.source.noteId) {
      window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: job.source.noteId }));
    }
    // 3. Tell the view to reopen the drawer for this jobId. Small delay so
    //    the section mounts first. Job stays in the store as history; the
    //    user dismisses it via X.
    setTimeout(() => {
      dispatchOpenAIJob({ jobId: job.jobId, kind: job.kind, source: job.source });
    }, 80);
  }, []);

  const handlePickFromPanel = useCallback((job: BgAIJob) => {
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer]);

  /** Dismiss a job from the UI. For in-flight jobs this also cancels on
   *  the backend (idempotent for done jobs). Persisted to localStorage so
   *  the rehydrate-on-reload doesn't bring it back. */
  const handleCancel = useCallback(async (jobId: string) => {
    try {
      await aiApi.cancelJob(jobId);
    } catch {
      // ignored — user already wanted it gone
    }
    remove(jobId);
    const dismissed = loadDismissed();
    dismissed.add(jobId);
    saveDismissed(dismissed);
  }, [remove]);

  return (
    <>
      {jobs.length > 0 && !panelOpen && (
        <button
          type="button"
          className="ai-jobs-launcher"
          onClick={() => setPanelOpen(true)}
          title="Open AI tasks"
        >
          <Sparkles size={13} />
          <span>AI · {jobs.length}</span>
        </button>
      )}
      <AIJobsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        jobs={jobs}
        onPickJob={handlePickFromPanel}
        onDismissJob={handleCancel}
      />
    </>
  );
}
