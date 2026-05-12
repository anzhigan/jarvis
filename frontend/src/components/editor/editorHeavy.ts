/**
 * Lazy-loaded heavy editor dependencies — KaTeX and Lowlight + 9 highlight.js
 * languages. Imported via dynamic import() so Vite splits them into a separate
 * chunk that is only fetched when the user actually opens a note for editing,
 * keeping the main JS bundle slim.
 */
import type { Extension } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CodeBlockView from './CodeBlockView';

export interface EditorHeavy {
  /** Configured CodeBlockLowlight extension instance ready to drop into useEditor. */
  codeBlockExtension: Extension;
  /** KaTeX instance for `renderToString` calls inside InlineMath node-view. */
  katex: typeof import('katex').default;
}

let cache: EditorHeavy | null = null;
let pending: Promise<EditorHeavy> | null = null;

export function loadEditorHeavy(): Promise<EditorHeavy> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    const [
      cblMod, lowlightMod, katexMod,
      bashMod, cssMod, jsMod, jsonMod, pyMod, sqlMod, tsMod, xmlMod, yamlMod,
    ] = await Promise.all([
      import('@tiptap/extension-code-block-lowlight'),
      import('lowlight'),
      import('katex'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/yaml'),
    ]);
    // CSS: dynamic imports get their own chunk side-effects.
    await Promise.all([
      import('katex/dist/katex.min.css'),
      import('highlight.js/styles/github-dark.css'),
    ]);

    const lowlight = lowlightMod.createLowlight();
    // Same set of grammars the editor previously registered eagerly (~9 langs
    // out of highlight.js's ~190 — keeps the chunk small).
    lowlight.register({
      bash: bashMod.default,
      css: cssMod.default,
      javascript: jsMod.default,
      json: jsonMod.default,
      python: pyMod.default,
      sql: sqlMod.default,
      typescript: tsMod.default,
      xml: xmlMod.default,
      yaml: yamlMod.default,
    });
    lowlight.registerAlias({ javascript: ['js'], typescript: ['ts'], xml: ['html'] });

    cache = {
      // React NodeView gives us a language picker, copy button, and collapse
      // toggle around the code. Lowlight's syntax highlighting runs as
      // ProseMirror decorations on the contentDOM, so it's unaffected by the
      // NodeView override.
      codeBlockExtension: cblMod.CodeBlockLowlight
        .configure({
          lowlight,
          HTMLAttributes: { class: 'editor-code-block' },
        })
        .extend({
          addNodeView() {
            return ReactNodeViewRenderer(CodeBlockView);
          },
        }) as unknown as Extension,
      katex: katexMod.default,
    };
    return cache;
  })();
  return pending;
}

/** Synchronous lookup — returns the cached katex instance once
 *  loadEditorHeavy() has resolved. Used by the InlineMath node-view which
 *  needs to render synchronously. */
export function getKatex(): typeof import('katex').default | null {
  return cache?.katex ?? null;
}

/** Begin loading without awaiting — used to prefetch when an editor
 *  parent component mounts so the chunk arrives ahead of focus. */
export function prefetchEditorHeavy(): void {
  void loadEditorHeavy();
}
