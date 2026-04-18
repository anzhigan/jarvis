import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderPlus,
  FilePlus,
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import RichTextEditor from './RichTextEditor';
import { notesApi, topicsApi, waysApi } from '../api/client';
import type { Note, Way } from '../api/types';

type Selection =
  | { kind: 'note'; noteId: string; parentType: 'way' | 'topic'; parentId: string }
  | null;

type AddingState =
  | { kind: 'way' }
  | { kind: 'topic'; wayId: string }
  | { kind: 'topic-note'; wayId: string; topicId: string }
  | { kind: 'way-inline-note'; wayId: string }
  | null;

type RenameState =
  | { kind: 'way'; id: string }
  | { kind: 'topic'; id: string }
  | { kind: 'note'; id: string }
  | null;

export default function Notes() {
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [expandedWays, setExpandedWays] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);

  const [adding, setAdding] = useState<AddingState>(null);
  const [addName, setAddName] = useState('');
  const [renaming, setRenaming] = useState<RenameState>(null);
  const [renameValue, setRenameValue] = useState('');

  const [search, setSearch] = useState('');

  // Editor state — single source of truth per currently-edited note
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
      if (selection.parentType === 'way' && way.id === selection.parentId && way.note?.id === selection.noteId) {
        return way.note;
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

  // ── Save helper ───────────────────────────────────────────────────────────
  // Save the CURRENT editor state (captured before any state changes)
  const saveCurrentEditor = async (): Promise<void> => {
    const st = editorStateRef.current;
    if (!st || !st.dirty) return;
    setSaving(true);
    try {
      await notesApi.update(st.noteId, { content: st.content });
      // Only clear dirty if the state still refers to the same note+content
      if (editorStateRef.current && editorStateRef.current.noteId === st.noteId && editorStateRef.current.content === st.content) {
        setEditorState({ ...editorStateRef.current, dirty: false });
      }
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── When selection changes: save previous, then load new ──────────────────
  useEffect(() => {
    const newNoteId = currentNote?.id ?? null;
    const prev = editorStateRef.current;

    // Same note? Nothing to do
    if (prev && prev.noteId === newNoteId) return;

    // Switching away from a dirty note — save it first (fire-and-forget — we captured its state)
    if (prev && prev.dirty) {
      notesApi.update(prev.noteId, { content: prev.content }).catch(() => {
        /* ignore — best effort */
      });
    }

    // Load new note's content
    if (currentNote) {
      setEditorState({ noteId: currentNote.id, content: currentNote.content, dirty: false });
    } else {
      setEditorState(null);
    }
  }, [currentNote?.id]);

  // ── Debounced autosave while typing ───────────────────────────────────────
  useEffect(() => {
    if (!editorState?.dirty) return;
    const snapshot = editorState; // capture
    const timer = setTimeout(() => {
      // Make sure we're still on the same note with the same content
      const cur = editorStateRef.current;
      if (cur && cur.noteId === snapshot.noteId && cur.content === snapshot.content && cur.dirty) {
        saveCurrentEditor();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [editorState?.noteId, editorState?.content, editorState?.dirty]);

  // ── Flush on unmount / page unload ────────────────────────────────────────
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

  // ── Add ───────────────────────────────────────────────────────────────────
  const commitAdd = async () => {
    if (!adding || !addName.trim()) { cancelAdd(); return; }
    const name = addName.trim();

    // CRITICAL: Save any pending edits BEFORE creating a new note
    // (otherwise the pending save could race with the note switch)
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
      } else if (adding.kind === 'way-inline-note') {
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
    } finally {
      cancelAdd();
    }
  };

  const cancelAdd = () => { setAdding(null); setAddName(''); };

  // ── Rename ────────────────────────────────────────────────────────────────
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

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteWay = async (id: string) => {
    if (!confirm('Delete this way and everything inside?')) return;
    try {
      await waysApi.delete(id);
      if (selection && 'parentId' in selection && selection.parentId === id) setSelection(null);
      await loadWays();
      toast.success('Way deleted');
    } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
  };

  const deleteTopic = async (id: string) => {
    if (!confirm('Delete this topic and all its notes?')) return;
    try {
      await topicsApi.delete(id);
      if (selection && 'parentId' in selection && selection.parentId === id) setSelection(null);
      await loadWays();
      toast.success('Topic deleted');
    } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
  };

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      await notesApi.delete(id);
      if (selection?.noteId === id) setSelection(null);
      if (editorState?.noteId === id) setEditorState(null);
      await loadWays();
      toast.success('Note deleted');
    } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
  };

  // ── Toggle ────────────────────────────────────────────────────────────────
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

  // ── Filter by search ──────────────────────────────────────────────────────
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
        const wayNoteMatches = way.note?.name.toLowerCase().includes(q) ?? false;
        if (wayMatches || topics.length || wayNoteMatches) {
          return { ...way, topics: wayMatches ? way.topics : topics };
        }
        return null;
      })
      .filter(Boolean) as Way[];
  }, [ways, search]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const InlineInput = ({ placeholder, onCommit, onCancel }: { placeholder: string; onCommit: () => void; onCancel: () => void }) => (
    <div className="px-2 py-1">
      <input
        type="text"
        placeholder={placeholder}
        value={addName}
        onChange={(e) => setAddName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel(); }}
        onBlur={() => (addName.trim() ? onCommit() : onCancel())}
        className="w-full h-8 px-2.5 text-sm bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
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
        className="w-full h-8 px-2.5 text-sm bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
        autoFocus
      />
    </div>
  );

  const ActionBtn = ({ icon: Icon, onClick, title }: { icon: React.ElementType; onClick: (e: React.MouseEvent) => void; title: string }) => (
    <div
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className="p-1 rounded-md hover:bg-card/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
    >
      <Icon size={12} />
    </div>
  );

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="size-full flex">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-72 border-r border-border bg-sidebar flex flex-col flex-shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-sidebar-border">
          <div className="flex items-center justify-end mb-3">
            <button
              onClick={() => { setAdding({ kind: 'way' }); setAddName(''); }}
              title="Add way"
              className="p-1 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-colors"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-2.5 text-xs bg-card rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
            />
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
                      if (way.note) {
                        setSelection({ kind: 'note', noteId: way.note.id, parentType: 'way', parentId: way.id });
                      } else {
                        setAdding({ kind: 'way-inline-note', wayId: way.id });
                        setAddName('');
                      }
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
                  >
                    {adding?.kind === 'way-inline-note' && adding.wayId === way.id && (
                      <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
                    )}
                    {way.note && (
                      <div
                        onClick={() => setSelection({ kind: 'note', noteId: way.note!.id, parentType: 'way', parentId: way.id })}
                        className={`group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md cursor-pointer ${
                          selection?.noteId === way.note.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-sidebar-accent'
                        }`}
                      >
                        <FileText size={13} className="flex-shrink-0 opacity-80" />
                        <span className="flex-1 text-sm truncate">{way.note.name}</span>
                        <ActionBtn icon={Pencil} title="Rename" onClick={() => startRename({ kind: 'note', id: way.note!.id }, way.note!.name)} />
                        <ActionBtn icon={Trash2} title="Delete" onClick={() => deleteNote(way.note!.id)} />
                      </div>
                    )}

                    {way.topics.map((topic) => (
                      <div key={topic.id}>
                        {renaming?.kind === 'topic' && renaming.id === topic.id ? (
                          <RenameInput onCommit={commitRename} onCancel={cancelRename} />
                        ) : (
                          <div
                            onClick={() => toggleTopic(topic.id)}
                            className="group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md hover:bg-sidebar-accent cursor-pointer"
                          >
                            {expandedTopics.has(topic.id) ? (
                              <ChevronDown size={12} className="text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight size={12} className="text-muted-foreground flex-shrink-0" />
                            )}
                            <Folder size={12} className="text-muted-foreground flex-shrink-0" />
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
                                      onClick={() => setSelection({ kind: 'note', noteId: note.id, parentType: 'topic', parentId: topic.id })}
                                      className={`group flex items-center gap-1.5 px-2 py-1.5 ml-1 mr-1 rounded-md cursor-pointer ${
                                        selection?.noteId === note.id
                                          ? 'bg-primary text-primary-foreground'
                                          : 'hover:bg-sidebar-accent'
                                      }`}
                                    >
                                      <FileText size={12} className="flex-shrink-0 opacity-80" />
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

      {/* ── Editor ───────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentNote && editorState?.noteId === currentNote.id ? (
          <>
            <header className="px-8 py-4 border-b border-border bg-background/80 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-semibold tracking-tight">{currentNote.name}</h2>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                {saving ? (
                  <><Loader2 size={12} className="animate-spin" /> Saving...</>
                ) : editorState.dirty ? (
                  <>Unsaved</>
                ) : (
                  <>Saved</>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-10 py-8">
                <RichTextEditor
                  key={currentNote.id}
                  noteId={currentNote.id}
                  content={editorState.content}
                  onChange={(html) => {
                    // Guard: only update if this belongs to the current note
                    const cur = editorStateRef.current;
                    if (!cur || cur.noteId !== currentNote.id) return;
                    setEditorState({ noteId: currentNote.id, content: html, dirty: html !== currentNote.content });
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <BookOpen size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select or create a note to start</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
