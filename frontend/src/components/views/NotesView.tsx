import { useEffect, useRef, useState } from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { waysApi, topicsApi, notesApi } from '../../api/client';
import type { Note, Topic, Way } from '../../api/types';
import { Button } from '../ui';
import { Library } from './notes/Library';
import { EditorPane } from './notes/EditorPane';
import { ContextPanel } from './notes/ContextPanel';

export default function NotesView() {
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() => {
    return localStorage.getItem('jarvnote:notes:selectedId') || null;
  });
  const [libraryCollapsed, setLibraryCollapsed] = useState(() =>
    localStorage.getItem('jarvnote:notes:libCollapsed') === '1');
  const [contextCollapsed, setContextCollapsed] = useState(() =>
    localStorage.getItem('jarvnote:notes:ctxCollapsed') === '1');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const draftContent = useRef<Map<string, string>>(new Map());
  const draftTitle = useRef<Map<string, string>>(new Map());
  const saveTimer = useRef<number | undefined>(undefined);

  const load = async () => {
    try {
      const data = await waysApi.list();
      setWays(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Command palette dispatches a custom event to open a specific note.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setSelectedNoteId(id);
    };
    window.addEventListener('jarvnote:openNote', handler);
    return () => window.removeEventListener('jarvnote:openNote', handler);
  }, []);

  useEffect(() => {
    if (selectedNoteId) localStorage.setItem('jarvnote:notes:selectedId', selectedNoteId);
    else localStorage.removeItem('jarvnote:notes:selectedId');
  }, [selectedNoteId]);
  useEffect(() => {
    localStorage.setItem('jarvnote:notes:libCollapsed', libraryCollapsed ? '1' : '0');
  }, [libraryCollapsed]);
  useEffect(() => {
    localStorage.setItem('jarvnote:notes:ctxCollapsed', contextCollapsed ? '1' : '0');
  }, [contextCollapsed]);

  // Find selected note + its parents from the tree.
  const findSelected = (): { note: Note; way: Way; topic: Topic | null } | null => {
    if (!selectedNoteId) return null;
    for (const w of ways) {
      for (const n of w.notes) {
        if (n.id === selectedNoteId) return { note: n, way: w, topic: null };
      }
      for (const t of w.topics) {
        for (const n of t.notes) {
          if (n.id === selectedNoteId) return { note: n, way: w, topic: t };
        }
      }
    }
    return null;
  };

  const selected = findSelected();

  // ── CRUD ────────────────────────────────────────────────────────────────
  const createWay = async () => {
    const name = prompt('Way name?');
    if (!name?.trim()) return;
    try {
      await waysApi.create(name.trim(), ways.length);
      await load();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const createTopic = async (wayId: string) => {
    const name = prompt('Topic name?');
    if (!name?.trim()) return;
    try {
      await topicsApi.create(wayId, name.trim());
      await load();
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const createNote = async (wayId: string, topicId: string | null) => {
    try {
      const created = await notesApi.create({
        name: 'Untitled',
        content: '',
        ...(topicId ? { topic_id: topicId } : { way_id: wayId }),
      });
      await load();
      setSelectedNoteId(created.id);
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const renameWay = async (id: string, name: string) => {
    try { await waysApi.update(id, { name }); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };
  const renameTopic = async (id: string, name: string) => {
    try { await topicsApi.update(id, { name }); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };
  const renameNote = async (id: string, name: string) => {
    try { await notesApi.update(id, { name }); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  const deleteWay = async (id: string) => {
    if (!confirm('Delete this way and everything inside?')) return;
    try { await waysApi.delete(id); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };
  const deleteTopic = async (id: string) => {
    if (!confirm('Delete this topic and its notes?')) return;
    try { await topicsApi.delete(id); await load(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };
  const deleteNote = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      await notesApi.delete(id);
      if (id === selectedNoteId) setSelectedNoteId(null);
      await load();
    }
    catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  // ── Autosave ────────────────────────────────────────────────────────────
  const scheduleSave = (id: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const c = draftContent.current.get(id);
      const title = draftTitle.current.get(id);
      if (c === undefined && title === undefined) return;
      setSaving(true);
      try {
        await notesApi.update(id, {
          ...(title !== undefined ? { name: title } : {}),
          ...(c !== undefined ? { content: c } : {}),
        });
        draftContent.current.delete(id);
        draftTitle.current.delete(id);
        setSavedAt(Date.now());
        // re-pull the way list so the tree shows new title
        if (title !== undefined) await load();
      } catch (e: any) {
        toast.error(e?.detail ?? 'Failed to save');
      } finally {
        setSaving(false);
      }
    }, 1200);
  };

  const handleTitleChange = (newName: string) => {
    if (!selected) return;
    draftTitle.current.set(selected.note.id, newName);
    // Optimistic update for immediate UI feedback
    setWays((prev) => prev.map((w) => ({
      ...w,
      notes: w.notes.map((n) => (n.id === selected.note.id ? { ...n, name: newName } : n)),
      topics: w.topics.map((t) => ({
        ...t,
        notes: t.notes.map((n) => (n.id === selected.note.id ? { ...n, name: newName } : n)),
      })),
    })));
    scheduleSave(selected.note.id);
  };

  const handleContentChange = (content: string) => {
    if (!selected) return;
    draftContent.current.set(selected.note.id, content);
    // optimistic
    setWays((prev) => prev.map((w) => ({
      ...w,
      notes: w.notes.map((n) => (n.id === selected.note.id ? { ...n, content } : n)),
      topics: w.topics.map((t) => ({
        ...t,
        notes: t.notes.map((n) => (n.id === selected.note.id ? { ...n, content } : n)),
      })),
    })));
    scheduleSave(selected.note.id);
  };

  const togglePin = async () => {
    if (!selected) return;
    try {
      const updated = await notesApi.update(selected.note.id, { pinned: !selected.note.pinned });
      setWays((prev) => prev.map((w) => ({
        ...w,
        notes: w.notes.map((n) => (n.id === updated.id ? { ...n, pinned: updated.pinned } : n)),
        topics: w.topics.map((t) => ({
          ...t,
          notes: t.notes.map((n) => (n.id === updated.id ? { ...n, pinned: updated.pinned } : n)),
        })),
      })));
    } catch (e: any) { toast.error(e?.detail ?? 'Failed'); }
  };

  if (loading) {
    return (
      <div className="dt-page" data-visible="true">
        <div className="size-full flex items-center justify-center">
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="dt-page" data-visible="true">
      <div
        className="notes-3col"
        data-library-collapsed={libraryCollapsed || undefined}
        data-context-collapsed={contextCollapsed || undefined}
      >
        {!libraryCollapsed && (
          <Library
            ways={ways}
            selectedNoteId={selectedNoteId}
            onSelectNote={(n) => setSelectedNoteId(n.id)}
            onCreateWay={createWay}
            onCreateTopic={createTopic}
            onCreateNote={createNote}
            onRenameWay={renameWay}
            onRenameTopic={renameTopic}
            onRenameNote={renameNote}
            onDeleteWay={deleteWay}
            onDeleteTopic={deleteTopic}
            onDeleteNote={deleteNote}
          />
        )}

        {selected ? (
          <EditorPane
            note={selected.note}
            way={selected.way}
            topic={selected.topic}
            saving={saving}
            savedAt={savedAt}
            onTitleChange={handleTitleChange}
            onContentChange={handleContentChange}
            onDelete={() => deleteNote(selected.note.id)}
            onToggleLibrary={() => setLibraryCollapsed((v) => !v)}
            onToggleContext={() => setContextCollapsed((v) => !v)}
            libraryCollapsed={libraryCollapsed}
            contextCollapsed={contextCollapsed}
          />
        ) : (
          <main className="notes-editor">
            <div className="dt-empty">
              <BookOpen size={32} style={{ color: 'var(--fg-faint)' }} />
              <div>
                <div className="dt-empty-title">Select a note</div>
                <div className="dt-empty-desc mt-1">
                  Pick something from the library to start editing,
                  {ways.length === 0 ? ' or create your first way.' : ' or create a new note.'}
                </div>
              </div>
              {ways.length === 0 && (
                <Button variant="primary" onClick={createWay}>Create first way</Button>
              )}
            </div>
          </main>
        )}

        {!contextCollapsed && selected && (
          <ContextPanel note={selected.note} onTogglePin={togglePin} />
        )}
      </div>
    </div>
  );
}
