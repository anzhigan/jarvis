import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight,
  Bold, Check, Image as ImageIcon, Italic, Link as LinkIcon, Loader2, Plus,
  Share2, Sigma, Strikethrough, Table as TableIcon, Underline as UnderlineIcon,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { EditorHelpers } from '../../../components/RichTextEditor';
import type { Note } from '../../../api/types';
import type { NoteBreadcrumb } from '../hooks/useNoteEditor';

// Tiptap is heavy (~280 KB gzip). Lazy-load only when a note is opened.
const RichTextEditor = lazy(() => import('../../../components/RichTextEditor'));
const ShareDialog = lazy(() => import('./ShareDialog'));
// BubbleMenu / FloatingMenu also live in their own chunk — they pull in
// floating-ui and the @tiptap/react/menus plugin which we don't need on the
// notes-library list view.
const NoteBubbleMenu   = lazy(() => import('./NoteEditorMenus').then((m) => ({ default: m.NoteBubbleMenu })));
const NoteFloatingMenu = lazy(() => import('./NoteEditorMenus').then((m) => ({ default: m.NoteFloatingMenu })));

interface Props {
  note: Note | null;
  breadcrumbs: NoteBreadcrumb[];
  saving: boolean;
  savedAt: number | null;
  onTitleChange: (id: string, name: string) => void;
  onContentChange: (id: string, html: string) => void;
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

      {/* Alignment */}
      <div className="ntb-group">
        <Btn
          title="Выровнять по левому краю"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={cmd((c) => c.setTextAlign('left'))}
        >
          <AlignLeft size={15} strokeWidth={1.8} />
        </Btn>
        <Btn
          title="Выровнять по центру"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={cmd((c) => c.setTextAlign('center'))}
        >
          <AlignCenter size={15} strokeWidth={1.8} />
        </Btn>
        <Btn
          title="Выровнять по правому краю"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={cmd((c) => c.setTextAlign('right'))}
        >
          <AlignRight size={15} strokeWidth={1.8} />
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
    </div>
  );
}

/* ── Block-insert "+" menu (Notion-style) — appears on empty paragraphs ── */

interface InsertProps { editor: Editor; helpers: EditorHelpers | null }

