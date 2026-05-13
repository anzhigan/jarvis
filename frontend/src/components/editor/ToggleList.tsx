/**
 * Toggle list — Notion-style collapsible block.
 *
 * Layout:
 *   toggleList (block, attr open=bool)
 *     toggleSummary (inline*, the always-visible title row)
 *     toggleContent (block+,  the body, hidden when open=false)
 *
 * The chevron is rendered by a React NodeView as a separate, contenteditable=false
 * button so clicking it doesn't move the caret into ProseMirror. The `open`
 * attribute lives on the node — toggling updates the doc, gets autosaved, and
 * survives reload. We deliberately avoid native <details>/<summary>: those
 * elements have built-in click handlers that fight with ProseMirror selection.
 *
 * Visual behavior:
 *   - closed: ▶ Title
 *   - open:   ▼ Title
 *               body…
 *   - empty title shows a "Toggle" placeholder.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';

function ToggleListView({ node, getPos, editor }: any) {
  // Local state for INSTANT visual feedback. We don't trust Tiptap's React
  // adapter to re-render on every attr change — it sometimes re-uses the
  // same node reference, so the prop-driven view stays stuck on stale attrs.
  const [isOpen, setIsOpen] = useState<boolean>(node.attrs.open !== false);
  useEffect(() => {
    setIsOpen(node.attrs.open !== false);
  }, [node.attrs.open]);

  // Refs read by the native event listener (which has stable identity).
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nodeRef = useRef(node);
  nodeRef.current = node;

  // ⚠️ React onClick fires DURING the bubble phase at React's root container,
  // which is HIGHER in the DOM tree than ProseMirror's `view.dom` listener
  // (also bubble phase). ProseMirror sees the event FIRST and may stop it
  // (NodeSelection / focus shuffling) before React's handler ever runs.
  //
  // Fix: attach a native click listener directly on the button in CAPTURE
  // phase + stopImmediatePropagation. This fires at the target (button) before
  // anything bubbles up, and immediately kills further propagation. No
  // ProseMirror listener gets to see the click.
  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    if (!editor?.isEditable) return;

    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const next = !isOpenRef.current;
      setIsOpen(next);
      if (typeof getPos !== 'function') return;
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
        ...nodeRef.current.attrs,
        open: next,
      });
      tr.setMeta('addToHistory', false);
      editor.view.dispatch(tr);
    };

    // Capture: true → run BEFORE any ancestor bubble listeners.
    // mousedown handler keeps the caret from jumping to the button.
    btn.addEventListener('mousedown', swallow, { capture: true });
    btn.addEventListener('click',     onClick, { capture: true });
    return () => {
      btn.removeEventListener('mousedown', swallow, { capture: true });
      btn.removeEventListener('click',     onClick, { capture: true });
    };
  }, [editor, getPos]);

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
   * Keyboard ergonomics:
   *   • Backspace at start of an EMPTY toggleSummary
   *   • Delete at start of an EMPTY toggleSummary  (forward delete)
   * Both delete the entire toggleList. This matches Notion: hit Backspace
   * on an unwanted toggle and it goes away in one keystroke. Without this,
   * `defining`+`isolating` on the toggleList block prevents the default
   * delete behavior, so users get stuck.
   */
  addKeyboardShortcuts() {
    const deleteHostToggleIfEmptySummary = (): boolean => {
      const editor = this.editor;
      const { state } = editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $from = selection.$from;
      // Walk up the ancestor chain until we find toggleSummary; verify it's
      // empty AND that the caret is at offset 0 (start of summary).
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (node.type.name === 'toggleSummary') {
          if (node.content.size > 0) return false;
          if ($from.parentOffset !== 0) return false;
          // Find the enclosing toggleList one level up.
          for (let dd = d - 1; dd >= 0; dd--) {
            const outer = $from.node(dd);
            if (outer.type.name === 'toggleList') {
              const pos = $from.before(dd);
              editor
                .chain()
                .focus()
                .deleteRange({ from: pos, to: pos + outer.nodeSize })
                .run();
              return true;
            }
          }
          return false;
        }
      }
      return false;
    };
    return {
      Backspace: deleteHostToggleIfEmptySummary,
      Delete:    deleteHostToggleIfEmptySummary,
    };
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,

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
   * Enter in the toggle's title jumps to the body (and opens the toggle if it
   * was collapsed) — matches Notion. Without this, ProseMirror's default Enter
   * tries to split toggleSummary, which the schema (`toggleSummary toggleContent`)
   * forbids, so the keystroke either does nothing or pushes a sibling out of
   * the toggleList — confusing.
   */
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const editor = this.editor;
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parent.type.name !== 'toggleSummary') return false;

        // Find the enclosing toggleList and the position math we'll need.
        for (let d = $from.depth - 1; d >= 0; d--) {
          const toggleList = $from.node(d);
          if (toggleList.type.name !== 'toggleList') continue;
          const listPos = $from.before(d);
          const summaryNode = toggleList.child(0);   // toggleSummary
          // Position INSIDE the first paragraph of toggleContent.
          //   listPos              — before toggleList opens
          //   +1                   — inside toggleList (before summary)
          //   +summaryNode.nodeSize — skip past summary
          //   +1                   — inside toggleContent (before first child)
          //   +1                   — inside that first child (offset 0)
          const target = listPos + 1 + summaryNode.nodeSize + 1 + 1;

          editor
            .chain()
            .focus()
            .command(({ tr }) => {
              if (toggleList.attrs.open === false) {
                tr.setNodeMarkup(listPos, undefined, { ...toggleList.attrs, open: true });
              }
              return true;
            })
            .setTextSelection(target)
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
  defining: true,

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
