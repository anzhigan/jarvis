// Module-level pub/sub: when one SwipeRow opens, all others close.
// No Provider needed — works across any component tree.

const listeners = new Set<(openedId: string) => void>();

export function notifySwipeOpen(id: string) {
  listeners.forEach((fn) => fn(id));
}

export function useSwipeRowAutoClose(id: string, onClose: () => void) {
  // Subscribe on mount, unsubscribe on unmount
  return {
    mount() {
      const handler = (openedId: string) => {
        if (openedId !== id) onClose();
      };
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
}
