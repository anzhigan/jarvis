/**
 * Unified confirmation dialog — replaces `window.confirm()` everywhere so all
 * destructive prompts share the same look and behave consistently in the
 * design system (overlay, focus ring, Esc-to-close, danger button styling).
 *
 * Usage:
 *
 *   if (await confirmDialog({
 *     title: 'Delete note?',
 *     body:  'This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     danger: true,
 *   })) {
 *     await deleteNote(id);
 *   }
 *
 * The first call lazily mounts a host into <body>; subsequent calls reuse it.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Input } from './Input';

export interface ConfirmSpec {
  title: string;
  /** Body — plain text or any React node (so callers can render bold names etc.). */
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger button variant — for destructive actions like delete. */
  danger?: boolean;
}

export interface PromptSpec {
  title: string;
  body?: React.ReactNode;
  /** Pre-populate the input (e.g. existing name when renaming). */
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmPending = ConfirmSpec & { kind: 'confirm'; resolve: (ok: boolean) => void };
type PromptPending = PromptSpec & { kind: 'prompt'; resolve: (value: string | null) => void };
type Pending = ConfirmPending | PromptPending;

let hostMounted = false;
let push: (p: Pending | null) => void = () => {};

function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    push = setPending;
    return () => { push = () => {}; };
  }, []);
  useEffect(() => {
    if (pending?.kind === 'prompt') {
      setDraft(pending.defaultValue ?? '');
      // Autofocus + select the existing value so the user can start typing
      // a replacement immediately, matching native window.prompt behaviour.
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [pending]);

  const close = (ok: boolean) => {
    if (!pending) return;
    if (pending.kind === 'confirm') {
      pending.resolve(ok);
    } else {
      pending.resolve(ok ? draft.trim() || null : null);
    }
    setPending(null);
  };

  const onSubmit = (e: React.FormEvent) => { e.preventDefault(); close(true); };

  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(o) => { if (!o) close(false); }}
      size="sm"
      title={pending?.title ?? ''}
      footer={pending && (
        <>
          <Button onClick={() => close(false)} variant="ghost">
            {pending.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            onClick={() => close(true)}
            variant={pending.kind === 'confirm' && pending.danger ? 'danger' : 'primary'}
            autoFocus={pending.kind === 'confirm'}
          >
            {pending.confirmLabel
              ?? (pending.kind === 'confirm' && pending.danger ? 'Delete' : 'OK')}
          </Button>
        </>
      )}
    >
      {pending?.kind === 'confirm' && pending.body && (
        <p style={{ margin: 0, color: 'var(--ink-3)', lineHeight: 1.5 }}>{pending.body}</p>
      )}
      {pending?.kind === 'prompt' && (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.body && (
            <p style={{ margin: 0, color: 'var(--ink-3)', lineHeight: 1.5 }}>{pending.body}</p>
          )}
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pending.placeholder}
            autoFocus
          />
        </form>
      )}
    </Dialog>
  );
}

function mountHost(): void {
  if (hostMounted) return;
  const div = document.createElement('div');
  div.setAttribute('data-confirm-host', '');
  document.body.appendChild(div);
  createRoot(div).render(<ConfirmHost />);
  hostMounted = true;
}

/** Show a confirm dialog. Resolves to `true` on confirm, `false` on cancel/Esc. */
export function confirmDialog(spec: ConfirmSpec): Promise<boolean> {
  return new Promise((resolve) => {
    mountHost();
    const trigger = () => push({ ...spec, kind: 'confirm', resolve });
    if (push !== (() => {})) trigger();
    else requestAnimationFrame(() => requestAnimationFrame(trigger));
  });
}

/** Show a text-input prompt. Resolves to the trimmed value on confirm, or
 *  `null` on cancel/Esc/empty submit — mirrors the `window.prompt()` API so
 *  call sites can drop in with minimal change. */
export function promptDialog(spec: PromptSpec): Promise<string | null> {
  return new Promise((resolve) => {
    mountHost();
    const trigger = () => push({ ...spec, kind: 'prompt', resolve });
    if (push !== (() => {})) trigger();
    else requestAnimationFrame(() => requestAnimationFrame(trigger));
  });
}
