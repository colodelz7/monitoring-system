import { useEffect, useId, useRef, useState } from 'react';
import { useGeocodeSearch } from '../hooks/useGeocodeSearch';
import Icon from './Icon';

/**
 * Busca de cidade com autocomplete e navegação por teclado.
 * O texto digitado é destacado no resultado para deixar claro por que cada
 * sugestão apareceu.
 */
export default function CitySearchInput({ placeholder, defaultValue = '', onSelect }) {
  const { query, setQuery, results, loading, open, setOpen, highlight } = useGeocodeSearch(defaultValue);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    function onDocumentClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [setOpen]);

  useEffect(() => setCursor(-1), [results]);

  function pick(result) {
    setQuery(result.label, { silent: true });
    setOpen(false);
    onSelect?.(result);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(results[cursor >= 0 ? cursor : 0]);
    }
  }

  return (
    <div className="city-search-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        className="input-select city-input"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul className="city-dropdown" id={listId} role="listbox">
          {loading && <li className="city-option city-option--muted"><Icon name="search" size={12} /> Buscando...</li>}

          {!loading && results.length === 0 && (
            <li className="city-option city-option--muted">Nenhuma cidade encontrada</li>
          )}

          {!loading && results.map((result, index) => {
            const parts = highlight(result.label);
            return (
              <li
                key={`${result.lat},${result.lon}`}
                className={`city-option${index === cursor ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === cursor}
                onMouseEnter={() => setCursor(index)}
                onClick={() => pick(result)}
              >
                {typeof parts === 'string' ? parts : (
                  <>{parts.before}<b>{parts.match}</b>{parts.after}</>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
