import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNotesLibrary } from '../hooks/useNotesLibrary';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteAutoSave } from '../hooks/useNoteAutoSave';
import { NotesPane } from './NotesPane';
import { NoteEditor } from './NoteEditor';
import './notes.css';

const PANE_COLLAPSED_KEY = 'jarvnote:notes:libCollapsed';

export default function NotesView() {
  const library = useNotesLibrary();
  const editor  = useNoteEditor(library);
  const save    = useNoteAutoSave(() => { void library.refresh(); });

  const [paneCollapsed, setPaneCollapsed] = useState(
    () => localStorage.getItem(PANE_COLLAPSED_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(PANE_COLLAPSED_KEY, paneCollapsed ? '1' : '0');
    // Tell the rail's sidebar-toggle about our current state so it can show
    // an active indicator on the rail button.
    window.dispatchEvent(new CustomEvent('jarvnote:notesPaneState', {
      detail: paneCollapsed,
    }));
  }, [paneCollapsed]);

  // Listen for toggle requests from the rail button (DesktopShell). The rail
  // owns the visible toggle; this view just owns the boolean.
  useEffect(() => {
    const handler = () => setPaneCollapsed((c) => !c);
    window.addEventListener('jarvnote:toggleNotesPane', handler);
    return () => window.removeEventListener('jarvnote:toggleNotesPane', handler);
  }, []);

  // Cross-section open: AIToastStack dispatches this when user clicks "Open →"
  // on a quiz/tasks toast originating from a different note than currently
  // shown. We re-select that note so the NoteEditor receives it.
  useEffect(() => {
    const handler = (e: Event) => {
      const noteId = (e as CustomEvent<string>).detail;
      if (noteId) editor.setSelectedNoteId(noteId);
    };
    window.addEventListener('jarvnote:openNote', handler);
    return () => window.removeEventListener('jarvnote:openNote', handler);
  }, [editor]);

  const handleSelectNote = useCallback(async (id: string) => {
    await save.flush();
    editor.setSelectedNoteId(id);
  }, [save, editor]);

  if (library.loading) {
    return (
      <main className="content">
        <div className="content-empty">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <>
      <NotesPane
        library={library}
        selectedNoteId={editor.selectedNoteId}
        collapsed={paneCollapsed}
        onSelectNote={handleSelectNote}
      />

      <NoteEditor
        note={editor.note}
        breadcrumbs={editor.breadcrumbs}
        saving={save.saving}
        savedAt={save.savedAt}
        onTitleChange={(id, name) => save.queueSave(id, { name })}
        onContentChange={(id, html) => save.queueSave(id, { content: html })}
      />
    </>
  );
}
