import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      fields.forEach((f) => { initial[f.key] = f.defaultValue ?? ''; });
      setValues(initial);
      setSubmitting(false);
      // focus after mount
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    }
  }, [open, fields]);

  const handleSubmit = async () => {
    // check required
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div
        className="w-full max-w-md bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-4 pb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">{title}</h3>
            {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {fields.map((f, idx) => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  ref={idx === 0 ? (firstFieldRef as any) : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring font-mono"
                />
              ) : f.type === 'select' ? (
                <select
                  ref={idx === 0 ? (firstFieldRef as any) : undefined}
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="w-full h-9 px-2 text-sm bg-input-background border border-border rounded-md"
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
                  className="w-full h-9 px-3 text-sm bg-input-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring"
                />
              )}
              {f.helpText && <p className="text-[11px] text-muted-foreground mt-1">{f.helpText}</p>}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-secondary/30 border-t border-border flex items-center justify-end gap-2">
          {extraActions?.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`h-9 px-3 rounded-md text-sm font-medium ${
                a.variant === 'destructive'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {a.label}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="h-9 px-3 rounded-md text-sm text-muted-foreground hover:bg-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-9 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            {!submitting && <Check size={14} />}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
