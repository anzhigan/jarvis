import { useEffect, useState } from 'react';

export function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const onUpdate = () => {
      // keyboard height = full window height minus visible viewport height
      // intentionally exclude vv.offsetTop: it reflects page scroll, not keyboard
      setH(Math.max(0, window.innerHeight - vv.height));
    };
    vv.addEventListener('resize', onUpdate);
    vv.addEventListener('scroll', onUpdate);
    onUpdate();
    return () => {
      vv.removeEventListener('resize', onUpdate);
      vv.removeEventListener('scroll', onUpdate);
    };
  }, []);
  return h;
}
