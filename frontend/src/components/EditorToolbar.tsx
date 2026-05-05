/**
 * EditorToolbar — single source of truth for the rich-text editor toolbar.
 *
 * - Desktop variant: sticky bar at the top of the editor scroll area.
 *   Full set of formatting buttons grouped by purpose.
 * - Mobile variant: fixed bar above the on-screen keyboard, compact set
 *   of the most common controls + a "dismiss keyboard" button.
 *
 * Notes on Safari / iOS:
 * - `onMouseDown={preventDefault}` on the root keeps caret focus inside
 *   the editor when the user clicks a button (otherwise the editor blurs
 *   and the formatting command runs against an empty selection).
 * - `position: sticky; top: 0` works in Safari 13+.
 * - Native `<select>` is used for the heading switcher — Safari renders
 *   a native, accessible dropdown (better UX than custom popovers).
 * - All buttons carry `aria-label` + `aria-pressed`/`aria-disabled` for
 *   screen readers and have focus-visible outlines for keyboard nav.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Code2,
  Heading1, Heading2, Heading3, Pilcrow,
  List, ListOrdered, ListChecks, Quote,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Table as TableIcon, Sigma,
  Undo2, Redo2, Palette, ChevronDown, Loader2,
} from 'lucide-react';

const TEXT_COLORS: { color: string; name: string }[] = [
  { color: '#5B5BD6', name: 'Indigo' },
  { color: '#10B981', name: 'Emerald' },
  { color: '#F59E0B', name: 'Amber' },
  { color: '#EC4899', name: 'Pink' },
  { color: '#06B6D4', name: 'Cyan' },
  { color: '#EF4444', name: 'Red' },
  { color: '#71717A', name: 'Slate' },
];

// ─── Building blocks ─────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}
function ToolbarButton({ onClick, active, disabled, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
      className="rt-btn"
      data-active={active ? 'true' : undefined}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="rt-group">{children}</div>;
}
function Divider() {
  return <span className="rt-divider" aria-hidden="true" />;
}

// ─── Color popover ───────────────────────────────────────────────────────────
function ColorMenu({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Defer so the click that opened us isn't caught immediately.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const current = editor.getAttributes('textStyle').color as string | undefined;

  return (
    <div ref={ref} className="rt-popover" role="menu">
      <div className="rt-popover-label">Text color</div>
      <div className="rt-color-grid">
        {TEXT_COLORS.map(({ color, name }) => (
          <button
            key={color}
            type="button"
            onClick={() => { editor.chain().focus().setColor(color).run(); onClose(); }}
            aria-label={name}
            title={name}
            className="rt-color-swatch"
            data-active={current === color ? 'true' : undefined}
            style={{ background: color }}
          />
        ))}
        <button
          type="button"
          onClick={() => { editor.chain().focus().unsetColor().run(); onClose(); }}
          aria-label="Reset color"
          title="Reset color"
          className="rt-color-swatch rt-color-swatch--reset"
        >✕</button>
      </div>
    </div>
  );
}

// ─── Block-type select (Safari-native dropdown) ──────────────────────────────
function BlockTypeSelect({ editor }: { editor: Editor }) {
  const value =
    editor.isActive('heading', { level: 1 }) ? 'h1' :
    editor.isActive('heading', { level: 2 }) ? 'h2' :
    editor.isActive('heading', { level: 3 }) ? 'h3' :
    editor.isActive('blockquote') ? 'quote' :
    editor.isActive('codeBlock') ? 'code' : 'p';

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const c = editor.chain().focus();
    switch (e.target.value) {
      case 'p': c.setParagraph().run(); break;
      case 'h1': c.toggleHeading({ level: 1 }).run(); break;
      case 'h2': c.toggleHeading({ level: 2 }).run(); break;
      case 'h3': c.toggleHeading({ level: 3 }).run(); break;
      case 'quote': c.toggleBlockquote().run(); break;
      case 'code': c.toggleCodeBlock().run(); break;
    }
  };

  return (
    <label className="rt-select-wrap" title="Block type">
      <BlockTypeIcon value={value} />
      <select className="rt-select" value={value} onChange={onChange} aria-label="Block type">
        <option value="p">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
        <option value="quote">Quote</option>
        <option value="code">Code block</option>
      </select>
      <ChevronDown size={12} className="rt-select-chev" aria-hidden="true" />
    </label>
  );
}

function BlockTypeIcon({ value }: { value: string }) {
  const icon =
    value === 'h1' ? <Heading1 size={14} /> :
    value === 'h2' ? <Heading2 size={14} /> :
    value === 'h3' ? <Heading3 size={14} /> :
    value === 'quote' ? <Quote size={14} /> :
    value === 'code' ? <Code2 size={14} /> :
    <Pilcrow size={14} />;
  return <span className="rt-select-icon">{icon}</span>;
}

// ─── Public props ────────────────────────────────────────────────────────────
export interface EditorToolbarProps {
  editor: Editor;
  variant: 'desktop' | 'mobile';
  onInsertLink: () => void;
  onInsertTable: () => void;
  onInsertMath: () => void;
  onInsertImage: () => void;
  uploadingImage: boolean;
  /** Mobile-only: distance from the viewport bottom (typically the
   *  on-screen keyboard height — read with `useKeyboardHeight`). */
  bottomOffset?: number;
  /** Mobile-only: dismiss the keyboard. */
  onDismissKeyboard?: () => void;
}

