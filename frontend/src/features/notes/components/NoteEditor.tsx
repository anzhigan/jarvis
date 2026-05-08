import { lazy, Suspense, useCallback, useEffect, useReducer, useState } from 'react';
import { Check, Loader2, MoreHorizontal } from 'lucide-react';
import type { Editor } from '@tiptap/react';
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

/* ── Top-of-content formatting toolbar (matches gallery section 01 .ntb-*) ── */

interface ToolbarProps { editor: Editor }

function NoteToolbar({ editor }: ToolbarProps) {
  // Re-render on every Tiptap transaction so isActive() reflects current state.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const update = () => tick();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  const cmd = useCallback(
    (run: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
      () => run(editor.chain().focus()).run(),
    [editor],
  );

  const onLink = useCallback(() => {
    const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
    const next = window.prompt('Link URL (leave blank to remove)', prev);
    if (next === null) return;
    if (next === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: next }).run();
  }, [editor]);

  const Btn = ({
    title, active, onClick, children,
  }: {
    title: string; active?: boolean; onClick: () => void; children: React.ReactNode;
  }) => (
    <button
      type="button"
      className="ntb-btn"
      title={title}
      aria-label={title}
      data-active={active || undefined}
      onClick={onClick}
    >{children}</button>
  );

  return (
    <div className="note-toolbar">
      <div className="ntb-group">
        <Btn
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={cmd((c) => c.toggleHeading({ level: 1 }))}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em' }}>H1</span>
        </Btn>
        <Btn
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={cmd((c) => c.toggleHeading({ level: 2 }))}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em' }}>H2</span>
        </Btn>
        <Btn
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={cmd((c) => c.toggleHeading({ level: 3 }))}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em' }}>H3</span>
        </Btn>
      </div>
      <div className="ntb-sep" />

      <div className="ntb-group">
        <Btn
          title="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={cmd((c) => c.toggleBulletList())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <line x1="9" y1="6" x2="20" y2="6" />
            <line x1="9" y1="12" x2="20" y2="12" />
            <line x1="9" y1="18" x2="20" y2="18" />
            <circle cx="4" cy="6" r="1.2" fill="currentColor" />
            <circle cx="4" cy="12" r="1.2" fill="currentColor" />
            <circle cx="4" cy="18" r="1.2" fill="currentColor" />
          </svg>
        </Btn>
        <Btn
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={cmd((c) => c.toggleOrderedList())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <line x1="10" y1="6" x2="20" y2="6" />
            <line x1="10" y1="12" x2="20" y2="12" />
            <line x1="10" y1="18" x2="20" y2="18" />
            <path d="M4 6h1v4M4 10h2M5 16c0-1 1-1 1.5-1s1 .5 1 1-.5 1-1 1.5L4 20h3.5" />
          </svg>
        </Btn>
        <Btn
          title="Checklist"
          active={editor.isActive('taskList')}
          onClick={cmd((c) => c.toggleTaskList())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </Btn>
      </div>
      <div className="ntb-sep" />

      <div className="ntb-group">
        <Btn
          title="Quote"
          active={editor.isActive('blockquote')}
          onClick={cmd((c) => c.toggleBlockquote())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M3 21c3 0 7-1 7-8V5H3v8h4M14 21c3 0 7-1 7-8V5h-7v8h4" />
          </svg>
        </Btn>
        <Btn
          title="Code block"
          active={editor.isActive('codeBlock')}
          onClick={cmd((c) => c.toggleCodeBlock())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </Btn>
        <Btn
          title="Divider"
          onClick={cmd((c) => c.setHorizontalRule())}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </Btn>
      </div>
      <div className="ntb-sep" />

      <div className="ntb-group">
        <Btn
          title="Link"
          active={editor.isActive('link')}
          onClick={onLink}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
        </Btn>
      </div>
    </div>
  );
}

export function NoteEditor({ note, breadcrumbs, saving, savedAt, onTitleChange, onContentChange }: Props) {
  const [localTitle, setLocalTitle] = useState(note?.name ?? '');
  const [editor, setEditor] = useState<Editor | null>(null);
  // Reset local title only when switching to a different note; also clear the
  // stale editor reference so the toolbar doesn't drive a different note's editor.
  useEffect(() => {
    setLocalTitle(note?.name ?? '');
    setEditor(null);
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
        <Tooltip content="More actions" side="bottom">
          <button className="icon-btn" aria-label="More actions"><MoreHorizontal /></button>
        </Tooltip>
      </div>

      {editor && <NoteToolbar editor={editor} />}

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
                onEditorReady={setEditor}
              />
            </Suspense>
          </div>
        </article>
      </div>
    </main>
  );
}