function BlockInsertMenu({ editor, helpers }: InsertProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Editor selection changes hide the menu naturally (FloatingMenu unmounts
  // when the cursor moves to a non-empty line). Reset our local open state.
  useEffect(() => {
    const onSel = () => setOpen(false);
    editor.on('selectionUpdate', onSel);
    return () => { editor.off('selectionUpdate', onSel); };
  }, [editor]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  const Pick = ({
    title, onClick, children,
  }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      className="bim-btn"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >{children}</button>
  );

  return (
    <div className="block-insert" ref={wrapRef}>
      <button
        type="button"
        className="block-insert-btn"
        aria-label="Insert block"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <Plus />
      </button>

      {open && (
        <div className="block-insert-menu" role="menu">
          <div className="bim-group">
            <div className="bim-label">Headings</div>
            <div className="bim-row">
              <Pick title="Heading 1" onClick={run(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}>
                <span className="bim-h">H1</span>
              </Pick>
              <Pick title="Heading 2" onClick={run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>
                <span className="bim-h">H2</span>
              </Pick>
              <Pick title="Heading 3" onClick={run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>
                <span className="bim-h">H3</span>
              </Pick>
            </div>
          </div>

          <div className="bim-group">
            <div className="bim-label">Lists</div>
            <div className="bim-row">
              <Pick title="Bulleted list" onClick={run(() => editor.chain().focus().toggleBulletList().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <line x1="9" y1="6" x2="20" y2="6" />
                  <line x1="9" y1="12" x2="20" y2="12" />
                  <line x1="9" y1="18" x2="20" y2="18" />
                  <circle cx="4" cy="6" r="1.2" fill="currentColor" />
                  <circle cx="4" cy="12" r="1.2" fill="currentColor" />
                  <circle cx="4" cy="18" r="1.2" fill="currentColor" />
                </svg>
              </Pick>
              <Pick title="Numbered list" onClick={run(() => editor.chain().focus().toggleOrderedList().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <line x1="10" y1="6" x2="20" y2="6" />
                  <line x1="10" y1="12" x2="20" y2="12" />
                  <line x1="10" y1="18" x2="20" y2="18" />
                  <path d="M4 6h1v4M4 10h2M5 16c0-1 1-1 1.5-1s1 .5 1 1-.5 1-1 1.5L4 20h3.5" />
                </svg>
              </Pick>
              <Pick title="Checklist" onClick={run(() => editor.chain().focus().toggleTaskList().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </Pick>
            </div>
          </div>

          <div className="bim-group">
            <div className="bim-label">Blocks</div>
            <div className="bim-row">
              <Pick title="Quote" onClick={run(() => editor.chain().focus().toggleBlockquote().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M3 21c3 0 7-1 7-8V5H3v8h4M14 21c3 0 7-1 7-8V5h-7v8h4" />
                </svg>
              </Pick>
              <Pick title="Code block" onClick={run(() => editor.chain().focus().toggleCodeBlock().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </Pick>
              <Pick title="Divider" onClick={run(() => editor.chain().focus().setHorizontalRule().run())}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
              </Pick>
            </div>
          </div>

          <div className="bim-group">
            <div className="bim-label">Inserts</div>
            <div className="bim-row">
              <Pick title="Link" onClick={run(() => helpers?.openLink())}>
                <LinkIcon />
              </Pick>
              <Pick title="Math formula" onClick={run(() => helpers?.openMath())}>
                <Sigma />
              </Pick>
              <Pick title="Table" onClick={run(() => helpers?.openTable())}>
                <TableIcon />
              </Pick>
              <Pick title="Image" onClick={run(() => helpers?.openImage())}>
                <ImageIcon />
              </Pick>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NoteEditor({ note, breadcrumbs, saving, savedAt, onTitleChange, onContentChange }: Props) {
  const [localTitle, setLocalTitle] = useState(note?.name ?? '');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [helpers, setHelpers] = useState<EditorHelpers | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Just sync localTitle when the note id changes — DON'T touch editor/helpers
  // here. Two reasons:
  //   1. RichTextEditor's `key={note.id}` already triggers a full remount, so
  //      the new editor instance arrives via onEditorReady automatically.
  //   2. If we manually setEditor(null) in this effect, it can race with the
  //      child's onEditorReady call (child effects fire BEFORE parent effects),
  //      leaving us with a permanently-null editor after a note switch.
  useEffect(() => {
    setLocalTitle(note?.name ?? '');
  }, [note?.id, note?.name]);

  // Receive the new editor + helpers when RichTextEditor remounts. Atomic
  // replace — never clear in between or BubbleMenu will permanently detach.
  const onEditorReady = useCallback((ed: Editor, h: EditorHelpers) => {
    setEditor(ed);
    setHelpers(h);
  }, []);

  // When an editor instance is destroyed (e.g. by RichTextEditor unmount on
  // note switch), clear our state IF and only IF that destroyed editor is
  // still the one we're holding. This prevents stale-destroyed editors from
  // hanging around but doesn't clobber a new editor that already replaced it.
  useEffect(() => {
    if (!editor) return;
    const onDestroy = () => setEditor((cur) => (cur === editor ? null : cur));
    editor.on('destroy', onDestroy);
    return () => {
      editor.off('destroy', onDestroy);
    };
  }, [editor]);

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

  // FloatingMenu shows the "+" block-insert button on empty paragraphs.
  // We anchor it to the LEFT of the line so it sits in the gutter.
  const floatingShouldShow = useCallback(
    ({ state }: {
      state: { selection: { empty: boolean; $from: { parent: { type: { name: string }; content: { size: number } } } } };
    }) => {
      const { selection } = state;
      if (!selection.empty) return false;
      const parent = selection.$from.parent;
      // Only show on truly empty paragraphs (don't crowd the gutter on every line).
      return parent.type.name === 'paragraph' && parent.content.size === 0;
    },
    [],
  );
  const floatingOptions = useRef({
    placement: 'left-start' as const,
    offset: 6,
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

  return (
    <main className="content">
      <Suspense fallback={null}>
        <ShareDialog noteId={note.id} open={shareOpen} onOpenChange={setShareOpen} />
      </Suspense>

      {editor && (
        <Suspense fallback={null}>
          <NoteBubbleMenu
            editor={editor}
            className="note-bubble"
            shouldShow={bubbleShouldShow}
            options={bubbleOptions}
          >
            <NoteToolbar editor={editor} helpers={helpers} />
          </NoteBubbleMenu>
          <NoteFloatingMenu
            editor={editor}
            shouldShow={floatingShouldShow}
            options={floatingOptions}
          >
            <BlockInsertMenu editor={editor} helpers={helpers} />
          </NoteFloatingMenu>
        </Suspense>
      )}

      <div className="content-scroll">
        <article className="doc">
          <div className="doc-topline">
            <Breadcrumb items={breadcrumbs} />
            <div className="doc-actions">
              <SavedPill saving={saving} savedAt={savedAt} />
              <button
                type="button"
                className="share-btn"
                onClick={() => setShareOpen(true)}
                title="Поделиться"
                aria-label="Поделиться"
              >
                <Share2 size={14} />
                <span>Поделиться</span>
              </button>
            </div>
          </div>
          {/* No header section — kicker + dates + tags removed. Title stays as a
              plain inline input at the top of the content. */}
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
