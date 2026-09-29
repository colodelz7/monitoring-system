import { useCallback, useEffect, useState } from 'react';

/**
 * Mantém a aba ativa no endereço.
 *
 * Antes a aba era estado só de memória: recarregar a página voltava para o
 * painel, o botão de voltar do navegador saía do sistema inteiro e não havia
 * como mandar para alguém o link de uma aba específica. Com o hash, as três
 * coisas passam a funcionar sem trazer uma biblioteca de rotas para um app de
 * cinco telas.
 */
export function useHashTab(tabs, fallback) {
  const read = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, '').trim();
    return tabs.includes(raw) ? raw : fallback;
  }, [tabs, fallback]);

  const [tab, setTabState] = useState(read);

  useEffect(() => {
    const onChange = () => setTabState(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [read]);

  // Um endereço sem hash recebe o da aba atual, para que o primeiro clique em
  // voltar não jogue a pessoa para fora do sistema.
  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', `#/${tab}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback((next) => {
    if (!tabs.includes(next)) return;
    if (read() === next) { setTabState(next); return; }
    window.location.hash = `#/${next}`;
  }, [tabs, read]);

  return [tab, setTab];
}
