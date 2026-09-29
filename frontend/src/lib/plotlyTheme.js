/**
 * Tema dos gráficos, lido da mesma paleta que o resto da interface.
 *
 * Antes eram valores fixos em rgba branco, o que funcionava enquanto só existia
 * o tema escuro e virava texto invisível no claro. Lendo as variáveis do CSS no
 * momento do desenho, o gráfico acompanha o tema sem precisar saber qual é.
 */
function cssVar(name, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export const cssColor = (name, fallback = '#888') => cssVar(name, fallback);

export function plotlyBase() {
  return {
    // O fundo continua transparente: quem pinta é o cartão embaixo, e assim o
    // gráfico nunca destoa da superfície em que está.
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: {
      family: 'JetBrains Mono, monospace',
      color: cssVar('--w50', 'rgba(255,255,255,0.5)'),
      size: 10,
    },
    margin: { l: 42, r: 14, t: 8, b: 34 },

    // Item 3: arrastar sobre o gráfico recorta o trecho, duplo clique volta ao
    // enquadramento inteiro. A barra de ferramentas do Plotly continua
    // escondida: ela traz uma dezena de botões que este painel não usa, e o
    // gesto de arrastar já é o que as pessoas tentam primeiro.
    dragmode: 'zoom',
  };
}

export function axis() {
  return {
    showgrid: true,
    gridcolor: cssVar('--w08', 'rgba(255,255,255,0.08)'),
    zeroline: false,
    tickfont: { color: cssVar('--w50', 'rgba(255,255,255,0.5)'), size: 10 },
    linecolor: cssVar('--w08', 'rgba(255,255,255,0.08)'),
  };
}

// Mantidos para quem já importava as constantes. São um retrato do tema no
// momento do import, então prefira as funções acima em código novo.
export const PLOTLY_BASE = plotlyBase();
export const AXIS = axis();
