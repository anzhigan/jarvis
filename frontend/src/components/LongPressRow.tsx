import { useRef } from 'react';
import SwipeRow from './SwipeRow';

interface Props {
  children: React.ReactNode;
  onSwipeEdit: () => void;
  onSwipeDelete: () => void;
  onLongPress: () => void;
  isDragging?: boolean;
  longPressMs?: number;
}

/**
 * Mobile-friendly row that supports both swipe actions (via SwipeRow) AND
 * long-press to enter a drag/move mode. Long-press fires a callback that
 * the parent uses to set "drag mode"; then parent tap-handlers move the item.
 */
export default function LongPressRow({
  children, onSwipeEdit, onSwipeDelete, onLongPress, isDragging, longPressMs = 500,
}: Props) {
  const timer = useRef<number | null>(null);
  const moved = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    moved.current = false;
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!moved.current) {
        // Haptic feedback if available
        if ('vibrate' in navigator) navigator.vibrate(30);
        onLongPress();
      }
    }, longPressMs);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - startPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - startPos.current.y);
    if (dx > 8 || dy > 8) moved.current = true;
  };
  const onTouchEnd = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={isDragging ? 'ring-2 ring-primary ring-inset bg-primary/5' : ''}
    >
      <SwipeRow onEdit={onSwipeEdit} onDelete={onSwipeDelete}>
        {children}
      </SwipeRow>
    </div>
  );
}
