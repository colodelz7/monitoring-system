import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

export const EMPTY_FILTERS = {
  sensor: '',
  city: '',
  severity: '',
  range: 'all',
  search: '',
  // Intervalo escolhido à mão. Só entra quando range é "custom", e vale mais
  // que os períodos relativos porque responde a outra pergunta: "o que
  // aconteceu naquela terça" não é a mesma coisa que "últimos 7 dias".
  from: '',
  to: '',
};

// Períodos relativos resolvidos aqui e enviados como data absoluta, para que o
// servidor não precise adivinhar o fuso de quem está consultando.
const RANGES = {
  all: null,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  custom: null,
};

export const RANGE_OPTIONS = [
  { value: 'all', label: 'Todo o período' },
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Escolher datas' },
];

/**
 * Converte a data do campo em instante.
 *
 * O input devolve só o dia, sem hora. O começo vai para a meia noite local e o
 * fim para o último instante do dia, senão escolher o mesmo dia nos dois campos
 * devolveria zero registros, que é o contrário do que a pessoa pediu.
 */
function instanteLocal(dia, fimDoDia) {
  if (!dia) return undefined;
  const data = new Date(`${dia}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(data.getTime()) ? undefined : data.toISOString();
}

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

/**
 * Histórico de alertas com filtros servidos pelo backend.
 *
 * A filtragem acontece no servidor, que é quem tem a lista inteira; o cliente
 * só carrega a página que está mostrando. A busca por texto é debounced para
 * não disparar uma requisição por tecla digitada.
 */
export function useAlertHistory() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ status: 'loading', items: [], total: 0, pageCount: 1, facets: null, stats: null });
  const abortRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const query = useMemo(() => {
    const span = RANGES[filters.range];
    const personalizado = filters.range === 'custom';

    return {
      sensor: filters.sensor || undefined,
      city: filters.city || undefined,
      severity: filters.severity || undefined,
      search: debouncedSearch || undefined,
      from: personalizado ? instanteLocal(filters.from, false) : span ? new Date(Date.now() - span).toISOString() : undefined,
      to: personalizado ? instanteLocal(filters.to, true) : undefined,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [filters.sensor, filters.city, filters.severity, filters.range, filters.from, filters.to, debouncedSearch, page]);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, status: prev.items.length ? 'refreshing' : 'loading' }));

    try {
      const result = await api.alertsLog(query, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({
        status: 'done',
        items: result.items,
        total: result.total,
        pageCount: result.pageCount,
        facets: result.facets,
        stats: result.stats,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'error', items: [], total: 0, pageCount: 1, facets: null, stats: null, error: error.message });
    }
  }, [query]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Trocar de filtro sempre volta para a primeira página, senão a lista pode
  // abrir vazia numa página que não existe mais.
  const updateFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => value && value !== EMPTY_FILTERS[key]).length,
    [filters],
  );

  return { filters, updateFilters, reset, activeCount, page, setPage, state, reload: load };
}
