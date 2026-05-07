import { useCallback, useEffect, useState } from 'react';

export type SprintsViewMode = 'timeline' | 'cards' | 'table';

const STORAGE_KEY = 'jarvnote:sprints:view';
const VALID: SprintsViewMode[] = ['timeline', 'cards', 'table'];

function read(): SprintsViewMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(v as SprintsViewMode) ? (v as SprintsViewMode) : 'timeline';
}

export function useSprintsView() {
  const [mode, setModeState] = useState<SprintsViewMode>(read);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);
  const setMode = useCallback((m: SprintsViewMode) => setModeState(m), []);
  return { mode, setMode };
}
