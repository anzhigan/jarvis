import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Bold, Check, Image as ImageIcon, Italic, Loader2, Sigma, Strikethrough, Table as TableIcon, Underline as UnderlineIcon } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { EditorHelpers } from '../../../components/RichTextEditor';
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

interface ToolbarProps { editor: Editor; helpers: EditorHelpers | null }

function NoteToolbar({ editor, helpers }: ToolbarProps) {
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

  const Btn = ({
    title, active, disabled, onClick, children,
  }: {
    title: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      className="ntb-btn"
      title={title}
      aria-label={title}
      data-active={active || undefined}
      disabled={disabled}
      // Crucial: prevent the editor's selection from collapsing when the user
      // clicks a toolbar button. Without this, mousedown moves focus to the
      // button, the editor blurs, and any subsequent toggleBold/etc runs on
      // an empty selection. Tiptap's standard pattern is to suppress the
      // mousedown's default focus shift here.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >{children}</button>
  );

  const HText = ({ children }: { children: React.ReactNode }) => (
    <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '-0.02em' }}>
      {children}
    </span>
  );

  return (
    <div className="note-toolbar">
      {/* Headings */}
      <div className="ntb-group">
        <Btn
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={cmd((c) => c.toggleHeading({ level: 1 }))}
        ><HText>H1</HText></Btn>
        <Btn
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={cmd((c) => c.toggleHeading({ level: 2 }))}
        ><HText>H2</HText></Btn>
        <Btn
          title="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={cmd((c) => c.toggleHeading({ level: 3 }))}
        ><HText>H3</HText></Btn>
      </div>
      <div className="ntb-sep" />

      {/* Inline marks: bold / italic / underline / strikethrough */}
      <div className="ntb-group">
        <Btn
          title="Bold"
          active={editor.isActive('bold')}
          onClick={cmd((c) => c.toggleBold())}
        ><Bold /></Btn>
        <Btn
          title="Italic"
          active={editor.isActive('italic')}
          onClick={cmd((c) => c.toggleItalic())}
        ><Italic /></Btn>
        <Btn
          title="Underline"
          active={editor.isActive('underline')}
          onClick={cmd((c) => c.toggleUnderline())}
        ><UnderlineIcon /></Btn>
        <Btn
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={cmd((c) => c.toggleStrike())}
        ><Strikethrough /></Btn>
      </div>
      <div className="ntb-sep" />

      {/* Lists */}
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

      {/* Blocks: quote / code / divider */}
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

      {/* Inserts: link / formula / table / image — driven via helpers callbacks
          provided by RichTextEditor onEditorReady. */}
      <div className="ntb-group">
        <Btn
          title="Link"
          active={editor.isActive('link')}
          disabled={!helpers}
          onClick={() => helpers?.openLink()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
        </Btn>
        <Btn
          title="Math formula"
          active={editor.isActive('inline-math') || editor.isActive('inlineMath')}
          disabled={!helpers}
          onClick={() => helpers?.openMath()}
        >
          <Sigma />
        </Btn>
        <Btn
          title="Table"
          active={editor.isActive('table')}
          disabled={!helpers}
          onClick={() => helpers?.openTable()}
        >
          <TableIcon />
        </Btn>
        <Btn
          title="Image"
          disabled={!helpers}
          onClick={() => helpers?.openImage()}
        >
          <ImageIcon />
        </Btn>
      </div>
    </div>
  );
}

export function NoteEditor({ note, breadcrumbs, saving, savedAt, onTitleChange, onContentChange }: Props) {
  const [localTitle, setLocalTitle] = useState(note?.name ?? '');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [helpers, setHelpers] = useState<EditorHelpers | null>(null);

  // Track previous note id so we can distinguish initial mount from a real
  // note switch — only the latter should clear the editor reference.
  const prevIdRef = useRef<string | undefined>(note?.id);
  useEffect(() => {
    setLocalTitle(note?.name ?? '');
    if (prevIdRef.current !== undefined && prevIdRef.current !== note?.id) {
      // Real switch between two distinct notes: drop the stale editor; the
      // RichTextEditor's `key={note.id}` remount will set the new one.
      setEditor(null);
      setHelpers(null);
    }
    prevIdRef.current = note?.id;
  }, [note?.id, note?.name]);

  const onEditorReady = useCallback((ed: Editor, h: EditorHelpers) => {
    setEditor(ed);
    setHelpers(h);
  }, []);

  // Stable references for BubbleMenu — recreating these on every render
  // re-initialises the menu plugin and causes lag/flicker.
  const bubbleShouldShow = useCallback(
    ({ state }: { state: { selection: { empty: boolean } } }) =>
      !state.selection.empty,
    [],
  );
  const bubbleOptions = useRef({
    placement: 'top' as const,
    offset: 8,
    flip: true,
    shift: { padding: 8 },
  }).current;

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
      </div>

      {editor && (
        <BubbleMenu
          editor={editor}
          className="note-bubble"
          updateDelay={0}
          shouldShow={bubbleShouldShow}
          options={bubbleOptions}
        >
          <NoteToolbar editor={editor} helpers={helpers} />
        </BubbleMenu>
      )}

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
                onEditorReady={onEditorReady}
              />
            </Suspense>
          </div>
        </article>
      </div>
    </main>
  );
}
