import { useCallback } from 'react';
import { dispatchOpenAIJob, useAIJobsStore, type BgAIJob } from '../../store/aiJobs';
import { AIGenerationToast } from './AIGenerationToast';

/**
 * Mounted at the app shell level (outside DesktopApp's section routing) so it
 * survives navigation between Notes/Goals/Analysis. Reads all backgrounded AI
 * jobs from the global store and stacks one toast per job in the bottom-right.
 *
 * Click "Open →" navigates to the source section + dispatches a custom event
 * the target view listens for to reopen the right drawer.
 */
export function AIToastStack() {
  const jobs = useAIJobsStore((s) => s.jobs);
  const remove = useAIJobsStore((s) => s.remove);

  const handleOpen = useCallback((job: BgAIJob) => {
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

  if (jobs.length === 0) return null;

  return (
    <div className="ai-toast-stack">
      {jobs.map((job) => (
        <AIGenerationToast
          key={job.jobId}
          jobId={job.jobId}
          onOpen={() => handleOpen(job)}
          onDismiss={() => remove(job.jobId)}
        />
      ))}
    </div>
  );
}
