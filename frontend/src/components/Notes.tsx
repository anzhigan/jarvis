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
  PanelLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';
import SwipeRow from './SwipeRow';
import LongPressRow from './LongPressRow';
import TagSelector from './TagSelector';
import ConfirmDialog from './ConfirmDialog';
import NoteTitle from './NoteTitle';
import { useT } from '../store/i18n';
import { notesApi, topicsApi, waysApi } from '../api/client';
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        className="w-full h-9 px-3 text-base md:text-sm bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
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
        className="w-full h-9 px-3 text-base md:text-sm bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
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
            {/* Floating back button top-left */}
            <button
              onClick={async () => {
                await saveCurrentEditor();
                await loadWays();
                setSelection(null);
              }}
              className="absolute top-3 left-2 z-10 h-10 w-10 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-sm hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Back"
            >
              <ChevronLeft size={22} />
            </button>
            {/* Floating save status top-right */}
            <div className="absolute top-4 right-4 z-10 text-xs text-muted-foreground flex items-center gap-1">
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving</> : editorState.dirty ? 'Unsaved' : 'Saved'}
            </div>

            <div className="pl-14 pr-4 pt-4 pb-2">
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
            <div className="px-4 pb-8">
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
    <div className="size-full flex">
      {sidebarOpen && (
      <aside className="w-72 border-r border-border bg-sidebar flex flex-col flex-shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(false)}
              title="Hide sidebar"
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors flex-shrink-0"
            >
              <PanelLeft size={15} />
            </button>
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-2.5 text-xs bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
              />
            </div>
            <button
              onClick={() => { setAdding({ kind: 'way' }); setAddName(''); }}
              title="Add way"
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors flex-shrink-0"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 py-2">
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
                    className="ml-3.5 overflow-hidden border-l border-sidebar-border"
                    onDragOver={(e) => { e.preventDefault(); setDragOver({ kind: 'way', id: way.id }); }}
                    onDragLeave={() => setDragOver((p) => p?.kind === 'way' && p.id === way.id ? null : p)}
                    onDrop={(e) => handleDrop(e, { kind: 'way', id: way.id })}
                    style={dragOver?.kind === 'way' && dragOver.id === way.id ? { backgroundColor: 'var(--primary-rgb, rgba(79,70,229,0.08))' } : undefined}
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
                          selection?.noteId === n.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-sidebar-accent'
                        } ${draggingNote === n.id ? 'opacity-40' : ''}`}
                      >
                        {n.pinned ? (
                          <Pin size={11} className="text-primary flex-shrink-0 fill-current" />
                        ) : (
                          <FileText size={12} className="text-muted-foreground flex-shrink-0" />
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
                              dragOver?.kind === 'topic' && dragOver.id === topic.id
                                ? 'bg-primary/15 ring-1 ring-primary'
                                : 'hover:bg-sidebar-accent'
                            }`}
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
                              className="ml-3.5 overflow-hidden border-l border-sidebar-border"
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
                                        selection?.noteId === note.id
                                          ? 'bg-primary text-primary-foreground'
                                          : 'hover:bg-sidebar-accent'
                                      } ${draggingNote === note.id ? 'opacity-40' : ''}`}
                                    >
                                      <FileText size={12} className="text-muted-foreground flex-shrink-0" />
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
      )}

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {currentNote && editorState?.noteId === currentNote.id ? (
          <>
            <div className="flex-1 overflow-y-auto relative">
              {/* Floating burger — only when sidebar closed, sticks to top-left while scrolling */}
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="sticky top-4 left-4 z-10 float-left h-9 w-9 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-sm border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                  style={{ marginLeft: '1rem', marginTop: '1rem' }}
                  title="Show sidebar"
                >
                  <PanelLeft size={16} />
                </button>
              )}
              {/* Save status top-right — inline, not floating absolute */}
              <div className="sticky top-4 right-6 z-10 float-right text-xs text-muted-foreground flex items-center gap-1.5"
                   style={{ marginRight: '1.5rem', marginTop: '1rem' }}>
                {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : editorState.dirty ? 'Unsaved' : 'Saved'}
              </div>

              <div className="max-w-4xl mx-auto px-10 pt-4 pb-3">
                {/* Note title as h1 */}
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
                <div className="mt-3">
                  <TagSelector targetId={currentNote.id} tags={currentNote.tags ?? []} onChange={loadWays} />
                </div>
              </div>
              <div className="max-w-4xl mx-auto px-10 pb-8">
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
          </>
        ) : (
          <div className="flex-1 flex flex-col relative">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="absolute top-4 left-4 z-10 h-9 w-9 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-sm border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shadow-sm"
                title="Show sidebar"
              >
                <PanelLeft size={16} />
              </button>
            )}
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select or create a note to start</p>
              </div>
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
      className="p-1 rounded-md hover:bg-card/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
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
    <div className="size-full flex flex-col bg-background">
      {/* Top bar */}
      <header className="px-3 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
        {view.kind !== 'root' && (
          <button
            onClick={goBack}
            className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            title="Back"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h2 className="text-lg font-semibold tracking-tight flex-1 min-w-0 truncate">{title}</h2>
        <button
          onClick={onAddClick}
          className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title="Add"
        >
          <Plus size={20} />
        </button>
      </header>

      {/* Add-menu (way view: note or topic) */}
      {showAddMenu && view.kind === 'way' && currentWay && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="absolute top-16 right-3 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { setAdding({ kind: 'way-note', wayId: currentWay.id }); setShowAddMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md hover:bg-secondary text-sm text-left"
            >
              <FileText size={15} /> New note
            </button>
            <button
              onClick={() => { setAdding({ kind: 'topic', wayId: currentWay.id }); setShowAddMenu(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md hover:bg-secondary text-sm text-left"
            >
              <FolderPlus size={15} /> New topic
            </button>
          </div>
        </div>
      )}

      {mobileDragNoteId && (
        <div className="px-4 py-3 bg-primary/10 border-b border-primary/20 flex items-center gap-2 flex-shrink-0">
          <div className="text-xs font-medium text-primary flex-1">
            Moving note — tap a way or topic to drop, or Cancel.
          </div>
          <button
            onClick={onCancelMobileDrag}
            className="h-8 px-3 text-xs bg-card border border-border rounded-md hover:bg-secondary"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search (only at root) */}
      {view.kind === 'root' && (
        <div className="px-3 py-2 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-3 text-base bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
          </div>
        </div>
      )}

      {/* Add-way inline */}
      {view.kind === 'root' && adding?.kind === 'way' && (
        <div className="border-b border-border">
          <InlineInput placeholder="Way name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}
      {view.kind === 'way' && currentWay && adding?.kind === 'topic' && adding.wayId === currentWay.id && (
        <div className="border-b border-border">
          <InlineInput placeholder="Topic name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}
      {view.kind === 'topic' && currentTopic && adding?.kind === 'topic-note' && adding.topicId === currentTopic.id && (
        <div className="border-b border-border">
          <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {view.kind === 'root' && (
          <>
            {ways.length === 0 && !adding && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No ways yet. Tap + to create one.
              </div>
            )}
            {ways.map((way) => (
              <SwipeRow
                key={way.id}
                onEdit={() => startRename({ kind: 'way', id: way.id }, way.name)}
                onDelete={() => onDeleteWay(way.id)}
              >
                {renaming?.kind === 'way' && renaming.id === way.id ? (
                  <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                ) : (
                  <button
                    onClick={() => {
                      if (mobileDragNoteId) {
                        onDropMobileDrag({ kind: 'way', id: way.id });
                      } else {
                        setView({ kind: 'way', wayId: way.id });
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left ${
                      mobileDragNoteId ? 'bg-primary/5 hover:bg-primary/10' : ''
                    }`}
                  >
                    <span className="flex-1 text-base font-medium truncate">{way.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {way.topics.length + way.notes.length}
                    </span>
                    <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                  </button>
                )}
              </SwipeRow>
            ))}
          </>
        )}

        {view.kind === 'way' && currentWay && (
          <>
            {/* Drop-zone header for current way when dragging */}
            {mobileDragNoteId && (
              <button
                onClick={() => onDropMobileDrag({ kind: 'way', id: currentWay.id })}
                className="w-full px-4 py-3 border-b border-primary/20 bg-primary/10 text-sm font-medium text-primary text-left active:bg-primary/20"
              >
                ↓ Drop here (in "{currentWay.name}")
              </button>
            )}

            {/* Way's notes */}
            {currentWay.notes.map((note) => (
              <div key={note.id}>
                {renaming?.kind === 'note' && renaming.id === note.id ? (
                  <div className="border-b border-border">
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
                      className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                    >
                      {note.pinned ? (
                        <Pin size={14} className="text-primary flex-shrink-0 fill-current" />
                      ) : (
                        <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="flex-1 text-base truncate">{note.name}</span>
                      <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  </LongPressRow>
                )}
              </div>
            ))}

            {adding?.kind === 'way-note' && adding.wayId === currentWay.id && (
              <div className="border-b border-border">
                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
              </div>
            )}

            {/* Topics */}
            {currentWay.topics.map((topic) => (
              <div key={topic.id}>
                {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                  <div className="border-b border-border">
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
                      className={`w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left ${
                        mobileDragNoteId ? 'bg-primary/5 hover:bg-primary/10' : ''
                      }`}
                    >
                      <span className="flex-1 text-base truncate">{topic.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{topic.notes.length}</span>
                      <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  </SwipeRow>
                )}
              </div>
            ))}

            {currentWay.topics.length === 0 && currentWay.notes.length === 0 && !adding && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                Empty. Tap + to add a topic.
              </div>
            )}
          </>
        )}

        {view.kind === 'topic' && currentTopic && (
          <>
            {mobileDragNoteId && (
              <button
                onClick={() => onDropMobileDrag({ kind: 'topic', id: currentTopic.id })}
                className="w-full px-4 py-3 border-b border-primary/20 bg-primary/10 text-sm font-medium text-primary text-left active:bg-primary/20"
              >
                ↓ Drop here (in "{currentTopic.name}")
              </button>
            )}
            {currentTopic.notes.map((note) => (
              <div key={note.id}>
                {renaming?.kind === 'note' && renaming.id === note.id ? (
                  <div className="border-b border-border">
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
                      className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                    >
                      {note.pinned ? (
                        <Pin size={14} className="text-primary flex-shrink-0 fill-current" />
                      ) : (
                        <FileText size={16} className="text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="flex-1 text-base truncate">{note.name}</span>
                      <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                    </button>
                  </LongPressRow>
                )}
              </div>
            ))}
            {currentTopic.notes.length === 0 && !adding && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                No notes yet. Tap + to create one.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
