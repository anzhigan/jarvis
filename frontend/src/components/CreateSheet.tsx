import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

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
  const kbHeight = useKeyboardHeight();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) { setError(''); setSaving(false); return; }
    if (!isMobile) return;
    // Delay focus until after the sheet slide-up animation (280ms) so iOS
    // treats it as user-initiated and correctly repositions the viewport
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
        transition: { type: 'tween' as const, duration: 0.28, ease: [0, 0, 0.2, 1] },
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
          style={isMobile ? { paddingBottom: kbHeight, transition: 'padding-bottom 0.2s ease' } : undefined}
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
