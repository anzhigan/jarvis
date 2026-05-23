import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import { findParentNode, mergeAttributes, Node } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { notesApi, injectImageToken, stripImageToken } from '../api/client';
import EditorToolbar from './EditorToolbar';
import LinkInsertSheet from './editor/LinkInsertSheet';
import MathInsertSheet from './editor/MathInsertSheet';
import TableInsertSheet from './editor/TableInsertSheet';
import { FileAttachment, FILE_ACCEPT, KNOWN_EXTENSIONS } from './editor/FileAttachment';
import { ToggleListBundle } from './editor/ToggleList';
import { useIsMobile } from '../hooks/useIsMobile';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { loadEditorHeavy, getKatex, type EditorHeavy } from './editor/editorHeavy';

/**
 * Downscale an image to `maxDim` (longer side) using a canvas. Preserves aspect
 * ratio. Returns a JPEG (or PNG if the source was PNG to keep transparency).
 * Falls back gracefully — caller should `.catch(() => originalFile)`.
 */
async function resizeImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error('read failed'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode failed'));
    i.src = dataUrl;
  });
  const longer = Math.max(img.width, img.height);
  if (longer <= maxDim) return file;
  const scale = maxDim / longer;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  const isPng = file.type === 'image/png';
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, isPng ? 'image/png' : 'image/jpeg', isPng ? undefined : quality)
  );
  if (!blob) return file;
  const ext = isPng ? 'png' : 'jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
}

