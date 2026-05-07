import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ChevronLeft, FolderPlus, FileText, Pin,
  Search, Loader2, Layers, Folder, Check,
} from 'lucide-react';
import { toast } from 'sonner';
// Heavy editor (~280 KB gzip with tiptap+lowlight+katex). Lazy-load only when
// a note is actually opened so the notes-list view doesn't pay the cost.
const RichTextEditor = lazy(() => import('./RichTextEditor'));
const EditorFallback = () => (
  <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 13 }}>Loading editor…</div>
);
import SwipeRow from './SwipeRow';
import LongPressRow from './LongPressRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import NoteTitle from './NoteTitle';
import MobileNavbar from './MobileNavbar';
import AddItemButton from './AddItemButton';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { useT } from '../store/i18n';
import { useAuthStore } from '../store/auth';
import { resolveUrl } from '../api/client';
import { useNotesLibrary } from '../features/notes/hooks/useNotesLibrary';
import { useNoteAutoSave } from '../features/notes/hooks/useNoteAutoSave';
import type { Note, Way } from '../api/types';
import CreateSheet, { FormField } from './CreateSheet';

type Selection =
  | { kind: 'note'; noteId: string; parentType: 'way' | 'topic'; parentId: string }
  | null;

type AddingState =
  | { kind: 'way' }
  | { kind: 'topic'; wayId: string }
  | { kind: 'topic-note'; wayId: string; topicId: string }
  | { kind: 'way-note'; wayId: string }
  | null;

type RenameState =
  | { kind: 'way'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'note'; id: string }
  | null;

// Mobile navigation state
type MobileView =
  | { kind: 'root' }                      // list of ways
  | { kind: 'way'; wayId: string }        // inside a way — shows topics + way note
  | { kind: 'topic'; topicId: string }    // inside a topic — shows notes
  | { kind: 'note'; noteId: string };     // editor view (note detail)

