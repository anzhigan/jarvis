import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
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
  FolderTree,
  PanelRightClose,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';
import SwipeRow from './SwipeRow';
import LongPressRow from './LongPressRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import NoteTitle from './NoteTitle';
import { useSwipeBack } from '../hooks/useSwipeBack';
import { useT } from '../store/i18n';
import { notesApi, topicsApi, waysApi, resolveUrl } from '../api/client';
import { useAuthStore } from '../store/auth';
import type { Note, Topic, Way } from '../api/types';

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
  | { kind: 'topic'; topicId: string };   // inside a topic — shows notes

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
          if (w.id === selection.parentId || w.note?.id === selection.noteId) {
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
          fetch(`${import.meta.env.VITE_API_URL ?? '/api'}/notes/${st.noteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ content: st.content }),
            keepalive: true,
          });
        }
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      const st = editorStateRef.current;
      if (st && st.dirty) {
        notesApi.update(st.noteId, { content: st.content }).catch(() => {});
      }
    };
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !addName.trim()) { cancelAdd(); return; }
    const name = addName.trim();
    await saveCurrentEditor();
    try {
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
        setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: adding.topicId });
        cancelAdd();
        return;
      } else if (adding.kind === 'way-note') {
        const note = await notesApi.create({ name, way_id: adding.wayId, content: '' });
        setExpandedWays((p) => new Set([...p, adding.wayId]));
        await loadWays();
        setSelection({ kind: 'note', noteId: note.id, parentType: 'way', parentId: adding.wayId });
        cancelAdd();
        return;
      }
      await loadWays();
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create');
    } finally { cancelAdd(); }
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
  const InlineInput = ({ placeholder, onCommit, onCancel }: { placeholder: string; onCommit: () => void; onCancel: () => void }) => (
    <div className="px-2 py-1">
      <input
        type="text"
        placeholder={placeholder}
        value={addName}
        onChange={(e) => setAddName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
        onBlur={() => (addName.trim() ? onCommit() : onCancel())}
        className="input w-full"
        autoFocus
      />
    </div>
  );

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
    // Mobile editor view (when a note is selected)
    if (currentNote && editorState?.noteId === currentNote.id) {
      return (
        <>
          <ConfirmDialog
            open={confirmState !== null}
            title={confirmState?.title ?? ''}
            message={confirmState?.message}
            onCancel={() => setConfirmState(null)}
            onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
          />
        <div className="size-full flex flex-col">
          <div className="flex-1 overflow-y-auto relative">
            {/* Floating back button — fixed so it stays visible while scrolling */}
            <button
              onClick={async () => {
                await saveCurrentEditor();
                await loadWays();
                setSelection(null);
              }}
              className="md:absolute md:top-3 md:left-2 fixed top-16 left-3 z-30 icon-btn icon-btn-lg active:scale-90 transition-all"
              style={{ background: 'color-mix(in srgb, var(--bg-app) 90%, transparent)', backdropFilter: 'blur(8px)', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              title="Back"
            >
              <ChevronLeft size={22} strokeWidth={2} />
            </button>
            {/* Floating save status */}
            <div className="md:fixed md:top-5 md:right-4 fixed top-16 right-4 z-30 text-xs flex items-center gap-1 px-2 py-1" style={{ color: 'var(--fg-muted)', background: 'color-mix(in srgb, var(--bg-app) 90%, transparent)', backdropFilter: 'blur(8px)', borderRadius: 'var(--r-pill)', boxShadow: '0 0 0 0.5px var(--line)' }}>
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving</> : editorState.dirty ? 'Unsaved' : 'Saved'}
            </div>

            <div className="pl-5 pr-5 pt-16 md:pt-4 md:pl-14 pb-2">
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
              <div className="mt-2">
                <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={loadWays} />
              </div>
            </div>
            <div className="px-5 pb-8">
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
            </div>
          </div>
        </div>
        </>
      );
    }

    // Mobile hierarchy views
    return (
      <>
        <ConfirmDialog
          open={confirmState !== null}
          title={confirmState?.title ?? ''}
          message={confirmState?.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
        />
      <MobileHierarchy
        view={mobileView}
        setView={setMobileView}
        ways={filteredWays}
        search={search}
        setSearch={setSearch}
        adding={adding}
        setAdding={setAdding}
        addName={addName}
        commitAdd={commitAdd}
        cancelAdd={cancelAdd}
        renaming={renaming}
        startRename={startRename}
        commitRename={commitRename}
        cancelRename={cancelRename}
        InlineInput={InlineInput}
        RenameInput={RenameInput}
        onSelectNote={(noteId, parentType, parentId) =>
          setSelection({ kind: 'note', noteId, parentType, parentId })
        }
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
  // DESKTOP VIEW (original sidebar + editor)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm(); }}
      />
    <div className="notes-layout" data-no-lib={!sidebarOpen}>
      <aside className="notes-library" data-collapsed={!sidebarOpen}>
        <div className="notes-library-head" style={{ padding: '10px 6px 8px' }}>
          <button onClick={() => setSidebarOpen(false)} title="Hide library" className="icon-btn icon-btn-sm flex-shrink-0">
            <FolderTree size={14} />
          </button>
          <div className="field flex-1" style={{ paddingLeft: 8, paddingRight: 8, gap: 5 }}>
            <Search size={12} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: 'transparent', fontSize: 12 }}
            />
          </div>
          <button
            onClick={() => { setAdding({ kind: 'way' }); setAddName(''); }}
            title="Add way"
            className="icon-btn icon-btn-sm flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="notes-library-tree">
          {adding?.kind === 'way' && (
            <InlineInput placeholder="Way name" onCommit={commitAdd} onCancel={cancelAdd} />
          )}

          {filteredWays.length === 0 && !adding && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {search ? 'No matches' : 'No ways yet. Click + to create one.'}
            </div>
          )}

          {filteredWays.map((way) => (
            <div key={way.id}>
              {renaming?.kind === 'way' && renaming.id === way.id ? (
                <RenameInput onCommit={commitRename} onCancel={cancelRename} />
              ) : (
                <div
                  onClick={() => toggleWay(way.id)}
                  className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-sidebar-accent cursor-pointer"
                >
                  {expandedWays.has(way.id) ? (
                    <ChevronDown size={13} className="text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRight size={13} className="text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm font-medium truncate">{way.name}</span>
                  <ActionBtn
                    icon={FilePlus}
                    title="Add note"
                    onClick={() => {
                      setAdding({ kind: 'way-note', wayId: way.id });
                      setAddName('');
                      setExpandedWays((p) => new Set([...p, way.id]));
                    }}
                  />
                  <ActionBtn
                    icon={FolderPlus}
                    title="Add topic"
                    onClick={() => {
                      setAdding({ kind: 'topic', wayId: way.id });
                      setAddName('');
                      setExpandedWays((p) => new Set([...p, way.id]));
                    }}
                  />
                  <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'way', id: way.id }, way.name)} />
                  <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteWay(way.id)} />
                </div>
              )}

              <AnimatePresence initial={false}>
                {expandedWays.has(way.id) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="ml-3.5 overflow-hidden"
                    onDragOver={(e) => { e.preventDefault(); setDragOver({ kind: 'way', id: way.id }); }}
                    onDragLeave={() => setDragOver((p) => p?.kind === 'way' && p.id === way.id ? null : p)}
                    onDrop={(e) => handleDrop(e, { kind: 'way', id: way.id })}
                    style={{
                      borderLeft: '0.5px solid var(--line)',
                      ...(dragOver?.kind === 'way' && dragOver.id === way.id ? { backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)' } : {}),
                    }}
                  >
                    {adding?.kind === 'way-note' && adding.wayId === way.id && (
                      <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                    )}
                    {way.notes.map((n) => (
                      <div
                        key={n.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('note-id', n.id); setDraggingNote(n.id); }}
                        onDragEnd={() => { setDraggingNote(null); setDragOver(null); }}
                        onClick={() => setSelection({ kind: 'note', noteId: n.id, parentType: 'way', parentId: way.id })}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md cursor-pointer ${
                          selection?.noteId === n.id ? '' : 'hover:bg-sidebar-accent'
                        } ${draggingNote === n.id ? 'opacity-40' : ''}`}
                        style={selection?.noteId === n.id ? { backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)', fontWeight: 500 } : undefined}
                      >
                        {n.pinned ? (
                          <Pin size={11} style={{ color: 'var(--accent-primary)', fill: 'currentColor' }} className="flex-shrink-0" />
                        ) : (
                          <FileText size={12} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                        )}
                        <span className="flex-1 text-sm truncate">{n.name}</span>
                        <ActionBtn icon={n.pinned ? PinOff : Pin} title={n.pinned ? 'Unpin' : 'Pin'} onClick={() => togglePin(n)} />
                        <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'note', id: n.id }, n.name)} />
                        <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteNote(n.id)} />
                      </div>
                    ))}

                    {way.topics.map((topic) => (
                      <div key={topic.id}>
                        {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                          <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <div
                            onClick={() => toggleTopic(topic.id)}
                            onDragOver={(e) => { if (draggingNote) { e.preventDefault(); setDragOver({ kind: 'topic', id: topic.id }); } }}
                            onDragLeave={() => setDragOver((p) => p?.kind === 'topic' && p.id === topic.id ? null : p)}
                            onDrop={(e) => handleDrop(e, { kind: 'topic', id: topic.id })}
                            className={`group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md cursor-pointer ${
                              dragOver?.kind === 'topic' && dragOver.id === topic.id ? '' : 'hover:bg-sidebar-accent'
                            }`}
                            style={dragOver?.kind === 'topic' && dragOver.id === topic.id ? { backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)', boxShadow: '0 0 0 1px var(--accent-primary)' } : undefined}
                          >
                            {expandedTopics.has(topic.id) ? (
                              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="flex-1 text-sm truncate">{topic.name}</span>
                            <ActionBtn
                              icon={Plus}
                              title="Add note"
                              onClick={() => {
                                setAdding({ kind: 'topic-note', wayId: way.id, topicId: topic.id });
                                setAddName('');
                                setExpandedTopics((p) => new Set([...p, topic.id]));
                              }}
                            />
                            <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'topic', id: topic.id }, topic.name)} />
                            <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteTopic(topic.id)} />
                          </div>
                        )}

                        <AnimatePresence initial={false}>
                          {expandedTopics.has(topic.id) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="ml-3.5 overflow-hidden"
                              style={{ borderLeft: '0.5px solid var(--line)' }}
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
                                      onClick={() => setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: topic.id })}
                                      className={`group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md cursor-pointer ${
                                        selection?.noteId === note.id ? '' : 'hover:bg-sidebar-accent'
                                      } ${draggingNote === note.id ? 'opacity-40' : ''}`}
                                      style={selection?.noteId === note.id ? { backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)', fontWeight: 500 } : undefined}
                                    >
                                      <FileText size={12} style={{ color: 'var(--fg-muted)' }} className="flex-shrink-0" />
                                      <span className="flex-1 text-sm truncate">{note.name}</span>
                                      <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'note', id: note.id }, note.name)} />
                                      <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteNote(note.id)} />
                                    </div>
                                  )}
                                </div>
                              ))}

                              {adding?.kind === 'topic-note' && adding.topicId === topic.id && (
                                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}

                    {adding?.kind === 'topic' && adding.wayId === way.id && (
                      <InlineInput placeholder="Topic name" onCommit={commitAdd} onCancel={cancelAdd} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </aside>

      <main className="notes-content" data-no-rp={!contextOpen}>
        {currentNote && editorState?.noteId === currentNote.id ? (
          <div className="notes-editor-and-context">
            <div className="notes-editor-wrap">
              <div className="notes-editor-paper">
                {/* Breadcrumbs + saved status + right-panel toggle */}
                <div className="notes-meta-row">
                  {!sidebarOpen && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="icon-btn icon-btn-sm"
                      title="Show library"
                    >
                      <FolderTree size={14} />
                    </button>
                  )}
                  <div className="notes-breadcrumb">
                    {(() => {
                      const wayName = ways.find((w) => w.id === currentNote.way_id)?.name;
                      const topicName = ways.flatMap((w) => w.topics ?? []).find((tp) => tp.id === currentNote.topic_id)?.name;
                      return (
                        <>
                          {wayName && <><span className="crumb">{wayName}</span><span className="crumb-sep">/</span></>}
                          {topicName && <><span className="crumb">{topicName}</span><span className="crumb-sep">/</span></>}
                          <span className="crumb-current">{currentNote.name || 'Untitled'}</span>
                        </>
                      );
                    })()}
                  </div>
                  <span className="notes-meta-saved">
                    {saving ? <><Loader2 size={11} className="animate-spin" /> Saving…</> :
                     editorState.dirty ? 'Unsaved' : <><Check size={11} /> Saved</>}
                  </span>
                  <button
                    onClick={() => setContextOpen(!contextOpen)}
                    className="icon-btn icon-btn-sm"
                    data-active={contextOpen}
                    title={contextOpen ? 'Hide right panel' : 'Show right panel'}
                  >
                    <PanelRightClose size={14} />
                  </button>
                </div>

                {/* Title */}
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

                {/* Tags */}
                <div className="note-tags-row">
                  <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={loadWays} />
                </div>

                {/* Editor body */}
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
              </div>
            </div>

            {/* Right context panel */}
            <aside className="notes-context">
              <div className="panel-card">
                <div className="panel-head">Linked goals</div>
                <div className="panel-empty">No goals linked yet</div>
              </div>
              <div className="panel-card">
                <div className="panel-head">Backlinks</div>
                <div className="panel-empty">No backlinks</div>
              </div>
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
        ) : (
          <div className="notes-empty-state">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="icon-btn"
                style={{ position: 'absolute', top: 16, left: 16 }}
                title="Show library"
              >
                <FolderTree size={16} />
              </button>
            )}
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
function MobileHierarchy({
  view,
  setView,
  ways,
  search,
  setSearch,
  adding,
  setAdding,
  addName,
  commitAdd,
  cancelAdd,
  renaming,
  startRename,
  commitRename,
  cancelRename,
  InlineInput,
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
  addName: string;
  commitAdd: () => void;
  cancelAdd: () => void;
  renaming: RenameState;
  startRename: (state: NonNullable<RenameState>, name: string) => void;
  commitRename: () => void;
  cancelRename: () => void;
  InlineInput: React.FC<{ placeholder: string; onCommit: () => void; onCancel: () => void }>;
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

  const title =
    view.kind === 'root' ? 'Notes'
    : view.kind === 'way' ? (currentWay?.name ?? '...')
    : (currentTopic?.name ?? '...');

  const goBack = () => {
    if (view.kind === 'way') setView({ kind: 'root' });
    else if (view.kind === 'topic' && parentWayOfTopic) setView({ kind: 'way', wayId: parentWayOfTopic.id });
    else setView({ kind: 'root' });
  };

  const [showAddMenu, setShowAddMenu] = useState(false);

  const onAddClick = () => {
    if (view.kind === 'root') {
      setAdding({ kind: 'way' });
    } else if (view.kind === 'way') {
      // Show menu: note or topic
      setShowAddMenu(true);
    } else if (view.kind === 'topic' && currentTopic && parentWayOfTopic) {
      setAdding({ kind: 'topic-note', wayId: parentWayOfTopic.id, topicId: currentTopic.id });
    }
  };

  return (
    <div className="size-full flex flex-col" style={{ background: 'var(--bg-app)' }}>
      {/* Header — big-title-row for root, top-bar for sub-views */}
      {view.kind === 'root' ? (
        <div className="big-title-row">
          <div>
            <div className="big-title">Notes</div>
            <div className="big-title-sub">{ways.length} {ways.length === 1 ? 'way' : 'ways'}</div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('jarvnote:navigate', { detail: 'profile' }))}
            className="profile-btn"
            title="Profile"
          >
            {user?.avatar_url ? (
              <img src={resolveUrl(user.avatar_url)} alt="" className="profile-avatar" />
            ) : (
              <span className="profile-avatar">{user?.username?.charAt(0).toUpperCase() ?? '?'}</span>
            )}
          </button>
        </div>
      ) : (
        <div className="top-bar">
          <div className="top-bar-leading">
            <button onClick={goBack} className="top-bar-back" title="Back">
              <ChevronLeft size={20} />
              {view.kind === 'way' ? 'Notes' : (parentWayOfTopic?.name ?? 'Back')}
            </button>
          </div>
          <div className="top-bar-title">{title}</div>
          <div className="top-bar-trailing">
            <button onClick={onAddClick} className="icon-btn icon-btn-lg" title="Add">
              <Plus size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Add-menu (way view: note or topic) */}
      {showAddMenu && view.kind === 'way' && currentWay && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="panel-card absolute top-16 right-3 p-1 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: 'var(--sh-popover)', zIndex: 41 }}
          >
            <button
              onClick={() => { setAdding({ kind: 'way-note', wayId: currentWay.id }); setShowAddMenu(false); }}
              className="btn btn-ghost w-full justify-start gap-2 text-sm"
            >
              <FileText size={15} /> New note
            </button>
            <button
              onClick={() => { setAdding({ kind: 'topic', wayId: currentWay.id }); setShowAddMenu(false); }}
              className="btn btn-ghost w-full justify-start gap-2 text-sm"
            >
              <FolderPlus size={15} /> New topic
            </button>
          </div>
        </div>
      )}

      {mobileDragNoteId && (
        <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', boxShadow: 'inset 0 -0.5px 0 color-mix(in srgb, var(--accent-primary) 20%, transparent)' }}>
          <div className="text-xs font-medium flex-1" style={{ color: 'var(--accent-primary)' }}>
            Moving note — tap a way or topic to drop, or Cancel.
          </div>
          <button
            onClick={onCancelMobileDrag}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search (only at root) */}
      {view.kind === 'root' && (
        <div className="search-field">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Add-way inline */}
      {view.kind === 'root' && adding?.kind === 'way' && (
        <div style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          <InlineInput placeholder="Way name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}
      {view.kind === 'way' && currentWay && adding?.kind === 'topic' && adding.wayId === currentWay.id && (
        <div style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          <InlineInput placeholder="Topic name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}
      {view.kind === 'topic' && currentTopic && adding?.kind === 'topic-note' && adding.topicId === currentTopic.id && (
        <div style={{ boxShadow: 'inset 0 -0.5px 0 var(--line)' }}>
          <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '2px 16px 0' }}>
        {view.kind === 'root' && (
          <>
            {ways.length === 0 && !adding && (
              <div className="px-2 py-12 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                No ways yet.
              </div>
            )}
            {ways.map((way) => (
              <SwipeRow
                key={way.id}
                onEdit={() => startRename({ kind: 'way', id: way.id }, way.name)}
                onDelete={() => onDeleteWay(way.id)}
              >
                {renaming?.kind === 'way' && renaming.id === way.id ? (
                  <div className="bg-card rounded-xl mb-1.5 px-3 py-1">
                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (mobileDragNoteId) {
                        onDropMobileDrag({ kind: 'way', id: way.id });
                      } else {
                        setView({ kind: 'way', wayId: way.id });
                      }
                    }}
                    className="way-tile w-full text-left"
                    style={mobileDragNoteId ? { background: 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-card))' } : undefined}
                  >
                    <div className="way-info">
                      <div className="way-tile-title">{way.name}</div>
                      <div className="way-tile-meta">
                        {way.topics.length > 0 && `${way.topics.length} topic${way.topics.length !== 1 ? 's' : ''}`}
                        {way.topics.length > 0 && way.notes.length > 0 && ' · '}
                        {way.notes.length > 0 && `${way.notes.length} note${way.notes.length !== 1 ? 's' : ''}`}
                        {way.topics.length === 0 && way.notes.length === 0 && 'Empty'}
                      </div>
                    </div>
                    <ChevronRight className="list-row-chevron" />
                  </button>
                )}
              </SwipeRow>
            ))}
            {/* "+ New way" CTA at bottom of list */}
            {!adding && (
              <button
                onClick={() => setAdding({ kind: 'way' })}
                className="btn btn-ghost w-full"
                style={{ marginTop: 4, marginBottom: 16, justifyContent: 'center' }}
              >
                <Plus size={15} /> New way
              </button>
            )}
          </>
        )}

        {view.kind === 'way' && currentWay && (
          <>
            {/* Drop-zone header for current way when dragging */}
            {mobileDragNoteId && (
              <button
                onClick={() => onDropMobileDrag({ kind: 'way', id: currentWay.id })}
                className="list-row w-full text-left text-sm font-medium"
                style={{ color: 'var(--accent-primary)', background: 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-card))' }}
              >
                ↓ Drop here (in "{currentWay.name}")
              </button>
            )}

            {/* Notes in this way */}
            {currentWay.notes.length > 0 && (
              <div className="section-h">Notes in this way</div>
            )}
            {currentWay.notes.map((note) => (
              <div key={note.id}>
                {renaming?.kind === 'note' && renaming.id === note.id ? (
                  <div className="bg-card rounded-xl mb-1.5 px-3 py-1">
                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                  </div>
                ) : (
                  <LongPressRow
                    onSwipeEdit={() => startRename({ kind: 'note', id: note.id }, note.name)}
                    onSwipeDelete={() => onDeleteNote(note.id)}
                    onLongPress={() => onStartMobileDrag(note.id)}
                    isDragging={mobileDragNoteId === note.id}
                  >
                    <button
                      onClick={() => {
                        if (mobileDragNoteId) return;
                        onSelectNote(note.id, 'way', currentWay.id);
                      }}
                      className="list-row w-full text-left"
                    >
                      <div className="list-row-icon">
                        {note.pinned
                          ? <Pin size={15} style={{ color: 'var(--accent-primary)', fill: 'currentColor' }} />
                          : <FileText size={15} />}
                      </div>
                      <div className="list-row-info">
                        <div className="list-row-title">{note.name}</div>
                      </div>
                      <ChevronRight className="list-row-chevron" />
                    </button>
                  </LongPressRow>
                )}
              </div>
            ))}

            {adding?.kind === 'way-note' && adding.wayId === currentWay.id && (
              <div className="bg-card rounded-xl mb-1.5 px-3 py-1">
                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
              </div>
            )}

            {/* Topics */}
            {currentWay.topics.length > 0 && (
              <div className="section-h">Topics</div>
            )}
            {currentWay.topics.map((topic) => (
              <div key={topic.id}>
                {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                  <div className="bg-card rounded-xl mb-1.5 px-3 py-1">
                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                  </div>
                ) : (
                  <SwipeRow
                    onEdit={() => startRename({ kind: 'topic', id: topic.id }, topic.name)}
                    onDelete={() => onDeleteTopic(topic.id)}
                  >
                    <button
                      onClick={() => {
                        if (mobileDragNoteId) {
                          onDropMobileDrag({ kind: 'topic', id: topic.id });
                        } else {
                          setView({ kind: 'topic', topicId: topic.id });
                        }
                      }}
                      className="list-row w-full text-left"
                      style={mobileDragNoteId ? { background: 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-card))' } : undefined}
                    >
                      <div className="list-row-info">
                        <div className="list-row-title">{topic.name}</div>
                        <div className="list-row-sub">{topic.notes.length} note{topic.notes.length !== 1 ? 's' : ''}</div>
                      </div>
                      <ChevronRight className="list-row-chevron" />
                    </button>
                  </SwipeRow>
                )}
              </div>
            ))}

            {currentWay.topics.length === 0 && currentWay.notes.length === 0 && !adding && (
              <div className="px-2 py-12 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                Empty. Tap + to add a topic or note.
              </div>
            )}
          </>
        )}

        {view.kind === 'topic' && currentTopic && (
          <>
            {mobileDragNoteId && (
              <button
                onClick={() => onDropMobileDrag({ kind: 'topic', id: currentTopic.id })}
                className="list-row w-full text-left text-sm font-medium"
                style={{ color: 'var(--accent-primary)', background: 'color-mix(in srgb, var(--accent-primary) 10%, var(--bg-card))' }}
              >
                ↓ Drop here (in "{currentTopic.name}")
              </button>
            )}
            {currentTopic.notes.map((note) => (
              <div key={note.id}>
                {renaming?.kind === 'note' && renaming.id === note.id ? (
                  <div className="bg-card rounded-xl mb-1.5 px-3 py-1">
                    <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                  </div>
                ) : (
                  <LongPressRow
                    onSwipeEdit={() => startRename({ kind: 'note', id: note.id }, note.name)}
                    onSwipeDelete={() => onDeleteNote(note.id)}
                    onLongPress={() => onStartMobileDrag(note.id)}
                    isDragging={mobileDragNoteId === note.id}
                  >
                    <button
                      onClick={() => {
                        if (mobileDragNoteId) return;
                        onSelectNote(note.id, 'topic', currentTopic.id);
                      }}
                      className="list-row w-full text-left"
                    >
                      <div className="list-row-icon">
                        {note.pinned
                          ? <Pin size={15} style={{ color: 'var(--accent-primary)', fill: 'currentColor' }} />
                          : <FileText size={15} />}
                      </div>
                      <div className="list-row-info">
                        <div className="list-row-title">{note.name}</div>
                      </div>
                      <ChevronRight className="list-row-chevron" />
                    </button>
                  </LongPressRow>
                )}
              </div>
            ))}
            {currentTopic.notes.length === 0 && !adding && (
              <div className="px-2 py-12 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
                No notes yet. Tap + to create one.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
