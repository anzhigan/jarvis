import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../../../api/types';
import type { NotesLibrary, NoteWithLocation } from './useNotesLibrary';

const STORAGE_KEY = 'jarvnote:notes:selectedId';

export interface NoteBreadcrumb {
  kind: 'way' | 'topic' | 'subtopic' | 'subsubtopic' | 'note';
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

  // Kept current so the openNote handler (whose closure is created once) can
  // tell a same-note deep link from a cross-note one without re-subscribing.
  const selectedIdRef = useRef(selectedNoteId);
  selectedIdRef.current = selectedNoteId;
  // Same, for resolving the source note's title for the "← Back" pill.
  const libraryRef = useRef(library);
  libraryRef.current = library;

  // Cross-app open-note bus (command palette, deep links, quiz "open source").
  // Detail is either a bare id string (legacy) or `{ id, highlight? }` — the
  // second form lets callers ask NoteEditor to scroll+highlight a quote after
  // the note mounts. We stash the pending highlight in sessionStorage so it
  // survives the render/mount gap without adding another cross-cutting store.
  useEffect(() => {
    type Source = { noteId: string; scrollTop: number };
    type Detail = string | {
      id: string;
      highlight?: string;
      heading?: string;
      from?: Source;
      restoreScrollTop?: number;
    };
    const handler = (e: Event) => {
      const raw = (e as CustomEvent<Detail>).detail;
      if (!raw) return;
      if (typeof raw === 'string') {
        setSelectedNoteId(raw);
        return;
      }
      if (!raw.id) return;

      // Returning to a source note — stash the scroll to restore on mount.
      if (raw.restoreScrollTop != null) {
        sessionStorage.setItem('jarvnote:notes:pendingRestoreScroll', String(raw.restoreScrollTop));
        setSelectedNoteId(raw.id);
        return;
      }

      // Tag the "came from" info with the source note's title for the pill.
      const back = raw.from
        ? {
            ...raw.from,
            label: libraryRef.current.findNote(raw.from.noteId)?.note.name || 'note',
          }
        : null;

      // Deep link within the SAME note → the editor won't remount, so scroll
      // now (and place the back pill) instead of stashing pending anchors.
      if (raw.id === selectedIdRef.current && (raw.heading || back)) {
        window.dispatchEvent(new CustomEvent('jarvnote:scrollToHeading', {
          detail: { noteId: raw.id, heading: raw.heading, from: back },
        }));
        return;
      }

      if (raw.heading) sessionStorage.setItem('jarvnote:notes:pendingHeading', raw.heading);
      if (raw.highlight) sessionStorage.setItem('jarvnote:notes:pendingHighlight', raw.highlight);
      if (back) sessionStorage.setItem('jarvnote:notes:pendingBack', JSON.stringify(back));
      setSelectedNoteId(raw.id);
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
    if (located.subtopic) out.push({ kind: 'subtopic', id: located.subtopic.id, name: located.subtopic.name });
    if (located.subsubtopic) out.push({ kind: 'subsubtopic', id: located.subsubtopic.id, name: located.subsubtopic.name });
    out.push({ kind: 'note', id: located.note.id, name: located.note.name });
    return out;
  }, [located]);

  const note: Note | null = located?.note ?? null;

  return { selectedNoteId, setSelectedNoteId, note, located, breadcrumbs };
}
