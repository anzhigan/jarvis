import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
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
  const startedFromOpen = useRef(false);
  const moved = useRef(false);

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startedFromOpen.current = open;
    moved.current = false;
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
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
    // If past threshold → snap open; otherwise snap closed.
    const target = dragX < -OPEN_THRESHOLD ? -OPEN_OFFSET : 0;
    setDragX(target);
    setOpen(target !== 0);
  };

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
