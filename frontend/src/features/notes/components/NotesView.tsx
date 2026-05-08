import { useCallback, useEffect, useState } from 'react';
import { Loader2, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
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
  }, [paneCollapsed]);

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
        onCollapseToggle={() => setPaneCollapsed(true)}
      />

      {paneCollapsed && (
        <Tooltip content="Show library" side="right">
          <button
            className="pane-expand-floating"
            onClick={() => setPaneCollapsed(false)}
            aria-label="Show library"
          >
            <PanelLeftOpen />
          </button>
        </Tooltip>
      )}

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
