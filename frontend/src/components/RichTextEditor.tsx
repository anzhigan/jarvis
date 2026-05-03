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
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { mergeAttributes, Node } from '@tiptap/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import {
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link as LinkIcon,
  Table as TableIcon,
  Loader2,
  Minus,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { notesApi } from '../api/client';
import InputDialog from './InputDialog';

const lowlight = createLowlight(common);

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
interface RichTextEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
  children?: ReactNode;
}

const COLORS: { color: string; name: string }[] = [
  { color: '#5B5BD6', name: 'Indigo' },
  { color: '#10B981', name: 'Emerald' },
  { color: '#F59E0B', name: 'Amber' },
  { color: '#EC4899', name: 'Pink' },
  { color: '#06B6D4', name: 'Cyan' },
  { color: '#EF4444', name: 'Red' },
  { color: '#71717A', name: 'Slate' },
];

const FONT_SIZES = [
  { label: 'Small', value: '0.875rem' },
  { label: 'Normal', value: '1rem' },
  { label: 'Large', value: '1.25rem' },
  { label: 'XL', value: '1.5rem' },
  { label: '2XL', value: '1.875rem' },
];

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function RichTextEditor({ noteId, content, onChange, children }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<null | 'link' | 'math' | 'table'>(null);
  const [dialogExtra, setDialogExtra] = useState<{ prevUrl?: string }>({});

  // Mobile keyboard detection — toolbar shows ONLY when editor is focused (=keyboard open)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [editorFocused, setEditorFocused] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);  // px from bottom
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
    // Delay — give time for tap on toolbar to refocus editor
    if (blurTimerRef.current !== null) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      setEditorFocused(false);
      blurTimerRef.current = null;
    }, 200);
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      // Bottom gap = how much keyboard takes
      const bottomGap = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, bottomGap));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isMobile]);

  // editorFocused/onFocus/onBlur kept for future use; toolbar is always visible now


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
      CodeBlockLowlight.configure({ lowlight, HTMLAttributes: { class: 'editor-code-block' } }),
      InlineMath,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
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
  });

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
      const result = await notesApi.uploadImage(noteId, file);
      editor
        .chain()
        .focus()
        .insertContent({ type: 'image', attrs: { src: result.url, width: 'auto' } })
        .run();
      toast.success('Image uploaded');
    } catch (e: any) {
      toast.error(e?.detail ?? 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setFontSize = (size: string) => {
    if (!editor) return;
    (editor.chain().focus() as any).setFontSize(size).run();
    setShowSizePicker(false);
  };

  // Close popovers on outside click
  useEffect(() => {
    const onClick = () => {
      setShowColorPicker(false);
      setShowSizePicker(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!editor) return null;

  const getBlockType = () => {
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    if (editor.isActive('blockquote')) return 'quote';
    if (editor.isActive('codeBlock')) return 'code';
    return 'paragraph';
  };

  const setBlockType = (val: string) => {
    const chain = editor.chain().focus();
    if (val === 'paragraph') chain.setParagraph().run();
    else if (val === 'h1') chain.toggleHeading({ level: 1 }).run();
    else if (val === 'h2') chain.toggleHeading({ level: 2 }).run();
    else if (val === 'h3') chain.toggleHeading({ level: 3 }).run();
    else if (val === 'quote') chain.toggleBlockquote().run();
    else if (val === 'code') chain.toggleCodeBlock().run();
  };

  const currentFontSizeVal = editor.getAttributes('textStyle').fontSize as string | undefined;
  const sizeIdx = FONT_SIZES.findIndex((s) => s.value === currentFontSizeVal);
  const effectiveSizeIdx = sizeIdx === -1 ? 1 : sizeIdx;

  const stepSize = (delta: number) => {
    const next = Math.max(0, Math.min(FONT_SIZES.length - 1, effectiveSizeIdx + delta));
    setFontSize(FONT_SIZES[next].value);
  };

  const currentTextColor = editor.getAttributes('textStyle').color as string | undefined;

  const Toolbar = (
    <div
      onMouseDown={(e) => { if (isMobile) e.preventDefault(); }}
      onTouchStart={(e) => {
        if (isMobile) {
          const tag = (e.target as HTMLElement).tagName.toLowerCase();
          if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
        }
      }}
      className={isMobile ? 'toolbar editor-toolbar-mobile' : 'toolbar'}
      style={isMobile ? { bottom: `${keyboardOffset}px` } : undefined}
    >
      {/* Block type */}
      <div className="tb-group">
        <select
          className="tb-select"
          value={getBlockType()}
          onChange={(e) => setBlockType(e.target.value)}
          title="Block type"
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
          <option value="code">Code</option>
        </select>
      </div>

      {/* Font size stepper */}
      <div className="tb-group">
        <button className="tb-btn" onClick={() => stepSize(-1)} title="Decrease font size"><Minus size={12} /></button>
        <span className="tb-btn" style={{ cursor: 'default', minWidth: 38 }}>
          {FONT_SIZES[effectiveSizeIdx].label}
        </span>
        <button className="tb-btn" onClick={() => stepSize(1)} title="Increase font size"><Plus size={12} /></button>
      </div>

      {/* Inline formatting */}
      <div className="tb-group">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`tb-btn${editor.isActive('bold') ? ' is-active' : ''}`} title="Bold" style={{ fontWeight: 700 }}>B</button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`tb-btn${editor.isActive('italic') ? ' is-active' : ''}`} title="Italic" style={{ fontStyle: 'italic' }}>I</button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`tb-btn${editor.isActive('underline') ? ' is-active' : ''}`} title="Underline" style={{ textDecoration: 'underline' }}>U</button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`tb-btn${editor.isActive('strike') ? ' is-active' : ''}`} title="Strikethrough" style={{ textDecoration: 'line-through' }}>S</button>
        <button onClick={() => editor.chain().focus().toggleCode().run()} className={`tb-btn${editor.isActive('code') ? ' is-active' : ''}`} title="Inline code" style={{ fontFamily: 'monospace', fontSize: 11 }}>&lt;/&gt;</button>
      </div>

      {/* Color */}
      <div className="tb-group" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }}
          className="tb-btn"
          title="Text color"
        >
          <span style={{ fontWeight: 700 }}>A</span>
          <span className="tb-color-swatch" style={{ background: currentTextColor || 'currentColor' }} />
        </button>
        {showColorPicker && (
          <div style={{
            position: 'absolute', top: 32, left: 0, zIndex: 50,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-panel)',
            boxShadow: 'var(--sh-popover)',
            padding: 12, minWidth: 180,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--fg-muted)', marginBottom: 8 }}>Text color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {COLORS.map(({ color, name }) => (
                <button
                  key={color}
                  onClick={() => { editor.chain().focus().setColor(color).run(); setShowColorPicker(false); }}
                  title={name}
                  style={{
                    width: 22, height: 22, borderRadius: 5,
                    background: color, border: 'none', cursor: 'pointer',
                    outline: (currentTextColor === color) ? '2px solid var(--accent-notes)' : 'none',
                    outlineOffset: 1,
                  }}
                />
              ))}
              <button
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: 'var(--bg-card)', border: '1px solid var(--line)',
                  cursor: 'pointer', fontSize: 9, color: 'var(--fg-muted)',
                }}
                title="Reset"
              >✕</button>
            </div>
          </div>
        )}
      </div>

      {/* Alignment */}
      <div className="tb-group">
        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`tb-btn${editor.isActive({ textAlign: 'left' }) ? ' is-active' : ''}`} title="Align left"><AlignLeft size={13} /></button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`tb-btn${editor.isActive({ textAlign: 'center' }) ? ' is-active' : ''}`} title="Align center"><AlignCenter size={13} /></button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`tb-btn${editor.isActive({ textAlign: 'right' }) ? ' is-active' : ''}`} title="Align right"><AlignRight size={13} /></button>
      </div>

      {/* Lists */}
      <div className="tb-group">
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`tb-btn${editor.isActive('bulletList') ? ' is-active' : ''}`} title="Bullet list"><List size={13} /></button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`tb-btn${editor.isActive('orderedList') ? ' is-active' : ''}`} title="Numbered list"><ListOrdered size={13} /></button>
        <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`tb-btn${editor.isActive('taskList') ? ' is-active' : ''}`} title="Task list"><ListChecks size={13} /></button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`tb-btn${editor.isActive('blockquote') ? ' is-active' : ''}`} title="Blockquote"><Quote size={13} /></button>
      </div>

      {/* Insert */}
      <div className="tb-group">
        <button
          onClick={() => { const prev = editor.getAttributes('link').href as string | undefined; setDialogExtra({ prevUrl: prev }); setDialog('link'); }}
          className={`tb-btn${editor.isActive('link') ? ' is-active' : ''}`}
          title="Insert / edit link"
        ><LinkIcon size={13} /></button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
          className="tb-btn"
          title="Insert image"
        >{uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}</button>
        <button
          onClick={() => { if (editor.isActive('table')) editor.chain().focus().deleteTable().run(); else setDialog('table'); }}
          className={`tb-btn${editor.isActive('table') ? ' is-active' : ''}`}
          title="Insert table"
        ><TableIcon size={13} /></button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`tb-btn${editor.isActive('codeBlock') ? ' is-active' : ''}`}
          title="Code block"
        ><Code size={13} /></button>
        <button
          onClick={() => setDialog('math')}
          className="tb-btn"
          title="Insert math formula"
          style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: 600 }}
        >∑</button>
      </div>
    </div>
  );

  return (
    <>
    <InputDialog
      open={dialog === 'link'}
      title="Insert link"
      description="External URL or internal reference to another note (#note:<id>)"
      fields={[
        { key: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com', defaultValue: dialogExtra.prevUrl ?? '', autoFocus: true, required: true, helpText: 'Tip: use #note:<note-id> to link to another note. Hold Ctrl/Cmd + click to open.' },
      ]}
      submitLabel="Insert"
      extraActions={editor.isActive('link') ? [{
        label: 'Remove link',
        variant: 'destructive',
        onClick: () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); setDialog(null); },
      }] : undefined}
      onSubmit={(v) => {
        const url = v.url.trim();
        if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        setDialog(null);
      }}
      onCancel={() => setDialog(null)}
    />

    <InputDialog
      open={dialog === 'table'}
      title="Insert table"
      description="Create a new table with specified dimensions"
      fields={[
        { key: 'rows', label: 'Rows', type: 'number', defaultValue: '3', autoFocus: true, required: true },
        { key: 'cols', label: 'Columns', type: 'number', defaultValue: '3', required: true },
        { key: 'header', label: 'Include header row', type: 'select', defaultValue: 'yes', options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]},
      ]}
      submitLabel="Insert table"
      onSubmit={(v) => {
        const rows = Math.max(1, Math.min(20, parseInt(v.rows, 10) || 3));
        const cols = Math.max(1, Math.min(10, parseInt(v.cols, 10) || 3));
        editor.chain().focus().insertTable({ rows, cols, withHeaderRow: v.header === 'yes' }).run();
        setDialog(null);
      }}
      onCancel={() => setDialog(null)}
    />

    <InputDialog
      open={dialog === 'math'}
      title="Insert formula"
      description="Enter a LaTeX expression"
      fields={[
        { key: 'latex', label: 'LaTeX', type: 'textarea', placeholder: 'x^2 + y^2 = z^2', defaultValue: 'x^2 + y^2 = z^2', autoFocus: true, required: true, helpText: 'Examples: \\frac{a}{b}, \\sqrt{x}, \\sum_{i=0}^{n}, \\int_a^b f(x)dx' },
      ]}
      submitLabel="Insert"
      onSubmit={(v) => {
        const latex = v.latex.trim();
        if (latex) (editor.chain().focus() as any).insertInlineMath(latex).run();
        setDialog(null);
      }}
      onCancel={() => setDialog(null)}
    />

    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

    {Toolbar}

    <div className="notes-editor-paper">
      {children}
      <div className={isMobile ? 'pb-24' : ''}>
        <EditorContent editor={editor} />
      </div>
    </div>
    </>
  );
}
