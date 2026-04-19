import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  ChevronDown,
  ChevronLeft,
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
import SwipeRow from './SwipeRow';
import { notesApi, topicsApi, waysApi } from '../api/client';
import type { Note, Topic, Way } from '../api/types';

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

// Mobile navigation state
type MobileView =
  | { kind: 'root' }                      // list of ways
  | { kind: 'way'; wayId: string }        // inside a way — shows topics + way note
  | { kind: 'topic'; topicId: string };   // inside a topic — shows notes

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

  // ── Autosave ──────────────────────────────────────────────────────────────
  const saveCurrentEditor = async (): Promise<void> => {
    const st = editorStateRef.current;
    if (!st || !st.dirty) return;
    setSaving(true);
    try {
      await notesApi.update(st.noteId, { content: st.content });
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

  const deleteWay = async (id: string) => {
    if (!confirm('Delete this way and everything inside?')) return;
    try {
      await waysApi.delete(id);
      if (selection && selection.parentId === id) setSelection(null);
      if (mobileView.kind === 'way' && mobileView.wayId === id) setMobileView({ kind: 'root' });
      await loadWays();
      toast.success('Way deleted');
    } catch (e: any) { toast.error(e?.detail ?? 'Failed to delete'); }
  };

  const deleteTopic = async (id: string) => {
    if (!confirm('Delete this topic and all its notes?')) return;
    try {
      await topicsApi.delete(id);
      if (selection && selection.parentId === id) setSelection(null);
      if (mobileView.kind === 'topic' && mobileView.topicId === id) {
        // Go back to the parent way
        const parentWay = ways.find((w) => w.topics.some((t) => t.id === id));
        if (parentWay) setMobileView({ kind: 'way', wayId: parentWay.id });
        else setMobileView({ kind: 'root' });
      }
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
        const wayNoteMatches = way.note?.name.toLowerCase().includes(q) ?? false;
        if (wayMatches || topics.length || wayNoteMatches) {
          return { ...way, topics: wayMatches ? way.topics : topics };
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
        <div className="size-full flex flex-col">
          <header className="px-3 py-3 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-2 flex-shrink-0">
            <button
              onClick={async () => {
                await saveCurrentEditor();
                setSelection(null);
              }}
              className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Back"
            >
              <ChevronLeft size={22} />
            </button>
            <h2 className="text-base font-semibold tracking-tight flex-1 min-w-0 truncate">{currentNote.name}</h2>
            <div className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving</> : editorState.dirty ? 'Unsaved' : 'Saved'}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-4">
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
      );
    }

    // Mobile hierarchy views
    return (
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
        InlineInput={InlineInput}
        RenameInput={RenameInput}
        onSelectNote={(noteId, parentType, parentId) =>
          setSelection({ kind: 'note', noteId, parentType, parentId })
        }
        onDeleteWay={deleteWay}
        onDeleteTopic={deleteTopic}
        onDeleteNote={deleteNote}
      />
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP VIEW (original sidebar + editor)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="size-full flex">
      <aside className="w-72 border-r border-border bg-sidebar flex flex-col flex-shrink-0">
        <div className="px-4 pt-4 pb-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
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

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {currentNote && editorState?.noteId === currentNote.id ? (
          <>
            <header className="px-8 py-4 border-b border-border bg-background/80 backdrop-blur-sm flex items-center gap-3 flex-shrink-0">
              <h2 className="text-xl font-semibold tracking-tight flex-1 min-w-0 truncate">{currentNote.name}</h2>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-shrink-0">
                {saving ? <><Loader2 size={12} className="animate-spin" /> Saving...</> : editorState.dirty ? 'Unsaved' : 'Saved'}
              </div>
            </header>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto px-10 py-8">
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
  InlineInput,
  RenameInput,
  onSelectNote,
  onDeleteWay,
  onDeleteTopic,
  onDeleteNote,
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
  InlineInput: React.FC<{ placeholder: string; onCommit: () => void; onCancel: () => void }>;
  RenameInput: React.FC<{ onCommit: () => void; onCancel: () => void }>;
  onSelectNote: (noteId: string, parentType: 'way' | 'topic', parentId: string) => void;
  onDeleteWay: (id: string) => void;
  onDeleteTopic: (id: string) => void;
  onDeleteNote: (id: string) => void;
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

  const onAddClick = () => {
    if (view.kind === 'root') {
      setAdding({ kind: 'way' });
    } else if (view.kind === 'way' && currentWay) {
      // At way level, add a topic (most common need)
      setAdding({ kind: 'topic', wayId: currentWay.id });
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
                  <RenameInput onCommit={() => {}} onCancel={() => {}} />
                ) : (
                  <button
                    onClick={() => setView({ kind: 'way', wayId: way.id })}
                    className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                  >
                    <BookOpen size={20} className="text-primary flex-shrink-0" />
                    <span className="flex-1 text-base font-medium truncate">{way.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {way.topics.length + (way.note ? 1 : 0)}
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
            {/* Way's own note */}
            {currentWay.note ? (
              <SwipeRow
                onEdit={() => startRename({ kind: 'note', id: currentWay.note!.id }, currentWay.note!.name)}
                onDelete={() => onDeleteNote(currentWay.note!.id)}
              >
                <button
                  onClick={() => onSelectNote(currentWay.note!.id, 'way', currentWay.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                >
                  <FileText size={18} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-base truncate">{currentWay.note.name}</span>
                  <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                </button>
              </SwipeRow>
            ) : (
              adding?.kind !== 'way-inline-note' && (
                <button
                  onClick={() => setAdding({ kind: 'way-inline-note', wayId: currentWay.id })}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-muted-foreground hover:bg-secondary/40 active:bg-secondary/60 text-left text-sm"
                >
                  <FilePlus size={18} />
                  Add main note
                </button>
              )
            )}
            {adding?.kind === 'way-inline-note' && adding.wayId === currentWay.id && (
              <div className="border-b border-border">
                <InlineInput placeholder="Note name" onCommit={commitAdd} onCancel={cancelAdd} />
              </div>
            )}

            {/* Topics */}
            {currentWay.topics.map((topic) => (
              <SwipeRow
                key={topic.id}
                onEdit={() => startRename({ kind: 'topic', id: topic.id }, topic.name)}
                onDelete={() => onDeleteTopic(topic.id)}
              >
                <button
                  onClick={() => setView({ kind: 'topic', topicId: topic.id })}
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                >
                  <Folder size={18} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-base truncate">{topic.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{topic.notes.length}</span>
                  <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                </button>
              </SwipeRow>
            ))}

            {currentWay.topics.length === 0 && !currentWay.note && !adding && (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                Empty. Tap + to add a topic.
              </div>
            )}
          </>
        )}

        {view.kind === 'topic' && currentTopic && (
          <>
            {currentTopic.notes.map((note) => (
              <SwipeRow
                key={note.id}
                onEdit={() => startRename({ kind: 'note', id: note.id }, note.name)}
                onDelete={() => onDeleteNote(note.id)}
              >
                <button
                  onClick={() => onSelectNote(note.id, 'topic', currentTopic.id)}
                  className="w-full flex items-center gap-3 px-4 py-4 border-b border-border hover:bg-secondary/40 active:bg-secondary/60 text-left"
                >
                  <FileText size={18} className="text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-base truncate">{note.name}</span>
                  <ChevronRight size={18} className="text-muted-foreground flex-shrink-0" />
                </button>
              </SwipeRow>
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
