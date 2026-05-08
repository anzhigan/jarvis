import { useEditor, EditorContent, Extension, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { mergeAttributes, Node } from '@tiptap/core';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { notesApi, injectImageToken, stripImageToken } from '../api/client';
import EditorToolbar from './EditorToolbar';
import LinkInsertSheet from './editor/LinkInsertSheet';
import MathInsertSheet from './editor/MathInsertSheet';
import TableInsertSheet from './editor/TableInsertSheet';
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

// Custom font size extension
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// ─── Resizable Image ─────────────────────────────────────────────────────────
function ResizableImageView({
  node,
  updateAttributes,
  selected,
}: {
  node: any;
  updateAttributes: (attrs: Record<string, any>) => void;
  selected: boolean;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const width = node.attrs.width || 'auto';
  const rotation = (node.attrs.rotation as number) || 0;

  const startResize = useCallback(
    (clientX: number) => {
      setIsResizing(true);
      startX.current = clientX;
      startWidth.current = imgRef.current?.getBoundingClientRect().width || 300;
    },
    []
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startResize(e.clientX);

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX.current;
        const newWidth = Math.max(80, startWidth.current + delta);
        updateAttributes({ width: `${Math.round(newWidth)}px` });
      };
      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [updateAttributes, startResize]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      const touch = e.touches[0];
      startResize(touch.clientX);

      const onTouchMove = (ev: TouchEvent) => {
        ev.preventDefault();
        const t = ev.touches[0];
        const delta = t.clientX - startX.current;
        const newWidth = Math.max(80, startWidth.current + delta);
        updateAttributes({ width: `${Math.round(newWidth)}px` });
      };
      const onTouchEnd = () => {
        setIsResizing(false);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    },
    [updateAttributes, startResize]
  );

  const rotate = () => {
    const next = (rotation + 90) % 360;
    updateAttributes({ rotation: next });
  };

  const resetSize = () => {
    updateAttributes({ width: 'auto' });
  };

  const showControls = selected || isResizing;

  return (
    <NodeViewWrapper className="relative inline-block group/img my-2" style={{ maxWidth: '100%' }}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        style={{
          width,
          maxWidth: '100%',
          display: 'block',
          borderRadius: '0.5rem',
          userSelect: 'none',
          outline: showControls ? '2px solid var(--primary)' : 'none',
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transition: isResizing ? 'none' : 'transform 0.2s ease-out',
        }}
        draggable={false}
      />

      {/* Rotate button (top-left) */}
      {showControls && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); rotate(); }}
          className="absolute top-1 left-1 w-8 h-8 md:w-7 md:h-7 bg-primary rounded-md flex items-center justify-center shadow-sm active:scale-95"
          title="Rotate 90°"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      )}

      {/* Reset size button (top-right) */}
      {showControls && width !== 'auto' && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); resetSize(); }}
          className="absolute top-1 right-1 px-2 h-8 md:h-7 bg-primary rounded-md flex items-center justify-center shadow-sm active:scale-95 text-white text-xs font-medium"
          title="Reset size"
        >
          Auto
        </button>
      )}

      {/* Resize handle (bottom-right) */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        className="absolute bottom-1 right-1 w-8 h-8 md:w-5 md:h-5 bg-primary rounded-md cursor-ew-resize flex items-center justify-center shadow-sm opacity-0 md:group-hover/img:opacity-100"
        style={{
          opacity: showControls ? 1 : undefined,
          touchAction: 'none',
        }}
        title="Drag to resize"
      >
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="1.5">
          <path d="M3 1 L9 7 M7 9 L9 7 L7 5" />
        </svg>
      </div>
    </NodeViewWrapper>
  );
}

const ResizableImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: 'auto' },
      rotation: {
        default: 0,
        parseHTML: (element) => parseInt(element.getAttribute('data-rotation') || '0', 10),
        renderHTML: (attributes) => {
          if (!attributes.rotation) return {};
          return {
            'data-rotation': attributes.rotation,
            style: `transform: rotate(${attributes.rotation}deg);`,
          };
        },
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
      return `<span style="color: var(--destructive)">[invalid LaTeX]</span>`;
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
import type { Editor } from '@tiptap/react';

/** Helpers exposed alongside the editor — they trigger our internal dialogs
 *  (link / table / math) and the file picker for image upload. The parent
 *  toolbar uses these so the buttons feel native to the editor. */
export interface EditorHelpers {
  openLink: () => void;
  openTable: () => void;
  openMath: () => void;
  openImage: () => void;
}

interface RichTextEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
  children?: ReactNode;
  /** Called once the Tiptap editor is ready — lets the parent render its own
   *  top-of-content toolbar (matching gallery section 01) wired to commands. */
  onEditorReady?: (editor: Editor, helpers: EditorHelpers) => void;
}

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function RichTextEditor({ noteId, content, onChange, children, onEditorReady }: RichTextEditorProps) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<null | 'link' | 'math' | 'table'>(null);
  const [dialogExtra, setDialogExtra] = useState<{ prevUrl?: string }>({});

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
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
        codeBlock: false, // we use CodeBlockLowlight instead
      }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Placeholder.configure({ placeholder: 'Begin writing...' }),
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
      // Handle clicks on links; external open in new tab, internal (#note:<id>) scroll/navigate
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement | null;
        const anchor = target?.closest('a') as HTMLAnchorElement | null;
        if (!anchor || !anchor.href) return false;
        const href = anchor.getAttribute('href') || '';
        if (event.ctrlKey || event.metaKey) {
          if (href.startsWith('#note:')) {
            const noteId = href.slice('#note:'.length);
            window.dispatchEvent(new CustomEvent('open-note', { detail: { noteId } }));
          } else {
            window.open(anchor.href, '_blank', 'noopener,noreferrer');
          }
          event.preventDefault();
          return true;
        }
        return false;
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
    });
  }, [editor, onEditorReady]);

  // Note: content changes between notes are handled via `key` prop remount in parent.

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    setUploadingImage(true);
    try {
      // Client-side resize before upload — phone photos can be 4-10 MB.
      // Skip GIF (animation) and tiny files.
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
      editor
        .chain()
        .focus()
        .insertContent({ type: 'image', attrs: { src, width: 'auto' } })
        .run();
      toast.success('Image uploaded');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Stable callbacks so the memoised <EditorToolbar /> doesn't re-render
  // on every parent state change.
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
  const dismissKeyboard = useCallback(() => editor?.commands.blur(), [editor]);

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

    {/* Desktop uses NoteEditor's top-of-content .note-toolbar (gallery section 01)
        wired via onEditorReady. The legacy EditorToolbar is mobile-only now. */}
    {isMobile && editorFocused && (
      <EditorToolbar
        editor={editor}
        variant="mobile"
        onInsertLink={openLink}
        onInsertTable={openTable}
        onInsertMath={openMath}
        onInsertImage={openImage}
        uploadingImage={uploadingImage}
        onDismissKeyboard={dismissKeyboard}
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
