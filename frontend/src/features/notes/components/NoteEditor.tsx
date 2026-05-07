import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { Note } from '../../../api/types';
import type { NoteBreadcrumb } from '../hooks/useNoteEditor';

// RichTextEditor pulls in tiptap + lowlight + katex (~280 KB gzip). Lazy-load
// it so opening the section without a selected note pays nothing.
const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));

interface Props {
  note: Note | null;
  breadcrumbs: NoteBreadcrumb[];
  saving: boolean;
  savedAt: number | null;
  onTitleChange: (id: string, name: string) => void;
  onContentChange: (id: string, html: string) => void;
}

function SavedIndicator({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  const [, force] = useState(0);
  // Re-render every 30s so "Saved 2s ago" stays current.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (saving) {
    return (
      <span className="saved" data-state="saving">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="saved" data-state="saved">
        <Check size={11} /> {formatRelative(savedAt)}
      </span>
    );
  }
  return null;
}

function formatRelative(ts: number): string {
  const diff = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diff < 5)   return 'Saved just now';
  if (diff < 60)  return `Saved ${diff}s ago`;
  const m = Math.round(diff / 60);
  if (m < 60)     return `Saved ${m}m ago`;
  return 'Saved earlier';
}

function Breadcrumbs({ items }: { items: NoteBreadcrumb[] }) {
  if (items.length === 0) return <span className="crumbs" />;
  return (
    <div className="crumbs">
      {items.map((c, i) => (
        <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {i > 0 && <span className="crumb-sep"><ChevronRight /></span>}
          <span className="crumb">{c.name || 'Untitled'}</span>
        </span>
      ))}
    </div>
  );
}

function EditorFallback() {
  return (
    <div style={{ padding: 24, color: 'var(--fg-muted)', fontSize: 13 }}>
      <Loader2 size={14} className="animate-spin" /> Loading editor…
    </div>
  );
}

export function NoteEditor({ note, breadcrumbs, saving, savedAt, onTitleChange, onContentChange }: Props) {
  // Local title mirrors note.name but doesn't reset on every server refresh —
  // only when the user switches to a different note (note.id changes).
  const [localTitle, setLocalTitle] = useState(note?.name ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setLocalTitle(note?.name ?? ''); }, [note?.id]);

  if (!note) {
    return (
      <main className="content">
        <div className="content-empty">
          <div className="content-empty-title">No note selected</div>
          <div>Pick a note from the library or create a new one.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="content editor">
      <div className="content-bar">
        <Breadcrumbs items={breadcrumbs} />
        <SavedIndicator saving={saving} savedAt={savedAt} />
        <Tooltip content="More actions" side="bottom">
          <button className="icon-btn" aria-label="More actions"><MoreHorizontal /></button>
        </Tooltip>
      </div>

      <div className="note-paper">
        <input
          className="note-title"
          value={localTitle}
          placeholder="Untitled"
          onChange={(e) => {
            const v = e.target.value;
            setLocalTitle(v);
            onTitleChange(note.id, v);
          }}
        />

        <Suspense fallback={<EditorFallback />}>
          <RichTextEditor
            key={note.id}
            noteId={note.id}
            content={note.content}
            onChange={(html) => onContentChange(note.id, html)}
          />
        </Suspense>
      </div>
    </main>
  );
}
