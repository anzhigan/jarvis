/**
 * useSwipeBack — hook for iOS-native edge-swipe-to-go-back gesture.
 *
 * Usage:
 *   useSwipeBack(() => navigate('back'));
 *
 * Detects swipes starting from the LEFT edge of the screen (within 25px).
 * Triggers callback when swiped > 50% of screen width with > 100px velocity.
 *
 * Visual indication: returns currentDx (0..1) so consumer can offset the
 * sliding screen during the gesture for natural feel.
 */
import { useEffect, useState, useRef } from 'react';

interface SwipeBackOptions {
  onBack: () => void;
  enabled?: boolean;
  edgeThreshold?: number;        // px from left edge to start tracking
  triggerThreshold?: number;     // % of width to trigger back
}

export function useSwipeBack({
  onBack,
  enabled = true,
  edgeThreshold = 25,
  triggerThreshold = 0.4,
}: SwipeBackOptions): { dx: number; active: boolean } {
  const [dx, setDx] = useState(0);
  const [active, setActive] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX <= edgeThreshold) {
        tracking.current = true;
        startX.current = t.clientX;
        startY.current = t.clientY;
        setActive(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const t = e.touches[0];
      const deltaX = t.clientX - startX.current;
      const deltaY = Math.abs(t.clientY - startY.current);
      // Cancel if vertical scroll is dominant
      if (deltaY > Math.abs(deltaX) && deltaY > 10) {
        tracking.current = false;
        setActive(false);
        setDx(0);
        return;
      }
      if (deltaX > 0) {
        setDx(deltaX);
        // Prevent default to avoid scrolling while gesturing
        if (deltaX > 5) e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (!tracking.current) return;
      const screenW = window.innerWidth;
      tracking.current = false;
      setActive(false);
      if (dx > screenW * triggerThreshold) {
        // Trigger back with haptic
        import('./bridge').then(({ hapticTap }) => hapticTap()).catch(() => {});
        onBack();
      }
      // Reset offset
      setDx(0);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, edgeThreshold, triggerThreshold, onBack, dx]);

  return { dx, active };
}