export default function Notes() {
  const t = useT();

  // Shared library + autosave hooks (also used by features/notes/ on desktop).
  const library = useNotesLibrary();
  const save    = useNoteAutoSave(() => { void library.refresh(); });
  const { ways, loading } = library;

  const [expandedWays, setExpandedWays] = useState<Set<string>>(new Set());
  const [, setExpandedTopics] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(() => {
    try {
      const raw = localStorage.getItem('notes:selection');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  // Persist selection to localStorage
  useEffect(() => {
    if (selection) localStorage.setItem('notes:selection', JSON.stringify(selection));
    else localStorage.removeItem('notes:selection');
  }, [selection]);

  const [adding, setAdding] = useState<AddingState>(null);
  const [addName, setAddName] = useState('');
  const [renaming, setRenaming] = useState<RenameState>(null);
  const [renameValue, setRenameValue] = useState('');

  const [search, setSearch] = useState('');

  // Detect mobile (<768px)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mobile navigation stack
  const [mobileView, setMobileView] = useState<MobileView>({ kind: 'root' });

  // ── Auto-expand parent way/topic for restored selection ─────────────────
  useEffect(() => {
    if (loading || ways.length === 0) return;
    if (expandedWays.size === 0) {
      setExpandedWays(new Set([ways[0].id]));
    }
    if (selection) {
      for (const w of ways) {
        for (const tp of w.topics) {
          if (tp.id === selection.parentId || tp.notes.some((n) => n.id === selection.noteId)) {
            setExpandedWays((p) => new Set([...p, w.id]));
            setExpandedTopics((p) => new Set([...p, tp.id]));
          }
        }
        if (w.id === selection.parentId || w.notes?.some((n) => n.id === selection.noteId)) {
          setExpandedWays((p) => new Set([...p, w.id]));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ways.length]);

  // iOS swipe-back gesture: from-left-edge swipe closes the note view
  useSwipeBack({
    onBack: async () => {
      if (selection) {
        // Flush pending edits before navigating away.
        await save.flush();
        // Restore the hierarchy view to the note's parent. Without this,
        // mobileView stays at { kind: 'note' } while currentNote becomes null,
        // and MobileHierarchy has no matching branch → blank screen, requiring
        // a second swipe to climb out.
        if (selection.parentType === 'topic') {
          setMobileView({ kind: 'topic', topicId: selection.parentId });
        } else if (selection.parentType === 'way') {
          setMobileView({ kind: 'way', wayId: selection.parentId });
        } else {
          setMobileView({ kind: 'root' });
        }
        setSelection(null);
      }
    },
    enabled: isMobile && !!selection,
  });

  // ── Find currently selected note ──────────────────────────────────────────
  const currentNote: Note | null = useMemo(() => {
    if (!selection) return null;
    for (const way of ways) {
      if (selection.parentType === 'way' && way.id === selection.parentId) {
        const n = way.notes.find((n) => n.id === selection.noteId);
        if (n) return n;
      }
      for (const topic of way.topics) {
        if (selection.parentType === 'topic' && topic.id === selection.parentId) {
          const n = topic.notes.find((n) => n.id === selection.noteId);
          if (n) return n;
        }
      }
    }
    return null;
  }, [ways, selection]);

  // Autosave is fully handled by useNoteAutoSave (debounce + flush on unmount).
  // When the selected note changes we flush any pending writes for the previous one.
  const prevNoteIdRef = useState<{ current: string | null }>({ current: null })[0];
  useEffect(() => {
    const newId = currentNote?.id ?? null;
    if (prevNoteIdRef.current && prevNoteIdRef.current !== newId) {
      void save.flush();
    }
    prevNoteIdRef.current = newId;
  }, [currentNote?.id, save, prevNoteIdRef]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !addName.trim()) { cancelAdd(); return; }
    const name = addName.trim();
    await save.flush();
    if (adding.kind === 'way') {
      const newWay = await library.createWay(name);
      if (newWay) setExpandedWays((p) => new Set([...p, newWay.id]));
    } else if (adding.kind === 'topic') {
      await library.createTopic(adding.wayId, name);
      setExpandedWays((p) => new Set([...p, adding.wayId]));
    } else if (adding.kind === 'topic-note') {
      const note = await library.createNote({ topic_id: adding.topicId }, name);
      setExpandedTopics((p) => new Set([...p, adding.topicId]));
      cancelAdd();
      if (note) setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: adding.topicId });
      return;
    } else if (adding.kind === 'way-note') {
      const note = await library.createNote({ way_id: adding.wayId }, name);
      setExpandedWays((p) => new Set([...p, adding.wayId]));
      cancelAdd();
      if (note) setSelection({ kind: 'note', noteId: note.id, parentType: 'way', parentId: adding.wayId });
      return;
    }
    cancelAdd();
  };

  const cancelAdd = () => { setAdding(null); setAddName(''); };

  const startRename = (state: NonNullable<RenameState>, currentName: string) => {
    setRenaming(state); setRenameValue(currentName);
  };

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { cancelRename(); return; }
    const name = renameValue.trim();
    if (renaming.kind === 'way')        await library.renameWay(renaming.id, name);
    else if (renaming.kind === 'topic') await library.renameTopic(renaming.id, name);
    else if (renaming.kind === 'note')  await library.renameNote(renaming.id, name);
    cancelRename();
  };

  const cancelRename = () => { setRenaming(null); setRenameValue(''); };

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmState({ title, message, onConfirm });

  // Mobile drag state (long-press triggers, then tap on target to drop)
  const [mobileDragNoteId, setMobileDragNoteId] = useState<string | null>(null);

  const deleteWay = (id: string) => {
    askConfirm(t('notes.deleteWay'), t('notes.deleteWayMsg'), async () => {
      if (selection && selection.parentId === id) setSelection(null);
      if (mobileView.kind === 'way' && mobileView.wayId === id) setMobileView({ kind: 'root' });
      await library.deleteWay(id);
      toast.success('Way deleted');
    });
  };

  const deleteTopic = (id: string) => {
    askConfirm('Delete topic?', 'This will delete the topic and all its notes.', async () => {
      if (selection && selection.parentId === id) setSelection(null);
      if (mobileView.kind === 'topic' && mobileView.topicId === id) {
        const parentWay = ways.find((w) => w.topics.some((t) => t.id === id));
        if (parentWay) setMobileView({ kind: 'way', wayId: parentWay.id });
        else setMobileView({ kind: 'root' });
      }
      await library.deleteTopic(id);
      toast.success('Topic deleted');
    });
  };

  const deleteNote = (id: string) => {
    askConfirm('Delete note?', 'This cannot be undone.', async () => {
      if (selection?.noteId === id) setSelection(null);
      await library.deleteNote(id);
      toast.success('Note deleted');
    });
  };

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredWays = useMemo(() => {
    if (!search.trim()) return ways;
    const q = search.toLowerCase();
    return ways
      .map((way) => {
        const topics = way.topics
          .map((topic) => {
            const notes = topic.notes.filter((n) => n.name.toLowerCase().includes(q));
            const topicMatches = topic.name.toLowerCase().includes(q);
            if (topicMatches || notes.length) {
              return { ...topic, notes: topicMatches ? topic.notes : notes };
            }
            return null;
          })
          .filter(Boolean) as typeof way.topics;
        const wayMatches = way.name.toLowerCase().includes(q);
        const wayNotes = way.notes.filter((n) => n.name.toLowerCase().includes(q));
        if (wayMatches || topics.length || wayNotes.length) {
          return {
            ...way,
            topics: wayMatches ? way.topics : topics,
            notes: wayMatches ? way.notes : wayNotes,
          };
        }
        return null;
      })
      .filter(Boolean) as Way[];
  }, [ways, search]);

  // ── Shared input components ───────────────────────────────────────────────
  const RenameInput = ({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) => (
    <div className="px-2 py-1">
      <input
        type="text"
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
        onBlur={() => (renameValue.trim() ? onCommit() : onCancel())}
        className="input w-full"
        autoFocus
      />
    </div>
  );

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    // Mobile editor view — triggered by selection OR mobileView.kind === 'note'
    if (currentNote) {
      // Determine back destination from selection state
      const backToTopic = selection?.parentType === 'topic' ? selection.parentId : null;
      const backToWay = selection?.parentType === 'way' ? selection.parentId : null;

      // Non-blocking back: navigate immediately, save in background
      const handleBack = () => {
        // Fire and forget — don't block navigation while saving
        void save.flush();
        setSelection(null);
        if (backToTopic) {
          setMobileView({ kind: 'topic', topicId: backToTopic });
        } else if (backToWay) {
          setMobileView({ kind: 'way', wayId: backToWay });
        } else {
          setMobileView({ kind: 'root' });
        }
      };

      // Build crumb for navbar
      const wayName = ways.find((w) => w.id === currentNote.way_id)?.name;
      const topicName = ways.flatMap((w) => w.topics ?? []).find((tp) => tp.id === currentNote.topic_id)?.name;
      const crumb = topicName ?? wayName;

      return (
        <>
          <ConfirmDialog
            open={confirmState !== null}
            title={confirmState?.title ?? ''}
            message={confirmState?.message}
            onCancel={() => setConfirmState(null)}
            onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
          />
        <div className="note-mobile-shell">
          <div
            className="note-mobile-scroll"
            ref={(el) => {
              if (!el) return;
              const onScroll = () => {
                const scrolled = el.scrollTop > 8;
                el.parentElement?.setAttribute('data-scrolled', scrolled ? 'true' : 'false');
              };
              el.removeEventListener('scroll', onScroll);
              el.addEventListener('scroll', onScroll, { passive: true });
            }}
          >
            <div className="note-mobile-header">
              <button onClick={handleBack} className="note-back-circle" aria-label="Back">
                <ChevronLeft size={20} />
              </button>
              {crumb && (
                <div className="note-crumb">
                  <span className="crumb">{crumb}</span>
                  <span className="crumb-sep">/</span>
                  <span className="crumb-current">{currentNote.name || 'Untitled'}</span>
                </div>
              )}
              <span className="notes-saved-pill">
                {save.saving
                  ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                  : save.savedAt ? <><Check size={11} /> Saved</> : null}
              </span>
            </div>
            <div style={{ padding: '4px 20px 4px' }}>
              <NoteTitle
                key={currentNote.id + '-title'}
                initial={currentNote.name}
                onChange={(newName) => {
                  if (newName === currentNote.name) return;
                  void library.renameNote(currentNote.id, newName);
                }}
              />
              <div className="doc-tags" style={{ marginTop: 8 }}>
                <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={library.refresh} />
              </div>
            </div>
            <div style={{ padding: '0 20px 80px' }}>
              <Suspense fallback={<EditorFallback />}>
                <RichTextEditor
                  key={currentNote.id}
                  noteId={currentNote.id}
                  content={currentNote.content}
                  onChange={(html) => save.queueSave(currentNote.id, { content: html })}
                />
              </Suspense>
            </div>
          </div>
        </div>
        </>
      );
    }

    // Mobile hierarchy views
    const addingTitle = !adding ? '' : adding.kind === 'way' ? 'New way' : adding.kind === 'topic' ? 'New topic' : 'New note';
    const addingLabel = !adding ? '' : adding.kind === 'way' ? 'Create way' : adding.kind === 'topic' ? 'Add topic' : 'Add note';
    return (
      <>
        <ConfirmDialog
          open={confirmState !== null}
          title={confirmState?.title ?? ''}
          message={confirmState?.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
        />
        <CreateSheet
          open={adding !== null}
          onClose={cancelAdd}
          title={addingTitle}
          primaryLabel={addingLabel}
          canSubmit={!!addName.trim()}
          onSubmit={async () => { await commitAdd(); }}
        >
          <FormField label="Name">
            <input type="text" className="input w-full" value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={addingTitle.toLowerCase()} />
          </FormField>
        </CreateSheet>
      <MobileHierarchy
        view={mobileView}
        setView={setMobileView}
        ways={filteredWays}
        search={search}
        setSearch={setSearch}
        adding={adding}
        setAdding={setAdding}
        renaming={renaming}
        startRename={startRename}
        commitRename={commitRename}
        cancelRename={cancelRename}
        RenameInput={RenameInput}
        onSelectNote={(noteId, parentType, parentId) => {
          setSelection({ kind: 'note', noteId, parentType, parentId });
          setMobileView({ kind: 'note', noteId });
        }}
        onDeleteWay={deleteWay}
        onDeleteTopic={deleteTopic}
        onDeleteNote={deleteNote}
        mobileDragNoteId={mobileDragNoteId}
        onStartMobileDrag={(noteId) => {
          setMobileDragNoteId(noteId);
          toast.info('Tap a way or topic to move the note, or tap here to cancel.', { duration: 4000 });
        }}
        onDropMobileDrag={async (target) => {
          if (!mobileDragNoteId) return;
          await library.moveNote(mobileDragNoteId, target.kind === 'way' ? { way_id: target.id } : { topic_id: target.id });
          toast.success(t('notes.moveToast'));
          setMobileDragNoteId(null);
        }}
        onCancelMobileDrag={() => setMobileDragNoteId(null)}
      />
      </>
    );
  }

  // Notes.tsx is mobile-only — desktop renders via features/notes/.
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// MOBILE HIERARCHY
// ═══════════════════════════════════════════════════════════════════════════

const getSnippet = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

const getNoteWordCount = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;

const getReadTime = (html: string) =>
  Math.max(1, Math.round(getNoteWordCount(html) / 200));

function MobileHierarchy({
  view,
  setView,
  ways,
  search,
  setSearch,
  adding,
  setAdding,
  renaming,
  startRename,
  commitRename,
  cancelRename,
  RenameInput,
  onSelectNote,
  onDeleteWay,
  onDeleteTopic,
  onDeleteNote,
  mobileDragNoteId,
  onStartMobileDrag,
  onDropMobileDrag,
  onCancelMobileDrag,
}: {
  view: MobileView;
  setView: (v: MobileView) => void;
  ways: Way[];
  search: string;
  setSearch: (s: string) => void;
  adding: AddingState;
  setAdding: (a: AddingState) => void;
  renaming: RenameState;
  startRename: (state: NonNullable<RenameState>, name: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  RenameInput: React.FC<{ onCommit: () => void; onCancel: () => void }>;
  onSelectNote: (noteId: string, parentType: 'way' | 'topic', parentId: string) => void;
  onDeleteWay: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onDeleteNote: (id: string) => void;
  mobileDragNoteId: string | null;
  onStartMobileDrag: (noteId: string) => void;
  onDropMobileDrag: (target: { kind: 'way' | 'topic'; id: string }) => void;
  onCancelMobileDrag: () => void;
}) {
  const { user } = useAuthStore();
  const currentWay = view.kind === 'way' ? ways.find((w) => w.id === view.wayId) : null;
  const currentTopic = view.kind === 'topic'
    ? ways.flatMap((w) => w.topics).find((t) => t.id === view.topicId)
    : null;
  const parentWayOfTopic = view.kind === 'topic'
    ? ways.find((w) => w.topics.some((t) => t.id === view.topicId))
    : null;

  const goBack = () => {
    if (view.kind === 'way') setView({ kind: 'root' });
    else if (view.kind === 'topic' && parentWayOfTopic) setView({ kind: 'way', wayId: parentWayOfTopic.id });
    else if (view.kind === 'note') {
      // Find the note's parent and step out one level.
      for (const w of ways) {
        if (w.notes?.some((n) => n.id === view.noteId)) { setView({ kind: 'way', wayId: w.id }); return; }
        for (const tp of w.topics ?? []) {
          if (tp.notes?.some((n) => n.id === view.noteId)) { setView({ kind: 'topic', topicId: tp.id }); return; }
        }
      }
      setView({ kind: 'root' });
    }
    else setView({ kind: 'root' });
  };

  useSwipeBack({ onBack: goBack, enabled: view.kind !== 'root' });

  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleAvatarTap = () =>
    window.dispatchEvent(new CustomEvent('jarvnote:drawerOpen'));

  // ── ROOT VIEW ──────────────────────────────────────────────────────────────
  if (view.kind === 'root') {
    return (
      <div className="size-full flex flex-col" style={{ background: 'var(--bg-app)' }}>
        {mobileDragNoteId && (
          <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-notes-bg)', flexShrink: 0 }}>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--accent-notes-fg)' }}>
              Moving note — tap a way to drop
            </div>
            <button onClick={onCancelMobileDrag} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="big-title-row">
            <div>
              <div className="big-title">Notes</div>
              <div className="big-title-sub">{ways.length} way{ways.length !== 1 ? 's' : ''}</div>
            </div>
            {user && (
              <button onClick={handleAvatarTap} className="profile-btn" title="Profile">
                {user.avatar_url ? (
                  <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
                ) : (
                  <span className="profile-avatar">{user.username.charAt(0).toUpperCase()}</span>
                )}
              </button>
            )}
          </div>
          <div className="search-field" style={{ margin: '0 12px 10px' }}>
            <Search size={14} />
            <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {ways.length === 0 && !adding && (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
              No ways yet. Tap below to create one.
            </div>
          )}

          {ways.length > 0 && (
            <div className="group-card">
              {ways.map((way) => (
                <div key={way.id}>
                  {renaming?.kind === 'way' && renaming.id === way.id ? (
                    <div style={{ padding: '4px 12px' }}>
                      <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                    </div>
                  ) : (
                    <SwipeRow
                      onEdit={() => startRename({ kind: 'way', id: way.id }, way.name)}
                      onDelete={() => onDeleteWay(way.id)}
                    >
                      <button
                        className="lib-row"
                        onClick={() => {
                          if (mobileDragNoteId) onDropMobileDrag({ kind: 'way', id: way.id });
                          else setView({ kind: 'way', wayId: way.id });
                        }}
                        style={mobileDragNoteId ? { background: 'var(--accent-notes-bg)' } : undefined}
                      >
                        <div className="lib-row-icon" style={{ background: 'var(--accent-notes-bg)', color: 'var(--accent-notes)' }}>
                          <Layers size={14} />
                        </div>
                        <div className="lib-row-info">
                          <div className="lib-row-title">{way.name}</div>
                          <div className="lib-row-sub">
                            {way.topics.length > 0 ? `${way.topics.length} topic${way.topics.length !== 1 ? 's' : ''}` : ''}
                            {way.topics.length > 0 && way.notes.length > 0 ? ' · ' : ''}
                            {way.notes.length > 0 ? `${way.notes.length} note${way.notes.length !== 1 ? 's' : ''}` : ''}
                            {way.topics.length === 0 && way.notes.length === 0 ? 'Empty' : ''}
                          </div>
                        </div>
                        <ChevronRight className="lib-row-chev" />
                      </button>
                    </SwipeRow>
                  )}
                </div>
              ))}
            </div>
          )}

          <AddItemButton label="Add Way" onClick={() => setAdding({ kind: 'way' })} />
        </div>
      </div>
    );
  }

  // ── WAY VIEW ───────────────────────────────────────────────────────────────
  if (view.kind === 'way' && currentWay) {
    return (
      <div className="size-full flex flex-col" style={{ background: 'var(--bg-app)' }}>
        {user && (
          <MobileNavbar
            variant="compact"
            title={currentWay.name}
            user={user}
            onBack={goBack}
            onAvatarTap={handleAvatarTap}
          />
        )}

        {/* Add-menu backdrop */}
        {showAddMenu && (
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAddMenu(false)}>
            <div
              style={{ position: 'absolute', top: 56, right: 12, background: 'var(--bg-elevated)', borderRadius: 'var(--r-card)', boxShadow: 'var(--sh-popover)', padding: 6, minWidth: 160, zIndex: 41 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="lib-row" onClick={() => { setAdding({ kind: 'way-note', wayId: currentWay.id }); setShowAddMenu(false); }}>
                <FileText size={14} style={{ flexShrink: 0 }} /> <span>New note</span>
              </button>
              <button className="lib-row" onClick={() => { setAdding({ kind: 'topic', wayId: currentWay.id }); setShowAddMenu(false); }}>
                <FolderPlus size={14} style={{ flexShrink: 0 }} /> <span>New topic</span>
              </button>
            </div>
          </div>
        )}

        {mobileDragNoteId && (
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-notes-bg)', flexShrink: 0 }}>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--accent-notes-fg)' }}>Moving note — tap to drop</div>
            <button onClick={onCancelMobileDrag} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ paddingTop: 10 }}>
          {/* Search within way */}
          <div className="search-field" style={{ margin: '0 12px 10px' }}>
            <Search size={14} />
            <input type="text" placeholder="Search in way…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {/* Direct notes group */}
          {currentWay.notes.length > 0 && (
            <>
              <div style={{ padding: '0 12px 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>Notes</div>
              <div className="group-card">
                {mobileDragNoteId && (
                  <button className="lib-row" onClick={() => onDropMobileDrag({ kind: 'way', id: currentWay.id })} style={{ color: 'var(--accent-notes-fg)', background: 'var(--accent-notes-bg)' }}>
                    ↓ Drop here
                  </button>
                )}
                {currentWay.notes.map((note, idx) => (
                  <div key={note.id} style={idx > 0 ? { borderTop: '0.5px solid var(--line)' } : undefined}>
                    {renaming?.kind === 'note' && renaming.id === note.id ? (
                      <div style={{ padding: '4px 12px' }}><RenameInput onCommit={commitRename} onCancel={cancelRename} /></div>
                    ) : (
                      <LongPressRow
                        onSwipeEdit={() => startRename({ kind: 'note', id: note.id }, note.name)}
                        onSwipeDelete={() => onDeleteNote(note.id)}
                        onLongPress={() => onStartMobileDrag(note.id)}
                        isDragging={mobileDragNoteId === note.id}
                      >
                        <button className="lib-row" onClick={() => { if (!mobileDragNoteId) onSelectNote(note.id, 'way', currentWay.id); }}>
                          <div className="lib-row-icon" style={{ background: 'var(--bg-input)', color: note.pinned ? 'var(--accent-notes)' : 'var(--fg-muted)' }}>
                            {note.pinned ? <Pin size={13} style={{ fill: 'currentColor' }} /> : <FileText size={13} />}
                          </div>
                          <div className="lib-row-info">
                            <div className="lib-row-title">{note.name}</div>
                          </div>
                          <ChevronRight className="lib-row-chev" />
                        </button>
                      </LongPressRow>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <AddItemButton label="Add Note" onClick={() => setAdding({ kind: 'way-note', wayId: currentWay.id })} />

          {/* Topics group */}
          {currentWay.topics.length > 0 && (
            <>
              <div style={{ padding: '4px 12px 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)' }}>Topics</div>
              <div className="group-card">
                {currentWay.topics.map((topic) => (
                  <div key={topic.id}>
                    {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                      <div style={{ padding: '4px 12px' }}><RenameInput onCommit={commitRename} onCancel={cancelRename} /></div>
                    ) : (
                      <SwipeRow
                        onEdit={() => startRename({ kind: 'topic', id: topic.id }, topic.name)}
                        onDelete={() => onDeleteTopic(topic.id)}
                      >
                        <button
                          className="lib-row"
                          onClick={() => {
                            if (mobileDragNoteId) onDropMobileDrag({ kind: 'topic', id: topic.id });
                            else setView({ kind: 'topic', topicId: topic.id });
                          }}
                          style={mobileDragNoteId ? { background: 'var(--accent-notes-bg)' } : undefined}
                        >
                          <div className="lib-row-icon" style={{ background: 'var(--bg-input)', color: 'var(--fg-muted)' }}>
                            <Folder size={13} />
                          </div>
                          <div className="lib-row-info">
                            <div className="lib-row-title">{topic.name}</div>
                            <div className="lib-row-sub">{topic.notes.length} note{topic.notes.length !== 1 ? 's' : ''}</div>
                          </div>
                          <ChevronRight className="lib-row-chev" />
                        </button>
                      </SwipeRow>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {currentWay.topics.length === 0 && currentWay.notes.length === 0 && !adding && (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
              Empty. Add a topic or note below.
            </div>
          )}

          <AddItemButton label="Add Topic" onClick={() => setAdding({ kind: 'topic', wayId: currentWay.id })} />
        </div>
      </div>
    );
  }

  // ── TOPIC VIEW ─────────────────────────────────────────────────────────────
  if (view.kind === 'topic' && currentTopic) {
    return (
      <div className="size-full flex flex-col" style={{ background: 'var(--bg-app)' }}>
        {user && (
          <MobileNavbar
            variant="compact"
            title={currentTopic.name}
            crumb={parentWayOfTopic?.name}
            user={user}
            onBack={goBack}
            onAvatarTap={handleAvatarTap}
          />
        )}

        {mobileDragNoteId && (
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-notes-bg)', flexShrink: 0 }}>
            <button className="lib-row" style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--accent-notes-fg)', background: 'transparent' }} onClick={() => onDropMobileDrag({ kind: 'topic', id: currentTopic.id })}>
              ↓ Drop here (in "{currentTopic.name}")
            </button>
            <button onClick={onCancelMobileDrag} className="btn btn-secondary btn-sm">Cancel</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" style={{ paddingTop: 10 }}>
          {/* Search */}
          <div className="search-field" style={{ margin: '0 12px 10px' }}>
            <Search size={14} />
            <input type="text" placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {currentTopic.notes.length === 0 && !adding && (
            <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--fg-muted)' }}>
              No notes yet. Tap below to create one.
            </div>
          )}

          {currentTopic.notes.length > 0 && (
            <div className="group-card">
              {currentTopic.notes.map((note, idx) => (
                <div key={note.id} style={idx > 0 ? { borderTop: '0.5px solid var(--line)' } : undefined}>
                  {renaming?.kind === 'note' && renaming.id === note.id ? (
                    <div style={{ padding: '4px 12px' }}><RenameInput onCommit={commitRename} onCancel={cancelRename} /></div>
                  ) : (
                    <LongPressRow
                      onSwipeEdit={() => startRename({ kind: 'note', id: note.id }, note.name)}
                      onSwipeDelete={() => onDeleteNote(note.id)}
                      onLongPress={() => onStartMobileDrag(note.id)}
                      isDragging={mobileDragNoteId === note.id}
                    >
                      <button
                        className="note-card"
                        onClick={() => { if (!mobileDragNoteId) onSelectNote(note.id, 'topic', currentTopic.id); }}
                      >
                        <div className="note-card-title">{note.name}</div>
                        {note.content && (
                          <div className="note-card-snippet">{getSnippet(note.content)}</div>
                        )}
                        <div className="note-card-meta">
                          {note.updated_at && (
                            <span>{new Date(note.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                          )}
                          {note.content && (
                            <><span>·</span><span>{getReadTime(note.content)} min read</span></>
                          )}
                          {note.pinned && (
                            <><span>·</span><Pin size={10} style={{ color: 'var(--accent-notes)' }} /></>
                          )}
                        </div>
                      </button>
                    </LongPressRow>
                  )}
                </div>
              ))}
            </div>
          )}

          <AddItemButton label="Add note" onClick={() => {
            if (parentWayOfTopic) setAdding({ kind: 'topic-note', wayId: parentWayOfTopic.id, topicId: currentTopic.id });
          }} />
        </div>
      </div>
    );
  }

  // Fallback (note view handled in parent)
  return null;
}
