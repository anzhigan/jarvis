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

function ToggleListView({ node, updateAttributes, editor }: any) {
  const isOpen = node.attrs.open !== false;
  const onToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    updateAttributes({ open: !isOpen });
  };
  return (
    <NodeViewWrapper className="editor-toggle" data-open={isOpen ? 'true' : 'false'}>
      <button
        type="button"
        contentEditable={false}
        className="editor-toggle__chevron"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Collapse toggle' : 'Expand toggle'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        // Hide from non-editable views in a clean way: button still in DOM
        // so layout stays stable, but pointer-events disabled.
        style={!editor?.isEditable ? { pointerEvents: 'none' } : undefined}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <NodeViewContent className="editor-toggle__inner" />
    </NodeViewWrapper>
  );
}

export const ToggleList = Node.create({
  name: 'toggleList',
  group: 'block',
  content: 'toggleSummary toggleContent',
  defining: true,
  isolating: true,

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
