import { useEditor, EditorContent, Extension, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Image as TiptapImage } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { FontFamily } from '@tiptap/extension-font-family';
import { Placeholder } from '@tiptap/extension-placeholder';
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
} from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';

// ─── Custom font size extension ───────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize || null,
          renderHTML: attributes => {
            if (!attributes.fontSize) return {};
            return { style: `font-size: ${attributes.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) =>
        chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

// ─── Resizable Image Node View ────────────────────────────────────────────────
function ResizableImageView({ node, updateAttributes }: { node: any; updateAttributes: (attrs: Record<string, any>) => void }) {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const width = node.attrs.width || 'auto';

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startX.current = e.clientX;
    startWidth.current = imgRef.current?.getBoundingClientRect().width || 300;

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
  }, [updateAttributes]);

  return (
    <NodeViewWrapper className="relative inline-block group/img" style={{ maxWidth: '100%' }}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        style={{
          width,
          maxWidth: '100%',
          display: 'block',
          cursor: isResizing ? 'ew-resize' : 'default',
          userSelect: 'none',
        }}
        draggable={false}
      />
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="absolute bottom-0 right-0 w-4 h-4 bg-primary opacity-0 group-hover/img:opacity-100 cursor-ew-resize rounded-tl-sm transition-opacity"
        title="Drag to resize"
        style={{ touchAction: 'none' }}
      />
    </NodeViewWrapper>
  );
}

// ─── Custom Image extension with resize support ────────────────────────────
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
  content: string;
  onChange: (content: string) => void;
  onAddPhoto: () => void;
}

const COLORS = ['#000000', '#6B7280', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];
const FONT_SIZES = [
  { label: 'Normal', value: '1rem' },
  { label: 'Large', value: '1.25rem' },
  { label: 'XL', value: '1.5rem' },
  { label: '2XL', value: '1.875rem' },
];

export default function RichTextEditor({ content, onChange, onAddPhoto }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, underline: false }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Placeholder.configure({ placeholder: 'Begin writing your thoughts...' }),
    ],
    content,
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); },
    editorProps: {
      attributes: { class: 'focus:outline-none min-h-[400px]' },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: { src: imageUrl, width: 'auto' },
      }).run();
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setFontSize = (size: string) => {
    if (!editor) return;
    (editor.chain().focus() as any).setFontSize(size).run();
    setShowSizePicker(false);
  };

  if (!editor) return null;

  return (
    <div className="w-full">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border mb-8 pb-4 -mx-12 px-12">
        <div className="flex items-center gap-1 flex-wrap pt-4">
          {/* Text Formatting */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${editor.isActive('bold') ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
            title="Bold"
          >
            <Bold size={18} />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${editor.isActive('italic') ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
            title="Italic"
          >
            <Italic size={18} />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${editor.isActive('underline') ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
            title="Underline"
          >
            <UnderlineIcon size={18} />
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Headings */}
          {([1, 2, 3] as const).map((level, i) => {
            const Icon = [Heading1, Heading2, Heading3][i];
            return (
              <button
                key={level}
                onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
                className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${editor.isActive('heading', { level }) ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
                title={`Heading ${level}`}
              >
                <Icon size={18} />
              </button>
            );
          })}

          <div className="w-px h-6 bg-border mx-1" />

          {/* Alignment */}
          {(['left', 'center', 'right'] as const).map((align) => {
            const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
            return (
              <button
                key={align}
                onClick={() => editor.chain().focus().setTextAlign(align).run()}
                className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95 ${editor.isActive({ textAlign: align }) ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'}`}
                title={`Align ${align}`}
              >
                <Icon size={18} />
              </button>
            );
          })}

          <div className="w-px h-6 bg-border mx-1" />

          {/* Font Size */}
          <div className="relative">
            <button
              onClick={() => setShowSizePicker(!showSizePicker)}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
              title="Font Size"
            >
              <Type size={18} />
            </button>
            {showSizePicker && (
              <div className="absolute top-full mt-1 left-0 bg-background border border-border rounded-lg shadow-lg p-2 min-w-[120px] z-20">
                {FONT_SIZES.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setFontSize(size.value)}
                    className="w-full text-left px-3 py-2 rounded hover:bg-secondary transition-colors"
                    style={{ fontSize: size.value }}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color Picker */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-2 rounded-lg hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95"
              title="Text Color"
            >
              <div
                className="w-5 h-5 rounded border-2 border-muted-foreground"
                style={{ backgroundColor: editor.getAttributes('textStyle').color || '#000000' }}
              />
            </button>
            {showColorPicker && (
              <div className="absolute top-full mt-1 left-0 bg-background border border-border rounded-lg shadow-lg p-3 z-20">
                <div className="grid grid-cols-4 gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => { editor.chain().focus().setColor(color).run(); setShowColorPicker(false); }}
                      className="w-8 h-8 rounded-lg border-2 border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Image */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95"
            title="Insert Image"
          >
            <ImageIcon size={18} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  );
}
