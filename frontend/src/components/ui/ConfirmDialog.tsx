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
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from './Dialog';
import { Button } from './Button';

export interface ConfirmSpec {
  title: string;
  /** Body — plain text or any React node (so callers can render bold names etc.). */
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the danger button variant — for destructive actions like delete. */
  danger?: boolean;
}

type Pending = ConfirmSpec & { resolve: (ok: boolean) => void };

let hostMounted = false;
let push: (p: Pending | null) => void = () => {};

function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    push = setPending;
    return () => { push = () => {}; };
  }, []);

  const close = (ok: boolean) => {
    if (!pending) return;
    pending.resolve(ok);
    setPending(null);
  };

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
            variant={pending.danger ? 'danger' : 'primary'}
            autoFocus
          >
            {pending.confirmLabel ?? (pending.danger ? 'Delete' : 'OK')}
          </Button>
        </>
      )}
    >
      {pending?.body && (
        <p style={{ margin: 0, color: 'var(--ink-3)', lineHeight: 1.5 }}>{pending.body}</p>
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
    // Two RAFs so React commits the host's first render before we push the
    // pending state — otherwise the first ever call sees `push` still being
    // the no-op default.
    const trigger = () => push({ ...spec, resolve });
    if (hostMounted && push !== (() => {})) trigger();
    else requestAnimationFrame(() => requestAnimationFrame(trigger));
  });
}
