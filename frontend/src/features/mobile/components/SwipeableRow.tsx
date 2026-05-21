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

  /** Minimum horizontal distance before we commit to a swipe. Until the
   *  finger has travelled this far AND clearly more horizontally than
   *  vertically, the card stays still and the browser handles the touch
   *  as a vertical scroll. iOS Mail/Messages use a similar gate. */
  const SWIPE_ACTIVATE_PX = 14;
  /** Horizontal must beat vertical by this ratio for the gesture to read
   *  as a swipe (vs. a vertical scroll with incidental horizontal jitter). */
  const HORIZ_OVER_VERT = 1.6;

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
    // Don't move the card visually until the native non-passive listener
    // has decided this is a swipe — otherwise the card jitters on every
    // vertical scroll, exactly the behaviour the user complained about.
    if (!horizLocked.current) return;
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

  // Non-passive touchmove listener. Decides on the *first* meaningful
  // delta whether this is a horizontal swipe (lock + preventDefault) or
  // a vertical scroll (release the gesture — startX nulled so onTouchMove
  // ignores the rest). A pure jitter (both dx and dy small) is ignored
  // until enough motion accumulates to judge.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (startX.current == null || startY.current == null) return;
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!horizLocked.current) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        // Vertical wins decisively → release the gesture so subsequent
        // moves are ignored; user is scrolling.
        if (absY >= SWIPE_ACTIVATE_PX && absY > absX) {
          startX.current = null;
          startY.current = null;
          return;
        }
        // Horizontal wins decisively → lock; commit to swipe.
        if (absX >= SWIPE_ACTIVATE_PX && absX > absY * HORIZ_OVER_VERT) {
          horizLocked.current = true;
        } else {
          return; // not enough motion yet, keep watching
        }
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
