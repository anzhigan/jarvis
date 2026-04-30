/**
 * SwipeRow — iOS-native swipe-to-reveal actions.
 * Apple Mail / Notes aesthetic: rounded action buttons, spring animation.
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  enabled: boolean;
}

export default function SwipeRow({ children, onEdit, onDelete, enabled }: Props) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const dragging = useRef(false);
  const horizontal = useRef<boolean | null>(null);

  const ACTIONS_WIDTH = onEdit ? 144 : 76;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = offset;
    dragging.current = true;
    horizontal.current = null;
    setIsDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Lock direction on first significant move
    if (horizontal.current === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        horizontal.current = Math.abs(dx) > Math.abs(dy);
      } else {
        return;
      }
    }
    if (!horizontal.current) return;

    let next = startOffset.current + dx;
    if (next > 0) next = next * 0.3;
    if (next < -ACTIONS_WIDTH) {
      const overshoot = next + ACTIONS_WIDTH;
      next = -ACTIONS_WIDTH + overshoot * 0.3;
    }
    setOffset(next);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    setIsDragging(false);
    if (offset < -ACTIONS_WIDTH / 2) {
      setOffset(-ACTIONS_WIDTH);
      import('../native/bridge').then(({ hapticTap }) => hapticTap()).catch(() => {});
    } else {
      setOffset(0);
    }
  };

  const close = () => setOffset(0);

  useEffect(() => {
    if (!enabled && offset !== 0) setOffset(0);
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Action buttons */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center gap-1.5 pr-1.5"
        style={{ pointerEvents: offset < -10 ? 'auto' : 'none' }}
      >
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              close();
              import('../native/bridge').then(({ hapticTap }) => hapticTap()).catch(() => {});
              onEdit();
            }}
            className="w-[60px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-white font-medium text-[11px] active:scale-95 transition-transform"
            style={{
              backgroundColor: 'var(--amber-500, #F59E0B)',
              height: 'calc(100% - 12px)',
              marginTop: 6, marginBottom: 6,
              boxShadow: 'var(--shadow-sm)',
            }}
            aria-label="Edit"
          >
            <Pencil size={18} strokeWidth={2.4} />
            Edit
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            close();
            import('../native/bridge').then(({ hapticWarning }) => hapticWarning()).catch(() => {});
            onDelete();
          }}
          className="w-[60px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-white font-medium text-[11px] active:scale-95 transition-transform"
          style={{
            backgroundColor: 'var(--destructive)',
            height: 'calc(100% - 12px)',
            marginTop: 6, marginBottom: 6,
            boxShadow: 'var(--shadow-sm)',
          }}
          aria-label="Delete"
        >
          <Trash2 size={18} strokeWidth={2.4} />
          Delete
        </button>
      </div>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? 'none' : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
          touchAction: offset === 0 ? 'pan-y' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
