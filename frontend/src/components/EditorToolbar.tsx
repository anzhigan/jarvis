/**
 * EditorToolbar — compact formatting bar shown above the on-screen keyboard
 * on mobile devices. Desktop uses NoteToolbar inside NoteBubbleMenu (see
 * `features/notes/components/NoteEditor.tsx`), so the desktop variant of
 * this component was removed.
 *
 * Notes on Safari / iOS:
 *  - `onMouseDown={preventDefault}` on the root keeps the caret inside the
 *    editor when the user taps a button (otherwise the editor blurs and the
 *    next command runs against an empty selection).
 *  - The bar is portaled to <body> so it isn't clipped by ancestors with
 *    `transform` / `overflow: hidden`.
 */
/* NB: Per-color palette is defined in `NoteEditor.tsx` (the desktop bubble
   toolbar). The mobile bar here is intentionally text-formatting-only and
   doesn't expose a color picker because the bubble menu already handles
   color in the same selection context. */
import { memo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Code, Heading2,
  List, ListChecks, Link as LinkIcon,
} from 'lucide-react';

// ─── Building blocks ────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick?: () => void;
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

// ─── Public props ────────────────────────────────────────────────────────────

export interface EditorToolbarProps {
  editor: Editor;
  onInsertLink: () => void;
  /** Distance from the viewport bottom (typically the on-screen keyboard
   *  height — read with `useKeyboardHeight`). */
  bottomOffset?: number;
}

// ─── Mobile bar (above keyboard) ────────────────────────────────────────────

function MobileBar(props: EditorToolbarProps) {
  const { editor, onInsertLink, bottomOffset } = props;

  const s = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return null;
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        code: e.isActive('code'),
        h2: e.isActive('heading', { level: 2 }),
        bulletList: e.isActive('bulletList'),
        taskList: e.isActive('taskList'),
        link: e.isActive('link'),
      };
    },
  });
  if (!s) return null;

  const preventBlur = (e: React.SyntheticEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
  };

  return (
    <div
      className="rt-toolbar rt-toolbar--mobile"
      role="toolbar"
      aria-label="Formatting"
      style={{ bottom: bottomOffset ?? 0 }}
      onMouseDown={preventBlur}
      onTouchStart={preventBlur}
    >
      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={s.bold} label="Bold">
          <Bold size={18} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={s.italic} label="Italic">
          <Italic size={18} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={s.underline} label="Underline">
          <Underline size={18} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={s.h2} label="Heading 2">
          <Heading2 size={18} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={s.bulletList} label="Bullet list">
          <List size={18} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={s.taskList} label="Task list">
          <ListChecks size={18} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={s.code} label="Inline code">
          <Code size={18} />
        </ToolbarButton>
      </Group>

      <Divider />

      <Group>
        <ToolbarButton onClick={onInsertLink} active={s.link} label="Link">
          <LinkIcon size={18} />
        </ToolbarButton>
      </Group>
    </div>
  );
}

// ─── Public component ────────────────────────────────────────────────────────

function EditorToolbarComponent(props: EditorToolbarProps) {
  // Portal to <body> so ancestor `transform` / `overflow` don't clip the bar.
  if (typeof document === 'undefined') return null;
  return createPortal(<MobileBar {...props} />, document.body);
}

/** Memo prevents the toolbar from re-rendering on every parent state change
 *  (e.g. dialog state). Active states are computed inside via `useEditorState`,
 *  which subscribes to the editor directly and only re-renders when one of the
 *  selected flags changes. */
export default memo(EditorToolbarComponent);
