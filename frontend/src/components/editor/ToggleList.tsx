/**
 * Toggle list — Notion-style collapsible block.
 *
 * Layout:
 *   toggleList (block, attr open=bool)
 *     toggleSummary (inline*, always-visible title row)
 *     toggleContent (block+,  body, hidden when open=false)
 *
 * The chevron is a button rendered inside a `contenteditable=false` span and
 * wired via a native capture-phase listener on the button itself. This fires
 * BEFORE ProseMirror's bubble-phase listener on `view.dom`, so the click is
 * never interpreted as a NodeSelection / caret move. The `open` attribute
 * lives on the node — toggling updates the doc, autosaves, and survives reload.
 * We deliberately avoid native <details>/<summary>: their built-in click
 * handlers fight with ProseMirror selection.
 *
 * Visual:
 *   - closed: ▶ Title
 *   - open:   ▼ Title
 *               body…
 *   Empty title shows a "Toggle" placeholder via the Placeholder extension.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

function ToggleListView({ node, getPos, editor }: any) {
  const [isOpen, setIsOpen] = useState<boolean>(node.attrs.open !== false);
  useEffect(() => { setIsOpen(node.attrs.open !== false); }, [node.attrs.open]);

  // Refs keep the native listener's closure stable across re-renders.
  const isOpenRef = useRef(isOpen);  isOpenRef.current = isOpen;
  const nodeRef   = useRef(node);    nodeRef.current   = node;
  const editorRef = useRef(editor);  editorRef.current = editor;
  const getPosRef = useRef(getPos);  getPosRef.current = getPos;
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Native capture-phase listener — runs at the target BEFORE any bubble
  // listener up the tree (including ProseMirror's on view.dom).
  // stopImmediatePropagation kills the event there so React's delegated
  // onClick at the root container never fires — no double-toggle.
  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const onMouseDown = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const onClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const next = !isOpenRef.current;
      setIsOpen(next);
      const gp = getPosRef.current;
      if (typeof gp !== 'function') return;
      const pos = gp();
      if (typeof pos !== 'number') return;
      const tr = editorRef.current.state.tr.setNodeMarkup(pos, undefined, {
        ...nodeRef.current.attrs,
        open: next,
      });
      tr.setMeta('addToHistory', false);
      editorRef.current.view.dispatch(tr);
    };
    btn.addEventListener('mousedown', onMouseDown, { capture: true });
    btn.addEventListener('click',     onClick,     { capture: true });
    return () => {
      btn.removeEventListener('mousedown', onMouseDown, { capture: true });
      btn.removeEventListener('click',     onClick,     { capture: true });
    };
  }, []);

  return (
    <NodeViewWrapper className="editor-toggle" data-open={isOpen ? 'true' : 'false'}>
      <span className="editor-toggle__chevron-cell" contentEditable={false}>
        <button
          ref={buttonRef}
          type="button"
          className="editor-toggle__chevron"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse toggle' : 'Expand toggle'}
          tabIndex={-1}
          style={!editor?.isEditable ? { pointerEvents: 'none' } : undefined}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
      <NodeViewContent className="editor-toggle__inner" />
    </NodeViewWrapper>
  );
}

export const ToggleList = Node.create({
  name: 'toggleList',
  group: 'block',
  content: 'toggleSummary toggleContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-open') !== 'false',
        renderHTML: (attrs) => ({ 'data-open': attrs.open === false ? 'false' : 'true' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-toggle-list]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toggle-list': '', class: 'editor-toggle' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleListView);
  },

  addCommands() {
    return {
      insertToggleList:
        () =>
        ({ chain }: any) =>
          chain()
            .insertContent({
              type: 'toggleList',
              attrs: { open: true },
              content: [
                { type: 'toggleSummary' },
                { type: 'toggleContent', content: [{ type: 'paragraph' }] },
              ],
            })
            .run(),
    } as any;
  },

  /**
   * Backspace / Delete at the start of an EMPTY toggleSummary removes the
   * whole toggleList in one keystroke. Matches Notion. Without this, the
   * `defining` flag on toggleList traps the caret in a structure the user
   * can't dismantle through normal text-editing keys.
   */
  addKeyboardShortcuts() {
    const dropToggleIfEmptySummary = (): boolean => {
      const editor = this.editor;
      const { $from, empty } = editor.state.selection;
      if (!empty) return false;
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name !== 'toggleSummary') continue;
        if (node.content.size > 0) return false;
        if ($from.parentOffset !== 0) return false;
        for (let dd = d - 1; dd >= 0; dd--) {
          const outer = $from.node(dd);
          if (outer.type.name !== 'toggleList') continue;
          const pos = $from.before(dd);
          editor.chain().focus()
            .deleteRange({ from: pos, to: pos + outer.nodeSize })
            .run();
          return true;
        }
        return false;
      }
      return false;
    };
    return {
      Backspace: dropToggleIfEmptySummary,
      Delete:    dropToggleIfEmptySummary,
    };
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  // No `defining: true` — without it, ProseMirror's replaceRange can "open"
  // pasted content into this node when the user pastes at a deeper level.
  // Structural integrity is enforced by the parent ToggleList's
  // `toggleSummary toggleContent` content rule + its own `defining: true`.

  addAttributes() {
    return {
      // Heading size of the toggle title: null = normal, 1/2/3 = h1/h2/h3.
      // The summary stays an `inline*` node (a heading is block-level and
      // can't live here), so the level is presentational — applied via a
      // `data-level` attribute and sized in CSS to match real headings.
      level: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-level');
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attrs) => (attrs.level ? { 'data-level': String(attrs.level) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-toggle-summary]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toggle-summary': '', class: 'editor-toggle__summary' }),
      0,
    ];
  },

  /**
   * Enter in the toggle title creates a new empty paragraph AFTER the whole
   * toggleList and moves the caret there. This is the "escape from toggle"
   * keystroke. It does NOT open a closed toggle (the previous version did —
   * but that surprised users who were typing between two closed toggles and
   * just wanted vertical space). To add body content, click into the body or
   * use ArrowDown.
   *
   * Without this override, ProseMirror's default Enter would try to split
   * toggleSummary, which the schema (`toggleSummary toggleContent` on the
   * parent) forbids — so the key either no-ops or kicks a sibling out.
   */
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const editor = this.editor;
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;
        if ($from.parent.type.name !== 'toggleSummary') return false;
        for (let d = $from.depth - 1; d >= 0; d--) {
          const toggleList = $from.node(d);
          if (toggleList.type.name !== 'toggleList') continue;
          const after = $from.before(d) + toggleList.nodeSize;
          editor.chain().focus()
            .insertContentAt(after, { type: 'paragraph' })
            .setTextSelection(after + 1)
            .run();
          return true;
        }
        return false;
      },
    };
  },
});

