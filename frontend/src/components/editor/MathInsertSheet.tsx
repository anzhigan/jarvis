/**
 * MathInsertSheet — bottom sheet for inserting a LaTeX formula.
 * UI: live KaTeX preview + a soft "math keyboard" (greek, fractions, sqrt,
 * sum/integral, super/sub, etc.) that types snippets into the underlying
 * textarea. Users can still type raw LaTeX directly in the textarea.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';
import katex from 'katex';

interface Snippet {
  /** What's typed into the textarea. `|` marks where the cursor lands; `~` marks
   * the start of an optional selection. Falls back to plain text if neither. */
  insert: string;
  label: string;  // visible button label (will be KaTeX-rendered)
  title?: string; // accessible name
}

const ROWS: Snippet[][] = [
  [
    { insert: '\\frac{|}{}', label: '\\frac{a}{b}' },
    { insert: '\\sqrt{|}', label: '\\sqrt{x}' },
    { insert: '|^{}', label: 'x^{n}' },
    { insert: '|_{}', label: 'x_{n}' },
    { insert: '\\sum_{|}^{}', label: '\\sum' },
    { insert: '\\int_{|}^{}', label: '\\int' },
    { insert: '\\lim_{| \\to }', label: '\\lim' },
    { insert: '\\binom{|}{}', label: '\\binom{n}{k}' },
  ],
  [
    { insert: '\\alpha|', label: '\\alpha' },
    { insert: '\\beta|', label: '\\beta' },
    { insert: '\\gamma|', label: '\\gamma' },
    { insert: '\\delta|', label: '\\delta' },
    { insert: '\\theta|', label: '\\theta' },
    { insert: '\\lambda|', label: '\\lambda' },
    { insert: '\\mu|', label: '\\mu' },
    { insert: '\\pi|', label: '\\pi' },
    { insert: '\\sigma|', label: '\\sigma' },
    { insert: '\\phi|', label: '\\phi' },
    { insert: '\\omega|', label: '\\omega' },
  ],
  [
    { insert: '\\leq|', label: '\\leq' },
    { insert: '\\geq|', label: '\\geq' },
    { insert: '\\neq|', label: '\\neq' },
    { insert: '\\approx|', label: '\\approx' },
    { insert: '\\to|', label: '\\to' },
    { insert: '\\infty|', label: '\\infty' },
    { insert: '\\cdot|', label: '\\cdot' },
    { insert: '\\times|', label: '\\times' },
    { insert: '\\pm|', label: '\\pm' },
  ],
];

interface Props {
  open: boolean;
  initial?: string;
  onCancel: () => void;
  onInsert: (latex: string) => void;
}

export default function MathInsertSheet({ open, initial = '', onCancel, onInsert }: Props) {
  const [value, setValue] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (open) {
      setValue(initial);
      const t = window.setTimeout(() => taRef.current?.focus(), 320);
      return () => window.clearTimeout(t);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const insertSnippet = (snip: string) => {
    const ta = taRef.current;
    if (!ta) {
      setValue((v) => v + snip.replace(/\|/g, ''));
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const cursorIdx = snip.indexOf('|');
    const cleanSnip = snip.replace('|', '');
    const next = value.slice(0, start) + cleanSnip + value.slice(end);
    setValue(next);
    // Place caret where `|` was (or at end of inserted snippet).
    const newPos = start + (cursorIdx >= 0 ? cursorIdx : cleanSnip.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    });
  };

  const preview = (() => {
    if (!value.trim()) return '<span style="color: var(--ink-4)">Preview</span>';
    try {
      return katex.renderToString(value, { throwOnError: false, displayMode: true });
    } catch {
      return '<span style="color: var(--rust)">Invalid LaTeX</span>';
    }
  })();

  const sheetMotion = isMobile
    ? {
        initial: { y: '100%' } as const,
        animate: { y: 0 } as const,
        exit: { y: '100%' } as const,
        transition: { type: 'tween' as const, duration: 0.28, ease: 'easeOut' as const },
      }
    : {
        initial: { opacity: 0, scale: 0.96 } as const,
        animate: { opacity: 1, scale: 1 } as const,
        exit: { opacity: 0, scale: 0.96 } as const,
        transition: { duration: 0.2 },
      };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="create-sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div className="create-sheet" {...sheetMotion} onClick={(e) => e.stopPropagation()}>
            <div className="create-sheet-header">
              <div className="create-sheet-drag-handle" />
              <div className="create-sheet-header-row">
                <span className="create-sheet-title">Insert formula</span>
                <button aria-label="Close" type="button" className="icon-btn" onClick={onCancel}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="create-sheet-body">
              <div className="form-fields">
                <div className="form-field">
                  <label className="form-field-label">Preview</label>
                  <div
                    className="math-preview"
                    dangerouslySetInnerHTML={{ __html: preview }}
                  />
                </div>

                <div className="form-field">
                  <label className="form-field-label">LaTeX</label>
                  <textarea
                    ref={taRef}
                    className="textarea w-full"
                    rows={3}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (value.trim()) onInsert(value.trim());
                      }
                    }}
                    placeholder="x^2 + y^2 = z^2"
                  />
                </div>

                <div className="form-field">
                  <label className="form-field-label">Symbols</label>
                  <div className="math-keyboard">
                    {ROWS.map((row, i) => (
                      <div key={i} className="math-keyboard-row">
                        {row.map((snip) => (
                          <button
                            key={snip.insert}
                            type="button"
                            className="math-key"
                            title={snip.title ?? snip.label}
                            onClick={() => insertSnippet(snip.insert)}
                            dangerouslySetInnerHTML={{
                              __html: katex.renderToString(snip.label, { throwOnError: false }),
                            }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="create-sheet-footer">
              <div className="create-sheet-footer-row">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!value.trim()}
                  onClick={() => onInsert(value.trim())}
                >
                  <Check size={14} /> Insert
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
