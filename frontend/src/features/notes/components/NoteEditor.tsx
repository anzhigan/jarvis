import { lazy, Suspense, useEffect, useState } from 'react';
import { Check, Loader2, MoreHorizontal } from 'lucide-react';
import { Tooltip } from '../../../components/ui';
import type { Note } from '../../../api/types';
import type { NoteBreadcrumb } from '../hooks/useNoteEditor';

// Tiptap is heavy (~280 KB gzip). Lazy-load only when a note is opened.
const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));

interface Props {
  note: Note | null;
  breadcrumbs: NoteBreadcrumb[];
  saving: boolean;
  savedAt: number | null;
  onTitleChange: (id: string, name: string) => void;
  onContentChange: (id: string, html: string) => void;
}

const VIEW_MODES = ['Read', 'Edit', 'Outline'] as const;
type ViewMode = typeof VIEW_MODES[number];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
  if (dayStart.getTime() === today.getTime()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) + ' today';
  }
  return fmtDate(iso);
}
function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}
function readMinutes(html: string): number {
  return Math.max(1, Math.round(wordCount(html) / 200));
}

function SavedPill({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (saving) {
    return (
      <span className="saved-pill" data-state="saving">
        <Loader2 size={11} className="animate-spin" /> Saving…
      </span>
    );
  }
  if (savedAt) {
    const ago = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
    const label = ago < 5 ? 'just now'
                : ago < 60 ? `${ago}s ago`
                : `${Math.round(ago / 60)}m ago`;
    return (
      <span className="saved-pill" data-state="saved">
        <Check size={11} /> {label}
      </span>
    );
  }
  return null;
}

function Breadcrumb({ items }: { items: NoteBreadcrumb[] }) {
  if (items.length === 0) return <div className="breadcrumb" />;
  return (
    <div className="breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span className="breadcrumb-sep">›</span>}
            {last
              ? <b>{c.name || 'Untitled'}</b>
              : <span>{c.name || 'Untitled'}</span>}
          </span>
        );
      })}
    </div>
  );
}

function EditorFallback() {
  return (
    <div style={{ padding: 24, color: 'var(--ink-4)', fontSize: 13 }}>
      <Loader2 size={14} className="animate-spin" /> Loading editor…
    </div>
  );
}

export function NoteEditor({ note, breadcrumbs, saving, savedAt, onTitleChange, onContentChange }: Props) {
  const [mode, setMode] = useState<ViewMode>('Edit');
  const [localTitle, setLocalTitle] = useState(note?.name ?? '');
  // Reset local title only when switching to a different note.
  useEffect(() => {
    setLocalTitle(note?.name ?? '');

  }, [note?.id]);

  if (!note) {
    return (
      <main className="content">
        <div className="content-empty">
          <div className="content-empty-eyebrow">Notes</div>
          <div className="content-empty-title">No note <em>selected</em>.</div>
          <div className="content-empty-desc">
            Pick a note from the library or create a new one to start writing.
          </div>
        </div>
      </main>
    );
  }

  const minutes = readMinutes(note.content || '');

  return (
    <main className="content">
      <div className="content-bar">
        <Breadcrumb items={breadcrumbs} />
        <SavedPill saving={saving} savedAt={savedAt} />
        <div className="pill-seg" role="tablist">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? 'on' : ''}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
            >{m}</button>
          ))}
        </div>
        <Tooltip content="More actions" side="bottom">
          <button className="icon-btn" aria-label="More actions"><MoreHorizontal /></button>
        </Tooltip>
      </div>

      <div className="content-scroll">
        <article className="doc">
          <header className="doc-head">
            <div className="doc-kicker">
              Notes · {minutes} minute{minutes === 1 ? '' : 's'} read
            </div>
            <input
              className="doc-title-input"
              value={localTitle}
              onChange={(e) => {
                const v = e.target.value;
                setLocalTitle(v);
                onTitleChange(note.id, v);
              }}
              placeholder="Untitled"
              aria-label="Note title"
            />
            <p className="doc-meta">
              <span className="doc-meta-item">Started <time>{fmtDate(note.created_at)}</time></span>
              <span className="doc-meta-sep">·</span>
              <span className="doc-meta-item">Updated <time>{fmtRelative(note.updated_at)}</time></span>
              {note.tags.length > 0 && (
                <>
                  <span className="doc-meta-sep">·</span>
                  <span className="doc-meta-tags">
                    {note.tags.map((t) => (
                      <span key={t.id} className="doc-tag">{t.name}</span>
                    ))}
                  </span>
                </>
              )}
            </p>
          </header>

          <div className="doc-body">
            <Suspense fallback={<EditorFallback />}>
              <RichTextEditor
                key={note.id}
                noteId={note.id}
                content={note.content}
                onChange={(html) => onContentChange(note.id, html)}
              />
            </Suspense>
          </div>
        </article>
      </div>
    </main>
  );
}
