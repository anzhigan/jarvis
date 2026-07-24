import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { notesApi, subsubtopicsApi, subtopicsApi, topicsApi, waysApi } from '../../../api/client';
import type { NoteParent } from '../../../api/client';
import type { Note, Subsubtopic, Subtopic, Topic, Way } from '../../../api/types';

export interface NoteWithLocation {
  note: Note;
  way: Way;
  topic: Topic | null;
  subtopic: Subtopic | null;
  subsubtopic: Subsubtopic | null;
}

/**
 * Single source of truth for the Notes library.
 *
 * Loads `ways` (which include nested `topics` and `notes`) from the backend,
 * exposes derived views (flattened notes, pinned notes), and offers mutations
 * that refresh the local cache after a successful API call.
 *
 * Used by both the desktop Notes view and (future) the mobile Notes view —
 * the hook contains no UI assumptions.
 */
export function useNotesLibrary() {
  const [ways, setWays] = useState<Way[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await waysApi.list();
      setWays(data);
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Derived views ────────────────────────────────────────────────────────
  const allNotes = useMemo<NoteWithLocation[]>(() => {
    const out: NoteWithLocation[] = [];
    for (const way of ways) {
      for (const note of way.notes) out.push({ note, way, topic: null, subtopic: null, subsubtopic: null });
      for (const topic of way.topics) {
        for (const note of topic.notes) out.push({ note, way, topic, subtopic: null, subsubtopic: null });
        for (const subtopic of topic.subtopics) {
          for (const note of subtopic.notes) out.push({ note, way, topic, subtopic, subsubtopic: null });
          for (const subsubtopic of subtopic.subsubtopics) {
            for (const note of subsubtopic.notes) out.push({ note, way, topic, subtopic, subsubtopic });
          }
        }
      }
    }
    return out;
  }, [ways]);

  const pinnedNotes = useMemo(
    () => allNotes.filter((n) => n.note.pinned)
                  .sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at)),
    [allNotes],
  );

  const findNote = useCallback(
    (id: string): NoteWithLocation | undefined => allNotes.find((n) => n.note.id === id),
    [allNotes],
  );

  // ── Mutations ────────────────────────────────────────────────────────────
  // Each mutator awaits the API, then refreshes the cache. We could do
  // optimistic updates per-entity, but a refresh keeps `way.notes`,
  // `topic.notes` and counts trivially in sync.

  const createWay = useCallback(async (name: string): Promise<Way | null> => {
    try {
      const w = await waysApi.create(name);
      await refresh();
      return w;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to create way');
      return null;
    }
  }, [refresh]);

  const renameWay = useCallback(async (id: string, name: string) => {
    try { await waysApi.update(id, { name }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to rename way'); }
  }, [refresh]);

  const deleteWay = useCallback(async (id: string) => {
    try { await waysApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete way'); }
  }, [refresh]);

  const createTopic = useCallback(async (wayId: string, name: string): Promise<Topic | null> => {
    try { const t = await topicsApi.create(wayId, name); await refresh(); return t; }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to create topic'); return null; }
  }, [refresh]);

  const renameTopic = useCallback(async (id: string, name: string) => {
    try { await topicsApi.update(id, { name }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to rename topic'); }
  }, [refresh]);

  const deleteTopic = useCallback(async (id: string) => {
    try { await topicsApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete topic'); }
  }, [refresh]);

  const createSubtopic = useCallback(
    async (topicId: string, name: string): Promise<Subtopic | null> => {
      try { const s = await subtopicsApi.create(topicId, name); await refresh(); return s; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create subtopic'); return null; }
    },
    [refresh],
  );

  const renameSubtopic = useCallback(async (id: string, name: string) => {
    try { await subtopicsApi.update(id, { name }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to rename subtopic'); }
  }, [refresh]);

  const deleteSubtopic = useCallback(async (id: string) => {
    try { await subtopicsApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete subtopic'); }
  }, [refresh]);

  const createSubsubtopic = useCallback(
    async (subtopicId: string, name: string): Promise<Subsubtopic | null> => {
      try { const s = await subsubtopicsApi.create(subtopicId, name); await refresh(); return s; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create subsubtopic'); return null; }
    },
    [refresh],
  );

  const renameSubsubtopic = useCallback(async (id: string, name: string) => {
    try { await subsubtopicsApi.update(id, { name }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to rename subsubtopic'); }
  }, [refresh]);

  const deleteSubsubtopic = useCallback(async (id: string) => {
    try { await subsubtopicsApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete subsubtopic'); }
  }, [refresh]);

  const createNote = useCallback(
    async (target: NoteParent, name = 'Untitled'): Promise<Note | null> => {
      try { const n = await notesApi.create({ name, ...target }); await refresh(); return n; }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to create note'); return null; }
    },
    [refresh],
  );

  const renameNote = useCallback(async (id: string, name: string) => {
    try { await notesApi.update(id, { name }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to rename note'); }
  }, [refresh]);

  const deleteNote = useCallback(async (id: string) => {
    try { await notesApi.delete(id); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to delete note'); }
  }, [refresh]);

  const togglePin = useCallback(async (noteId: string) => {
    const located = findNote(noteId);
    if (!located) return;
    try { await notesApi.update(noteId, { pinned: !located.note.pinned }); await refresh(); }
    catch (e: any) { toast.error(e?.detail ?? 'Failed to toggle pin'); }
  }, [findNote, refresh]);

  const moveNote = useCallback(
    async (noteId: string, target: NoteParent) => {
      try { await notesApi.move(noteId, target); await refresh(); }
      catch (e: any) { toast.error(e?.detail ?? 'Failed to move note'); }
    },
    [refresh],
  );

  return {
    ways, loading, refresh,
    allNotes, pinnedNotes, findNote,
    createWay, renameWay, deleteWay,
    createTopic, renameTopic, deleteTopic,
    createSubtopic, renameSubtopic, deleteSubtopic,
    createSubsubtopic, renameSubsubtopic, deleteSubsubtopic,
    createNote, renameNote, deleteNote,
    togglePin, moveNote,
  };
}

export type NotesLibrary = ReturnType<typeof useNotesLibrary>;
