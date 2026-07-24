import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import { imageTargetAtPos, imageTargetAt, mergeImagesTr } from './imageRowLogic';

// A schema that mirrors the app's relevant nodes: block-level atom `image`,
// an `imageRow` holding `image+`, and a Notion-style toggle whose body
// (`toggleContent`) accepts any block — so an imageRow is valid inside it.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: {
      group: 'block',
      atom: true,
      selectable: false,
      draggable: true,
      attrs: { src: { default: null } },
      toDOM: () => ['img'],
    },
    imageRow: {
      group: 'block',
      content: 'image+',
      attrs: { splitPct: { default: null } },
      toDOM: () => ['div', { 'data-image-row': '' }, 0],
    },
    toggleSummary: { content: 'inline*', toDOM: () => ['div', 0] },
    toggleContent: { content: 'block+', toDOM: () => ['div', 0] },
    toggleList: {
      group: 'block',
      content: 'toggleSummary toggleContent',
      toDOM: () => ['div', { 'data-toggle-list': '' }, 0],
    },
  },
});

const img = (src: string) => schema.nodes.image.create({ src });
const stateOf = (doc: ReturnType<typeof schema.nodes.doc.create>) =>
  EditorState.create({ schema, doc });

/** Build: doc( toggleList( toggleSummary, toggleContent(imgA, imgB) ) ). */
function toggleWithTwoImages() {
  const doc = schema.nodes.doc.create(null, [
    schema.nodes.toggleList.create(null, [
      schema.nodes.toggleSummary.create(),
      schema.nodes.toggleContent.create(null, [img('a'), img('b')]),
    ]),
  ]);
  // Positions of the two images inside the toggle body.
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') positions.push(pos);
  });
  return { doc, aPos: positions[0], bPos: positions[1] };
}

describe('imageTargetAtPos', () => {
  it('finds an image nested inside a toggle', () => {
    const { doc, aPos, bPos } = toggleWithTwoImages();
    const a = imageTargetAtPos(doc, aPos);
    expect(a).toMatchObject({ kind: 'image', pos: aPos });
    const b = imageTargetAtPos(doc, bPos);
    expect(b).toMatchObject({ kind: 'image', pos: bPos });
  });

  it('resolves via posAtCoords `inside` too', () => {
    const { doc, aPos } = toggleWithTwoImages();
    expect(imageTargetAt(doc, { pos: aPos, inside: aPos })).toMatchObject({ pos: aPos });
    // inside = -1 falls back to pos
    expect(imageTargetAt(doc, { pos: aPos, inside: -1 })).toMatchObject({ pos: aPos });
  });
});

describe('mergeImagesTr — inside a toggle', () => {
  it('fuses two toggle images into a valid imageRow', () => {
    const { doc, aPos, bPos } = toggleWithTwoImages();
    const state = stateOf(doc);
    const target = imageTargetAtPos(doc, aPos)!;
    const draggedNode = doc.nodeAt(bPos)!;
    const tr = mergeImagesTr(state, bPos, draggedNode, target);
    expect(tr).not.toBeNull();

    const next = state.apply(tr!).doc;
    // Document is well-formed (throws if content rules are violated).
    expect(() => next.check()).not.toThrow();

    // The toggle body now holds exactly one imageRow with the two images.
    let rows = 0;
    let rowChildren = 0;
    let toggleImages = 0;
    next.descendants((node) => {
      if (node.type.name === 'imageRow') { rows++; rowChildren = node.childCount; }
      if (node.type.name === 'image') toggleImages++;
    });
    expect(rows).toBe(1);
    expect(rowChildren).toBe(2);
    expect(toggleImages).toBe(2);
  });
});

describe('mergeImagesTr — guards', () => {
  it('merges two top-level images', () => {
    const doc = schema.nodes.doc.create(null, [img('a'), img('b')]);
    let aPos = -1; let bPos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'image') { if (aPos < 0) aPos = pos; else bPos = pos; }
    });
    const state = stateOf(doc);
    const tr = mergeImagesTr(state, bPos, doc.nodeAt(bPos)!, imageTargetAtPos(doc, aPos)!);
    expect(tr).not.toBeNull();
    const next = state.apply(tr!).doc;
    expect(() => next.check()).not.toThrow();
  });

  it('refuses to nest a row inside a row (same-row drag)', () => {
    // doc( imageRow(imgA, imgB) )
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.imageRow.create(null, [img('a'), img('b')]),
    ]);
    const positions: number[] = [];
    doc.descendants((node, pos) => { if (node.type.name === 'image') positions.push(pos); });
    const state = stateOf(doc);
    // Drag image B onto image A — both already in the same row.
    const target = imageTargetAtPos(doc, positions[0])!;
    const tr = mergeImagesTr(state, positions[1], doc.nodeAt(positions[1])!, target);
    expect(tr).toBeNull();
  });

  it('does not overfill a full row', () => {
    // doc( imageRow(imgA, imgB), imgC )
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.imageRow.create(null, [img('a'), img('b')]),
      img('c'),
    ]);
    let rowPos = -1; let cPos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'imageRow') rowPos = pos;
      if (node.type.name === 'image' && node.attrs.src === 'c') cPos = pos;
    });
    const state = stateOf(doc);
    const target = { kind: 'imageRow' as const, node: doc.nodeAt(rowPos)!, pos: rowPos };
    const tr = mergeImagesTr(state, cPos, doc.nodeAt(cPos)!, target);
    expect(tr).toBeNull();
  });
});
