import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FolderOpen, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { Note, Subsubtopic, Subtopic, Topic, Way } from '../../../api/types';
import { useNotesLibrary } from '../../notes/hooks/useNotesLibrary';
import { aiApi, type NoteParent } from '../../../api/client';
import { useAIJobsStore } from '../../../store/aiJobs';
import { MobileTopBar } from '../components/MobileTopBar';
import { MobileShell } from '../components/MobileShell';
import { WayForm, TopicForm, SubtopicForm, SubsubtopicForm, NoteForm } from '../components/MobileAddForms';
import { SwipeableRow } from '../components/SwipeableRow';
import { MobileConfirmSheet } from '../components/MobileConfirmSheet';
import type { Tab } from '../../../app/tabs';

// AITestPicker is the same Radix-dialog used on desktop — it works on
// mobile too (full-width with safe-area). Lazy-loaded so its bundle is
// only fetched when the user actually taps "AI test".
const AITestPicker = lazy(() => import('../../ai/AITestPicker').then((m) => ({ default: m.AITestPicker })));

// Full-screen note editor — opened when a card is tapped.
const MobileNoteEditor = lazy(() => import('./MobileNoteEditor'));

interface Props {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onAvatarClick: () => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const noteDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - noteDay.getTime()) / 86_400_000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (diffDays === 0) return `Today · ${hh}:${mm}`;
  if (diffDays === 1) return `Yesterday · ${hh}:${mm}`;
  if (diffDays < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${hh}:${mm}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function previewText(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent ?? '').trim();
}

/** Where in the way → topic → subtopic → subsubtopic → note tree the user is. */
type CurrentLevel =
  | { kind: 'root' }
  | { kind: 'way';   wayId: string }
  | { kind: 'topic'; wayId: string; topicId: string }
  | { kind: 'subtopic'; wayId: string; topicId: string; subtopicId: string }
  | { kind: 'subsubtopic'; wayId: string; topicId: string; subtopicId: string; subsubtopicId: string };

