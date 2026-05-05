import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2 } from 'lucide-react';

interface CreateSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  primaryLabel: string;
  onSubmit: () => Promise<void>;
  canSubmit: boolean;
  children: React.ReactNode;
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="form-field">
      <label className="form-field-label">{label}</label>
      {children}
    </div>
  );
}

export default function CreateSheet({
  open, onClose, title, primaryLabel, onSubmit, canSubmit, children,
}: CreateSheetProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) { setError(''); setSaving(false); return; }
    if (!isMobile) return;
    // Lock body scroll so iOS Safari doesn't scroll the page when focusing
    // an input inside the sheet — which would cause position:fixed elements
    // to visually shift upward past the top of the viewport.
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    if (!isMobile) return;
    // Delay focus until after the sheet slide-up animation so iOS treats it
    // as user-initiated and doesn't trigger aggressive scroll-to-focus.
    const timer = setTimeout(() => {
      const el = sheetRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      el?.focus();
    }, 320);
    return () => clearTimeout(timer);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit();
    } catch (e: any) {
      setError(e?.detail ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="create-sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            ref={sheetRef}
            className="create-sheet"
            {...sheetMotion}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-sheet-header">
              <div className="create-sheet-drag-handle" />
              <div className="create-sheet-header-row">
                <span className="create-sheet-title">{title}</span>
                <button className="icon-btn" type="button" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="create-sheet-body">
              <div className="form-fields">
                {children}
              </div>
            </div>

            <div className="create-sheet-footer">
              {error && <div className="create-sheet-error">{error}</div>}
              <div className="create-sheet-footer-row">
                <button className="btn btn-secondary" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!canSubmit || saving}
                  onClick={handleSubmit}
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {primaryLabel}
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
