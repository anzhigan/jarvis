/**
 * TableInsertSheet — bottom sheet with a visual grid for picking the size of
 * the table to insert (Word/Notion style — hover/tap to highlight rows×cols).
 * Always includes a header-row toggle.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check } from 'lucide-react';

const MAX_ROWS = 8;
const MAX_COLS = 10;

interface Props {
  open: boolean;
  onCancel: () => void;
  onInsert: (rows: number, cols: number, withHeader: boolean) => void;
}

export default function TableInsertSheet({ open, onCancel, onInsert }: Props) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [withHeader, setWithHeader] = useState(true);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (open) { setRows(3); setCols(3); setWithHeader(true); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

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
                <span className="create-sheet-title">Insert table</span>
                <button aria-label="Close" type="button" className="icon-btn" onClick={onCancel}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="create-sheet-body">
              <div className="form-fields">
                <div className="form-field">
                  <label className="form-field-label">{rows} × {cols}</label>
                  <div
                    className="table-grid"
                    role="grid"
                    aria-label={`Pick table size, currently ${rows} rows by ${cols} columns`}
                    onMouseLeave={() => { /* keep last selection */ }}
                  >
                    {Array.from({ length: MAX_ROWS }).map((_, r) => (
                      <div key={r} className="table-grid-row">
                        {Array.from({ length: MAX_COLS }).map((_, c) => (
                          <button
                            key={c}
                            type="button"
                            className="table-grid-cell"
                            data-active={r < rows && c < cols ? 'true' : undefined}
                            aria-label={`${r + 1} rows by ${c + 1} columns`}
                            onMouseEnter={() => { setRows(r + 1); setCols(c + 1); }}
                            onTouchStart={() => { setRows(r + 1); setCols(c + 1); }}
                            onClick={() => { setRows(r + 1); setCols(c + 1); }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <label
                    className="form-field-label"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={withHeader}
                      onChange={(e) => setWithHeader(e.target.checked)}
                    />
                    Include header row
                  </label>
                </div>
              </div>
            </div>

            <div className="create-sheet-footer">
              <div className="create-sheet-footer-row">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onInsert(rows, cols, withHeader)}
                >
                  <Check size={14} /> Insert {rows}×{cols}
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
