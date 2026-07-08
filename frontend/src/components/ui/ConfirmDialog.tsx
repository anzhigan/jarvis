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
  /** Show a compact grid of popular emojis above the input. The picked
   *  emoji is stored as a "<emoji> " prefix on the returned string —
   *  zero backend changes needed. */
  withEmoji?: boolean;
}

/** Curated emoji set for knowledge-management use. Kept small and
 *  compact so the picker doesn't dominate the dialog. */
const EMOJI_LIST = [
  '📚', '📝', '💡', '🎯', '🚀', '📅', '💼', '🎨', '🎓', '🏃',
  '🧠', '⭐', '✅', '🔥', '💰', '☕', '🎵', '🎬', '🏠', '🌱',
  '🍎', '⚙️', '🔬', '🌍', '❤️', '🎮', '✈️', '📷', '💻', '🏋️',
];
const EMOJI_SET = new Set(EMOJI_LIST);

/** Split "📚 History" → { emoji: "📚", rest: "History" }. Only recognises
 *  emojis from EMOJI_LIST followed by whitespace — anything else is treated
 *  as plain name text. Handles the variation-selector (️) suffix. */
function splitEmoji(name: string): { emoji: string | null; rest: string } {
  const trimmed = name.trimStart();
  for (const e of EMOJI_LIST) {
    if (trimmed.startsWith(e + ' ') || trimmed.startsWith(e + ' ')) {
      return { emoji: e, rest: trimmed.slice(e.length).trimStart() };
    }
  }
  // Fallback: single emoji-like character followed by whitespace.
  const m = trimmed.match(/^(\p{Extended_Pictographic}️?)\s+(.*)$/u);
  if (m && EMOJI_SET.has(m[1])) return { emoji: m[1], rest: m[2] };
  return { emoji: null, rest: name };
}

type ConfirmPending = ConfirmSpec & { kind: 'confirm'; resolve: (ok: boolean) => void };
type PromptPending = PromptSpec & { kind: 'prompt'; resolve: (value: string | null) => void };
type Pending = ConfirmPending | PromptPending;

let hostMounted = false;
let push: (p: Pending | null) => void = () => {};

function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    push = setPending;
    return () => { push = () => {}; };
  }, []);
  useEffect(() => {
    if (pending?.kind === 'prompt') {
      // If the dialog supports emoji, split the existing prefix off so the
      // input shows only the "clean" name and the picker highlights the
      // current emoji. Otherwise treat the whole value as text.
      if (pending.withEmoji) {
        const { emoji: e, rest } = splitEmoji(pending.defaultValue ?? '');
        setEmoji(e);
        setDraft(rest);
      } else {
        setEmoji(null);
        setDraft(pending.defaultValue ?? '');
      }
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
      const text = draft.trim();
      if (!ok || !text) {
        pending.resolve(null);
      } else {
        pending.resolve(emoji ? `${emoji} ${text}` : text);
      }
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
          {pending.withEmoji && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontSize: 'var(--text-2xs)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-4)',
                fontWeight: 500,
              }}>
                Emoji {emoji && (
                  <button
                    type="button"
                    onClick={() => setEmoji(null)}
                    style={{
                      marginLeft: 8, background: 'transparent', border: 0,
                      color: 'var(--ink-4)', cursor: 'pointer',
                      fontSize: 'var(--text-2xs)', textTransform: 'none',
                      letterSpacing: 0, padding: 0,
                    }}
                  >clear</button>
                )}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(10, 1fr)',
                gap: 4,
              }}>
                {EMOJI_LIST.map((e) => {
                  const selected = e === emoji;
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoji(selected ? null : e)}
                      aria-pressed={selected}
                      style={{
                        aspectRatio: '1 / 1',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, lineHeight: 1,
                        background: selected ? 'var(--indigo-soft)' : 'var(--cream)',
                        border: selected ? '1px solid var(--indigo)' : '1px solid transparent',
                        borderRadius: 'var(--r-control)',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'background 120ms',
                      }}
                    >{e}</button>
                  );
                })}
              </div>
            </div>
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
