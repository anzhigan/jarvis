/**
 * InputDialog — small modal for collecting one or two text fields.
 * Visually consistent with CreateSheet / PickerSheet:
 *   • mobile: bottom sheet that slides up
 *   • desktop: centered card that fades in
 * Always rendered through `createPortal(document.body)` so it isn't
 * trapped by an ancestor `transform` / `overflow`.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Loader2 } from 'lucide-react';

export interface InputDialogField {
  key: string;
  label: string;
  type?: 'text' | 'url' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];  // for select
  autoFocus?: boolean;
  required?: boolean;
  helpText?: string;
}

interface Props {
  open: boolean;
  title: string;
  description?: string;
  fields: InputDialogField[];
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
  extraActions?: { label: string; onClick: () => void; variant?: 'default' | 'destructive' }[];
}

export default function InputDialog({
  open, title, description, fields, submitLabel = 'OK', cancelLabel = 'Cancel',
  onSubmit, onCancel, extraActions,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
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
      const initial: Record<string, string> = {};
      fields.forEach((f) => { initial[f.key] = f.defaultValue ?? ''; });
      setValues(initial);
      setSubmitting(false);
      // Defer focus until after the slide-up animation so iOS doesn't
      // aggressively scroll the page to bring the input into view.
      const t = window.setTimeout(() => firstFieldRef.current?.focus(), 320);
      return () => window.clearTimeout(t);
    }
  }, [open, fields]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  const handleSubmit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) return;
    }
    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
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
          <motion.div
            className="create-sheet"
            {...sheetMotion}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="create-sheet-header">
              <div className="create-sheet-drag-handle" />
              <div className="create-sheet-header-row">
                <span className="create-sheet-title">{title}</span>
                <button aria-label="Close" className="icon-btn" type="button" onClick={onCancel}>
                  <X size={16} />
                </button>
              </div>
              {description && (
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{description}</div>
              )}
            </div>

            <div className="create-sheet-body">
              <div className="form-fields">
                {fields.map((f, idx) => (
                  <div key={f.key} className="form-field">
                    <label className="form-field-label">{f.label}</label>
                    {f.type === 'textarea' ? (
                      <textarea
                        ref={idx === 0 ? (firstFieldRef as any) : undefined}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        rows={4}
                        className="textarea w-full"
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        ref={idx === 0 ? (firstFieldRef as any) : undefined}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className="select-base w-full"
                      >
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        ref={idx === 0 ? (firstFieldRef as any) : undefined}
                        type={f.type ?? 'text'}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !(e as any).shiftKey) { e.preventDefault(); handleSubmit(); } }}
                        placeholder={f.placeholder}
                        className="input w-full"
                      />
                    )}
                    {f.helpText && (
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>{f.helpText}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="create-sheet-footer">
              <div className="create-sheet-footer-row">
                {extraActions?.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    className="btn"
                    style={a.variant === 'destructive' ? { color: 'var(--danger)' } : undefined}
                  >
                    {a.label}
                  </button>
                ))}
                <button type="button" onClick={onCancel} className="btn btn-secondary">
                  {cancelLabel}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn btn-primary"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {submitLabel}
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