export default function MobileNotesScreen({ tab, onTabChange, onAvatarClick }: Props) {
  const lib = useNotesLibrary();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<CurrentLevel>({ kind: 'root' });
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  // AI toast/panel re-open protocol: when user picks a quiz job, the toast
  // stack navigates to "notes" + dispatches an openNote event with the
  // target note id. MobileNoteEditor then catches the AI_JOB_OPEN_EVENT
  // for itself. Without this listener the user would land on the notes
  // list instead of the editor where the quiz sheet renders.
  useEffect(() => {
    const handler = (e: Event) => {
      // Detail is a bare id (legacy) or `{ id, highlight?, heading? }` for a
      // deep link. On mobile we open the target note; heading/quote scroll
      // isn't wired into the mobile editor yet, so extract just the id.
      const raw = (e as CustomEvent<string | { id: string }>).detail;
      const id = typeof raw === 'string' ? raw : raw?.id;
      if (id) setOpenNoteId(id);
    };
    window.addEventListener('jarvnote:openNote', handler);
    return () => window.removeEventListener('jarvnote:openNote', handler);
  }, []);

  // Bottom-sheet add forms
  const [wayFormOpen, setWayFormOpen] = useState(false);
  const [topicFormOpen, setTopicFormOpen] = useState<{ wayId: string; wayName: string } | null>(null);
  const [subtopicFormOpen, setSubtopicFormOpen] = useState<{ topicId: string; topicName: string } | null>(null);
  const [subsubtopicFormOpen, setSubsubtopicFormOpen] = useState<{ subtopicId: string; subtopicName: string } | null>(null);
  const [noteFormOpen, setNoteFormOpen] = useState<{ target: NoteParent; parentName: string } | null>(null);
  // Edit forms
  const [editWay, setEditWay] = useState<Way | null>(null);
  const [editTopic, setEditTopic] = useState<{ topic: Topic; wayName: string } | null>(null);
  const [editSubtopic, setEditSubtopic] = useState<{ subtopic: Subtopic; topicName: string } | null>(null);
  const [editSubsubtopic, setEditSubsubtopic] = useState<{ subsubtopic: Subsubtopic; subtopicName: string } | null>(null);
  const [editNote, setEditNote] = useState<Note | null>(null);
  // Confirm-delete sheets
  const [confirmWay, setConfirmWay] = useState<Way | null>(null);
  const [confirmTopic, setConfirmTopic] = useState<Topic | null>(null);
  const [confirmSubtopic, setConfirmSubtopic] = useState<Subtopic | null>(null);
  const [confirmSubsubtopic, setConfirmSubsubtopic] = useState<Subsubtopic | null>(null);
  const [confirmNote, setConfirmNote] = useState<Note | null>(null);

  const allNotes = useMemo(() => {
    let n = 0;
    for (const w of lib.ways) {
      n += w.notes.length;
      for (const t of w.topics) {
        n += t.notes.length;
        for (const s of t.subtopics) {
          n += s.notes.length;
          for (const ss of s.subsubtopics) n += ss.notes.length;
        }
      }
    }
    return n;
  }, [lib.ways]);

  // ── Resolve the current way / topic ───────────────────────────────────────
  // Computed every render — must run before any early returns so the React
  // hooks order stays stable.
  const currentWay: Way | null = level.kind !== 'root'
    ? lib.ways.find((w) => w.id === level.wayId) ?? null
    : null;
  const currentTopic: Topic | null =
    (level.kind === 'topic' || level.kind === 'subtopic' || level.kind === 'subsubtopic') && currentWay
      ? currentWay.topics.find((t) => t.id === level.topicId) ?? null
      : null;
  const currentSubtopic: Subtopic | null =
    (level.kind === 'subtopic' || level.kind === 'subsubtopic') && currentTopic
      ? currentTopic.subtopics.find((s) => s.id === level.subtopicId) ?? null
      : null;
  const currentSubsubtopic: Subsubtopic | null = level.kind === 'subsubtopic' && currentSubtopic
    ? currentSubtopic.subsubtopics.find((s) => s.id === level.subsubtopicId) ?? null
    : null;

  // If the underlying entity disappeared (rename/delete), step back up.
  useEffect(() => {
    if (level.kind !== 'root' && !lib.loading && !currentWay) {
      setLevel({ kind: 'root' });
    } else if (
      (level.kind === 'topic' || level.kind === 'subtopic' || level.kind === 'subsubtopic')
      && !lib.loading && !currentTopic
    ) {
      setLevel({ kind: 'way', wayId: level.wayId });
    } else if (
      (level.kind === 'subtopic' || level.kind === 'subsubtopic') && !lib.loading && !currentSubtopic
    ) {
      setLevel({ kind: 'topic', wayId: level.wayId, topicId: level.topicId });
    } else if (level.kind === 'subsubtopic' && !lib.loading && !currentSubsubtopic) {
      setLevel({ kind: 'subtopic', wayId: level.wayId, topicId: level.topicId, subtopicId: level.subtopicId });
    }
  }, [level, currentWay, currentTopic, currentSubtopic, currentSubsubtopic, lib.loading]);

  // ── AI test on all notes — same flow as desktop NotesView. Tap pill →
  // AITestPicker (Radix dialog, works on mobile too) → user picks notes →
  // create quiz with scope `multi` → pushed as bg job. When done, the
  // universal AI toast appears; tapping it opens MobileQuizSheet.
  //
  // These hooks must run BEFORE every early return in this component —
  // both the `openedNote` overlay below and the `lib.loading` shell
  // further down — otherwise the React hook count flips between
  // renders ("Rendered fewer/more hooks than during the previous
  // render") and the whole tree white-screens.
  const addBgJob = useAIJobsStore((s) => s.add);
  const [aiTestPickerOpen, setAiTestPickerOpen] = useState(false);
  const [aiTestSubmitting, setAiTestSubmitting] = useState(false);
  const allNotesFlat = useMemo<Note[]>(() => {
    const out: Note[] = [];
    for (const way of lib.ways) {
      out.push(...way.notes);
      for (const topic of way.topics) {
        out.push(...topic.notes);
        for (const sub of topic.subtopics) {
          out.push(...sub.notes);
          for (const ss of sub.subsubtopics) out.push(...ss.notes);
        }
      }
    }
    return out;
  }, [lib.ways]);
  const handleAiTestConfirm = useCallback(async (ids: string[]) => {
    setAiTestPickerOpen(false);
    if (ids.length === 0) return;
    const inBg = useAIJobsStore.getState().findSame('quiz', undefined);
    if (inBg) {
      toast.message('A test is already running — check the AI tasks panel.');
      return;
    }
    setAiTestSubmitting(true);
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
        ? (allNotesFlat.find((n) => n.id === ids[0])?.name || 'note')
        : `${ids.length} notes`;
      addBgJob({
        jobId: job.id,
        kind: 'quiz',
        source: { section: 'notes', noteTitle },
      });
      toast.success('Test is generating…');
    } catch (e: any) {
      toast.error(e?.detail ?? e?.message ?? 'Failed to start test');
    } finally {
      setAiTestSubmitting(false);
    }
  }, [allNotesFlat, addBgJob]);

  // ── Note editor (full-screen overlay) ─────────────────────────────────────
  const openedNote = openNoteId ? lib.findNote(openNoteId)?.note ?? null : null;
  if (openedNote) {
    return (
      <Suspense fallback={null}>
        <MobileNoteEditor
          note={openedNote}
          library={lib}
          onBack={() => setOpenNoteId(null)}
        />
      </Suspense>
    );
  }

  if (lib.loading) {
    return (
      <MobileShell
        topBar={<MobileTopBar title="Notes" onAvatarClick={onAvatarClick} />}
        tab={tab}
        onTabChange={onTabChange}
      >
        <div style={{ display: 'grid', placeItems: 'center', height: '60dvh', color: 'var(--ink-4)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      </MobileShell>
    );
  }

  // ── Add handlers — open bottom-sheet forms instead of prompts ────────────
  const handleAddWay = () => setWayFormOpen(true);
  const handleAddTopic = (wayId: string) => {
    const w = lib.ways.find((x) => x.id === wayId);
    if (w) setTopicFormOpen({ wayId: w.id, wayName: w.name });
  };
  const handleAddSubtopic = (topicId: string, topicName: string) => {
    setSubtopicFormOpen({ topicId, topicName });
  };
  const handleAddSubsubtopic = (subtopicId: string, subtopicName: string) => {
    setSubsubtopicFormOpen({ subtopicId, subtopicName });
  };
  const handleAddNote = (target: NoteParent, parentName: string) => {
    setNoteFormOpen({ target, parentName });
  };

  // ── Top bar — varies by level ─────────────────────────────────────────────
  let title = 'Notes';
  let subtitle: string | undefined;
  let leftSlot: React.ReactNode | undefined;
  if (level.kind === 'root') {
    subtitle = `${allNotes} note${allNotes === 1 ? '' : 's'} · ${lib.ways.length} way${lib.ways.length === 1 ? '' : 's'}`;
  } else if (level.kind === 'way' && currentWay) {
    title = currentWay.name;
    subtitle = `${currentWay.topics.length} topic${currentWay.topics.length === 1 ? '' : 's'} · ${currentWay.notes.length} direct note${currentWay.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'root' })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  } else if (level.kind === 'topic' && currentTopic && currentWay) {
    title = currentTopic.name;
    subtitle = `${currentTopic.subtopics.length} subtopic${currentTopic.subtopics.length === 1 ? '' : 's'} · ${currentTopic.notes.length} note${currentTopic.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'way', wayId: currentWay.id })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  } else if (level.kind === 'subtopic' && currentSubtopic && currentTopic && currentWay) {
    title = currentSubtopic.name;
    subtitle = `${currentSubtopic.subsubtopics.length} subsubtopic${currentSubtopic.subsubtopics.length === 1 ? '' : 's'} · ${currentSubtopic.notes.length} note${currentSubtopic.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'topic', wayId: currentWay.id, topicId: currentTopic.id })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  } else if (level.kind === 'subsubtopic' && currentSubsubtopic && currentSubtopic && currentTopic && currentWay) {
    title = currentSubsubtopic.name;
    subtitle = `${currentSubtopic.name} · ${currentSubsubtopic.notes.length} note${currentSubsubtopic.notes.length === 1 ? '' : 's'}`;
    leftSlot = (
      <button type="button" className="tb-btn" onClick={() => setLevel({ kind: 'subtopic', wayId: currentWay.id, topicId: currentTopic.id, subtopicId: currentSubtopic.id })} aria-label="Back">
        <ChevronLeft size={18} />
      </button>
    );
  }

  // Compact bar for nested levels (way / topic — they carry a back arrow
   // already); large-title for the root. Keeps vertical space tight when
   // the user is deep in the tree.
  const topBar = (
    <MobileTopBar
      title={title}
      subtitle={subtitle}
      leftSlot={leftSlot}
      onAvatarClick={onAvatarClick}
      mode={level.kind === 'root' ? 'large' : 'compact'}
      aiAction={{
        icon: <Sparkles size={14} />,
        label: 'AI test',
        onClick: () => setAiTestPickerOpen(true),
        busy: aiTestSubmitting,
      }}
    />
  );

  // ── Body ──────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const matchesQuery = (n: Note) => {
    if (!q) return true;
    return `${n.name} ${previewText(n.content)} ${n.tags.map((t) => t.name).join(' ')}`.toLowerCase().includes(q);
  };

  return (
    <MobileShell topBar={topBar} tab={tab} onTabChange={onTabChange}>
      {level.kind === 'root' && (
        <RootLevel
          ways={lib.ways}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenWay={(id) => setLevel({ kind: 'way', wayId: id })}
          onOpenNote={setOpenNoteId}
          onAddWay={handleAddWay}
          onAddNote={(target, parentName) => handleAddNote(target, parentName)}
          onEditWay={(w) => setEditWay(w)}
          onDeleteWay={(w) => setConfirmWay(w)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      {level.kind === 'way' && currentWay && (
        <WayLevel
          way={currentWay}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenTopic={(id) => setLevel({ kind: 'topic', wayId: currentWay.id, topicId: id })}
          onOpenNote={setOpenNoteId}
          onAddTopic={() => handleAddTopic(currentWay.id)}
          onAddNote={() => handleAddNote({ way_id: currentWay.id }, currentWay.name)}
          onEditTopic={(t) => setEditTopic({ topic: t, wayName: currentWay.name })}
          onDeleteTopic={(t) => setConfirmTopic(t)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      {level.kind === 'topic' && currentTopic && currentWay && (
        <TopicLevel
          topic={currentTopic}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenNote={setOpenNoteId}
          onOpenSubtopic={(id) => setLevel({ kind: 'subtopic', wayId: currentWay.id, topicId: currentTopic.id, subtopicId: id })}
          onAddNote={() => handleAddNote({ topic_id: currentTopic.id }, `${currentWay.name} · ${currentTopic.name}`)}
          onAddSubtopic={() => handleAddSubtopic(currentTopic.id, currentTopic.name)}
          onEditSubtopic={(s) => setEditSubtopic({ subtopic: s, topicName: currentTopic.name })}
          onDeleteSubtopic={(s) => setConfirmSubtopic(s)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      {level.kind === 'subtopic' && currentSubtopic && currentTopic && currentWay && (
        <SubtopicLevel
          subtopic={currentSubtopic}
          topicName={currentTopic.name}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenNote={setOpenNoteId}
          onOpenSubsubtopic={(id) => setLevel({ kind: 'subsubtopic', wayId: currentWay.id, topicId: currentTopic.id, subtopicId: currentSubtopic.id, subsubtopicId: id })}
          onAddNote={() => handleAddNote({ subtopic_id: currentSubtopic.id }, `${currentTopic.name} · ${currentSubtopic.name}`)}
          onAddSubsubtopic={() => handleAddSubsubtopic(currentSubtopic.id, currentSubtopic.name)}
          onEditSubsubtopic={(s) => setEditSubsubtopic({ subsubtopic: s, subtopicName: currentSubtopic.name })}
          onDeleteSubsubtopic={(s) => setConfirmSubsubtopic(s)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      {level.kind === 'subsubtopic' && currentSubsubtopic && currentSubtopic && currentTopic && currentWay && (
        <SubsubtopicLevel
          subsubtopic={currentSubsubtopic}
          subtopicName={currentSubtopic.name}
          search={search}
          onSearch={setSearch}
          matchesQuery={matchesQuery}
          onOpenNote={setOpenNoteId}
          onAddNote={() => handleAddNote({ subsubtopic_id: currentSubsubtopic.id }, `${currentSubtopic.name} · ${currentSubsubtopic.name}`)}
          onEditNote={(n) => setEditNote(n)}
          onDeleteNote={(n) => setConfirmNote(n)}
        />
      )}

      <WayForm
        open={wayFormOpen}
        onOpenChange={setWayFormOpen}
        library={lib}
        onCreated={(id) => setLevel({ kind: 'way', wayId: id })}
      />
      {topicFormOpen && (
        <TopicForm
          open={!!topicFormOpen}
          onOpenChange={(o) => { if (!o) setTopicFormOpen(null); }}
          library={lib}
          wayId={topicFormOpen.wayId}
          wayName={topicFormOpen.wayName}
          onCreated={(tid) => setLevel({ kind: 'topic', wayId: topicFormOpen.wayId, topicId: tid })}
        />
      )}
      {subtopicFormOpen && currentWay && (
        <SubtopicForm
          open={!!subtopicFormOpen}
          onOpenChange={(o) => { if (!o) setSubtopicFormOpen(null); }}
          library={lib}
          topicId={subtopicFormOpen.topicId}
          topicName={subtopicFormOpen.topicName}
          onCreated={(sid) => setLevel({
            kind: 'subtopic', wayId: currentWay.id,
            topicId: subtopicFormOpen.topicId, subtopicId: sid,
          })}
        />
      )}
      {subsubtopicFormOpen && currentWay && currentTopic && currentSubtopic && (
        <SubsubtopicForm
          open={!!subsubtopicFormOpen}
          onOpenChange={(o) => { if (!o) setSubsubtopicFormOpen(null); }}
          library={lib}
          subtopicId={subsubtopicFormOpen.subtopicId}
          subtopicName={subsubtopicFormOpen.subtopicName}
          onCreated={(ssid) => setLevel({
            kind: 'subsubtopic', wayId: currentWay.id, topicId: currentTopic.id,
            subtopicId: subsubtopicFormOpen.subtopicId, subsubtopicId: ssid,
          })}
        />
      )}
      {noteFormOpen && (
        <NoteForm
          open={!!noteFormOpen}
          onOpenChange={(o) => { if (!o) setNoteFormOpen(null); }}
          library={lib}
          target={noteFormOpen.target}
          parentName={noteFormOpen.parentName}
          onCreated={(nid) => setOpenNoteId(nid)}
        />
      )}

      {/* Edit forms */}
      {editWay && (
        <WayForm
          open={!!editWay}
          onOpenChange={(o) => { if (!o) setEditWay(null); }}
          library={lib}
          editing={editWay}
        />
      )}
      {editTopic && (
        <TopicForm
          open={!!editTopic}
          onOpenChange={(o) => { if (!o) setEditTopic(null); }}
          library={lib}
          wayId={editTopic.topic.way_id}
          wayName={editTopic.wayName}
          editing={editTopic.topic}
        />
      )}
      {editSubtopic && (
        <SubtopicForm
          open={!!editSubtopic}
          onOpenChange={(o) => { if (!o) setEditSubtopic(null); }}
          library={lib}
          topicId={editSubtopic.subtopic.topic_id}
          topicName={editSubtopic.topicName}
          editing={editSubtopic.subtopic}
        />
      )}
      {editSubsubtopic && (
        <SubsubtopicForm
          open={!!editSubsubtopic}
          onOpenChange={(o) => { if (!o) setEditSubsubtopic(null); }}
          library={lib}
          subtopicId={editSubsubtopic.subsubtopic.subtopic_id}
          subtopicName={editSubsubtopic.subtopicName}
          editing={editSubsubtopic.subsubtopic}
        />
      )}
      {editNote && (
        <NoteForm
          open={!!editNote}
          onOpenChange={(o) => { if (!o) setEditNote(null); }}
          library={lib}
          editing={editNote}
        />
      )}

      <MobileConfirmSheet
        open={!!confirmWay}
        onOpenChange={(o) => { if (!o) setConfirmWay(null); }}
        title={`Delete "${confirmWay?.name ?? ''}"?`}
        description="This way and all its topics & notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmWay) await lib.deleteWay(confirmWay.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmTopic}
        onOpenChange={(o) => { if (!o) setConfirmTopic(null); }}
        title={`Delete topic "${confirmTopic?.name ?? ''}"?`}
        description="The topic and all its notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmTopic) await lib.deleteTopic(confirmTopic.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmSubtopic}
        onOpenChange={(o) => { if (!o) setConfirmSubtopic(null); }}
        title={`Delete subtopic "${confirmSubtopic?.name ?? ''}"?`}
        description="The subtopic and all its notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmSubtopic) await lib.deleteSubtopic(confirmSubtopic.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmSubsubtopic}
        onOpenChange={(o) => { if (!o) setConfirmSubsubtopic(null); }}
        title={`Delete subsubtopic "${confirmSubsubtopic?.name ?? ''}"?`}
        description="The subsubtopic and all its notes will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmSubsubtopic) await lib.deleteSubsubtopic(confirmSubsubtopic.id); }}
      />
      <MobileConfirmSheet
        open={!!confirmNote}
        onOpenChange={(o) => { if (!o) setConfirmNote(null); }}
        title={`Delete "${confirmNote?.name || 'Untitled'}"?`}
        description="This note will be permanently removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => { if (confirmNote) await lib.deleteNote(confirmNote.id); }}
      />

      {/* AI test picker — same Radix dialog the desktop uses. Suspense
          fallback is null so opening doesn't flash a loader. */}
      {aiTestPickerOpen && (
        <Suspense fallback={null}>
          <AITestPicker
            open={aiTestPickerOpen}
            onOpenChange={setAiTestPickerOpen}
            notes={allNotesFlat}
            onConfirm={handleAiTestConfirm}
          />
        </Suspense>
      )}
    </MobileShell>
  );
}

// ── Root: list of ways + add buttons after each section ──────────────────

function RootLevel({
  ways, search, onSearch, matchesQuery, onOpenWay, onOpenNote, onAddWay, onAddNote,
  onEditWay, onDeleteWay, onEditNote, onDeleteNote,
}: {
  ways: Way[];
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenWay: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddWay: () => void;
  onAddNote: (target: { way_id?: string; topic_id?: string }, parentName: string) => void;
  onEditWay: (w: Way) => void;
  onDeleteWay: (w: Way) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  // Search results (when q is set, surface matched notes from any way/topic).
  const q = search.trim();
  const searchResults: { note: Note; way: Way; topic: Topic | null }[] = [];
  if (q) {
    for (const w of ways) {
      for (const n of w.notes) if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: null });
      for (const t of w.topics) {
        for (const n of t.notes)
          if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: t });
        for (const s of t.subtopics) {
          for (const n of s.notes)
            if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: t });
          for (const ss of s.subsubtopics) for (const n of ss.notes)
            if (matchesQuery(n)) searchResults.push({ note: n, way: w, topic: t });
        }
      }
    }
    searchResults.sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));
  }

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder="Search notes, tags, ways..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {q && searchResults.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Search results</span>
            <span className="sec-rule" />
            <span className="sec-meta">{searchResults.length}</span>
          </div>
          <div className="notes-list">
            {searchResults.map((r) => (
              <SwipeableRow
                key={r.note.id}
                onClick={() => onOpenNote(r.note.id)}
                onEdit={() => onEditNote(r.note)}
                onDelete={() => onDeleteNote(r.note)}
                editLabel="Rename"
              >
                <NoteCard row={r} onClick={() => onOpenNote(r.note.id)} />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      {!q && (
        <>
          <div className="section-bar">
            <span className="sec-title">Ways</span>
            <span className="sec-rule" />
            <span className="sec-meta">{ways.length}</span>
          </div>
          {ways.length === 0 ? (
            <EmptyHint>Tap “+ Way” below to create your first folder.</EmptyHint>
          ) : (
            <div className="notes-list">
              {ways.map((w) => {
                const total = w.notes.length + w.topics.reduce(
                  (a, t) => a + t.notes.length + t.subtopics.reduce(
                    (b, s) => b + s.notes.length + s.subsubtopics.reduce((c, ss) => c + ss.notes.length, 0), 0), 0);
                return (
                  <SwipeableRow
                    key={w.id}
                    onClick={() => onOpenWay(w.id)}
                    onEdit={() => onEditWay(w)}
                    onDelete={() => onDeleteWay(w)}
                    editLabel="Rename"
                  >
                    <FolderRow
                      icon={<FolderOpen size={14} />}
                      name={w.name}
                      meta={`${w.topics.length} topic${w.topics.length === 1 ? '' : 's'} · ${total} note${total === 1 ? '' : 's'}`}
                      onClick={() => onOpenWay(w.id)}
                    />
                  </SwipeableRow>
                );
              })}
            </div>
          )}

          <button type="button" className="m-add-btn" onClick={onAddWay}>
            <Plus /> Way
          </button>

          {ways.length > 0 && (
            <button
              type="button"
              className="m-add-btn"
              onClick={() => {
                // Pick the topmost way silently — the user explicitly asked
                // not to be prompted to choose. Browser prompt() looked
                // foreign anyway. If they wanted a different way, they can
                // drill into it and tap + Note from there.
                onAddNote({ way_id: ways[0].id }, ways[0].name);
              }}
            >
              <Plus /> Note
            </button>
          )}
        </>
      )}
    </>
  );
}

// ── Way: topics + standalone notes inside the way ─────────────────────────

function WayLevel({
  way, search, onSearch, matchesQuery, onOpenTopic, onOpenNote, onAddTopic, onAddNote,
  onEditTopic, onDeleteTopic, onEditNote, onDeleteNote,
}: {
  way: Way;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenTopic: (id: string) => void;
  onOpenNote: (id: string) => void;
  onAddTopic: () => void;
  onAddNote: () => void;
  onEditTopic: (t: Topic) => void;
  onDeleteTopic: (t: Topic) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const directNotes = way.notes.filter(matchesQuery)
    .sort((a, b) => {
      // Pinned first, then most recently updated.
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${way.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {way.topics.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Topics</span>
            <span className="sec-rule" />
            <span className="sec-meta">{way.topics.length}</span>
          </div>
          <div className="notes-list">
            {way.topics.map((t) => (
              <SwipeableRow
                key={t.id}
                onClick={() => onOpenTopic(t.id)}
                onEdit={() => onEditTopic(t)}
                onDelete={() => onDeleteTopic(t)}
                editLabel="Rename"
              >
                <FolderRow
                  icon={<FolderOpen size={14} />}
                  name={t.name}
                  meta={topicMeta(t)}
                  onClick={() => onOpenTopic(t.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddTopic}>
        <Plus /> Topic
      </button>

      {directNotes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{directNotes.length}</span>
          </div>
          <div className="notes-list">
            {directNotes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way, topic: null }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>

      {way.topics.length === 0 && directNotes.length === 0 && (
        <EmptyHint>This way is empty. Add a topic or a note below.</EmptyHint>
      )}
    </>
  );
}

// ── Topic: subtopics + notes in the topic ─────────────────────────────────

/** Notes directly in a subtopic + everything nested in its subsubtopics. */
function subtopicNoteTotal(s: Subtopic): number {
  return s.notes.length + s.subsubtopics.reduce((a, ss) => a + ss.notes.length, 0);
}

/** Subtopic folder meta: "N subsubtopics · M notes" (M counts nested). */
function subtopicMeta(s: Subtopic): string {
  const notes = subtopicNoteTotal(s);
  const subs = s.subsubtopics.length;
  const notePart = `${notes} note${notes === 1 ? '' : 's'}`;
  return subs > 0 ? `${subs} subsubtopic${subs === 1 ? '' : 's'} · ${notePart}` : notePart;
}

/** Topic meta line: "N subtopics · M notes" (M counts all nested notes too). */
function topicMeta(t: Topic): string {
  const notes = t.notes.length + t.subtopics.reduce((a, s) => a + subtopicNoteTotal(s), 0);
  const subs = t.subtopics.length;
  const notePart = `${notes} note${notes === 1 ? '' : 's'}`;
  return subs > 0 ? `${subs} subtopic${subs === 1 ? '' : 's'} · ${notePart}` : notePart;
}

function TopicLevel({
  topic, search, onSearch, matchesQuery, onOpenNote, onOpenSubtopic,
  onAddNote, onAddSubtopic, onEditSubtopic, onDeleteSubtopic, onEditNote, onDeleteNote,
}: {
  topic: Topic;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenNote: (id: string) => void;
  onOpenSubtopic: (id: string) => void;
  onAddNote: () => void;
  onAddSubtopic: () => void;
  onEditSubtopic: (s: Subtopic) => void;
  onDeleteSubtopic: (s: Subtopic) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const notes = topic.notes.filter(matchesQuery)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${topic.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {topic.subtopics.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Subtopics</span>
            <span className="sec-rule" />
            <span className="sec-meta">{topic.subtopics.length}</span>
          </div>
          <div className="notes-list">
            {topic.subtopics.map((s) => (
              <SwipeableRow
                key={s.id}
                onClick={() => onOpenSubtopic(s.id)}
                onEdit={() => onEditSubtopic(s)}
                onDelete={() => onDeleteSubtopic(s)}
                editLabel="Rename"
              >
                <FolderRow
                  icon={<FolderOpen size={14} />}
                  name={s.name}
                  meta={subtopicMeta(s)}
                  onClick={() => onOpenSubtopic(s.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddSubtopic}>
        <Plus /> Subtopic
      </button>

      {notes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{notes.length}</span>
          </div>
          <div className="notes-list">
            {notes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way: { id: '', name: '', topics: [], notes: [], order: 0, created_at: '', updated_at: '' }, topic }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>
    </>
  );
}

// A synthetic Topic used only to feed NoteCard's `topic` label at deeper
// levels (its `.name` becomes the second breadcrumb segment on the card).
function labelTopic(name: string): Topic {
  return { id: '', way_id: '', name, order: 0, notes: [], inline_note: null, subtopics: [], created_at: '', updated_at: '' };
}
function labelWay(name: string): Way {
  return { id: '', name, topics: [], notes: [], order: 0, created_at: '', updated_at: '' };
}

// ── Subtopic: subsubtopics + notes in the subtopic ─────────────────────────

function SubtopicLevel({
  subtopic, topicName, search, onSearch, matchesQuery, onOpenNote, onOpenSubsubtopic,
  onAddNote, onAddSubsubtopic, onEditSubsubtopic, onDeleteSubsubtopic, onEditNote, onDeleteNote,
}: {
  subtopic: Subtopic;
  topicName: string;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenNote: (id: string) => void;
  onOpenSubsubtopic: (id: string) => void;
  onAddNote: () => void;
  onAddSubsubtopic: () => void;
  onEditSubsubtopic: (s: Subsubtopic) => void;
  onDeleteSubsubtopic: (s: Subsubtopic) => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const notes = subtopic.notes.filter(matchesQuery)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${subtopic.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {subtopic.subsubtopics.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Subsubtopics</span>
            <span className="sec-rule" />
            <span className="sec-meta">{subtopic.subsubtopics.length}</span>
          </div>
          <div className="notes-list">
            {subtopic.subsubtopics.map((ss) => (
              <SwipeableRow
                key={ss.id}
                onClick={() => onOpenSubsubtopic(ss.id)}
                onEdit={() => onEditSubsubtopic(ss)}
                onDelete={() => onDeleteSubsubtopic(ss)}
                editLabel="Rename"
              >
                <FolderRow
                  icon={<FolderOpen size={14} />}
                  name={ss.name}
                  meta={`${ss.notes.length} note${ss.notes.length === 1 ? '' : 's'}`}
                  onClick={() => onOpenSubsubtopic(ss.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddSubsubtopic}>
        <Plus /> Subsubtopic
      </button>

      {notes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{notes.length}</span>
          </div>
          <div className="notes-list">
            {notes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way: labelWay(topicName), topic: labelTopic(subtopic.name) }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>
    </>
  );
}

// ── Subsubtopic: notes in the subsubtopic ──────────────────────────────────

function SubsubtopicLevel({
  subsubtopic, subtopicName, search, onSearch, matchesQuery, onOpenNote, onAddNote, onEditNote, onDeleteNote,
}: {
  subsubtopic: Subsubtopic;
  subtopicName: string;
  search: string;
  onSearch: (s: string) => void;
  matchesQuery: (n: Note) => boolean;
  onOpenNote: (id: string) => void;
  onAddNote: () => void;
  onEditNote: (n: Note) => void;
  onDeleteNote: (n: Note) => void;
}) {
  const notes = subsubtopic.notes.filter(matchesQuery)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });

  return (
    <>
      <div className="search-pill">
        <Search />
        <input
          type="search"
          placeholder={`Search ${subsubtopic.name}…`}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {notes.length > 0 && (
        <>
          <div className="section-bar">
            <span className="sec-title">Notes</span>
            <span className="sec-rule" />
            <span className="sec-meta">{notes.length}</span>
          </div>
          <div className="notes-list">
            {notes.map((n) => (
              <SwipeableRow
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                onEdit={() => onEditNote(n)}
                onDelete={() => onDeleteNote(n)}
                editLabel="Rename"
              >
                <NoteCard
                  row={{ note: n, way: labelWay(subtopicName), topic: labelTopic(subsubtopic.name) }}
                  hideWayLabel
                  onClick={() => onOpenNote(n.id)}
                />
              </SwipeableRow>
            ))}
          </div>
        </>
      )}

      <button type="button" className="m-add-btn" onClick={onAddNote}>
        <Plus /> Note
      </button>
    </>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────

function FolderRow({
  icon, name, meta, onClick,
}: { icon: React.ReactNode; name: string; meta: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="m-folder-row">
      <span className="m-folder-icon">{icon}</span>
      <span className="m-folder-name">{name}</span>
      <span className="m-folder-meta">{meta}</span>
      <span className="m-folder-chev"><ChevronRight size={14} /></span>
    </button>
  );
}

function NoteCard({
  row, hideWayLabel, onClick,
}: {
  row: { note: Note; way: Way; topic: Topic | null };
  hideWayLabel?: boolean;
  onClick: () => void;
}) {
  const { note, way, topic } = row;
  const wayLabel = topic ? `${way.name} · ${topic.name}` : way.name;
  return (
    <article
      className="note-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      style={{ cursor: 'pointer' }}
    >
      {!hideWayLabel && (
        <header className="nc-head">
          <div className="nc-way">
            {note.pinned && <span className="note-pin">●</span>}
            {wayLabel}
          </div>
          <span className="nc-time">{formatTimestamp(note.updated_at)}</span>
        </header>
      )}
      {hideWayLabel && note.pinned && (
        <span className="note-pin" style={{ float: 'right' }}>●</span>
      )}
      <h3 className="nc-title">{note.name || 'Untitled'}</h3>
      {note.content && <p className="nc-preview">{previewText(note.content)}</p>}
      {note.tags.length > 0 && (
        <footer className="nc-foot">
          {note.tags.map((t) => (
            <span key={t.id} className="note-tag" style={{ color: t.color }}>#{t.name}</span>
          ))}
        </footer>
      )}
    </article>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '32px 20px', textAlign: 'center', color: 'var(--ink-4)',
      fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
    }}>{children}</div>
  );
}
