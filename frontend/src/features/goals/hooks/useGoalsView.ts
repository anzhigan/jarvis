import { useCallback, useEffect, useState } from 'react';

export type GoalsViewMode = 'goals' | 'go' | 'step';

const STORAGE_KEY = 'jarvnote:goals:view';

const VALID: GoalsViewMode[] = ['goals', 'go', 'step'];

function readMode(): GoalsViewMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(v as GoalsViewMode) ? (v as GoalsViewMode) : 'goals';
}

/** Persisted segmented-control state for Goals / Go / Step. */
export function useGoalsView() {
  const [mode, setModeState] = useState<GoalsViewMode>(readMode);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);

  const setMode = useCallback((m: GoalsViewMode) => setModeState(m), []);

  return { mode, setMode };
}
