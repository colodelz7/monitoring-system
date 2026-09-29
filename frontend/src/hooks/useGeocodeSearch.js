import { useCallback, useEffect, useRef, useState } from 'react';
import { api, normalizeText } from '../lib/api';

const DEBOUNCE_MS = 400;
const MIN_LENGTH = 2;

/**
 * Autocomplete de cidade com debounce e cancelamento.
 *
 * Preencher o campo programaticamente (valor inicial, ou escolher um resultado)
 * usa o modo silencioso, para que exibir um nome não dispare uma busca nova.
 */
export function useGeocodeSearch(initialValue = '') {
  const [query, setQueryRaw] = useState(initialValue);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  const doSearch = useCallback(async (term) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setOpen(true);
    try {
      const found = await api.geocode(term, { signal: controller.signal });
      if (!controller.signal.aborted) setResults(found);
    } catch {
      if (!controller.signal.aborted) setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  const setQuery = useCallback((value, { silent = false } = {}) => {
    setQueryRaw(value);
    clearTimeout(timerRef.current);

    if (silent) return;
    if (value.trim().length < MIN_LENGTH) {
      setOpen(false);
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(() => doSearch(value.trim()), DEBOUNCE_MS);
  }, [doSearch]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const highlight = useCallback((label) => {
    const normalizedLabel = normalizeText(label);
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return label;

    const index = normalizedLabel.indexOf(normalizedQuery);
    if (index === -1) return label;

    return {
      before: label.slice(0, index),
      match: label.slice(index, index + normalizedQuery.length),
      after: label.slice(index + normalizedQuery.length),
    };
  }, [query]);

  return { query, setQuery, results, loading, open, setOpen, highlight };
}
