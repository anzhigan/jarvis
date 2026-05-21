import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { aiApi } from '../../../api/client';
import type { Note } from '../../../api/types';
import { useNoteAutoSave } from '../../notes/hooks/useNoteAutoSave';
import type { NotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { useAIJobsStore } from '../../../store/aiJobs';
import { MobileActionSheet, type ActionSheetItem } from '../components/MobileActionSheet';
import { MobileQuizSheet } from '../components/MobileQuizSheet';
import '../../../styles/mobile.css';

const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));

interface Props {
  note: Note;
  library: NotesLibrary;
  onBack: () => void;
}

/**
 * Mobile full-screen note editor.
 *
 * Distinct from the rest of the mobile shell: there is no bottom tab bar — the
 * full viewport is dedicated to writing. The top bar is collapsed to back +
 * actions, the title is inline (doc-style), and a meta line under it shows
 * way/topic + tags. Auto-save status sits next to the back button.
 *
 * AI: ✨ button in the top bar → MobileActionSheet with "Generate test"
 * (more actions to follow — tasks_extract / summarize are not wired on
 * desktop yet either). The quiz lands in MobileQuizSheet that polls the
 * job and presents the result.
 */
export default function MobileNoteEditor({ note, library, onBack }: Props) {
  const save = useNoteAutoSave(() => { void library.refresh(); });
  const [localTitle, setLocalTitle] = useState(note.name);
  const [aiOpen, setAiOpen] = useState(false);

  // Active quiz job — set after fire, also restored from the AI panel's
  // "Open" event if the user comes back via toast.
  const [quizJobId, setQuizJobId] = useState<string | null>(null);
  const addBgJob = useAIJobsStore((s) => s.add);

  useEffect(() => { setLocalTitle(note.name); }, [note.id, note.name]);

  // The AI_JOB_OPEN_EVENT listener for quiz used to live here so a panel
  // re-tap could relaunch MobileQuizSheet. Removed — MobileAIToastStack
  // now opens the universal MobileAIResultSheet for every kind, so panel/
  // toast taps always land on the same design-system bottom sheet.
  // MobileQuizSheet still opens in-flow when the user creates / reuses a
  // quiz from this editor (see the AI button handler below).

  const goBack = async () => { await save.flush(); onBack(); };

  // ── AI · quiz fire ──────────────────────────────────────────────────────
  const fireQuiz = useCallback(async () => {
    // Re-use existing in-flight / done quiz for this note if any. Same
    // protocol as desktop NoteEditor: if there's a `done` job, open it
    // directly; if it's in-flight, do nothing (toast shows progress); if
    // it's terminal-but-failed, fall through to a fresh generation.
    const existing = useAIJobsStore.getState().findSame('quiz', note.id);
    if (existing) {
      try {
        const live = await aiApi.getJob(existing.jobId);
        if (live.status === 'done') {
          setQuizJobId(existing.jobId);
          return;
        }
        if (live.status === 'queued' || live.status === 'running') {
          toast.info('A test is already being generated — watch the bottom toast');
          return;
        }
      } catch { /* ignore — fall through to fresh */ }
    }
    try {
      // Same word-count → question-count buckets the desktop uses. Short
      // notes get 5 questions; long ones up to 10.
      const len = (note.content || '').length;
      const count = len >= 4000 ? 10
        : len >= 2500 ? 8
        : len >= 1200 ? 7
        : len >= 600  ? 6
        : 5;
      const job = await aiApi.createQuiz({
        scope: { kind: 'note', id: note.id },
        difficulty: 'medium',
        count,
      });
      addBgJob({
        jobId: job.id,
        kind: 'quiz',
        source: {
          section: 'notes',
          noteId: note.id,
          noteTitle: note.name || 'untitled',
        },
      });
      // Cache hit returned a done job? Open immediately.
      if (job.status === 'done') {
        setQuizJobId(job.id);
      }
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to start quiz');
    }
  }, [note, addBgJob]);

  // ── Top-bar actions sheet ───────────────────────────────────────────────
  const aiActions: ActionSheetItem[] = [
    {
      label: 'Generate test',
      onSelect: () => { void fireQuiz(); },
    },
  ];

  return (
    <div
      className="m-shell"
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Floating circular controls — only Back (left) and AI (right).
          Both `position: fixed` so they stay anchored at the top while
          the editor body scrolls. Pin / more-menu were removed per the
          design call to declutter the note view. */}
      <button
        type="button"
        className="m-note-fab m-note-fab-back"
        onClick={goBack}
        aria-label="Back to notes"
      ><ChevronLeft size={18} /></button>
      <button
        type="button"
        className="m-note-fab m-note-fab-ai"
        onClick={() => setAiOpen(true)}
        aria-label="AI actions"
      ><Sparkles size={16} /></button>

      <main
        className="screen-content"
        style={{
          padding: '64px 18px 28px',
        }}
      >
        <input
          className="doc-title-input"
          value={localTitle}
          onChange={(e) => {
            const v = e.target.value;
            setLocalTitle(v);
            save.queueSave(note.id, { name: v });
          }}
          placeholder="Untitled"
          aria-label="Note title"
          style={{
            width: '100%', border: 0, outline: 0, background: 'transparent',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-2xl)',
            fontWeight: 500,
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--ink)',
            lineHeight: 1.15,
            padding: 0,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            margin: '10px 0 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--ink-4)',
          }}
        >
          <time>{new Date(note.updated_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
          })}</time>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span>{wordCount(note.content)} words</span>
          {note.tags.length > 0 && (
            <>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                {note.tags.map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 10,
                      fontWeight: 500,
                      padding: '1px 6px',
                      borderRadius: 999,
                      color: tag.color,
                      boxShadow: `inset 0 0 0 1px ${tag.color}33`,
                    }}
                  >#{tag.name}</span>
                ))}
              </span>
            </>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--hairline)', margin: '0 0 14px' }} />

        <Suspense fallback={
          <div style={{ display: 'grid', placeItems: 'center', height: '40dvh', color: 'var(--ink-4)' }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        }>
          <RichTextEditor
            key={note.id}
            noteId={note.id}
            content={note.content}
            onChange={(html) => save.queueSave(note.id, { content: html })}
          />
        </Suspense>
      </main>

      {/* AI actions sheet */}
      <MobileActionSheet
        open={aiOpen}
        onOpenChange={setAiOpen}
        title="AI actions"
        message="Generate a multi-choice test from this note. More AI tools (extract tasks, summarize) coming soon."
        actions={aiActions}
      />

      {/* Quiz result sheet — polls the AI job + presents the quiz UI */}
      <MobileQuizSheet
        jobId={quizJobId}
        noteTitle={note.name || 'Untitled'}
        onClose={() => setQuizJobId(null)}
      />
    </div>
  );
}

function wordCount(html: string): number {
  if (!html) return 0;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent ?? '').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}
