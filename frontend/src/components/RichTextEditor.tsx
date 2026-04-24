import { useEditor, EditorContent, Extension, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextAlign } from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extension-placeholder';
import { mergeAttributes, Node } from '@tiptap/core';
import {
  Bold,
  Underline as UnderlineIcon,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  List,
  ListOrdered,
  Quote,
  Code,
  Loader2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { notesApi } from '../api/client';

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

// ─── Types ───────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
}

const COLORS: { color: string; name: string }[] = [
  { color: '#1c1917', name: 'Default' },
  { color: '#78716c', name: 'Gray' },
  { color: '#e11d48', name: 'Red' },
  { color: '#ea580c', name: 'Orange' },
  { color: '#d97706', name: 'Amber' },
  { color: '#65a30d', name: 'Lime' },
  { color: '#059669', name: 'Green' },
  { color: '#0891b2', name: 'Cyan' },
  { color: '#0ea5e9', name: 'Sky' },
  { color: '#4f46e5', name: 'Indigo' },
  { color: '#7c3aed', name: 'Violet' },
  { color: '#db2777', name: 'Pink' },
];

const FONT_SIZES = [
  { label: 'Small', value: '0.875rem' },
  { label: 'Normal', value: '1rem' },
  { label: 'Large', value: '1.25rem' },
  { label: 'XL', value: '1.5rem' },
  { label: '2XL', value: '1.875rem' },
];

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function RichTextEditor({ noteId, content, onChange }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false }),
      Underline,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Placeholder.configure({ placeholder: 'Begin writing...' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px]',
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

  const btnCls = (active: boolean) =>
    `h-8 w-8 rounded-md flex items-center justify-center transition-all active:scale-95 ${
      active
        ? 'bg-primary text-primary-foreground shadow-sm'
        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm mb-6 pb-2 -mx-4 md:-mx-10 px-4 md:px-10 border-b border-border">
        <div className="flex items-center gap-0.5 flex-wrap pt-2">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnCls(editor.isActive('bold'))} title="Bold">
            <Bold size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnCls(editor.isActive('italic'))} title="Italic">
            <Italic size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnCls(editor.isActive('underline'))} title="Underline">
            <UnderlineIcon size={15} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnCls(editor.isActive('heading', { level: 1 }))} title="Heading 1">
            <Heading1 size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnCls(editor.isActive('heading', { level: 2 }))} title="Heading 2">
            <Heading2 size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnCls(editor.isActive('heading', { level: 3 }))} title="Heading 3">
            <Heading3 size={15} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnCls(editor.isActive('bulletList'))} title="Bullet list">
            <List size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnCls(editor.isActive('orderedList'))} title="Numbered list">
            <ListOrdered size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnCls(editor.isActive('blockquote'))} title="Quote">
            <Quote size={15} />
          </button>
          <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnCls(editor.isActive('codeBlock'))} title="Code block">
            <Code size={15} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnCls(editor.isActive({ textAlign: 'left' }))} title="Align left">
            <AlignLeft size={15} />
          </button>
          <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnCls(editor.isActive({ textAlign: 'center' }))} title="Align center">
            <AlignCenter size={15} />
          </button>
          <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnCls(editor.isActive({ textAlign: 'right' }))} title="Align right">
            <AlignRight size={15} />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Font size */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setShowSizePicker(!showSizePicker);
                setShowColorPicker(false);
              }}
              className={btnCls(false)}
              title="Font size"
            >
              <Type size={15} />
            </button>
            {showSizePicker && (
              <div className="absolute top-9 left-0 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[140px] z-20">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setFontSize(size.value)}
                    className="w-full text-left px-3 py-1.5 rounded-md hover:bg-secondary transition-colors text-sm"
                    style={{ fontSize: size.value }}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowSizePicker(false);
              }}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-secondary transition-all active:scale-95"
              title="Text color"
            >
              <div
                className="w-4 h-4 rounded-sm border border-border-strong"
                style={{ backgroundColor: editor.getAttributes('textStyle').color || '#1c1917' }}
              />
            </button>
            {showColorPicker && (
              <div className="absolute top-9 left-0 bg-popover border border-border rounded-lg shadow-lg p-3 z-20 w-[220px]">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2 px-0.5">Text color</div>
                <div className="grid grid-cols-6 gap-2">
                  {COLORS.map(({ color, name }) => {
                    const active = (editor.getAttributes('textStyle').color || '#1c1917') === color;
                    return (
                      <button
                        key={color}
                        onClick={() => {
                          editor.chain().focus().setColor(color).run();
                          setShowColorPicker(false);
                        }}
                        className={`relative w-8 h-8 rounded-md transition-all hover:scale-110 ${
                          active ? 'ring-2 ring-offset-2 ring-ring ring-offset-popover' : 'ring-1 ring-border'
                        }`}
                        style={{ backgroundColor: color }}
                        title={name}
                      />
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    editor.chain().focus().unsetColor().run();
                    setShowColorPicker(false);
                  }}
                  className="w-full mt-2.5 h-7 rounded-md text-xs text-muted-foreground hover:bg-secondary transition-colors border border-border"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-border mx-1" />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingImage}
            className={btnCls(false)}
            title="Insert image"
          >
            {uploadingImage ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />}
          </button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
