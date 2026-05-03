import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useT } from '../store/i18n';

interface Props {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete: () => void;
  enabled?: boolean;
}

const SPRING = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)';
const BTN_W = 72;

export default function SwipeRow({ children, onEdit, onDelete, enabled = true }: Props) {
  const t = useT();
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const active = useRef(false);
  const horizontal = useRef<boolean | null>(null);

  const ACTIONS_W = onEdit ? BTN_W * 2 : BTN_W;
  const swiped = offset < -20;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startOffset.current = offset;
    active.current = true;
    horizontal.current = null;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (horizontal.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        horizontal.current = Math.abs(dx) > Math.abs(dy);
      } else {
        return;
      }
    }
    if (!horizontal.current) return;

    let next = startOffset.current + dx;
    if (next > 0) next = next * 0.2;
    if (next < -ACTIONS_W) next = -ACTIONS_W + (next + ACTIONS_W) * 0.2;
    setOffset(next);
  };

  const onTouchEnd = () => {
    active.current = false;
    setDragging(false);
    setOffset(offset < -ACTIONS_W / 2 ? -ACTIONS_W : 0);
  };

  const close = () => setOffset(0);

  useEffect(() => {
    if (!enabled && offset !== 0) setOffset(0);
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  const tr = dragging ? 'none' : SPRING;
  const actionsTx = ACTIONS_W + offset;

  return (
    <div
      style={{ position: 'relative', overflow: 'hidden' }}
      data-swiped={swiped ? 'true' : undefined}
    >
      {/* Content — slides left */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'relative',
          zIndex: 1,
          transform: `translateX(${offset}px) ${swiped ? 'scale(0.99)' : ''}`,
          transition: tr,
          touchAction: 'pan-y',
          transformOrigin: 'left center',
        }}
      >
        {children}
      </div>

      {/* Action buttons */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 4,
          paddingRight: 4,
          width: ACTIONS_W,
          transform: `translateX(${actionsTx}px)`,
          transition: tr,
          zIndex: 0,
          pointerEvents: offset < -20 ? 'auto' : 'none',
        }}
      >
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); close(); onEdit(); }}
            style={{
              flex: 1,
              border: 0,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'var(--warning)',
              color: '#fff',
              borderRadius: 'var(--r-control)',
              fontSize: 10,
              fontWeight: 600,
            }}
            aria-label={t('common.edit')}
          >
            <Pencil size={16} strokeWidth={2} />
            <span>{t('common.edit')}</span>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); close(); onDelete(); }}
          style={{
            flex: 1,
            border: 0,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: 'var(--danger)',
            color: '#fff',
            borderRadius: 'var(--r-control)',
            fontSize: 10,
            fontWeight: 600,
          }}
          aria-label={t('common.delete')}
        >
          <Trash2 size={16} strokeWidth={2} />
          <span>{t('common.delete')}</span>
        </button>
      </div>
    </div>
  );
}