// ─── Desktop ─────────────────────────────────────────────────────────────────
function DesktopBar(props: EditorToolbarProps) {
  const { editor, onInsertLink, onInsertTable, onInsertMath, onInsertImage, uploadingImage } = props;
  const [colorOpen, setColorOpen] = useState(false);

  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);

  return (
    <div
      className="rt-toolbar"
      role="toolbar"
      aria-label="Formatting"
      // Preserve editor focus when clicking buttons.
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag !== 'select' && tag !== 'input' && tag !== 'textarea') e.preventDefault();
      }}
    >
      <Group>
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          label="Undo (⌘Z)"
        ><Undo2 size={15} /></ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          label="Redo (⇧⌘Z)"
        ><Redo2 size={15} /></ToolbarButton>
      </Group>

      <Divider />

      <BlockTypeSelect editor={editor} />

      <Divider />

      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={is('bold')} label="Bold (⌘B)">
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={is('italic')} label="Italic (⌘I)">
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={is('underline')} label="Underline (⌘U)">
          <Underline size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={is('strike')} label="Strikethrough">
          <Strikethrough size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={is('code')} label="Inline code">
          <Code size={15} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <div className="rt-color">
          <ToolbarButton
            onClick={() => setColorOpen((v) => !v)}
            active={colorOpen}
            label="Text color"
          >
            <Palette size={15} />
            <span
              className="rt-color-bar"
              style={{ background: (editor.getAttributes('textStyle').color as string | undefined) ?? 'currentColor' }}
            />
          </ToolbarButton>
          {colorOpen && <ColorMenu editor={editor} onClose={() => setColorOpen(false)} />}
        </div>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={is({ textAlign: 'left' } as never)} label="Align left">
          <AlignLeft size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={is({ textAlign: 'center' } as never)} label="Align center">
          <AlignCenter size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={is({ textAlign: 'right' } as never)} label="Align right">
          <AlignRight size={15} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={is('bulletList')} label="Bullet list">
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={is('orderedList')} label="Numbered list">
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={is('taskList')} label="Task list">
          <ListChecks size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={is('blockquote')} label="Quote">
          <Quote size={15} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={onInsertLink} active={is('link')} label="Insert/edit link (⌘K)">
          <LinkIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={onInsertImage} disabled={uploadingImage} label="Insert image">
          {uploadingImage ? <Loader2 size={15} className="rt-spin" /> : <ImageIcon size={15} />}
        </ToolbarButton>
        <ToolbarButton onClick={onInsertTable} active={is('table')} label="Insert table">
          <TableIcon size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={is('codeBlock')} label="Code block">
          <Code2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={onInsertMath} label="Insert math formula">
          <Sigma size={15} />
        </ToolbarButton>
      </Group>
    </div>
  );
}

// ─── Mobile (above keyboard) ─────────────────────────────────────────────────
function MobileBar(props: EditorToolbarProps) {
  const { editor, onInsertLink, onInsertImage, onInsertMath, uploadingImage, onDismissKeyboard, bottomOffset } = props;
  const is = (name: string) => editor.isActive(name);

  return (
    <div
      className="rt-toolbar rt-toolbar--mobile"
      role="toolbar"
      aria-label="Formatting"
      style={{ bottom: bottomOffset ?? 0 }}
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
      }}
      onTouchStart={(e) => {
        const tag = (e.target as HTMLElement).tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
      }}
    >
      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={is('bold')} label="Bold">
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={is('italic')} label="Italic">
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={is('underline')} label="Underline">
          <Underline size={16} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} label="Heading 2">
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={is('bulletList')} label="Bullet list">
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={is('taskList')} label="Task list">
          <ListChecks size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={is('code')} label="Inline code">
          <Code size={16} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={onInsertLink} active={is('link')} label="Link">
          <LinkIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={onInsertImage} disabled={uploadingImage} label="Image">
          {uploadingImage ? <Loader2 size={16} className="rt-spin" /> : <ImageIcon size={16} />}
        </ToolbarButton>
        <ToolbarButton onClick={onInsertMath} label="Math">
          <Sigma size={16} />
        </ToolbarButton>
      </Group>

      <span className="rt-spacer" />

      {onDismissKeyboard && (
        <ToolbarButton onClick={onDismissKeyboard} label="Dismiss keyboard">
          <ChevronDown size={16} />
        </ToolbarButton>
      )}
    </div>
  );
}

// ─── Public component ────────────────────────────────────────────────────────
export default function EditorToolbar(props: EditorToolbarProps) {
  if (props.variant === 'desktop') return <DesktopBar {...props} />;
  // Mobile bar is portaled to the body so it isn't trapped by ancestor
  // `transform`/`overflow` (the whole reason CreateSheet uses portal too).
  if (typeof document === 'undefined') return null;
  return createPortal(<MobileBar {...props} />, document.body);
}
