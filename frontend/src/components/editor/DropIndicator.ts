/**
 * Block-shaped drop indicator for the Tiptap editor.
 *
 * The built-in `prosemirror-dropcursor` draws a thin coloured line at the
 * insertion point and is absolutely-positioned — it does not occupy
 * layout space, so neighbour blocks never visibly "make room" for the
 * dragged item. This plugin replaces that with a widget Decoration: a
 * real div inserted into the editor DOM at the candidate drop position.
 * Because it's in flow, it pushes whatever block follows DOWN by its
 * own height — that's the "neighbour shifts down" feel the user asked
 * for. Styled via `.pm-drop-target` in editor.css.
 *
 * Tracks dragover at the editor level, snaps the candidate position to
 * the nearest TOP-LEVEL block boundary (paragraph/heading/etc.) so the
 * widget always lands cleanly between blocks rather than mid-text.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const META_KEY = 'dropIndicatorPos';
const pluginKey = new PluginKey<{ pos: number | null }>('dropIndicator');

interface PluginState {
  pos: number | null;
}

export const DropIndicator = Extension.create({
  name: 'dropIndicator',

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key: pluginKey,
        state: {
          init: (): PluginState => ({ pos: null }),
          apply(tr, oldState): PluginState {
            const meta = tr.getMeta(META_KEY);
            if (meta === undefined) return oldState;
            // null clears, number sets
            return { pos: typeof meta === 'number' ? meta : null };
          },
        },
        props: {
          decorations(state) {
            const ps = pluginKey.getState(state);
            const pos = ps?.pos;
            if (pos === null || pos === undefined) return null;
            const widget = Decoration.widget(
              pos,
              () => {
                const el = document.createElement('div');
                el.className = 'pm-drop-target';
                return el;
              },
              { side: -1, key: 'pm-drop-target' },
            );
            return DecorationSet.create(state.doc, [widget]);
          },
          handleDOMEvents: {
            dragover(view, event) {
              if (!event.dataTransfer) return false;
              const coords = { left: event.clientX, top: event.clientY };
              const hit = view.posAtCoords(coords);
              if (!hit) return false;
              // Snap to a TOP-LEVEL block boundary — find the depth-1
              // ancestor and use its start/end as the candidate position
              // (whichever is closer to the pointer's Y).
              const $pos = view.state.doc.resolve(hit.pos);
              if ($pos.depth === 0) return false;
              const blockStart = $pos.start(1);
              const blockEnd = $pos.end(1);
              const blockDOM = view.nodeDOM($pos.before(1)) as HTMLElement | null;
              let target = blockStart;
              if (blockDOM) {
                const rect = blockDOM.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                target = coords.top < mid ? $pos.before(1) : $pos.after(1);
              } else {
                target = coords.top < (hit.inside ?? 0) ? blockStart : blockEnd;
              }
              const current = pluginKey.getState(view.state)?.pos;
              if (current !== target) {
                view.dispatch(view.state.tr.setMeta(META_KEY, target));
              }
              return false;
            },
            dragleave(view, event) {
              // Only clear when the pointer actually leaves the editor —
              // dragleave fires for every child transition otherwise.
              const related = event.relatedTarget as Node | null;
              if (related && (view.dom as HTMLElement).contains(related)) return false;
              view.dispatch(view.state.tr.setMeta(META_KEY, null));
              return false;
            },
            drop(view) {
              view.dispatch(view.state.tr.setMeta(META_KEY, null));
              return false;
            },
            dragend(view) {
              view.dispatch(view.state.tr.setMeta(META_KEY, null));
              return false;
            },
          },
        },
      }),
    ];
  },
});
