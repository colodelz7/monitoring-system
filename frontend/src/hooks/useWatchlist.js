import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Leitura das cidades acompanhadas.
 *
 * Roda num ritmo próprio, bem mais lento que o do painel: a lista responde
 * "está tudo bem por lá?", e essa pergunta não muda de resposta a cada trinta
 * segundos. Atualizar junto com o painel multiplicaria por seis a chamada à API
 * paga para ganhar uma precisão que ninguém olha.
 */

const INTERVALO_MS = 5 * 60 * 1000;

export function useWatchlist(cidades, thresholds) {
  const [state, setState] = useState({ status: 'idle', cidades: [] });
  const abortRef = useRef(null);

  // A lista é um array novo a cada render do componente pai. Comparar pela
  // string evita refazer a busca quando o conteúdo é o mesmo de antes.
  const chave = cidades.join('|');
  const limites = `${thresholds.tempMin}|${thresholds.tempMax}`;

  const load = useCallback(async () => {
    const lista = chave ? chave.split('|') : [];
    if (!lista.length) {
      setState({ status: 'idle', cidades: [] });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, status: prev.cidades.length ? 'refreshing' : 'loading' }));

    try {
      const [tempMin, tempMax] = limites.split('|').map(Number);
      const result = await api.watchlist(lista, { tempMin, tempMax }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({ status: 'done', cidades: result.cidades ?? [] });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'error', cidades: [], error: error.message });
    }
  }, [chave, limites]);

  useEffect(() => {
    load();
    const timer = setInterval(load, INTERVALO_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  return { ...state, reload: load };
}
