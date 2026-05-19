import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aiApi } from '../../api/client';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
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
  if (j.kind === 'sprint_plan') return { section: 'sprints' };
  // quiz: noteId only when scope.kind='note'; noteTitle comes from
  // server-resolved display_title (real note name for single-note quizzes,
  // "all notes" / "N notes" for cross-notes ones).
  const input = (j.input_json ?? {}) as Record<string, unknown>;
  const scope = (input.scope ?? {}) as Record<string, unknown>;
  const noteId = scope.kind === 'note' ? (scope.id as string | undefined) : undefined;
  const noteTitle = j.display_title ?? undefined;
  return { section: 'notes', noteId, noteTitle };
}

// ─── Soft-dismiss persistence ────────────────────────────────────────────
// We persist per-job dismiss flags (toast / panel) so reloading the page
// keeps the user's choices: previously-closed toasts don't pop back, and
// jobs cleared from the AI tasks panel stay cleared. We never remove jobs
// from the store on user-action — they stay around so `findSame` can hit
// the backend cache and re-open the existing result instead of running a
// fresh generation.
const HIDDEN_KEY = 'jarvnote:ai-jobs:hidden';
const HIDDEN_MAX = 200;

type HiddenMap = Record<string, { toast?: true; panel?: true }>;

function loadHidden(): HiddenMap {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveHidden(map: HiddenMap) {
  try {
    const entries = Object.entries(map);
    const trimmed = entries.length > HIDDEN_MAX
      ? Object.fromEntries(entries.slice(entries.length - HIDDEN_MAX))
      : map;
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full / disabled — best-effort, dismissals just won't persist
  }
}

function markHidden(jobId: string, surface: 'toast' | 'panel') {
  const cur = loadHidden();
  const entry = cur[jobId] ?? {};
  entry[surface] = true;
  // Panel dismiss implies toast dismiss too — they're nested.
  if (surface === 'panel') entry.toast = true;
  cur[jobId] = entry;
  saveHidden(cur);
}

function unmarkHidden(jobId: string) {
  const cur = loadHidden();
  if (!(jobId in cur)) return;
  delete cur[jobId];
  saveHidden(cur);
}

/**
 * Mounted at the app shell level (outside DesktopApp's section routing) so it
 * survives navigation between Notes/Goals/Analysis. Renders the head of the
 * queue as a single toast with a "+N" badge; tapping the toast opens a panel
 * listing every backgrounded job, from which the user can pick one to reopen.
 */
export function AIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const hydrate = useAIJobsStore((s) => s.hydrate);
  const dismissToast = useAIJobsStore((s) => s.dismissToast);
  const dismissPanel = useAIJobsStore((s) => s.dismissPanel);
  const bump = useAIJobsStore((s) => s.bump);
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
  // in-flight / recent jobs (the store is in-memory). We also re-apply any
  // persisted soft-dismiss flags here so a refresh respects the user's
  // earlier "X" clicks on the toast / panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const recent = await aiApi.listJobs(20);
        if (cancelled) return;
        const hidden = loadHidden();
        hydrate(recent.map((j) => {
          const bg = deriveBgJob(j);
          const flag = hidden[j.id];
          if (flag?.toast) bg.hideFromToast = true;
          if (flag?.panel) bg.hideFromPanel = true;
          return bg;
        }));
        const m = new Map<string, AIJobStatus>();
        for (const j of recent) m.set(j.id, j.status);
        setStatusMap(m);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [hydrate]);

  // Keep the persisted hidden-flags in sync with the store. Whenever a job
  // is re-engaged (bump from re-triggering, or NoteEditor calling addBgJob
  // on drawer close), its in-store flags reset to false. Mirror that into
  // localStorage so a reload doesn't re-hide a job the user has revisited.
  useEffect(() => {
    const hidden = loadHidden();
    let changed = false;
    for (const j of jobs) {
      const flag = hidden[j.jobId];
      if (!flag) continue;
      if (!j.hideFromToast && flag.toast) { delete flag.toast; changed = true; }
      if (!j.hideFromPanel && flag.panel) { delete flag.panel; changed = true; }
      if (!flag.toast && !flag.panel) { delete hidden[j.jobId]; changed = true; }
    }
    if (changed) saveHidden(hidden);
  }, [jobs]);

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
  // treated as queued — the natural state of a fresh job. Panel filters
  // out `hideFromPanel` jobs (user clicked X in the sidebar); the toast
  // filters out `hideFromToast` later in render.
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
    const all = [...running, ...queued, ...completed];
    return {
      workingJobs: [...running, ...queued],
      completedJobs: completed,
      orderedJobs: all.filter((j) => !j.hideFromPanel),
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
    // Opening a job clears its dismissed flags — the user is actively
    // engaging with it again, so its hash/cache is meaningful and either
    // surface (toast / panel) should reappear next time it bumps.
    if (job.hideFromToast || job.hideFromPanel) {
      bump(job.jobId);
      unmarkHidden(job.jobId);
    }
    reopenPanelAfterCloseRef.current = job.jobId;
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer, bump]);

  /** Toast X — soft dismissal. The job stays in the AI tasks panel and in
   *  the store (so the backend cache_key keeps working: next trigger of
   *  the same generation opens this result via findSame, not a fresh run).
   *  Persisted to localStorage so reload doesn't bring the toast back. */
  const handleDismissToast = useCallback((jobId: string) => {
    dismissToast(jobId);
    markHidden(jobId, 'toast');
  }, [dismissToast]);

  /** Panel X handler — status-dependent.
   *
   *  Running / queued: ask first, then call POST /ai/jobs/{id}/cancel. We
   *  also soft-dismiss the row so it disappears immediately (the next poll
   *  will reflect status='cancelled' anyway, but waiting feels laggy).
   *
   *  Done / failed / cancelled: pure soft dismiss (same as before) — job
   *  stays in the store so re-triggering the same kind+source still hits
   *  the backend cache via findSame instead of starting a fresh run. */
  const handlePanelX = useCallback(async (job: BgAIJob) => {
    const s = statusMap.get(job.jobId) ?? 'queued';
    const isActive = s === 'running' || s === 'queued';
    if (isActive) {
      const ok = await confirmDialog({
        title: 'Cancel this AI task?',
        body: 'It will stop right now and the result will not be saved.',
        confirmLabel: 'Cancel task',
        cancelLabel: 'Keep running',
        danger: true,
      });
      if (!ok) return;
      try {
        await aiApi.cancelJob(job.jobId);
      } catch (e: any) {
        toast.error(e?.detail ?? e?.message ?? 'Failed to cancel task');
        return;
      }
    }
    dismissPanel(job.jobId);
    markHidden(job.jobId, 'panel');
  }, [statusMap, dismissPanel]);

  /** Clear-completed: soft-dismiss every row whose status is in {done,failed,cancelled}.
   *  No confirmation — destination is the panel only; the underlying jobs
   *  stay in the store so the backend cache still works. */
  const handleClearCompleted = useCallback(() => {
    for (const j of completedJobs) {
      dismissPanel(j.jobId);
      markHidden(j.jobId, 'panel');
    }
  }, [completedJobs, dismissPanel]);

  if (jobs.length === 0) return null;
  // While any AI-job drawer is on screen, suppress the bottom toasts entirely
  // — including "Queued"/"Generating" toasts for unrelated jobs. They'd
  // otherwise sit on top of the result the user just opened. The panel still
  // surfaces those jobs when reopened.
  const anyDrawerOpen = openDrawerIds.size > 0;
  // Per-category collapsing: when a category has ≥3 visible jobs, show
  // just its head with a "+N" capsule (N = others - 1) instead of N
  // separate toasts. Below 3 we still render each job on its own.
  const COLLAPSE_AT = 3;
  const collapse = (list: BgAIJob[]): { heads: BgAIJob[]; extra: number } => {
    const visible = list.filter((j) => !j.hideFromToast);
    if (visible.length < COLLAPSE_AT) return { heads: visible, extra: 0 };
    return { heads: [visible[0]], extra: visible.length - 1 };
  };
  const workingSlot = collapse(workingJobs);
  const completedSlot = collapse(completedJobs);
  const renderable: Array<{ job: BgAIJob; extra: number }> = [
    ...workingSlot.heads.map((j, i) => ({
      job: j,
      extra: i === 0 ? workingSlot.extra : 0,
    })),
    ...completedSlot.heads.map((j, i) => ({
      job: j,
      extra: i === 0 ? completedSlot.extra : 0,
    })),
  ];

  return (
    <>
      {!panelOpen && !anyDrawerOpen && renderable.length > 0 && (
        <div className="ai-toast-stack">
          {renderable.map(({ job, extra }) => (
            <AIGenerationToast
              key={job.jobId}
              jobId={job.jobId}
              bumpedAt={job.bumpedAt}
              sourceTitle={job.source.noteTitle}
              extraCount={extra}
              onOpen={handleToastClick}
              onDismiss={() => handleDismissToast(job.jobId)}
            />
          ))}
        </div>
      )}
      <AIJobsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        jobs={orderedJobs}
        statusMap={statusMap}
        onPickJob={handlePickFromPanel}
        onJobX={handlePanelX}
        onClearCompleted={handleClearCompleted}
      />
    </>
  );
}
