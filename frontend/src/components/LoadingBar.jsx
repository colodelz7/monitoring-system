import { useEffect, useState } from 'react';

/**
 * Barra de progresso do topo, visível enquanto o painel busca dados.
 *
 * Existe porque nem toda busca é rápida: a janela de 90 dias ou de um ano
 * consulta a base de eventos da USGS e leva alguns segundos. Nesse intervalo a
 * tela continuava mostrando o dado anterior sem dizer nada, e parada com dado
 * velho é indistinguível de travada.
 *
 * É indeterminada de propósito. Não dá para saber quanto falta de uma chamada a
 * terceiros, e uma barra que finge saber a porcentagem mente. Esta só afirma
 * que algo está acontecendo, que é a única coisa verdadeira aqui.
 */

// Buscas do cache voltam em poucos milissegundos, e uma barra piscando a cada
// atualização automática vira ruído. Ela só aparece se a espera passar disto.
const ATRASO_MS = 220;

export default function LoadingBar({ loading, label = 'Carregando dados' }) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!loading) {
      setVisivel(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisivel(true), ATRASO_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <div
      className={`fetch-bar${visivel ? ' is-active' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-busy={visivel}
      aria-hidden={!visivel}
    >
      <span className="fetch-bar__run" />
    </div>
  );
}