// Allow list shared between the file picker, paste, and drop handlers. Keep in
// sync with backend/app/services/s3.py:ATTACHMENT_EXTENSIONS.
function isSupportedAttachment(file: File): boolean {
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1) : '';
  return KNOWN_EXTENSIONS.has(ext);
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// ─── Resizable Image (Notion/Figma-style hover toolbar) ────────────────────
function ResizableImageView({
  node,
  updateAttributes,
  deleteNode,
  editor,
}: {
  node: any;
  updateAttributes: (attrs: Record<string, any>) => void;
  deleteNode: () => void;
  editor: any;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [hover, setHover] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const width = node.attrs.width || 'auto';
  const align = (node.attrs.align as 'left' | 'center' | 'right') || 'left';
  const src = node.attrs.src as string;
  const readonly = !editor?.isEditable;

  // Close lightbox on Esc — registered only while open.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const startResize = useCallback((clientX: number) => {
    setIsResizing(true);
    startX.current = clientX;
    startWidth.current = imgRef.current?.getBoundingClientRect().width || 300;
  }, []);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startResize(e.clientX);
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(80, startWidth.current + (ev.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newW)}px` });
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [startResize, updateAttributes]);

  const onResizeTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const t = e.touches[0];
    startResize(t.clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      const tt = ev.touches[0];
      const newW = Math.max(80, startWidth.current + (tt.clientX - startX.current));
      updateAttributes({ width: `${Math.round(newW)}px` });
    };
    const onEnd = () => {
      setIsResizing(false);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [startResize, updateAttributes]);

  // The toolbar must stay visible while the user hovers the toolbar itself
  // (otherwise moving from image → toolbar makes the toolbar disappear before
  // the click registers). The wrapper handles mouseenter/leave; child buttons
  // re-trigger via bubbling so layout is one source of truth.
  const showControls = !readonly && (hover || isResizing);

  // Alignment is stored on the image attrs and applied via inline margins on
  // the outer wrapper (image block). Center/right shift the image without
  // requiring float-clearing hacks on the surrounding paragraph.
  const wrapperStyle: React.CSSProperties = {
    display: 'block',
    margin:
      align === 'center' ? '0 auto' :
      align === 'right'  ? '0 0 0 auto' :
                           '0 auto 0 0',
    maxWidth: '100%',
    width,
    position: 'relative',
  };

  const onOpenFullSize = () => {
    if (src) setLightbox(true);
  };
  const onDownload = () => {
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = node.attrs.alt || 'image';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  const setAlign = (a: 'left' | 'center' | 'right') => updateAttributes({ align: a });

  return (
    <NodeViewWrapper
      as="span"
      className="img-block"
      data-align={align}
      contentEditable={false}
    >
      <span
        className="img-wrap"
        style={wrapperStyle}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <img
          ref={imgRef}
          src={src}
          alt={node.attrs.alt || ''}
          draggable={false}
          className="img-block__img"
          style={{ width: '100%' }}
        />

        {showControls && (
          <span className="img-toolbar" role="toolbar" aria-label="Image actions">
            <ImgBtn title="Align left"   active={align === 'left'}   onClick={() => setAlign('left')}>
              <svg viewBox="0 0 16 16"><path d="M2 3h12M2 7h8M2 11h12M2 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </ImgBtn>
            <ImgBtn title="Align right"  active={align === 'right'}  onClick={() => setAlign('right')}>
              <svg viewBox="0 0 16 16"><path d="M2 3h12M6 7h8M2 11h12M6 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </ImgBtn>
            <ImgBtn title="Align center" active={align === 'center'} onClick={() => setAlign('center')}>
              <svg viewBox="0 0 16 16"><path d="M2 3h12M4 7h8M2 11h12M4 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </ImgBtn>
            <span className="img-toolbar__sep" />
            <ImgBtn title="Open full size" onClick={onOpenFullSize}>
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M10.2 10.2 L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </ImgBtn>
            <ImgBtn title="Download" onClick={onDownload}>
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M3 14h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ImgBtn>
            <span className="img-toolbar__sep" />
            <ImgBtn title="Delete" onClick={() => deleteNode()} variant="danger">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V2.5h4V4M5 4l.7 9a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </ImgBtn>
          </span>
        )}

        {showControls && (
          <span
            className="img-resize-corner"
            role="separator"
            aria-label="Resize"
            title="Drag to resize"
            onMouseDown={onResizeMouseDown}
            onTouchStart={onResizeTouchStart}
          >
            <svg viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 12 L12 12 M12 12 L12 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </span>
      {lightbox && (
        <div
          className="img-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            className="img-lightbox__close"
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3 L13 13 M13 3 L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <img
            src={src}
            alt={node.attrs.alt || ''}
            className="img-lightbox__img"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

function ImgBtn({
  title, active, variant, onClick, children,
}: {
  title: string;
  active?: boolean;
  variant?: 'danger';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="img-toolbar__btn"
      data-active={active || undefined}
      data-variant={variant || undefined}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
  );
}

/**
 * Insert a block-level media node (image / file attachment) at the most natural
 * location relative to the caret.
 *
 *  - If the caret is inside a bullet/ordered list, place the node AFTER the
 *    whole list (a common-sense interpretation: media doesn't belong "in" a
 *    list item; it belongs between items or after the list). The list keeps
 *    its bullets/numbers intact.
 *  - Inside a blockquote / toggle body / cell → same rule: walk out to the
 *    nearest block-allowing container.
 *  - Otherwise → insert at the caret as usual.
 *
 * Returns true if the editor accepted the insert.
 */
function insertMediaBlock(
  editor: Editor,
  node: { type: string; attrs: Record<string, any> },
  fallbackPos?: number,
): boolean {
  const isListNode = (n: { type: { name: string } }) => {
    const name = n.type.name;
    return name === 'bulletList' || name === 'orderedList' || name === 'taskList';
  };

  // Drag/drop / paste path — caller passes a document position. Resolve it and
  // walk up the doc tree from there to find any wrapping list, then place the
  // block AFTER that list. This keeps "drop inside the 3rd item" intuitive: the
  // image lands below the list, not as a new bulleted line.
  if (typeof fallbackPos === 'number') {
    try {
      const $pos = editor.state.doc.resolve(fallbackPos);
      for (let d = $pos.depth; d > 0; d--) {
        const parent = $pos.node(d);
        if (isListNode(parent)) {
          const insertAt = $pos.before(d) + parent.nodeSize;
          return editor.chain().focus().insertContentAt(insertAt, node).run();
        }
      }
    } catch { /* fall through to plain insert at the given position */ }
    return editor.chain().focus().insertContentAt(fallbackPos, node).run();
  }

  // Toolbar / keyboard path — use the current selection. If the caret is inside
  // a list, place the block as a sibling AFTER the whole list.
  const wrappingList = findParentNode(isListNode)(editor.state.selection);
  if (wrappingList) {
    const insertAt = wrappingList.pos + wrappingList.node.nodeSize;
    return editor.chain().focus().insertContentAt(insertAt, node).run();
  }
  return editor.chain().focus().insertContent(node).run();
}

const ResizableImage = Node.create({
  name: 'image',
  // Block-level: an image lives on its own line, never as an inline word. This
  // is the Notion / Linear behavior and avoids two papercuts: (a) images inside
  // <li> inherit the list marker (bullet / number) — which feels wrong, the
  // marker is for text not media; (b) cursor accidentally lands "in" the
  // middle of an inline image. With block placement plus the insertMediaBlock
  // helper, an image inserted while caret is inside a list ends up AFTER the
  // entire list.
  group: 'block',
  // atom + selectable: false → the cursor treats the image as a single "gap":
  // pressing Right at the position before the image jumps straight past it
  // (no intermediate "node-selected" state). Resize/rotate controls inside
  // the NodeView keep working because they handle their own pointer events.
  atom: true,
  selectable: false,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: 'auto' },
      align: {
        default: 'left',
        parseHTML: (element) => element.getAttribute('data-align') || 'left',
        renderHTML: (attributes) => (attributes.align ? { 'data-align': attributes.align } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
  addKeyboardShortcuts() {
    return {
      // Backspace in an empty paragraph that follows an image: delete just
      // the empty paragraph, never the image. Default Tiptap behaviour
      // "joinBackward" merges with the previous block — for an atom node
      // like our image that ends up wiping the image, which is surprising.
      Backspace: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;
        const para = $from.parent;
        if (para.type.name !== 'paragraph' || para.content.size !== 0) return false;
        const parentDepth = $from.depth - 1;
        const idx = $from.index(parentDepth);
        if (idx === 0) return false;
        const prev = $from.node(parentDepth).child(idx - 1);
        if (prev.type.name !== 'image') return false;
        const blockStart = $from.before($from.depth);
        const blockEnd = $from.after($from.depth);
        view.dispatch(state.tr.delete(blockStart, blockEnd));
        return true;
      },
    };
  },
});

// ─── InlineMath — renders $...$ LaTeX inline ──────────────────────────────
const InlineMathView = ({ node, updateAttributes, editor }: any) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(node.attrs.latex || '');

  const rendered = (() => {
    const katex = getKatex();
    if (!katex) {
      // KaTeX still loading — show the raw LaTeX until the chunk arrives.
      return `<span style="font-family: var(--font-mono); color: var(--ink-4)">${node.attrs.latex || ''}</span>`;
    }
    try {
      return katex.renderToString(node.attrs.latex || '', { throwOnError: false, displayMode: false });
    } catch {
      return `<span style="color: var(--rust)">[invalid LaTeX]</span>`;
    }
  })();

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-middle">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              updateAttributes({ latex: value });
              setEditing(false);
            }
            if (e.key === 'Escape') { setEditing(false); setValue(node.attrs.latex || ''); }
          }}
          onBlur={() => { updateAttributes({ latex: value }); setEditing(false); }}
          placeholder="LaTeX: e.g. x^2 + y^2 = z^2"
          autoFocus
          className="inline-block px-2 py-0.5 text-sm font-mono bg-secondary border border-primary rounded min-w-[200px]"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle">
      <span
        onClick={() => editor?.isEditable && setEditing(true)}
        title="Click to edit formula"
        className="inline-block px-1 rounded hover:bg-secondary cursor-pointer"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </NodeViewWrapper>
  );
};

const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { latex: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-math]', getAttrs: (el) => ({ latex: (el as HTMLElement).getAttribute('data-latex') || '' }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': 'true', 'data-latex': node.attrs.latex }), node.attrs.latex];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView);
  },
  addCommands() {
    return {
      insertInlineMath: (latex: string) => ({ chain }: any) => {
        return chain().insertContent({ type: 'inlineMath', attrs: { latex } }).run();
      },
    } as any;
  },
});

// ─── Types ───────────────────────────────────────────────────────────────────

/** Helpers exposed alongside the editor — they trigger our internal dialogs
 *  (link / table / math) and the file picker for image upload. The parent
 *  toolbar uses these so the buttons feel native to the editor. */
export interface EditorHelpers {
  openLink: () => void;
  openTable: () => void;
  openMath: () => void;
  openImage: () => void;
  openFile: () => void;
}

interface RichTextEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
  children?: ReactNode;
  /** When false, the editor is read-only — no edits, no upload, no toolbar. */
  editable?: boolean;
  /** Called once the Tiptap editor is ready — lets the parent render its own
   *  top-of-content toolbar (matching gallery section 01) wired to commands. */
  onEditorReady?: (editor: Editor, helpers: EditorHelpers) => void;
}

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function RichTextEditor({ noteId, content, onChange, children, editable = true, onEditorReady }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<null | 'link' | 'math' | 'table'>(null);
  const [dialogExtra, setDialogExtra] = useState<{ prevUrl?: string }>({});

  // editorProps closures are captured once when the editor is created, so drop/
  // paste handlers can't see the live `editor`/`noteId`. Route them through a
  // ref that we keep in sync.
  const editorRef = useRef<Editor | null>(null);
  const uploadAndInsertRef = useRef<(file: File, at?: number) => Promise<boolean>>(async () => false);
  const uploadAndInsertFileRef = useRef<(file: File, at?: number) => Promise<boolean>>(async () => false);

  // Heavy extensions (KaTeX + Lowlight + 9 highlight.js languages) are
  // dynamically imported so they ship as their own chunk, not inside the
  // editor's main bundle. Editor only mounts once the chunk has resolved.
  const [heavy, setHeavy] = useState<EditorHeavy | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadEditorHeavy().then((h) => { if (!cancelled) setHeavy(h); });
    return () => { cancelled = true; };
  }, []);

  // Mobile keyboard detection — toolbar shows ONLY when editor is focused AND keyboard is up
  const isMobile = useIsMobile();
  const [editorFocused, setEditorFocused] = useState(false);
  const kbHeight = useKeyboardHeight();
  const blurTimerRef = useRef<number | null>(null);

  // Refocus editor on toolbar tap; blur is debounced so toolbar doesn't flicker
  const handleEditorFocus = () => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setEditorFocused(true);
  };
  const handleEditorBlur = () => {
    // Delay — give time for tap on toolbar to refocus editor before hiding it
    if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      setEditorFocused(false);
      blurTimerRef.current = null;
    }, 250);
  };


  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
        codeBlock: false, // we use CodeBlockLowlight instead
        // Built-in line-style dropcursor — color/width set via CSS in
        // editor.css (.ProseMirror-dropcursor) using our --indigo token.
        dropcursor: {
          width: 3,
          class: 'pm-dropcursor',
        },
      }),
      Underline,
      TextStyle,
      Color,
      // multicolor=true lets each highlight span carry its own background
      // colour; without it the mark is binary (on / off) with a single hue.
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Placeholder.configure({
        // Per-node placeholders: empty toggle-list summaries display "Toggle"
        // so the user knows what to type; empty top-level paragraphs keep the
        // generic editor prompt. `includeChildren: true` makes the Placeholder
        // plugin descend into nested nodes (toggleSummary is a child of
        // toggleList) so its `is-empty` class fires properly.
        placeholder: ({ node }) => {
          if (node.type.name === 'toggleSummary') return 'Toggle';
          return 'Begin writing...';
        },
        includeChildren: true,
      }),
      Link.configure({
        openOnClick: false,           // handled by our custom click; prevents nav while editing
        autolink: true,
        HTMLAttributes: { class: 'editor-link', rel: 'noopener noreferrer' },
      }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList.configure({ HTMLAttributes: { class: 'editor-task-list' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'editor-task-item' } }),
      heavy?.codeBlockExtension,
      InlineMath,
      FileAttachment,
      ...ToggleListBundle,
      // Drag handle in the left gutter for reordering top-level blocks
      // (paragraphs, headings, lists, etc.). Appears on hover, disappears
      // when the pointer leaves. CSS knob: `.drag-handle` in editor.css.
      GlobalDragHandle.configure({
        dragHandleWidth: 20,
        scrollTreshold: 100,
        excludedTags: [],
      }),
    ].filter(Boolean) as any[],
    content: injectImageToken(content),
    onUpdate: ({ editor }) => onChange(stripImageToken(editor.getHTML())),
    onFocus: handleEditorFocus,
    onBlur: handleEditorBlur,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px]',
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          view.dispatch(view.state.tr.insertText('    '));
          return true;
        }
        return false;
      },
      // Link clicks inside the editor. Two rules:
      //  - Internal `#note:<id>` link → always open the target note (plain
      //    click or modifier — there's no edit-vs-navigate ambiguity for
      //    these, you'd never want a #note: fragment to land in the URL).
      //    Dispatches `jarvnote:openNote` with the bare id string — same
      //    contract NotesView / MobileNotesScreen are already listening on.
      //  - External link → opened in a new tab only with Cmd/Ctrl-click;
      //    plain click during editing places the caret as expected.
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest('a') as HTMLAnchorElement | null;
        if (!anchor || !anchor.href) return false;
        const href = anchor.getAttribute('href') || '';
        if (href.startsWith('#note:')) {
          const noteId = href.slice('#note:'.length);
          window.dispatchEvent(new CustomEvent('jarvnote:openNote', { detail: noteId }));
          event.preventDefault();
          return true;
        }
        if (event.ctrlKey || event.metaKey) {
          window.open(anchor.href, '_blank', 'noopener,noreferrer');
          event.preventDefault();
          return true;
        }
        return false;
      },
      // Drag-and-drop image files (e.g. screenshot from Finder) at the cursor
      // position under the pointer. Returning true tells ProseMirror we handled
      // the event so it doesn't fall back to inserting a file:// URL.
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // internal node drag — let Tiptap handle it
        const dt = (event as DragEvent).dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return false;
        const all = Array.from(dt.files);
        const images = all.filter((f) => f.type.startsWith('image/'));
        const attachments = all.filter((f) => !f.type.startsWith('image/') && isSupportedAttachment(f));
        if (images.length === 0 && attachments.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({
          left: (event as DragEvent).clientX,
          top: (event as DragEvent).clientY,
        });
        void (async () => {
          let insertAt = coords?.pos;
          for (const f of images) {
            const ok = await uploadAndInsertRef.current(f, insertAt);
            if (ok && typeof insertAt === 'number') insertAt += 1; // advance past the inline image node
          }
          for (const f of attachments) {
            const ok = await uploadAndInsertFileRef.current(f, insertAt);
            if (ok && typeof insertAt === 'number') insertAt += 1;
          }
        })();
        return true;
      },
      // Paste from clipboard: images (screenshots) AND supported attachments
      // (e.g. drag a .xlsx from Finder → cmd-c → cmd-v).
      handlePaste: (_view, event) => {
        const cd = (event as ClipboardEvent).clipboardData;
        if (!cd) return false;
        const images: File[] = [];
        const attachments: File[] = [];
        const collect = (f: File) => {
          if (f.type.startsWith('image/')) images.push(f);
          else if (isSupportedAttachment(f)) attachments.push(f);
        };
        if (cd.files && cd.files.length) {
          for (const f of Array.from(cd.files)) collect(f);
        }
        if (images.length === 0 && attachments.length === 0 && cd.items) {
          for (const it of Array.from(cd.items)) {
            if (it.kind === 'file') {
              const f = it.getAsFile();
              if (f) collect(f);
            }
          }
        }
        if (images.length === 0 && attachments.length === 0) return false;
        event.preventDefault();
        void (async () => {
          for (const f of images) await uploadAndInsertRef.current(f);
          for (const f of attachments) await uploadAndInsertFileRef.current(f);
        })();
        return true;
      },
      // Strip inline font-size / line-height / font-family from pasted HTML
      // so that user's global font-size setting applies to pasted content
      // (common issue when copying from Telegram, Notion, Google Docs, etc.)
      transformPastedHTML: (html: string) => {
        // Remove font-size, line-height, font-family properties from style attributes
        // Matches either at start or after a `;` — preserves other inline styles
        return html
          .replace(/font-size\s*:\s*[^;"']+;?/gi, '')
          .replace(/line-height\s*:\s*[^;"']+;?/gi, '')
          .replace(/font-family\s*:\s*[^;"']+;?/gi, '')
          // Clean up empty style attributes like style=""
          .replace(/style\s*=\s*"\s*"/gi, '')
          .replace(/style\s*=\s*'\s*'/gi, '');
      },
    },
  // Re-create the editor instance once the heavy chunk arrives so the new
  // CodeBlockLowlight extension takes effect (saved content rehydrates).
  }, [heavy]);

  // Lift the editor + helpers to the parent so it can render its own top-of-
  // content toolbar (matches gallery section 01). Fires once per editor instance.
  // We use a ref for the helpers callback signatures so the effect doesn't
  // re-fire on every render — only on actual editor instance change.
  useEffect(() => {
    if (!editor || !onEditorReady) return;
    onEditorReady(editor, {
      openLink:  () => {
        const prev = editor.getAttributes('link').href as string | undefined;
        setDialogExtra({ prevUrl: prev });
        setDialog('link');
      },
      openTable: () => {
        if (editor.isActive('table')) editor.chain().focus().deleteTable().run();
        else setDialog('table');
      },
      openMath:  () => setDialog('math'),
      openImage: () => fileInputRef.current?.click(),
      openFile:  () => attachmentInputRef.current?.click(),
    });
  }, [editor, onEditorReady]);

  // Note: content changes between notes are handled via `key` prop remount in parent.

  // Single code path for "take a File, upload it, insert <img> at a given doc
  // position (or current selection)". Shared by the file picker, drag-and-drop,
  // and clipboard paste.
  const uploadAndInsertImage = useCallback(async (file: File, at?: number): Promise<boolean> => {
    const ed = editorRef.current;
    if (!ed) return false;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return false;
    }
    try {
      // Client-side resize before upload — phone photos / retina screenshots
      // can be 4-10 MB. Skip GIF (animation) and tiny files.
      const toUpload = (file.type !== 'image/gif' && file.size > 200 * 1024)
        ? await resizeImage(file, 1600).catch(() => file)
        : file;
      const result = await notesApi.uploadImage(noteId, toUpload);
      // Backend returns a relative auth-protected URL like "/api/images/{key}".
      // Add the access token query param so the <img> tag actually loads —
      // otherwise the browser hits the endpoint unauthenticated and we see a
      // broken image. On save, stripImageToken (in onUpdate) removes the token
      // before persisting; injectImageToken adds it back when content reloads.
      const token = typeof localStorage !== 'undefined'
        ? localStorage.getItem('access_token')
        : null;
      const src = token
        ? `${result.url}?token=${encodeURIComponent(token)}`
        : result.url;
      const node = { type: 'image', attrs: { src, width: 'auto' } };
      insertMediaBlock(ed, node, typeof at === 'number' ? at : undefined);
      toast.success('Image uploaded');
      return true;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload image');
      return false;
    }
  }, [noteId]);

  // Same shape as uploadAndInsertImage, but for office/pdf attachments.
  // Inserts a FileAttachment inline node at the given doc position (or the
  // current selection) once the file is uploaded.
  const uploadAndInsertFile = useCallback(async (file: File, at?: number): Promise<boolean> => {
    const ed = editorRef.current;
    if (!ed) return false;
    if (!isSupportedAttachment(file)) {
      toast.error('Unsupported file type. Allowed: PDF, XLSX, XLS, DOCX, DOC, CSV');
      return false;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('File too large (max 25 MB)');
      return false;
    }
    try {
      const result = await notesApi.uploadAttachment(noteId, file);
      // Store the BARE URL in node attrs — no `?token=` baked in. The token is
      // appended just-in-time by `resolveUrl()` inside the NodeView, so each
      // click uses the freshest access token from localStorage. Vinegar of
      // baking tokens into the DOM: they go stale after refresh and produce
      // 401 on download.
      const attrs = {
        url: result.url,
        filename: result.filename,
        mimeType: result.mime_type,
        size: result.size_bytes,
      };
      const node = { type: 'fileAttachment', attrs };
      insertMediaBlock(ed, node, typeof at === 'number' ? at : undefined);
      toast.success('File attached');
      return true;
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload file');
      return false;
    }
  }, [noteId]);

  // Keep refs in sync so the drop/paste handlers (captured at editor-create
  // time) can call the up-to-date uploader against the live editor.
  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => { uploadAndInsertRef.current = uploadAndInsertImage; }, [uploadAndInsertImage]);
  useEffect(() => { uploadAndInsertFileRef.current = uploadAndInsertFile; }, [uploadAndInsertFile]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await uploadAndInsertImage(file);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await uploadAndInsertFile(file);
    } finally {
      if (attachmentInputRef.current) attachmentInputRef.current.value = '';
    }
  };

  // Stable callbacks so the memoised <EditorToolbar /> doesn't re-render
  // on every parent state change. Mobile's mounted bar uses these to
  // surface the same insert surface as the desktop BlockInsertMenu.
  const openLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    setDialogExtra({ prevUrl: prev });
    setDialog('link');
  }, [editor]);
  const openTable = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('table')) editor.chain().focus().deleteTable().run();
    else setDialog('table');
  }, [editor]);
  const openMath = useCallback(() => setDialog('math'), []);
  const openImage = useCallback(() => fileInputRef.current?.click(), []);
  const openFile = useCallback(() => attachmentInputRef.current?.click(), []);

  if (!editor) return null;

  return (
    <>
    <LinkInsertSheet
      open={dialog === 'link'}
      initialUrl={dialogExtra.prevUrl ?? ''}
      isEditingExisting={editor.isActive('link')}
      onCancel={() => setDialog(null)}
      onInsert={(url) => {
        if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        setDialog(null);
      }}
      onRemove={() => {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setDialog(null);
      }}
    />

    <TableInsertSheet
      open={dialog === 'table'}
      onCancel={() => setDialog(null)}
      onInsert={(rows, cols, withHeader) => {
        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: withHeader }).run();
        setDialog(null);
      }}
    />

    <MathInsertSheet
      open={dialog === 'math'}
      onCancel={() => setDialog(null)}
      onInsert={(latex) => {
        if (latex) (editor.chain().focus() as any).insertInlineMath(latex).run();
        setDialog(null);
      }}
    />

    {/* Visually hidden but pointer-reachable (display:none breaks .click() on iOS Safari).
        Toolbar button uses htmlFor="rt-image-upload" — bypasses the .click() API entirely. */}
    <input
      id="rt-image-upload"
      ref={fileInputRef}
      type="file"
      accept="image/*"
      onChange={handleImageUpload}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
    />
    <input
      id="rt-file-upload"
      ref={attachmentInputRef}
      type="file"
      accept={FILE_ACCEPT}
      onChange={handleAttachmentUpload}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
    />

    {/* Desktop uses NoteEditor's top-of-content .note-toolbar (gallery section 01)
        wired via onEditorReady. The legacy EditorToolbar is mobile-only now. */}
    {editable && isMobile && editorFocused && (
      <EditorToolbar
        editor={editor}
        onInsertLink={openLink}
        onInsertTable={openTable}
        onInsertMath={openMath}
        onInsertImage={openImage}
        onInsertFile={openFile}
        bottomOffset={kbHeight}
      />
    )}

    <div className="notes-editor-paper">
      {children}
      <div className={isMobile ? 'pb-24' : ''}>
        <EditorContent editor={editor} />
      </div>
    </div>
    </>
  );
}
