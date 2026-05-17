import { useCallback, useState } from 'react';
import { aiApi } from '../../api/client';
import { dispatchOpenAIJob, useAIJobsStore, type BgAIJob } from '../../store/aiJobs';
import { AIGenerationToast } from './AIGenerationToast';
import { AIJobsPanel } from './AIJobsPanel';

/**
 * Mounted at the app shell level (outside DesktopApp's section routing) so it
 * survives navigation between Notes/Goals/Analysis. Renders the head of the
 * queue as a single toast with a "+N" badge; tapping the toast opens a panel
 * listing every backgrounded job, from which the user can pick one to reopen.
 */
export function AIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const remove = useAIJobsStore((s) => s.remove);
  const [panelOpen, setPanelOpen] = useState(false);

  const openSourceDrawer = useCallback((job: BgAIJob) => {
    // 1. Switch to the source section if we're not there.
    window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: job.source.section }));
    // 2. If this job belongs to a specific note, also select that note in the
    //    tree — otherwise NoteEditor renders the wrong (or no) note and the
    //    open-drawer event would no-op.
    if (job.source.noteId) {
      window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: job.source.noteId }));
    }
    // 3. Tell the view to reopen the right drawer with this jobId. Small
    //    delay so the section actually mounts before the event fires.
    setTimeout(() => {
      dispatchOpenAIJob({ jobId: job.jobId, kind: job.kind, source: job.source });
      remove(job.jobId);
    }, 80);
  }, [remove]);

  const handleToastClick = useCallback(() => {
    // Always open the queue panel — even with one job the user sees full
    // status (elapsed, error message) before deciding to open it.
    if (jobs.length > 0) setPanelOpen(true);
  }, [jobs.length]);

  const handlePickFromPanel = useCallback((job: BgAIJob) => {
    setPanelOpen(false);
    openSourceDrawer(job);
  }, [openSourceDrawer]);

  /** Real cancellation: hits the backend so a running task is preempted and
   *  pending ones are dropped from the queue. We then remove from the store
   *  regardless of API outcome — the toast/panel shouldn't get stuck if the
   *  request failed for a network blip. */
  const handleCancel = useCallback(async (jobId: string) => {
    try {
      await aiApi.cancelJob(jobId);
    } catch {
      // ignored — user already wanted it gone
    }
    remove(jobId);
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
            onDismiss={() => void handleCancel(head.jobId)}
          />
        </div>
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
