import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import { confirmDialog } from '../../../components/ui/ConfirmDialog';
import type { AIJobBrief, AIJobKind, AIJobStatus } from '../../../api/types';
import {
  AI_JOB_DRAWER_CLOSED_EVENT,
  AI_JOB_DRAWER_OPENED_EVENT,
  dispatchOpenAIJob,
  useAIJobsStore,
  type AIJobSource,
  type BgAIJob,
} from '../../../store/aiJobs';
import { MobileAIToast } from './MobileAIToast';
import { MobileAIJobsPanel } from './MobileAIJobsPanel';
import { OPEN_AI_PANEL_EVENT } from './MobileTopBar';

/** Map a server job into the lightweight bg shape (same as desktop's
 *  AIToastStack.deriveBgJob). Keep in sync — both surfaces read from the
 *  same backend list. */
function deriveBgJob(j: AIJobBrief): BgAIJob {
  return { jobId: j.id, kind: j.kind as AIJobKind, source: deriveSource(j) };
}
function deriveSource(j: AIJobBrief): AIJobSource {
  if (j.kind === 'schedule')   return { section: 'goals' };
  if (j.kind === 'insights')   return { section: 'analysis' };
  if (j.kind === 'coach')      return { section: 'analysis' };
  if (j.kind === 'sprint_plan') return { section: 'sprints' };
  if (j.kind === 'goal_plan')
    return { section: 'goals', noteTitle: j.display_title ?? undefined };
  const input = (j.input_json ?? {}) as Record<string, unknown>;
  const scope = (input.scope ?? {}) as Record<string, unknown>;
  const noteId = scope.kind === 'note' ? (scope.id as string | undefined) : undefined;
  const noteTitle = j.display_title ?? undefined;
  return { section: 'notes', noteId, noteTitle };
}

// Persisted soft-dismiss flags — mirror of desktop's AIToastStack so a user
// switching between mobile / desktop sees the same dismissed-job state.
const HIDDEN_KEY = 'jarvnote:ai-jobs:hidden';
const HIDDEN_MAX = 200;

type HiddenMap = Record<string, { toast?: true; panel?: true }>;

