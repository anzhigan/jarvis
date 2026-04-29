import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  /** Pass false to disable swipe on desktop (default: auto-detects viewport) */
  enabled?: boolean;
}

/**
 * iOS-style swipe-to-reveal row. Drag left to show Edit/Delete buttons behind.
 * On desktop (>= 768px) by default swipe is disabled and children are shown as-is.
 */
export default function SwipeRow({ children, onEdit, onDelete, enabled }: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const active = enabled ?? isMobile;

  const ACTIONS_WIDTH = onEdit ? 140 : 70;

  if (!active) return <>{children}</>;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startOffset.current = offset;
    dragging.current = true;
    setIsDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const next = Math.max(-ACTIONS_WIDTH, Math.min(0, startOffset.current + dx));
    setOffset(next);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    setIsDragging(false);
    if (offset < -ACTIONS_WIDTH / 2) {
      setOffset(-ACTIONS_WIDTH);
      // Haptic when swipe snaps open
      import('../native/bridge').then(({ hapticTap }) => hapticTap());
    } else {
      setOffset(0);
    }
  };
  const close = () => setOffset(0);

  // When swipe is disabled (e.g. while editing), reset offset on disable
  useEffect(() => {
    if (!enabled && offset !== 0) setOffset(0);
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Actions behind */}
      <div className="absolute right-0 top-0 bottom-0 flex">
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); close(); onEdit(); }}
            className="w-[70px] bg-chart-3 text-white flex items-center justify-center active:opacity-80"
            aria-label="Edit"
          >
            <Pencil size={18} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            close();
            import('../native/bridge').then(({ hapticWarning }) => hapticWarning());
            onDelete();
          }}
          className="w-[70px] bg-destructive text-white flex items-center justify-center active:opacity-80"
          aria-label="Delete"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={(e) => {
          if (offset !== 0) {
            e.stopPropagation();
            e.preventDefault();
            close();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  );
}