export const ToggleContent = Node.create({
  name: 'toggleContent',
  content: 'block+',
  // No `defining: true` — see ToggleSummary above for the same rationale
  // (paste of block-level content must be able to flow into here).

  parseHTML() {
    return [{ tag: 'div[data-toggle-content]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-toggle-content': '', class: 'editor-toggle__body' }),
      0,
    ];
  },
});

export const ToggleListBundle = [ToggleList, ToggleSummary, ToggleContent];

export type HeadingLevel = 1 | 2 | 3;

/** Whether the H1/H2/H3 control should read as active for `level`. Inside a
 *  toggle summary this reflects the summary's `level` attribute; elsewhere it
 *  reflects a real heading node. */
export function isHeadingLevelActive(editor: Editor, level: HeadingLevel): boolean {
  if (editor.isActive('toggleSummary')) {
    return editor.getAttributes('toggleSummary').level === level;
  }
  return editor.isActive('heading', { level });
}

/** Apply an H1/H2/H3 control. Inside a toggle summary it sets/clears the
 *  summary's presentational `level` (a heading node can't nest in `inline*`
 *  content); elsewhere it toggles a normal heading. Toggling the active level
 *  off returns the summary to normal text size. */
export function applyHeadingLevel(editor: Editor, level: HeadingLevel): void {
  if (editor.isActive('toggleSummary')) {
    const cur = (editor.getAttributes('toggleSummary').level ?? null) as HeadingLevel | null;
    const next = cur === level ? null : level;
    editor.chain().focus().command(({ tr, state }) => {
      const { $from } = state.selection;
      for (let d = $from.depth; d >= 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'toggleSummary') {
          tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, level: next });
          return true;
        }
      }
      return false;
    }).run();
    return;
  }
  editor.chain().focus().toggleHeading({ level }).run();
}
