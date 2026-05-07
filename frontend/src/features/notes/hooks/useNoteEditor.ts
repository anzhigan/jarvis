import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Note } from '../../../api/types';
import type { NotesLibrary, NoteWithLocation } from './useNotesLibrary';

const STORAGE_KEY = 'jarvnote:notes:selectedId';

export interface NoteBreadcrumb {
  kind: 'way' | 'topic' | 'note';
  id: string;
  name: string;
}

/**
 * Tracks the currently selected note and derives navigation context
 * (breadcrumbs, parent way/topic). Persists selection across reloads.
 *
 * Listens to a `jarvnote:openNote` window event so the command palette
 * can open a note from anywhere.
 */
export function useNoteEditor(library: NotesLibrary) {
  const [selectedNoteId, setSelectedNoteIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  const setSelectedNoteId = useCallback((id: string | null) => {
    setSelectedNoteIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Cross-app open-note bus (command palette, deep links).
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setSelectedNoteId(id);
    };
    window.addEventListener('jarvnote:openNote', handler);
    return () => window.removeEventListener('jarvnote:openNote', handler);
  }, [setSelectedNoteId]);

  const located: NoteWithLocation | null = useMemo(() => {
    if (!selectedNoteId) return null;
    return library.findNote(selectedNoteId) ?? null;
  }, [selectedNoteId, library]);

  // If the selected id no longer exists in the library (deleted, moved away)
  // clear it so the editor doesn't render a stale state.
  useEffect(() => {
    if (selectedNoteId && !library.loading && !located) {
      setSelectedNoteId(null);
    }
  }, [selectedNoteId, library.loading, located, setSelectedNoteId]);

  const breadcrumbs = useMemo<NoteBreadcrumb[]>(() => {
    if (!located) return [];
    const out: NoteBreadcrumb[] = [
      { kind: 'way', id: located.way.id, name: located.way.name },
    ];
    if (located.topic) out.push({ kind: 'topic', id: located.topic.id, name: located.topic.name });
    out.push({ kind: 'note', id: located.note.id, name: located.note.name });
    return out;
  }, [located]);

  const note: Note | null = located?.note ?? null;

  return { selectedNoteId, setSelectedNoteId, note, located, breadcrumbs };
}
