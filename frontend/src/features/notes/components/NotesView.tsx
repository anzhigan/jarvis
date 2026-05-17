import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import {
  AI_JOB_OPEN_EVENT,
  dispatchAIJobDrawerClosed,
  useAIJobsStore,
  type AIJobOpenDetail,
} from '../../../store/aiJobs';
import { useNotesLibrary } from '../hooks/useNotesLibrary';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteAutoSave } from '../hooks/useNoteAutoSave';
import { NotesPane } from './NotesPane';
import { NoteEditor } from './NoteEditor';
import './notes.css';

// Lazy-load the QuizDrawer used for the multi-note ("all notes") variant —
// the per-note one is loaded by NoteEditor under the same name; both end
// up sharing the chunk after Vite dedup.
const QuizDrawer = lazy(() => import('../../ai/QuizDrawer').then((m) => ({ default: m.QuizDrawer })));
const AITestPicker = lazy(() => import('../../ai/AITestPicker').then((m) => ({ default: m.AITestPicker })));

const PANE_COLLAPSED_KEY = 'jarvnote:notes:libCollapsed';

export default function NotesView() {
  const library = useNotesLibrary();
  const editor  = useNoteEditor(library);
  const save    = useNoteAutoSave(() => { void library.refresh(); });

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
    // Tell the rail's sidebar-toggle about our current state so it can show
    // an active indicator on the rail button.
    window.dispatchEvent(new CustomEvent('jarvnote:notesPaneState', {
      detail: paneCollapsed,
    }));
  }, [paneCollapsed]);

  // Listen for toggle requests from the rail button (DesktopShell). The rail
  // owns the visible toggle; this view just owns the boolean.
  useEffect(() => {
    const handler = () => setPaneCollapsed((c) => !c);
    window.addEventListener('jarvnote:toggleNotesPane', handler);
    return () => window.removeEventListener('jarvnote:toggleNotesPane', handler);
  }, []);

  // Cross-section open: AIToastStack dispatches this when user clicks "Open →"
  // on a quiz/tasks toast originating from a different note than currently
  // shown. We re-select that note so the NoteEditor receives it.
  useEffect(() => {
    const handler = (e: Event) => {
      const noteId = (e as CustomEvent<string>).detail;
      if (noteId) editor.setSelectedNoteId(noteId);
    };
    window.addEventListener('jarvnote:openNote', handler);
    return () => window.removeEventListener('jarvnote:openNote', handler);
  }, [editor]);

  // ── "Smart test on all notes" — multi-note quiz state lives at the view
  // level (no specific NoteEditor is required, so we can't put the drawer
  // there). Same backgrounding pattern as the per-note quiz.
  const [multiQuizJobId, setMultiQuizJobId] = useState<string | null>(null);
  const [multiQuizDrawerOpen, setMultiQuizDrawerOpen] = useState(false);
  const addBgJob = useAIJobsStore((s) => s.add);

  // Picker dialog state for the "ai test" entry point.
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSmartTestAll = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const handlePickerConfirm = useCallback(async (ids: string[]) => {
    setPickerOpen(false);
    if (ids.length === 0) return;
    // Same-task guard: a quiz with no noteId is the multi-quiz slot. If it
    // already exists and is done, open it; otherwise let the AI tasks
    // sidebar show progress.
    const inBg = useAIJobsStore.getState().findSame('quiz', undefined);
    if (inBg) {
      try {
        const live = await aiApi.getJob(inBg.jobId);
        if (live.status === 'done') {
          setMultiQuizJobId(inBg.jobId);
          setMultiQuizDrawerOpen(true);
        }
      } catch { /* ignore */ }
      return;
    }
    if (multiQuizJobId && multiQuizDrawerOpen) return;
    try {
      const count = ids.length === 1 ? 5
                  : ids.length <= 3  ? 7
                                     : 10;
      const job = await aiApi.createQuiz({
        scope: { kind: 'multi', ids },
        difficulty: 'medium',
        count,
      });
      const noteTitle = ids.length === 1
        ? (library.findNote(ids[0])?.note.name || 'note')
        : `${ids.length} notes`;
      addBgJob({
        jobId: job.id,
        kind: 'quiz',
        source: { section: 'notes', noteTitle },
      });
      // Cached-done jobs pop the drawer immediately. Otherwise the user
      // watches progress in the AI tasks sidebar.
      if (job.status === 'done') {
        setMultiQuizJobId(job.id);
        setMultiQuizDrawerOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start quiz');
    }
  }, [multiQuizJobId, multiQuizDrawerOpen, addBgJob, library]);

  const handleMultiQuizClose = useCallback(() => {
    setMultiQuizDrawerOpen(false);
    if (multiQuizJobId) {
      addBgJob({
        jobId: multiQuizJobId,
        kind: 'quiz',
        source: { section: 'notes', noteTitle: 'all notes' },
      });
      // Lets AIToastStack reopen its panel if the user originally launched
      // this drawer from there.
      dispatchAIJobDrawerClosed(multiQuizJobId);
    }
  }, [multiQuizJobId, addBgJob]);

  // Cross-section reopen of an all-notes quiz from the toast / AI Jobs panel.
  // We only react when there is NO noteId on the detail — per-note quizzes
  // are routed to NoteEditor instead.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AIJobOpenDetail>).detail;
      if (detail.kind !== 'quiz' || detail.source.noteId) return;
      setMultiQuizJobId(detail.jobId);
      setMultiQuizDrawerOpen(true);
    };
    window.addEventListener(AI_JOB_OPEN_EVENT, handler);
    return () => window.removeEventListener(AI_JOB_OPEN_EVENT, handler);
  }, []);
  const handleSelectNote = useCallback(async (id: string) => {
    await save.flush();
    editor.setSelectedNoteId(id);
  }, [save, editor]);

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <NotesPane
        library={library}
        selectedNoteId={editor.selectedNoteId}
        collapsed={paneCollapsed}
        onSelectNote={handleSelectNote}
        onSmartTestAll={handleSmartTestAll}
      />

      <NoteEditor
        note={editor.note}
        breadcrumbs={editor.breadcrumbs}
        saving={save.saving}
        savedAt={save.savedAt}
        onTitleChange={(id, name) => save.queueSave(id, { name })}
        onContentChange={(id, html) => save.queueSave(id, { content: html })}
      />

      {multiQuizJobId !== null && multiQuizDrawerOpen && (
        <Suspense fallback={null}>
          <QuizDrawer
            jobId={multiQuizJobId}
            noteTitle="all notes"
            onClose={handleMultiQuizClose}
          />
        </Suspense>
      )}

      {pickerOpen && (
        <Suspense fallback={null}>
          <AITestPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            notes={library.allNotes.map((n) => n.note)}
            onConfirm={handlePickerConfirm}
          />
        </Suspense>
      )}
    </>
  );
}
