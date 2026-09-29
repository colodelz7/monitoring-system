import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/**
 * Regras de alerta.
 *
 * O catálogo de métricas, operadores e limites vem junto da listagem, do
 * próprio servidor. Isso é de propósito: manter uma cópia da lista aqui
 * significaria que adicionar uma métrica no backend exigiria lembrar de
 * adicioná-la aqui também, e a primeira vez que alguém esquecesse o formulário
 * ofereceria algo que a validação recusa.
 */
export function useRules() {
  const [state, setState] = useState({
    status: 'loading',
    regras: [],
    metricas: [],
    operadores: [],
    limites: null,
    erro: null,
  });
  const abortRef = useRef(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, status: prev.regras.length ? 'refreshing' : 'loading' }));

    try {
      const result = await api.rules({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setState({
        status: 'done',
        regras: result.regras ?? [],
        metricas: result.metricas ?? [],
        operadores: result.operadores ?? [],
        limites: result.limites ?? null,
        erro: null,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((prev) => ({ ...prev, status: 'error', erro: error.message }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  /**
   * As três escritas devolvem o erro em vez de lançá-lo.
   *
   * Recusa de validação é resposta esperada aqui, não falha: o formulário
   * precisa mostrar o motivo ao lado do campo, e uma exceção obrigaria cada
   * chamador a envolver tudo em try.
   */
  const criar = useCallback(async (regra) => {
    try {
      await api.createRule(regra);
      await load();
      return { ok: true };
    } catch (error) {
      return { ok: false, erro: error.message };
    }
  }, [load]);

  const atualizar = useCallback(async (id, patch) => {
    try {
      await api.updateRule(id, patch);
      await load();
      return { ok: true };
    } catch (error) {
      return { ok: false, erro: error.message };
    }
  }, [load]);

  const remover = useCallback(async (id) => {
    try {
      await api.deleteRule(id);
      await load();
      return { ok: true };
    } catch (error) {
      return { ok: false, erro: error.message };
    }
  }, [load]);

  return { ...state, reload: load, criar, atualizar, remover };
}
