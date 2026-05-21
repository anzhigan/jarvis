import { useEffect, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Click handler for the visible content (forwarded only when the row hasn't
   *  been swiped open). */
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Optional prefix on the swiped-out edit button (e.g. "Rename"). */
  editLabel?: string;
}

/** How far the row needs to be dragged before it snaps to the open state. */
const OPEN_THRESHOLD = 60;
/** How far the action panel ends up sticking out when open.
 *  Matches `.m-swipe-actions` layout: 8 + 56 + 8 + 56 + 12 = 140. */
const OPEN_OFFSET = 140;
/** Multi-finger interactions are ignored — this guards drag from accidental
 *  zoom gestures. */

/**
 * Wraps a row (note card, folder row, goal card, etc.) and reveals
 * Edit / Delete action buttons when the user swipes left. Click outside or
 * swipe right (or programmatic close on action) returns it to its idle state.
 */
export function SwipeableRow({ children, onClick, onEdit, onDelete, editLabel = 'Edit' }: Props) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const startedFromOpen = useRef(false);
  const moved = useRef(false);
  /** Once we decide a gesture is a horizontal swipe (dx dominates dy by a
   *  margin) we lock the row to it: subsequent touchmoves preventDefault
   *  so the vertical list scroll doesn't fight the swipe. Released on end. */
  const horizLocked = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startedFromOpen.current = open;
    moved.current = false;
    horizLocked.current = open;  // rows that start open are already in swipe mode
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    const base = startedFromOpen.current ? -OPEN_OFFSET : 0;
    // Clamp so right-swipe never overshoots (closes only).
    const next = Math.min(0, Math.max(-OPEN_OFFSET - 30, base + dx));
    if (Math.abs(dx) > 4) moved.current = true;
    setDragX(next);
  };
  const onTouchEnd = () => {
    if (startX.current == null) return;
    startX.current = null;
    startY.current = null;
    horizLocked.current = false;
    // If past threshold → snap open; otherwise snap closed.
    const target = dragX < -OPEN_THRESHOLD ? -OPEN_OFFSET : 0;
    setDragX(target);
    setOpen(target !== 0);
  };

  // React's touchmove is passive by default (preventDefault would silently
  // fail), so we attach a *non-passive* listener directly to the element.
  // The listener decides the gesture direction the first time it sees a
  // meaningful delta and, if it's horizontal, locks vertical scroll for
  // the rest of the gesture by calling preventDefault on every move.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (startX.current == null || startY.current == null) return;
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!horizLocked.current) {
        // Wait until we have enough motion to judge direction. Horizontal
        // wins when |dx| > |dy| + 6px (the +6 keeps small jitter from
        // hijacking a vertical scroll).
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy) + 6) horizLocked.current = true;
        else return;
      }
      e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const visibleX = startX.current != null ? dragX : (open ? -OPEN_OFFSET : 0);

  const handleContentClick = () => {
    // If we were dragging or the row is open, swallow the click and close instead.
    if (moved.current || open) {
      setOpen(false);
      setDragX(0);
      return;
    }
    onClick?.();
  };

  // Reveal-progress (0..1) drives an opacity fade on the actions so they
  // never visually leak past the card when closed (regardless of stacking-
  // context surprises in any individual card's CSS).
  const offsetMag = Math.abs(visibleX);
  const reveal = Math.max(0, Math.min(1, offsetMag / OPEN_OFFSET));

  const transition = startX.current == null
    ? 'transform 180ms cubic-bezier(0.32, 0.72, 0.30, 1)'
    : 'none';

  return (
    <div className="m-swipe" data-open={open || undefined}>
      <div
        ref={contentRef}
        className="m-swipe-content"
        style={{
          transform: `translateX(${visibleX}px)`,
          transition,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClickCapture={handleContentClick}
      >
        {children}
        {/* Actions are absolutely positioned INSIDE the moving content so
            they share the card's intrinsic height (top:0 bottom:0 → exactly
            card height; no grid surprises, no margin leaks). To keep them
            anchored to the right edge of the wrapper despite the content's
            transform, we apply an equal-and-opposite translate. */}
        <div
          className="m-swipe-actions"
          aria-hidden={!open}
          style={{
            transform: `translateX(${-visibleX}px)`,
            transition,
            opacity: reveal,
            pointerEvents: reveal > 0.5 ? 'auto' : 'none',
          }}
        >
          {onEdit && (
            <button
              type="button"
              className="m-swipe-action m-swipe-action-edit"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false); setDragX(0);
                onEdit();
              }}
            >
              <Pencil size={16} /><span>{editLabel}</span>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="m-swipe-action m-swipe-action-delete"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false); setDragX(0);
                onDelete();
              }}
            >
              <Trash2 size={16} /><span>Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
