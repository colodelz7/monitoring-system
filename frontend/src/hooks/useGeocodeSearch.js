import { useState, useRef, useCallback } from 'react';
import { api, normalizeText } from '../lib/api';

/**
 * Autocomplete de cidade com debounce.
 * Uso: const { query, setQuery, results, loading, open, setOpen, highlight } = useGeocodeSearch();
 */
export function useGeocodeSearch() {
  const [query, setQueryRaw] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    setLoading(true);
    try {
      const r = await api.geocode(q);
      setResults(r);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
      setOpen(true);
    }
  }, []);

  const setQuery = useCallback((q) => {
    setQueryRaw(q);
    clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setOpen(false); return; }
    timerRef.current = setTimeout(() => doSearch(q.trim()), 400);
  }, [doSearch]);

  const highlight = useCallback((label) => {
    const norm = normalizeText(label);
    const qNorm = normalizeText(query);
    const idx = norm.indexOf(qNorm);
    if (idx === -1) return label;
    return {
      before: label.slice(0, idx),
      match: label.slice(idx, idx + query.length),
      after: label.slice(idx + query.length),
    };
  }, [query]);

  return { query, setQuery, results, loading, open, setOpen, highlight };
}
