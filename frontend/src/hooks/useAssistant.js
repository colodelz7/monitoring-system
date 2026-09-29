import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'colodelbot:conversa';
const MAX_TURNS = 40;

const SAUDACAO = {
  role: 'bot',
  text: 'Oi, eu sou o ColodelBot. Eu enxergo o painel inteiro: leitura atual da cidade, previsão, sismos, alertas disparados e o histórico. Pode perguntar.',
};

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [SAUDACAO];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed.slice(-MAX_TURNS) : [SAUDACAO];
  } catch {
    // Janela anônima, armazenamento bloqueado ou dado corrompido: a conversa
    // simplesmente começa do zero, sem derrubar a interface.
    return [SAUDACAO];
  }
}

/**
 * Conversa com o assistente.
 *
 * O texto chega em pedaços por SSE, e cada pedaço é concatenado na última
 * mensagem. O contexto do sistema não sai daqui: o cliente manda apenas a
 * pergunta e o que está vendo, e o servidor monta o retrato dos dados.
 */
export function useAssistant({ city, period, onAction }) {
  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState(loadHistory);
  const [state, setState] = useState('idle'); // idle | pensando | respondendo
  const [error, setError] = useState(null);

  const abortRef = useRef(null);

  // Em ref para o efeito de stream não depender da identidade da função, que
  // quem chama costuma escrever direto no JSX.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/assistant/status', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => setStatus(value ?? { enabled: false }))
      .catch(() => setStatus({ enabled: false }));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_TURNS)));
    } catch {
      // Não conseguir guardar a conversa não é motivo para interromper nada.
    }
  }, [messages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([SAUDACAO]);
    setError(null);
  }, [stop]);

  const send = useCallback(async (raw) => {
    const message = String(raw ?? '').trim();
    if (!message || abortRef.current) return;

    setError(null);
    setState('pensando');

    const history = messages
      .filter((turn) => turn.text && !turn.pending)
      .slice(-12)
      .map((turn) => ({ role: turn.role, text: turn.text }));

    setMessages((prev) => [...prev, { role: 'user', text: message }, { role: 'bot', text: '', pending: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ message, history, city, period }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Erro ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';

      const apply = (block) => {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let event;
          try { event = JSON.parse(payload); } catch { continue; }

          if (event.type === 'start') setState('respondendo');
          if (event.type === 'delta') {
            text += event.chunk;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'bot', text, pending: true };
              return next;
            });
          }
          if (event.type === 'end') {
            text = event.text ?? text;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: 'bot', text };
              return next;
            });
          }
          // O modelo pode pedir uma mudança no painel. O servidor já validou
          // cidade, período e limites contra as mesmas faixas da query string,
          // então aqui só resta aplicar.
          if (event.type === 'action' && event.tipo === 'ajustar_painel') {
            onActionRef.current?.(event.mudancas);
          }
          if (event.type === 'error') throw new Error(event.message);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        let cut;
        while ((cut = buffer.indexOf('\n\n')) !== -1) {
          apply(buffer.slice(0, cut));
          buffer = buffer.slice(cut + 2);
        }
      }
      if (buffer.trim()) apply(buffer);

      // Um stream que fecha sem texto deixaria uma bolha vazia para sempre.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.pending) {
          next[next.length - 1] = last.text
            ? { role: 'bot', text: last.text }
            : { role: 'bot', text: 'Não veio resposta dessa vez. Tente perguntar de novo.' };
        }
        return next;
      });
    } catch (failure) {
      if (controller.signal.aborted) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.pending) {
            if (last.text) next[next.length - 1] = { role: 'bot', text: last.text };
            else next.pop();
          }
          return next;
        });
      } else {
        setError(failure.message || 'Falha ao falar com o assistente.');
        setMessages((prev) => prev.filter((turn) => !turn.pending));
      }
    } finally {
      abortRef.current = null;
      setState('idle');
    }
  }, [messages, city, period]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { status, messages, state, error, send, stop, reset, busy: state !== 'idle' };
}
