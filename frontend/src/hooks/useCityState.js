import { useState, useCallback } from 'react';
import { loadState, saveState } from '../lib/api';

export function useCityState() {
  const [state, setState] = useState(loadState);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  return [state, update];
}