function loadHidden(): HiddenMap {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}
function saveHidden(map: HiddenMap) {
  try {
    const entries = Object.entries(map);
    const trimmed = entries.length > HIDDEN_MAX
      ? Object.fromEntries(entries.slice(entries.length - HIDDEN_MAX))
      : map;
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(trimmed));
  } catch { /* best-effort */ }
}
function markHidden(jobId: string, surface: 'toast' | 'panel') {
  const cur = loadHidden();
  const entry = cur[jobId] ?? {};
  entry[surface] = true;
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
 * Mobile counterpart to desktop AIToastStack. Renders the head of the
 * working / completed queues as a single bottom-pinned toast above the tab
 * bar; tap → opens MobileAIJobsPanel with the full list.
 *
 * Mounted at the App level (sibling to MobileApp) so it survives all tab
 * navigation while a job runs.
 */
export function MobileAIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const hydrate = useAIJobsStore((s) => s.hydrate);
  const dismissToast = useAIJobsStore((s) => s.dismissToast);
  const dismissPanel = useAIJobsStore((s) => s.dismissPanel);
  const bump = useAIJobsStore((s) => s.bump);

  const [panelOpen, setPanelOpen] = useState(false);
  const [statusMap, setStatusMap] = useState<Map<string, AIJobStatus>>(new Map());
  const reopenPanelAfterCloseRef = useRef<string | null>(null);
  const [openDrawerIds, setOpenDrawerIds] = useState<ReadonlySet<string>>(new Set());

  // Hydrate from backend on mount + reapply persisted dismiss flags.
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
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [hydrate]);

  // Persist any flag clearings (when a bump or fresh add un-hides a job).
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

  // Status refresh tick — keeps the "working vs completed" split fresh.
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

  // Listen for AI-job drawer mount/unmount events. While any result drawer
  // is on screen, suppress the bottom toast so it doesn't sit on top of
  // the result the user just opened.
  useEffect(() => {
    const onOpened = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setOpenDrawerIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev); next.add(id); return next;
      });
    };
    const onClosed = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setOpenDrawerIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev); next.delete(id); return next;
      });
      if (reopenPanelAfterCloseRef.current === id) {
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

  // Split jobs into working vs completed and produce an ordered panel list.
  const { workingJobs, completedJobs, orderedJobs } = useMemo(() => {
    const running: BgAIJob[] = [];
    const queued: BgAIJob[] = [];
    const completed: BgAIJob[] = [];
    for (const j of jobs) {
      const s = statusMap.get(j.jobId);
      if (s === 'running') running.push(j);
      else if (s === 'done' || s === 'failed' || s === 'cancelled') completed.push(j);
      else queued.push(j);
    }
    return {
      workingJobs: [...running, ...queued],
      completedJobs: completed,
      orderedJobs: [...running, ...queued, ...completed].filter((j) => !j.hideFromPanel),
    };
  }, [jobs, statusMap]);

  const openSourceDrawer = useCallback((job: BgAIJob) => {
    // Switch tab to the job's section. Result drawer wiring is per-section;
    // for now we just route. On mobile the screens listen for the open-job
    // event and surface a sheet with the result. If a screen doesn't handle
    // a particular kind yet, the user just lands on the section.
    window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: job.source.section }));
    if (job.source.noteId) {
      window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: job.source.noteId }));
    }
    setTimeout(() => {
      dispatchOpenAIJob({ jobId: job.jobId, kind: job.kind, source: job.source });
    }, 80);
  }, []);

  const handleToastClick = useCallback((jobId: string) => {
    if (jobs.length > 0) setPanelOpen(true);
    // Terminal toast click = ack → auto-dismiss so it doesn't re-appear
    // after closing the panel.
    const s = statusMap.get(jobId);
    if (s === 'done' || s === 'failed' || s === 'cancelled') {
      dismissToast(jobId);
      markHidden(jobId, 'toast');
    }
  }, [jobs.length, statusMap, dismissToast]);

  const handlePickFromPanel = useCallback((job: BgAIJob) => {
    if (job.hideFromToast || job.hideFromPanel) {
      bump(job.jobId);
      unmarkHidden(job.jobId);
    }
    // Auto-hide toast on engagement — same as desktop.
    dismissToast(job.jobId);
    markHidden(job.jobId, 'toast');
    reopenPanelAfterCloseRef.current = job.jobId;
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer, bump, dismissToast]);

  // Tapping the × on any single toast dismisses ALL currently visible
  // toasts at once — matches the "tap the toast → open the panel and the
  // toasts disappear" pattern. The user shouldn't have to dismiss 3 in
  // a row to clear the bottom of the screen.
  const handleDismissAllToasts = useCallback(() => {
    const visible = [...workingJobs, ...completedJobs].filter((j) => !j.hideFromToast);
    for (const j of visible) {
      dismissToast(j.jobId);
      markHidden(j.jobId, 'toast');
    }
  }, [workingJobs, completedJobs, dismissToast]);

  // Open the AI panel when the header's AI button (or anything else)
  // dispatches OPEN_AI_PANEL_EVENT. Lets external surfaces drive the
  // sheet without needing direct state access.
  useEffect(() => {
    const handler = () => setPanelOpen(true);
    window.addEventListener(OPEN_AI_PANEL_EVENT, handler);
    return () => window.removeEventListener(OPEN_AI_PANEL_EVENT, handler);
  }, []);

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
      try { await aiApi.cancelJob(job.jobId); }
      catch (e: any) { toast.error(e?.detail ?? e?.message ?? 'Failed to cancel task'); return; }
    }
    dismissPanel(job.jobId);
    markHidden(job.jobId, 'panel');
  }, [statusMap, dismissPanel]);

  const handleClearCompleted = useCallback(() => {
    for (const j of completedJobs) {
      dismissPanel(j.jobId);
      markHidden(j.jobId, 'panel');
    }
  }, [completedJobs, dismissPanel]);

  // Render decision: head of each category (running+queued vs completed),
  // collapsing to one toast with "+N" badge when ≥3 visible in a category.
  const anyDrawerOpen = openDrawerIds.size > 0;
  if (jobs.length === 0) return null;
  const COLLAPSE_AT = 3;
  const collapse = (list: BgAIJob[]): { heads: BgAIJob[]; extra: number } => {
    const visible = list.filter((j) => !j.hideFromToast);
    if (visible.length < COLLAPSE_AT) return { heads: visible, extra: 0 };
    return { heads: [visible[0]], extra: visible.length - 1 };
  };
  const workingSlot = collapse(workingJobs);
  const completedSlot = collapse(completedJobs);
  const renderable: Array<{ job: BgAIJob; extra: number }> = [
    ...workingSlot.heads.map((j, i) => ({ job: j, extra: i === 0 ? workingSlot.extra : 0 })),
    ...completedSlot.heads.map((j, i) => ({ job: j, extra: i === 0 ? completedSlot.extra : 0 })),
  ];

  return (
    <>
      {!panelOpen && !anyDrawerOpen && renderable.length > 0 && (
        <div className="m-ai-toast-slot">
          {renderable.map(({ job, extra }) => (
            <MobileAIToast
              key={job.jobId}
              jobId={job.jobId}
              bumpedAt={job.bumpedAt}
              sourceTitle={job.source.noteTitle}
              extraCount={extra}
              onOpen={() => handleToastClick(job.jobId)}
              onDismiss={handleDismissAllToasts}
            />
          ))}
        </div>
      )}
      <MobileAIJobsPanel
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
