import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_STATE, loadState, saveState } from '../lib/api';

/**
 * Recorte atual do painel: cidade, janela de tempo e limites de alerta.
 *
 * Vive em três lugares ao mesmo tempo, cada um com um papel (item 4):
 *
 * - memória, que é o que a interface lê;
 * - localStorage, que faz a preferência sobreviver a fechar o navegador;
 * - endereço, que torna o estado compartilhável e reproduzível.
 *
 * O endereço tem precedência na abertura. Se alguém manda um link com outra
 * cidade, o que vale é o link, e não a última cidade que esta máquina abriu:
 * caso contrário o link não significaria nada para quem recebe.
 */

// Só o que descreve o recorte entra no endereço. O intervalo de atualização
// automática é preferência da máquina, não do que está sendo mostrado, e sujaria
// o link sem dizer nada sobre ele.
const NA_URL = Object.freeze({
  city: (v) => String(v),
  period: (v) => String(v),
  tempMin: Number,
  tempMax: Number,
  magThreshold: Number,
  seismicRadiusKm: Number,
});

function lerDaUrl() {
  const params = new URLSearchParams(window.location.search);
  const achado = {};

  for (const [chave, converter] of Object.entries(NA_URL)) {
    if (!params.has(chave)) continue;
    const valor = converter(params.get(chave));
    // Número inválido no endereço é ignorado em silêncio: link torto não pode
    // quebrar o painel, e o padrão continua valendo.
    if (typeof valor === 'number' && !Number.isFinite(valor)) continue;
    achado[chave] = valor;
  }

  return achado;
}

function escreverNaUrl(state) {
  const params = new URLSearchParams(window.location.search);

  for (const chave of Object.keys(NA_URL)) {
    const valor = state[chave];
    // O que está no padrão sai do endereço: link curto é link que se lê.
    if (valor == null || valor === DEFAULT_STATE[chave]) params.delete(chave);
    else params.set(chave, String(valor));
  }

  const busca = params.toString();
  const destino = `${window.location.pathname}${busca ? `?${busca}` : ''}${window.location.hash}`;

  // replaceState e não pushState: mexer no filtro não é navegar, e encher o
  // histórico faria o botão de voltar percorrer cada ajuste de limite.
  window.history.replaceState(null, '', destino);
}

export function useCityState() {
  const [state, setState] = useState(() => ({ ...loadState(), ...lerDaUrl() }));

  // A primeira escrita é pulada para não reescrever o endereço que acabou de
  // ser lido, o que apagaria parâmetros iguais ao padrão logo na abertura.
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    escreverNaUrl(state);
  }, [state]);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  return [state, update];
}
