/**
 * Toggle list — Notion-style collapsible block built on the native HTML5
 * `<details>` / `<summary>` pair so the browser handles expand/collapse
 * without any JS. Serializes round-trip as plain `<details>` HTML, so it
 * survives copy-paste and public-share rendering.
 *
 * Structure:
 *   <details data-toggle-list> (block, defining)
 *     <summary>             (inline*, the toggle label)
 *     <div data-toggle-content>   (block+, the collapsible body)
 *
 * The command `insertToggleList` inserts the whole skeleton with an empty
 * summary and an empty paragraph inside so the cursor has somewhere to land.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const ToggleList = Node.create({
  name: 'toggleList',
  group: 'block',
  content: 'toggleSummary toggleContent',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'details[data-toggle-list]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // `open` is set on insert so the user immediately sees where to type.
    // It's a serialized HTML attribute — public share/static render will
    // render the toggle in its persisted open/closed state.
    return ['details', mergeAttributes(HTMLAttributes, { 'data-toggle-list': '', class: 'editor-toggle' }), 0];
  },

  addCommands() {
    return {
      insertToggleList:
        () =>
        ({ chain }: any) =>
          chain()
            .insertContent({
              type: 'toggleList',
              attrs: { open: 'true' },
              content: [
                { type: 'toggleSummary' },
                { type: 'toggleContent', content: [{ type: 'paragraph' }] },
              ],
            })
            .run(),
    } as any;
  },

  addAttributes() {
    return {
      open: {
        default: 'true',
        parseHTML: (element) => (element.hasAttribute('open') ? 'true' : null),
        renderHTML: (attributes) => (attributes.open ? { open: 'true' } : {}),
      },
    };
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes, { class: 'editor-toggle-summary' }), 0];
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
      mergeAttributes(HTMLAttributes, { 'data-toggle-content': '', class: 'editor-toggle-content' }),
      0,
    ];
  },
});

export const ToggleListBundle = [ToggleList, ToggleSummary, ToggleContent];
