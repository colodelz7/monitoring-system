import { useEffect, useRef } from 'react';
import { useGeocodeSearch } from '../hooks/useGeocodeSearch';

/**
 * Campo de busca de cidade com autocomplete.
 * onSelect(result) é chamado quando uma cidade é escolhida.
 */
export default function CitySearchInput({ id, wrapId, placeholder, defaultValue = '', onSelect }) {
  const { query, setQuery, results, loading, open, setOpen, highlight } = useGeocodeSearch();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (defaultValue) setQuery(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [setOpen]);

  function pick(r) {
    setQuery(r.label);
    setOpen(false);
    onSelect?.(r);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    if (e.key === 'Enter' && results[0]) pick(results[0]);
  }

  return (
    <div className="city-search-wrap" id={wrapId} ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="input-select city-input"
        placeholder={placeholder}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="city-dropdown" style={{ display: 'block' }}>
          {loading && (
            <div className="city-option" style={{ color: 'var(--w20)', pointerEvents: 'none' }}>🔍 Buscando...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="city-option" style={{ color: 'var(--w20)', pointerEvents: 'none' }}>Nenhuma cidade encontrada</div>
          )}
          {!loading && results.map((r, i) => {
            const h = highlight(r.label);
            return (
              <div className="city-option" key={i} onClick={() => pick(r)}>
                {typeof h === 'string' ? h : (
                  <>{h.before}<b style={{ color: 'var(--cyan)' }}>{h.match}</b>{h.after}</>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
