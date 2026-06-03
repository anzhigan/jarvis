/**
 * EditorToolbar — mobile-only formatting + insert menus that float right
 * next to the caret / selection (Notion-style), not pinned above the
 * on-screen keyboard.
 *
 * Two states, two Tiptap menus:
 *  • BubbleMenu (anchored under the selection) — visible when at least one
 *    character is selected. Hosts inline marks + headings + alignment
 *    (groups 1 + 2 + 4 from the legacy bar).
 *  • FloatingMenu (anchored under the caret) — visible when the caret is in
 *    an EMPTY block. Hosts lists + block-level wrappers + inserts
 *    (groups 3 + 5 + 6 from the legacy bar).
 *
 * Caret in a non-empty block with no selection: neither menu shows — the
 * user is presumably typing and shouldn't have a popover yelling at them.
 *
 * Desktop uses NoteToolbar inside NoteBubbleMenu (see
 * `features/notes/components/NoteEditor.tsx`), so this component is mobile-only.
 *
 * Notes on Safari / iOS:
 *  - `onMouseDown={preventDefault}` on each pill root keeps the caret inside
 *    the editor when the user taps a button (otherwise the editor blurs and
 *    the next command runs against an empty selection).
 */
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
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
  /** Optional insert handlers — when provided, the insert pill exposes
   *  the matching button. All are wired by RichTextEditor on mobile so
   *  the user can reach the same surface as the desktop BlockInsertMenu. */
  onInsertTable?: () => void;
  onInsertMath?: () => void;
  onInsertImage?: () => void;
  onInsertFile?: () => void;
}

// ─── State subscription (one selector feeds both pills) ────────────────────

interface ToolbarState {
  bold: boolean; italic: boolean; underline: boolean; strike: boolean; code: boolean;
  h1: boolean; h2: boolean; h3: boolean;
  bulletList: boolean; orderedList: boolean; taskList: boolean; toggleList: boolean;
  alignLeft: boolean; alignCenter: boolean; alignRight: boolean;
  blockquote: boolean; codeBlock: boolean;
  link: boolean;
}

// ─── Format pill (selection ≥ 1 char) ──────────────────────────────────────

function FormatPill({ editor, onInsertLink: _, s }: {
  editor: Editor;
  onInsertLink: () => void;
  s: ToolbarState;
}) {
  const preventBlur = (e: React.SyntheticEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
  };

  return (
    <div
      className="rt-toolbar rt-toolbar--floating"
      role="toolbar"
      aria-label="Formatting"
      onMouseDown={preventBlur}
      onTouchStart={preventBlur}
    >
      {/* Inline marks */}
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
            // Range-pinned addMark / removeMark — guarantees the code mark is
            // applied ONLY to the explicit selection and doesn't spread.
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

      {/* Headings */}
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

      {/* Alignment */}
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
    </div>
  );
}

// ─── Insert pill (caret in empty block) ────────────────────────────────────

function InsertPill({
  editor, onInsertLink, onInsertTable, onInsertMath, onInsertImage, onInsertFile, s,
}: {
  editor: Editor;
  onInsertLink: () => void;
  onInsertTable?: () => void;
  onInsertMath?: () => void;
  onInsertImage?: () => void;
  onInsertFile?: () => void;
  s: ToolbarState;
}) {
  const preventBlur = (e: React.SyntheticEvent) => {
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') e.preventDefault();
  };

  return (
    <div
      className="rt-toolbar rt-toolbar--floating"
      role="toolbar"
      aria-label="Insert"
      onMouseDown={preventBlur}
      onTouchStart={preventBlur}
    >
      {/* Lists */}
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

      {/* Block-level */}
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

      {/* Inserts */}
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
    </div>
  );
}

// ─── Public component ──────────────────────────────────────────────────────

function EditorToolbarComponent(props: EditorToolbarProps) {
  const { editor } = props;

  // One subscription feeds both pills. Bubble/FloatingMenu only mount their
  // children when `shouldShow` returns true, but the editor state hook here
  // lives on the parent so we can hand the snapshot to both children.
  const s = useEditorState<ToolbarState | null>({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return null;
      return {
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

  // BubbleMenu: any non-empty selection inside the editor.
  const bubbleShouldShow = useCallback(
    ({ state }: { state: { selection: { empty: boolean } } }) =>
      !state.selection.empty,
    [],
  );
  // Anchor under the selection. `flip` lets Floating UI flip above when
  // there's no room (caret near viewport bottom on a tall keyboard).
  const bubbleOptions = useRef({
    placement: 'bottom' as const,
    offset: 8,
    flip: true,
    shift: { padding: 8 },
  }).current;

  // FloatingMenu: empty caret inside an empty block. Same gate the desktop
  // BlockInsertMenu uses — only fire at the doc root / inside a toggleContent
  // (avoids the "click bullet inside an empty bullet collapses the list"
  // foot-gun by hiding the pill in list/quote/cell contexts).
  const floatingShouldShow = useCallback(
    ({ state }: { state: any }) => {
      const sel = state.selection;
      if (!sel.empty) return false;
      const $from = sel.$from;
      const parent = $from.parent;
      if (parent.content.size !== 0) return false;
      const container = $from.depth >= 1 ? $from.node($from.depth - 1) : null;
      const containerType = container?.type.name;
      if (containerType !== 'doc' && containerType !== 'toggleContent') return false;
      return true;
    },
    [],
  );
  const floatingOptions = useRef({
    placement: 'bottom-start' as const,
    offset: 6,
    flip: true,
    shift: { padding: 8 },
  }).current;

  if (!s) return null;

  return (
    <>
      <BubbleMenu
        editor={editor}
        updateDelay={0}
        shouldShow={bubbleShouldShow}
        options={bubbleOptions}
      >
        <FormatPill editor={editor} onInsertLink={props.onInsertLink} s={s} />
      </BubbleMenu>
      <FloatingMenu
        editor={editor}
        updateDelay={0}
        shouldShow={floatingShouldShow}
        options={floatingOptions}
      >
        <InsertPill
          editor={editor}
          onInsertLink={props.onInsertLink}
          onInsertTable={props.onInsertTable}
          onInsertMath={props.onInsertMath}
          onInsertImage={props.onInsertImage}
          onInsertFile={props.onInsertFile}
          s={s}
        />
      </FloatingMenu>
    </>
  );
}

/** Memo prevents re-renders on parent state churn. Active states inside come
 *  from `useEditorState`, which subscribes to the editor directly. */
export default memo(EditorToolbarComponent);
