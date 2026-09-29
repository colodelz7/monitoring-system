import { useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import { useReducedMotion } from '../hooks/useReducedMotion';

const DRAW_DURATION_MS = 720;

/**
 * Faixa que cada eixo Y deve cobrir para caber todos os valores reais.
 *
 * Um gráfico pode ter mais de um eixo vertical, com escalas que não têm nada a
 * ver entre si: umidade de 0 a 100 e pressão perto de 1013 no mesmo quadro. Por
 * isso os traços são agrupados pelo eixo a que pertencem e cada eixo ganha a
 * sua própria faixa. Fixar só o principal deixava o secundário preso à escala
 * da linha de base, e a linha da pressão saía do quadro.
 *
 * O zero entra quando a série é preenchida até o eixo ou desenhada em barras:
 * nesses casos a área abaixo da curva faz parte da leitura, e cortar o zero
 * mentiria sobre a proporção.
 */
function faixasPorEixo(traces) {
  const porEixo = new Map();

  for (const trace of traces) {
    const eixo = trace.yaxis && trace.yaxis !== 'y' ? trace.yaxis : 'y';
    if (!porEixo.has(eixo)) porEixo.set(eixo, { valores: [], precisaDoZero: false });
    const alvo = porEixo.get(eixo);

    if (trace.type === 'bar' || trace.fill === 'tozeroy') alvo.precisaDoZero = true;
    for (const valor of trace.y ?? []) {
      if (Number.isFinite(valor)) alvo.valores.push(valor);
    }
  }

  const faixas = {};

  for (const [eixo, { valores, precisaDoZero }] of porEixo) {
    if (!valores.length) continue;

    let minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    if (precisaDoZero) minimo = Math.min(0, minimo);

    // Uma série constante tem amplitude zero e deixaria o eixo degenerado.
    const folga = (maximo - minimo) * 0.08 || Math.max(Math.abs(maximo) * 0.1, 1);
    // 'y' vira 'yaxis' e 'y2' vira 'yaxis2', que é como o layout os nomeia.
    const chave = eixo === 'y' ? 'yaxis' : `yaxis${eixo.slice(1)}`;
    faixas[chave] = [precisaDoZero ? minimo : minimo - folga, maximo + folga];
  }

  return Object.keys(faixas).length ? faixas : null;
}

/**
 * Envelope de gráfico Plotly com desenho ao aparecer.
 *
 * O gráfico é criado achatado na linha de base e só então animado até os
 * valores reais, o que dá a leitura de "crescendo a partir do eixo" em vez de
 * simplesmente surgir pronto. A animação só dispara quando o elemento entra em
 * tela, para que trocar de aba não desperdice o efeito num gráfico invisível.
 *
 * Com prefers-reduced-motion o gráfico é desenhado direto no estado final.
 */
export default function PlotlyChart({ traces, layout, baseline, height = 220, ariaLabel }) {
  const containerRef = useRef(null);
  const plotRef = useRef(null);
  const drawnRef = useRef(false);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);

  // Só observa a entrada em tela; depois disso o observer não tem mais função.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || visible) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !visible || !traces?.length) return undefined;

    const finalTraces = traces;
    const shouldAnimate = !reduced && !drawnRef.current && baseline;
    const initialTraces = shouldAnimate
      ? finalTraces.map((trace, index) => ({ ...trace, y: baseline(trace, index) }))
      : finalTraces;

    // O eixo Y precisa nascer medindo os valores reais, não a linha de base.
    //
    // A animação de entrada desenha o gráfico achatado e só então sobe até os
    // valores verdadeiros. Sem esta trava, o Plotly calculava a escala a partir
    // do desenho achatado e nunca mais a revisava, porque a animação roda com
    // redraw desligado: o eixo ficava preso na faixa da linha de base e tudo
    // que subia acima dela era recortado. Fixar a faixa antes também evita o
    // eixo pular de escala no meio da animação, que era feio mesmo quando
    // funcionava.
    const escalasFixas = shouldAnimate ? faixasPorEixo(finalTraces) : null;
    const layoutInicial = escalasFixas
      ? Object.entries(escalasFixas).reduce(
        (acc, [chave, faixa]) => ({
          ...acc,
          [chave]: { ...(layout[chave] ?? {}), range: faixa, autorange: false },
        }),
        { ...layout },
      )
      : layout;

    // O Plotly desenha de forma assíncrona e escreve direto no DOM. Trocar de
    // aba desmonta este componente antes de a promessa resolver, e sem esta
    // trava a continuação rodava sobre um nó que o React já tinha removido:
    // o Plotly reinseria conteúdo ali e a reconciliação seguinte estourava.
    let cancelled = false;
    const alive = () => !cancelled && node.isConnected;

    // O Plotly marca o próprio nó com esta classe ao inicializar. É o sinal de
    // que existe um gráfico ali para redimensionar, e vale mesmo enquanto a
    // promessa abaixo ainda não resolveu.
    const montado = () => alive() && node.classList.contains('js-plotly-plot');

    const ajustar = () => {
      if (!montado()) return;
      Plotly.Plots.resize(node);
    };

    // A altura sai do layout e fica com o CSS, que é quem sabe a densidade
    // escolhida. Com ela fixada aqui, o gráfico ignorava o modo compacto: o
    // quadro em volta encolhia e a área de plotagem continuava do mesmo
    // tamanho. Com `responsive`, o Plotly passa a seguir o container, e o
    // ResizeObserver abaixo é o que avisa quando esse container muda.
    Plotly.react(node, initialTraces, layoutInicial, { responsive: true, displayModeBar: false })
      .then(() => {
        if (!alive()) return null;
        plotRef.current = node;
        if (!shouldAnimate) return null;
        drawnRef.current = true;
        return Plotly.animate(
          node,
          { data: finalTraces.map((trace) => ({ y: trace.y })) },
          {
            transition: { duration: DRAW_DURATION_MS, easing: 'cubic-out' },
            frame: { duration: DRAW_DURATION_MS, redraw: false },
          },
        );
      })
      // O container costuma assentar enquanto o Plotly ainda desenha, porque a
      // aba entra por lazy e ainda está em transição. Sem este acerto no fim, a
      // área de plotagem fica com a largura antiga e os eixos com a nova, e o
      // gráfico aparece recortado. A animação usa redraw:false, então também
      // depende deste passo para reconciliar.
      .then(ajustar)
      .catch(() => {
        // Falha de render não deve derrubar a aba inteira.
      });

    // Uma chamada já enfileirada ainda chega depois do disconnect, então a
    // checagem de nó vivo precisa estar aqui dentro também.
    const observer = new ResizeObserver(ajustar);
    observer.observe(node);

    return () => {
      cancelled = true;
      plotRef.current = null;
      observer.disconnect();
    };
  }, [traces, layout, height, visible, reduced, baseline]);

  useEffect(() => {
    const node = containerRef.current;
    return () => {
      // Devolve o nó vazio para o React desmontar, sem sobras do Plotly dentro.
      if (node) Plotly.purge(node);
    };
  }, []);

  return (
    <div
      className="chart-area"
      ref={containerRef}
      // A altura pedida vira variável em vez de valor fixo, para o CSS poder
      // multiplicá-la pela densidade.
      style={{ '--chart-h': `${height}px` }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
