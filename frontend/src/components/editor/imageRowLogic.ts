/**
 * Pure logic for the "drag one image onto another → side-by-side imageRow"
 * feature. Kept DOM-free (no React, no EditorView) so it can be unit-tested
 * headlessly; RichTextEditor wires it to the actual drop event.
 */
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode, Slice } from '@tiptap/pm/model';

export const MAX_ROW_IMAGES = 2;

export type ImageTarget = {
  kind: 'image' | 'imageRow';
  node: PMNode;
  pos: number;
};

/** True when the dragged slice is exactly one `image` node. */
export function singleDraggedImage(slice: Slice): boolean {
  const c = slice.content;
  return c.childCount === 1 && c.firstChild?.type.name === 'image';
}

function asTarget(node: PMNode | null | undefined, pos: number): ImageTarget | null {
  if (node?.type.name === 'image') return { kind: 'image', node, pos };
  if (node?.type.name === 'imageRow') return { kind: 'imageRow', node, pos };
  return null;
}

/** Find an `image`/`imageRow` at a single document position. Checks: the node
 *  that starts exactly here, any wrapping imageRow, then the gap neighbours. */
export function imageTargetAtPos(doc: PMNode, pos: number): ImageTarget | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  // Node that *starts* at this position (posAtCoords `inside` lands here for a
  // leaf like an image — the reliable path for nested cases such as toggles).
  const direct = asTarget(doc.nodeAt(clamped), clamped);
  if (direct) return direct;

  const $pos = doc.resolve(clamped);
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'imageRow') return { kind: 'imageRow', node, pos: $pos.before(d) };
  }
  const after = asTarget($pos.nodeAfter, $pos.pos);
  if (after) return after;
  const before = $pos.nodeBefore;
  if (before) {
    const t = asTarget(before, $pos.pos - before.nodeSize);
    if (t) return t;
  }
  return null;
}

/** Resolve the drop target from posAtCoords output — prefer `inside` (the node
 *  directly under the cursor, works through nesting like toggles) then `pos`. */
export function imageTargetAt(
  doc: PMNode,
  coords: { pos: number; inside: number },
): ImageTarget | null {
  if (coords.inside >= 0) {
    const t = imageTargetAtPos(doc, coords.inside);
    if (t) return t;
  }
  return imageTargetAtPos(doc, coords.pos);
}

/** The imageRow (start/end range) that directly contains `pos`, if any. */
function containingRow(doc: PMNode, pos: number): { start: number; end: number } | null {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).type.name === 'imageRow') {
      const start = $pos.before(d);
      return { start, end: start + $pos.node(d).nodeSize };
    }
  }
  return null;
}

/**
 * Build the transaction that fuses the dragged image into `target` (an image →
 * new row of two; a not-full row → appended). Returns null when the merge
 * shouldn't happen (self-drop, full row, or same-row reorder — which would
 * nest an imageRow inside an imageRow). Pure: no dispatch, no DOM.
 */
export function mergeImagesTr(
  state: EditorState,
  sourcePos: number,
  draggedNode: PMNode,
  target: ImageTarget,
): Transaction | null {
  // Dropped onto itself.
  if (target.pos === sourcePos) return null;
  // Row already full — don't overfill.
  if (target.kind === 'imageRow' && target.node.childCount >= MAX_ROW_IMAGES) return null;
  // Same-row guard: source already in the row being dropped onto/into.
  const srcRow = containingRow(state.doc, sourcePos);
  if (srcRow && target.pos >= srcRow.start && target.pos < srcRow.end) return null;

  const { schema } = state;
  const tr = state.tr;
  // Remove the source first, then map the target through that deletion so its
  // position stays correct whether it was before or after the source.
  tr.delete(sourcePos, sourcePos + draggedNode.nodeSize);
  const tPos = tr.mapping.map(target.pos);
  const tNode = tr.doc.nodeAt(tPos);
  if (!tNode) return null;

  if (tNode.type.name === 'image') {
    // New pair starts balanced (splitPct null → 50/50).
    const row = schema.nodes.imageRow.create(null, [tNode, draggedNode]);
    tr.replaceRangeWith(tPos, tPos + tNode.nodeSize, row);
  } else if (tNode.type.name === 'imageRow') {
    // Append inside the row, just before its closing token.
    tr.insert(tPos + tNode.nodeSize - 1, draggedNode);
  } else {
    return null;
  }
  return tr;
}
