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
  Bold, Italic, Underline, Braces, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, ListChecks, ChevronRight,
  Link as LinkIcon, Image as ImageIcon, Paperclip,
  Sigma, Table as TableIcon,
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
  /** Optional insert handlers — when provided, the mobile bar exposes
   *  the matching button. All are wired by RichTextEditor on mobile so
   *  the user can reach the same surface area as the desktop
   *  BlockInsertMenu without needing the "+" trigger. */
  onInsertTable?: () => void;
  onInsertMath?: () => void;
  onInsertImage?: () => void;
  onInsertFile?: () => void;
  /** Distance from the viewport bottom (typically the on-screen keyboard
   *  height — read with `useKeyboardHeight`). */
  bottomOffset?: number;
}

// ─── Mobile bar (above keyboard) ────────────────────────────────────────────

function MobileBar(props: EditorToolbarProps) {
  const {
    editor, onInsertLink, onInsertTable, onInsertMath, onInsertImage, onInsertFile,
    bottomOffset,
  } = props;

  const s = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return null;
      // Selection / block-emptiness flags drive which bar mode we render:
      //   • selection not empty → "format" bar (inline marks + headings + align)
      //   • empty selection inside an empty block → "insert" bar (lists + block + insert)
      //   • otherwise → bar hides entirely so it doesn't flicker mid-typing
      const sel = e.state.selection;
      const selEmpty = sel.empty;
      const parent = sel.$from.parent;
      const blockEmpty = parent.content.size === 0;
      return {
        selEmpty,
        blockEmpty,
        bold:        e.isActive('bold'),
        italic:      e.isActive('italic'),
        underline:   e.isActive('underline'),
        strike:      e.isActive('strike'),
        code:        e.isActive('code'),
        h1:          e.isActive('heading', { level: 1 }),
        h2:          e.isActive('heading', { level: 2 }),
        h3:          e.isActive('heading', { level: 3 }),
        bulletList:  e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        taskList:    e.isActive('taskList'),
        toggleList:  e.isActive('toggleList'),
        alignLeft:   e.isActive({ textAlign: 'left' }),
        alignCenter: e.isActive({ textAlign: 'center' }),
        alignRight:  e.isActive({ textAlign: 'right' }),
        blockquote:  e.isActive('blockquote'),
        codeBlock:   e.isActive('codeBlock'),
        link:        e.isActive('link'),
      };
    },
  });
  if (!s) return null;

  // Mode gate. Three branches: "format" (selection), "insert" (caret on
  // empty block), or hidden. Anything else (caret mid-word) hides the bar
  // so it doesn't sit there yelling while the user is typing.
  const mode: 'format' | 'insert' | null =
    !s.selEmpty        ? 'format'
    : s.blockEmpty     ? 'insert'
                       : null;
  if (mode === null) return null;

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
      {mode === 'format' && (
        <>
          {/* Inline marks — Bold / Italic / Underline / Strike / Inline code */}
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
            <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={s.strike} label="Strikethrough">
              <Strikethrough size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                // Range-pinned addMark / removeMark — guarantees the code mark
                // is applied ONLY to the explicitly selected characters and
                // never extends to the rest of the block (Tiptap's
                // chain().toggleCode() can spread to adjacent code-marked runs).
                const { state } = editor;
                const { from, to, empty } = state.selection;
                if (empty) return;
                const codeType = state.schema.marks.code;
                if (!codeType) return;
                const tr = state.tr;
                if (state.doc.rangeHasMark(from, to, codeType)) tr.removeMark(from, to, codeType);
                else                                            tr.addMark(from, to, codeType.create());
                editor.view.dispatch(tr);
                editor.view.focus();
              }}
              active={s.code}
              label="Inline code"
            >
              <Braces size={18} />
            </ToolbarButton>
          </Group>

          <Divider />

          {/* Headings — H1 / H2 / H3 */}
          <Group>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={s.h1} label="Heading 1">
              <span className="rt-h-label">H1</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={s.h2} label="Heading 2">
              <span className="rt-h-label">H2</span>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={s.h3} label="Heading 3">
              <span className="rt-h-label">H3</span>
            </ToolbarButton>
          </Group>

          <Divider />

          {/* Alignment — L / C / R */}
          <Group>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={s.alignLeft} label="Align left">
              <AlignLeft size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={s.alignCenter} label="Align center">
              <AlignCenter size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={s.alignRight} label="Align right">
              <AlignRight size={18} />
            </ToolbarButton>
          </Group>
        </>
      )}

      {mode === 'insert' && (
        <>
          {/* Lists — Bulleted / Numbered / Checklist / Toggle */}
          <Group>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={s.bulletList} label="Bulleted list">
              <List size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={s.orderedList} label="Numbered list">
              <ListOrdered size={18} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={s.taskList} label="Checklist">
              <ListChecks size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => (editor.chain().focus() as unknown as { insertToggleList: () => { run: () => void } }).insertToggleList().run()}
              active={s.toggleList}
              label="Toggle list"
            >
              <ChevronRight size={18} />
            </ToolbarButton>
          </Group>

          <Divider />

          {/* Block-level: Quote / Code block / Divider */}
          <Group>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={s.blockquote} label="Quote">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
                <path d="M3 21c3 0 7-1 7-8V5H3v8h4M14 21c3 0 7-1 7-8V5h-7v8h4" />
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={s.codeBlock} label="Code block">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} label="Divider">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width={18} height={18}>
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </ToolbarButton>
          </Group>

          <Divider />

          {/* Inserts — Link / Math / Table / Image / File. Image+File only
              show up when the parent wired the helper callbacks. */}
          <Group>
            <ToolbarButton onClick={onInsertLink} active={s.link} label="Link">
              <LinkIcon size={18} />
            </ToolbarButton>
            {onInsertMath && (
              <ToolbarButton onClick={onInsertMath} label="Math formula">
                <Sigma size={18} />
              </ToolbarButton>
            )}
            {onInsertTable && (
              <ToolbarButton onClick={onInsertTable} label="Table">
                <TableIcon size={18} />
              </ToolbarButton>
            )}
            {onInsertImage && (
              <ToolbarButton onClick={onInsertImage} label="Image">
                <ImageIcon size={18} />
              </ToolbarButton>
            )}
            {onInsertFile && (
              <ToolbarButton onClick={onInsertFile} label="File">
                <Paperclip size={18} />
              </ToolbarButton>
            )}
          </Group>
        </>
      )}
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
