/**
 * Pull-to-refresh — iOS-style.
 *
 * Wraps a scrollable container. Detects pull-down gesture at the top of scroll,
 * shows a spinner with elastic animation, fires onRefresh when threshold passed.
 *
 * Usage:
 *   <PullToRefresh onRefresh={async () => { await load(); }}>
 *     <ScrollableContent />
 *   </PullToRefresh>
 */
import { useRef, useState, useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  threshold?: number;
  disabled?: boolean;
}

export default function PullToRefresh({ onRefresh, children, threshold = 70, disabled = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      // Only trigger when scroll is at top
      if (el.scrollTop > 0) {
        setArmed(false);
        return;
      }
      startY.current = e.touches[0].clientY;
      setArmed(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (refreshing || !armed) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      // Diminishing returns — feels rubbery
      const damped = Math.min(dy * 0.5, threshold * 1.5);
      setPullDistance(damped);
      // Prevent native scroll bounce when actively pulling
      if (dy > 5) e.preventDefault();
    };

    const handleTouchEnd = async () => {
      if (refreshing || !armed) {
        setPullDistance(0);
        setArmed(false);
        return;
      }
      setArmed(false);
      if (pullDistance >= threshold) {
        setRefreshing(true);
        // Tactile feedback
        import('../native/bridge').then(({ hapticTap }) => hapticTap());
        try {
          await onRefresh();
        } catch { /* swallow */ }
        setRefreshing(false);
      }
      setPullDistance(0);
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [armed, refreshing, pullDistance, threshold, onRefresh, disabled]);

  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorScale = 0.6 + indicatorOpacity * 0.4;

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Indicator overlay */}
      <div
        className="pointer-events-none absolute left-0 right-0 flex justify-center items-center z-10"
        style={{
          top: 0,
          height: refreshing ? '50px' : `${pullDistance}px`,
          opacity: refreshing ? 1 : indicatorOpacity,
          transform: `scale(${indicatorScale})`,
          transition: refreshing || pullDistance === 0 ? 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      >
        <div className="bg-card border border-border rounded-full w-9 h-9 flex items-center justify-center shadow-sm">
          <Loader2
            size={16}
            className={refreshing ? 'animate-spin text-primary' : 'text-muted-foreground'}
            style={refreshing ? undefined : { transform: `rotate(${indicatorOpacity * 360}deg)` }}
          />
        </div>
      </div>

      {/* Content with translate based on pull */}
      <div
        style={{
          transform: refreshing ? 'translateY(50px)' : `translateY(${pullDistance}px)`,
          transition: refreshing || pullDistance === 0 ? 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
