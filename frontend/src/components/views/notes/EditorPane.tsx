import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ChevronRight, Loader2, MoreHorizontal, PanelLeftClose, PanelRightClose, Trash2 } from 'lucide-react';
import type { Note, Topic, Way } from '../../../api/types';
import NoteTitle from '../../NoteTitle';
import { IconButton, Tooltip, Dropdown, MenuItem, MenuSeparator } from '../../ui';

const RichTextEditor = lazy(() => import('../../RichTextEditor'));

interface Props {
  note: Note;
  way: Way | null;
  topic: Topic | null;
  saving: boolean;
  savedAt: number | null;
  onTitleChange: (name: string) => void;
  onContentChange: (content: string) => void;
  onDelete: () => void;
  onToggleLibrary: () => void;
  onToggleContext: () => void;
  libraryCollapsed: boolean;
  contextCollapsed: boolean;
}

export function EditorPane({
  note, way, topic, saving, savedAt,
  onTitleChange, onContentChange, onDelete,
  onToggleLibrary, onToggleContext, libraryCollapsed, contextCollapsed,
}: Props) {
  const [savedLabel, setSavedLabel] = useState('');
  const tickRef = useRef<number>();

  useEffect(() => {
    const tick = () => {
      if (saving) { setSavedLabel('Saving…'); }
      else if (savedAt) {
        const ago = Math.max(0, Date.now() - savedAt);
        if (ago < 4000) setSavedLabel('Saved');
        else if (ago < 60_000) setSavedLabel(`Saved ${Math.round(ago / 1000)}s ago`);
        else setSavedLabel(`Saved ${Math.round(ago / 60_000)}m ago`);
      } else setSavedLabel('');
    };
    tick();
    tickRef.current = window.setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [saving, savedAt]);

  return (
    <main className="notes-editor">
      <div className="notes-editor-bar">
        <Tooltip content={libraryCollapsed ? 'Show library' : 'Hide library'}>
          <IconButton size="sm" onClick={onToggleLibrary} aria-label="Toggle library">
            <PanelLeftClose size={14} />
          </IconButton>
        </Tooltip>
        <div className="notes-crumbs">
          {way && <span className="notes-crumb">{way.name}</span>}
          {topic && <><ChevronRight className="notes-crumb-sep" size={12} /><span className="notes-crumb">{topic.name}</span></>}
          {(way || topic) && <ChevronRight className="notes-crumb-sep" size={12} />}
          <span className="notes-crumb">{note.name || 'Untitled'}</span>
        </div>
        <span className="notes-save">
          {saving && <Loader2 size={11} className="animate-spin" />}
          {savedLabel}
        </span>
        <Dropdown trigger={<IconButton size="sm" aria-label="Note actions"><MoreHorizontal size={14} /></IconButton>}>
          <MenuItem icon={<Trash2 size={12} />} tone="danger" onSelect={onDelete}>Delete note</MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onToggleContext}>{contextCollapsed ? 'Show context panel' : 'Hide context panel'}</MenuItem>
        </Dropdown>
        <Tooltip content={contextCollapsed ? 'Show context' : 'Hide context'}>
          <IconButton size="sm" onClick={onToggleContext} aria-label="Toggle context">
            <PanelRightClose size={14} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="notes-doc">
        <NoteTitle initial={note.name} onChange={onTitleChange} />
        <Suspense fallback={
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
          </div>
        }>
          <RichTextEditor
            key={note.id}
            noteId={note.id}
            content={note.content}
            onChange={onContentChange}
          />
        </Suspense>
      </div>
    </main>
  );
}
