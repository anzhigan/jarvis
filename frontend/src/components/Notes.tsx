import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronLeft,
  FolderPlus,
  FileText,
  Pin,
  PinOff,
  FilePlus,
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  BookOpen,
  Layers,
  Folder,
  FolderOpen,
  PanelRightClose,
  ChevronsRight,
  Check,
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
import { notesApi, topicsApi, waysApi, resolveUrl } from '../api/client';
import { useAuthStore } from '../store/auth';
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
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedWays, setExpandedWays] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
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

  // Desktop sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    return localStorage.getItem('jarvnote:notes:libOpen') !== '0';
  });
  // Right context panel visibility
  const [contextOpen, setContextOpen] = useState(() => {
    return localStorage.getItem('jarvnote:notes:ctxOpen') !== '0';
  });
  useEffect(() => { localStorage.setItem('jarvnote:notes:libOpen', sidebarOpen ? '1' : '0'); }, [sidebarOpen]);
  useEffect(() => { localStorage.setItem('jarvnote:notes:ctxOpen', contextOpen ? '1' : '0'); }, [contextOpen]);

  // Editor state
  const [editorState, setEditorState] = useState<{ noteId: string; content: string; dirty: boolean } | null>(null);
  const editorStateRef = useRef(editorState);
  editorStateRef.current = editorState;

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadWays = async () => {
    try {
      const data = await waysApi.list();
      setWays(data);
      if (data.length > 0 && expandedWays.size === 0) {
        setExpandedWays(new Set([data[0].id]));
      }
      // If we have a restored selection, expand its parent way/topic
      if (selection) {
        for (const w of data) {
          for (const t of w.topics) {
            if (t.id === selection.parentId || t.notes.some((n) => n.id === selection.noteId)) {
              setExpandedWays((p) => new Set([...p, w.id]));
              setExpandedTopics((p) => new Set([...p, t.id]));
            }
          }
          if (w.id === selection.parentId || w.notes?.some((n) => n.id === selection.noteId)) {
            setExpandedWays((p) => new Set([...p, w.id]));
          }
        }
      }
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load knowledge base');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWays(); }, []);

  // iOS swipe-back gesture: from-left-edge swipe closes the note view
  useSwipeBack({
    onBack: async () => {
      if (selection) {
        // Save and exit
        const st = editorStateRef.current;
        if (st?.dirty) {
          try { await notesApi.update(st.noteId, { content: st.content }); } catch {}
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

  // ── Autosave ──────────────────────────────────────────────────────────────
  const saveCurrentEditor = async (): Promise<void> => {
    const st = editorStateRef.current;
    if (!st || !st.dirty) return;
    setSaving(true);
    try {
      await notesApi.update(st.noteId, { content: st.content });
      // Update local ways state in-place so content matches server
      setWays((prev) => prev.map((w) => ({
        ...w,
        notes: w.notes.map((n) => n.id === st.noteId ? { ...n, content: st.content } : n),
        topics: w.topics.map((t) => ({
          ...t,
          notes: t.notes.map((n) => n.id === st.noteId ? { ...n, content: st.content } : n),
        })),
      })));
      if (editorStateRef.current && editorStateRef.current.noteId === st.noteId && editorStateRef.current.content === st.content) {
        setEditorState({ ...editorStateRef.current, dirty: false });
      }
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const newNoteId = currentNote?.id ?? null;
    const prev = editorStateRef.current;
    if (prev && prev.noteId === newNoteId) return;

    if (prev && prev.dirty) {
      notesApi.update(prev.noteId, { content: prev.content }).catch(() => {});
    }

    if (currentNote) {
      setEditorState({ noteId: currentNote.id, content: currentNote.content, dirty: false });
    } else {
      setEditorState(null);
    }
  }, [currentNote?.id]);

  useEffect(() => {
    if (!editorState?.dirty) return;
    const snapshot = editorState;
    const timer = setTimeout(() => {
      const cur = editorStateRef.current;
      if (cur && cur.noteId === snapshot.noteId && cur.content === snapshot.content && cur.dirty) {
        saveCurrentEditor();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [editorState?.noteId, editorState?.content, editorState?.dirty]);

  useEffect(() => {
    const onBeforeUnload = () => {
      const st = editorStateRef.current;
      if (st && st.dirty) {
        const token = localStorage.getItem('access_token');
        if (token) {
          // Use sendBeacon when available — guaranteed to fire on unload
          // and doesn't trigger CORS preflight. Fall back to keepalive fetch.
          const url = `${import.meta.env.VITE_API_URL ?? '/api'}/notes/${st.noteId}`;
          const body = JSON.stringify({ content: st.content });
          try {
            fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body,
              keepalive: true,
            }).catch((err) => {
              console.warn('[Notes] keepalive save failed', err);
            });
          } catch (err) {
            console.warn('[Notes] keepalive save threw', err);
          }
        }
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      const st = editorStateRef.current;
      if (st && st.dirty) {
        notesApi.update(st.noteId, { content: st.content })
          .catch((err) => console.warn('[Notes] cleanup save failed', err));
      }
    };
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !addName.trim()) { cancelAdd(); return; }
    const name = addName.trim();
    await saveCurrentEditor();
    if (adding.kind === 'way') {
      const newWay = await waysApi.create(name, ways.length);
      setExpandedWays((p) => new Set([...p, newWay.id]));
    } else if (adding.kind === 'topic') {
      const way = ways.find((w) => w.id === adding.wayId);
      await topicsApi.create(adding.wayId, name, way?.topics.length ?? 0);
      setExpandedWays((p) => new Set([...p, adding.wayId]));
    } else if (adding.kind === 'topic-note') {
      const note = await notesApi.create({ name, topic_id: adding.topicId, content: '' });
      setExpandedTopics((p) => new Set([...p, adding.topicId]));
      await loadWays();
      cancelAdd();
      setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: adding.topicId });
      return;
    } else if (adding.kind === 'way-note') {
      const note = await notesApi.create({ name, way_id: adding.wayId, content: '' });
      setExpandedWays((p) => new Set([...p, adding.wayId]));
      await loadWays();
      cancelAdd();
      setSelection({ kind: 'note', noteId: note.id, parentType: 'way', parentId: adding.wayId });
      return;
    }
    await loadWays();
    cancelAdd();
  };

  const cancelAdd = () => { setAdding(null); setAddName(''); };

  const startRename = (state: NonNullable<RenameState>, currentName: string) => {
    setRenaming(state); setRenameValue(currentName);
  };

  const commitRename = async () => {
    if (!renaming || !renameValue.trim()) { cancelRename(); return; }
    const name = renameValue.trim();
    try {
      if (renaming.kind === 'way') await waysApi.update(renaming.id, { name });
      else if (renaming.kind === 'topic') await topicsApi.update(renaming.id, { name });
      else if (renaming.kind === 'note') await notesApi.update(renaming.id, { name });
      await loadWays();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to rename');
    } finally { cancelRename(); }
  };

  const cancelRename = () => { setRenaming(null); setRenameValue(''); };

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState<{ title: string; message?: string; onConfirm: () => void } | null>(null);
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirmState({ title, message, onConfirm });

  // Drag & drop state
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<{ kind: 'way' | 'topic'; id: string } | null>(null);

  // Mobile drag state (long-press triggers, then tap on target to drop)
  const [mobileDragNoteId, setMobileDragNoteId] = useState<string | null>(null);

  const togglePin = async (note: Note) => {
    try {
      await notesApi.update(note.id, { pinned: !note.pinned });
      await loadWays();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed to pin'); }
  };

  const handleDrop = async (e: React.DragEvent, target: { kind: 'way' | 'topic'; id: string }) => {
    e.preventDefault();
    const noteId = e.dataTransfer.getData('note-id');
    setDraggingNote(null);
    setDragOver(null);
    if (!noteId) return;
    try {
      await notesApi.move(noteId, target.kind === 'way' ? { way_id: target.id } : { topic_id: target.id });
      await loadWays();
      toast.success(t('notes.moveToast'));
    } catch (err: any) {
      toast.error(err?.detail ?? t('notes.moveFail'));
    }
  };

  const deleteWay = (id: string) => {
    askConfirm(t('notes.deleteWay'), t('notes.deleteWayMsg'), async () => {
      try {
        await waysApi.delete(id);
        if (selection && selection.parentId === id) setSelection(null);
        if (mobileView.kind === 'way' && mobileView.wayId === id) setMobileView({ kind: 'root' });
        await loadWays();
        toast.success('Way deleted');
      } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
    });
  };

  const deleteTopic = (id: string) => {
    askConfirm('Delete topic?', 'This will delete the topic and all its notes.', async () => {
      try {
        await topicsApi.delete(id);
        if (selection && selection.parentId === id) setSelection(null);
        if (mobileView.kind === 'topic' && mobileView.topicId === id) {
          const parentWay = ways.find((w) => w.topics.some((t) => t.id === id));
          if (parentWay) setMobileView({ kind: 'way', wayId: parentWay.id });
          else setMobileView({ kind: 'root' });
        }
        await loadWays();
        toast.success('Topic deleted');
      } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
    });
  };

  const deleteNote = (id: string) => {
    askConfirm('Delete note?', 'This cannot be undone.', async () => {
      try {
        await notesApi.delete(id);
        if (selection?.noteId === id) setSelection(null);
        if (editorState?.noteId === id) setEditorState(null);
        await loadWays();
        toast.success('Note deleted');
      } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
    });
  };

  const toggleWay = (id: string) => setExpandedWays((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleTopic = (id: string) => setExpandedTopics((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

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
    if (currentNote && editorState?.noteId === currentNote.id) {
      // Determine back destination from selection state
      const backToTopic = selection?.parentType === 'topic' ? selection.parentId : null;
      const backToWay = selection?.parentType === 'way' ? selection.parentId : null;

      // Non-blocking back: navigate immediately, save in background
      const handleBack = () => {
        // Fire and forget — don't block navigation while saving
        saveCurrentEditor();
        loadWays();
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
                {saving
                  ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                  : editorState.dirty ? null : <><Check size={11} /> Saved</>}
              </span>
            </div>
            <div style={{ padding: '4px 20px 4px' }}>
              <NoteTitle
                key={currentNote.id + '-title'}
                initial={currentNote.name}
                onChange={(newName) => {
                  if (newName === currentNote.name) return;
                  notesApi.update(currentNote.id, { name: newName })
                    .then(() => loadWays())
                    .catch((e: any) => toast.error(e?.detail ?? 'Failed to rename'));
                }}
              />
              <div className="doc-tags" style={{ marginTop: 8 }}>
                <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={loadWays} />
              </div>
            </div>
            <div style={{ padding: '0 20px 80px' }}>
              <Suspense fallback={<EditorFallback />}>
                <RichTextEditor
                  key={currentNote.id}
                  noteId={currentNote.id}
                  content={editorState.content}
                  onChange={(html) => {
                    const cur = editorStateRef.current;
                    if (!cur || cur.noteId !== currentNote.id) return;
                    setEditorState({ noteId: currentNote.id, content: html, dirty: html !== currentNote.content });
                  }}
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
          try {
            await notesApi.move(mobileDragNoteId, target.kind === 'way' ? { way_id: target.id } : { topic_id: target.id });
            await loadWays();
            toast.success(t('notes.moveToast'));
          } catch (err: any) { toast.error(err?.detail ?? 'Failed'); }
          finally { setMobileDragNoteId(null); }
        }}
        onCancelMobileDrag={() => setMobileDragNoteId(null)}
      />
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  const addingTitle = !adding ? '' : adding.kind === 'way' ? 'New way' : adding.kind === 'topic' ? 'New topic' : 'New note';
  const addingLabel = !adding ? '' : adding.kind === 'way' ? 'Create way' : adding.kind === 'topic' ? 'Add topic' : 'Add note';

  const countWayNotes = (way: Way) =>
    way.notes.length + way.topics.reduce((sum, t) => sum + t.notes.length, 0);

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

    <div className="notes-layout" data-no-lib={!sidebarOpen}>
      {/* ── Library ── */}
      <aside className="notes-library">
        <div className="notes-library-head">
          <span className="notes-library-title">Library</span>
          <div className="notes-library-actions">
            <button
              onClick={() => { setAdding({ kind: 'way' }); setAddName(''); }}
              title="New way"
              className="icon-btn icon-btn-sm"
            ><Plus size={14} /></button>
            <button onClick={() => setSidebarOpen(false)} title="Hide library" className="icon-btn icon-btn-sm">
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>

        <div className="library-search">
          <div className="field" style={{ height: 26, gap: 5 }}>
            <Search size={11} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Filter notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: 'transparent', fontSize: 12, border: 0, outline: 0 }}
            />
          </div>
        </div>

        <div className="notes-library-tree">
          {filteredWays.length === 0 && !adding && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--fg-muted)' }}>
              {search ? 'No matches' : 'No ways yet. Click + to create one.'}
            </div>
          )}

          {filteredWays.map((way) => (
            <div key={way.id}>
              {renaming?.kind === 'way' && renaming.id === way.id ? (
                <RenameInput onCommit={commitRename} onCancel={cancelRename} />
              ) : (
                <div
                  className={`tree-row${expandedWays.has(way.id) ? ' is-open' : ''}`}
                  data-depth="0"
                  onClick={() => toggleWay(way.id)}
                >
                  <span className="chev"><ChevronRight size={11} /></span>
                  <Layers size={13} className="tico" />
                  <span className="tname">{way.name}</span>
                  <span className="tcount">{countWayNotes(way)}</span>
                  <div className="tree-actions">
                    <ActionBtn icon={FilePlus} title="Add note" onClick={() => { setAdding({ kind: 'way-note', wayId: way.id }); setAddName(''); setExpandedWays((p) => new Set([...p, way.id])); }} />
                    <ActionBtn icon={FolderPlus} title="Add topic" onClick={() => { setAdding({ kind: 'topic', wayId: way.id }); setAddName(''); setExpandedWays((p) => new Set([...p, way.id])); }} />
                    <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'way', id: way.id }, way.name)} />
                    <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteWay(way.id)} />
                  </div>
                </div>
              )}

              <AnimatePresence initial={false}>
                {expandedWays.has(way.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver({ kind: 'way', id: way.id }); }}
                    onDragLeave={() => setDragOver((p) => p?.kind === 'way' && p.id === way.id ? null : p)}
                    onDrop={(e) => handleDrop(e, { kind: 'way', id: way.id })}
                  >
                    {/* Direct way notes */}
                    {way.notes.map((n) => (
                      <div key={n.id}>
                        {renaming?.kind === 'note' && renaming.id === n.id ? (
                          <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <div
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData('note-id', n.id); setDraggingNote(n.id); }}
                            onDragEnd={() => { setDraggingNote(null); setDragOver(null); }}
                            className="tree-row"
                            data-depth="1"
                            data-active={selection?.noteId === n.id}
                            style={draggingNote === n.id ? { opacity: 0.4 } : undefined}
                            onClick={() => setSelection({ kind: 'note', noteId: n.id, parentType: 'way', parentId: way.id })}
                          >
                            {n.pinned ? <Pin size={11} className="tico" style={{ color: 'var(--accent-notes)', fill: 'currentColor' }} /> : <FileText size={12} className="tico" />}
                            <span className="tname">{n.name}</span>
                            <div className="tree-actions">
                              <ActionBtn icon={n.pinned ? PinOff : Pin} title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(n)} />
                              <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'note', id: n.id }, n.name)} />
                              <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteNote(n.id)} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Topics */}
                    {way.topics.map((topic) => (
                      <div key={topic.id}>
                        {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                          <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <div
                            className={`tree-row${expandedTopics.has(topic.id) ? ' is-open' : ''}`}
                            data-depth="1"
                            onClick={() => toggleTopic(topic.id)}
                            onDragOver={(e) => { if (draggingNote) { e.preventDefault(); setDragOver({ kind: 'topic', id: topic.id }); } }}
                            onDragLeave={() => setDragOver((p) => p?.kind === 'topic' && p.id === topic.id ? null : p)}
                            onDrop={(e) => handleDrop(e, { kind: 'topic', id: topic.id })}
                            style={dragOver?.kind === 'topic' && dragOver.id === topic.id ? { boxShadow: '0 0 0 1px var(--accent-notes)' } : undefined}
                          >
                            <span className="chev"><ChevronRight size={11} /></span>
                            {expandedTopics.has(topic.id)
                              ? <FolderOpen size={13} className="tico" />
                              : <Folder size={13} className="tico" />}
                            <span className="tname">{topic.name}</span>
                            <span className="tcount">{topic.notes.length}</span>
                            <div className="tree-actions">
                              <ActionBtn icon={Plus} title="Add note" onClick={() => { setAdding({ kind: 'topic-note', wayId: way.id, topicId: topic.id }); setAddName(''); setExpandedTopics((p) => new Set([...p, topic.id])); }} />
                              <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'topic', id: topic.id }, topic.name)} />
                              <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteTopic(topic.id)} />
                            </div>
                          </div>
                        )}

                        <AnimatePresence initial={false}>
                          {expandedTopics.has(topic.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              style={{ overflow: 'hidden' }}
                            >
                              {topic.notes.map((note) => (
                                <div key={note.id}>
                                  {renaming?.kind === 'note' && renaming.id === note.id ? (
                                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                                  ) : (
                                    <div
                                      draggable
                                      onDragStart={(e) => { e.dataTransfer.setData('note-id', note.id); setDraggingNote(note.id); }}
                                      onDragEnd={() => { setDraggingNote(null); setDragOver(null); }}
                                      className="tree-row"
                                      data-depth="2"
                                      data-active={selection?.noteId === note.id}
                                      style={draggingNote === note.id ? { opacity: 0.4 } : undefined}
                                      onClick={() => setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: topic.id })}
                                    >
                                      <FileText size={12} className="tico" />
                                      <span className="tname">{note.name}</span>
                                      <div className="tree-actions">
                                        <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'note', id: note.id }, note.name)} />
                                        <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteNote(note.id)} />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </aside>

      {/* Floating "show library" button when collapsed */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="icon-btn"
          title="Show library"
          style={{ position: 'absolute', top: 10, left: 10, zIndex: 4, background: 'var(--bg-elevated)', boxShadow: '0 0 0 0.5px var(--line), var(--sh-raised)' }}
        >
          <ChevronsRight size={14} />
        </button>
      )}

      {/* ── Content ── */}
      <main className="notes-content" data-no-rp={!contextOpen}>
        {currentNote && editorState?.noteId === currentNote.id ? (
          <>
            {/* Topbar: breadcrumb + save status */}
            <div className="notes-topbar">
              <div className="notes-breadcrumb">
                {(() => {
                  const wayName = ways.find((w) => w.id === currentNote.way_id)?.name;
                  const topicName = ways.flatMap((w) => w.topics ?? []).find((tp) => tp.id === currentNote.topic_id)?.name;
                  return (
                    <>
                      {wayName && <><span className="crumb">{wayName}</span><span className="crumb-sep">›</span></>}
                      {topicName && <><span className="crumb">{topicName}</span><span className="crumb-sep">›</span></>}
                      <span className="crumb current">{currentNote.name || 'Untitled'}</span>
                    </>
                  );
                })()}
              </div>
              <span className="notes-saved">
                {saving
                  ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                  : editorState.dirty ? null : <><Check size={11} /> Saved</>}
              </span>
              <div className="notes-topbar-actions">
                <button
                  onClick={() => setContextOpen(!contextOpen)}
                  className="icon-btn icon-btn-sm"
                  data-active={contextOpen}
                  title={contextOpen ? 'Hide right panel' : 'Show right panel'}
                ><PanelRightClose size={14} /></button>
              </div>
            </div>

            {/* Editor + context grid */}
            <div className="notes-editor-and-context">
              <div className="notes-editor-wrap">
                {/* Toolbar (sticky at top of scroll) + paper: title, tags, body */}
                <Suspense fallback={<EditorFallback />}>
                <RichTextEditor
                  key={currentNote.id}
                  noteId={currentNote.id}
                  content={editorState.content}
                  onChange={(html) => {
                    const cur = editorStateRef.current;
                    if (!cur || cur.noteId !== currentNote.id) return;
                    setEditorState({ noteId: currentNote.id, content: html, dirty: html !== currentNote.content });
                  }}
                >
                  <NoteTitle
                    key={currentNote.id + '-title'}
                    initial={currentNote.name}
                    onChange={async (newName) => {
                      if (newName === currentNote.name) return;
                      try {
                        await notesApi.update(currentNote.id, { name: newName });
                        await loadWays();
                      } catch (e: any) { toast.error(e?.detail ?? 'Failed to rename'); }
                    }}
                  />
                  <div className="doc-meta">
                    <span>
                      {currentNote.updated_at
                        ? `Updated ${new Date(currentNote.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                        : 'New note'}
                    </span>
                    <span className="dot" />
                    <span>
                      {Math.max(1, Math.round(
                        (editorState.content || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length / 200
                      ))} min read
                    </span>
                  </div>
                  <div className="doc-tag-row">
                    <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={loadWays} />
                  </div>
                </RichTextEditor>
                </Suspense>
              </div>

              {/* Right context panel */}
              <aside className="notes-context">
                <div className="panel-card">
                  <div className="panel-head">Note stats</div>
                  <div className="panel-row">
                    <span className="panel-row-title">Words</span>
                    <span className="panel-row-meta">{(editorState.content || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length}</span>
                  </div>
                  <div className="panel-row">
                    <span className="panel-row-title">Read time</span>
                    <span className="panel-row-meta">
                      {Math.max(1, Math.round((editorState.content || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length / 200))} min
                    </span>
                  </div>
                  <div className="panel-row">
                    <span className="panel-row-title">Tags</span>
                    <span className="panel-row-meta">{(currentNote.tags ?? []).length}</span>
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <div className="notes-empty-state">
            <div className="notes-empty-content">
              <BookOpen size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: 'var(--fg-tertiary)' }}>Select or create a note to start</p>
            </div>
          </div>
        )}
      </main>
    </div>
    </>
  );
}

function ActionBtn({ icon: Icon, onClick, title }: { icon: React.ElementType; onClick: (e: React.MouseEvent) => void; title: string }) {
  return (
    <div
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="icon-btn icon-btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <Icon size={12} />
    </div>
  );
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
              <button onClick={handleAvatarTap} className="avatar-btn">
                {user.avatar_url
                  ? <img src={resolveUrl(user.avatar_url)} alt="" />
                  : user.username.charAt(0).toUpperCase()}
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
