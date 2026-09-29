import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import Icon from '../Icon';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * Os três gráficos que acompanham o mapa sísmico (itens 9, 10 e 11).
 *
 * O mapa responde onde tremeu. Estes respondem com que força, a que
 * profundidade e quando, que são as outras três perguntas óbvias e que o mapa
 * sozinho não consegue mostrar sem virar uma sopa de pontos.
 *
 * Todos usam o mesmo recorte do mapa, resolvido no servidor, então a contagem
 * aqui e o número de pontos lá nunca divergem.
 */

// Memoizado por série: passar uma função nova a cada render reexecutava o
// efeito de desenho do Plotly, cancelando a animação no meio e deixando o
// gráfico em estado intermediário.
function useZeros(series) {
  return useMemo(() => () => (series?.y ?? []).map(() => 0), [series]);
}

function Moldura({ dot, title, badge, children }) {
  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className={`chart-dot ${dot}`} />
          {title}
        </h3>
        {badge && <div className="chart-badge">{badge}</div>}
      </header>
      {children}
    </section>
  );
}

function Magnitude({ series, theme }) {
  const baseline = useZeros(series);
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;
    return [{
      x: series.x,
      y: series.y,
      type: 'bar',
      marker: { color: cssColor('--indigo'), opacity: 0.8 },
      hovertemplate: '<b>%{x}</b><br>%{y} eventos<extra></extra>',
    }];
  }, [series]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), showgrid: false },
    yaxis: { ...axis(), rangemode: 'nonnegative' },
    showlegend: false,
    bargap: 0.2,
    hoverlabel: { bgcolor: cssColor('--bg3'), bordercolor: cssColor('--indigo'), font: { color: cssColor('--white'), size: 11 } },
  }), [theme]);

  return (
    <Moldura dot="dot-ind" title={series?.title ?? 'Distribuição de magnitude'} badge={series ? `${series.x.length} faixas` : null}>
      {traces
        ? <PlotlyChart traces={traces} layout={layout} baseline={baseline} height={190} ariaLabel="Quantos eventos sísmicos ocorreram em cada faixa de magnitude" />
        : <div className="chart-area chart-skeleton" style={{ height: 190 }} />}
    </Moldura>
  );
}

function Profundidade({ series, theme }) {
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;
    return [{
      x: series.x,
      y: series.y,
      type: 'scatter',
      mode: 'markers',
      marker: {
        size: 6,
        color: series.cor,
        opacity: 0.75,
        line: { width: 0 },
      },
      text: series.rotulo,
      hovertemplate: '<b>%{text}</b><br>M%{x:.1f} a %{y:.0f} km<extra></extra>',
    }];
  }, [series]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), ticksuffix: '', title: { text: 'magnitude', font: { size: 9, color: cssColor('--w20') } } },
    // Profundidade cresce para baixo, que é como a Terra é: eixo invertido.
    yaxis: { ...axis(), ticksuffix: ' km', autorange: 'reversed' },
    showlegend: false,
    hoverlabel: { bgcolor: cssColor('--bg3'), bordercolor: cssColor('--cyan'), font: { color: cssColor('--white'), size: 11 } },
  }), [theme]);

  return (
    <Moldura dot="dot-cyan" title={series?.title ?? 'Profundidade por magnitude'} badge={series ? `${series.x.length} eventos` : null}>
      {traces
        ? <PlotlyChart traces={traces} layout={layout} height={190} ariaLabel="Profundidade de cada evento sísmico em relação à sua magnitude" />
        : <div className="chart-area chart-skeleton" style={{ height: 190 }} />}
    </Moldura>
  );
}

function LinhaDoTempo({ series, theme }) {
  const baseline = useZeros(series);
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;
    return [{
      x: series.x,
      y: series.y,
      type: 'scatter',
      mode: 'lines',
      line: { shape: 'hv', color: cssColor('--orange'), width: 1.8 },
      fill: 'tozeroy',
      fillcolor: 'rgba(255,140,0,0.10)',
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y} eventos<extra></extra>',
    }];
  }, [series]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...axis(), rangemode: 'nonnegative' },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: cssColor('--bg3'), bordercolor: cssColor('--orange'), font: { color: cssColor('--white'), size: 11 } },
  }), [theme]);

  return (
    <Moldura dot="dot-alert" title={series?.title ?? 'Eventos ao longo do tempo'}>
      {traces
        ? <PlotlyChart traces={traces} layout={layout} baseline={baseline} height={190} ariaLabel="Quantidade de eventos sísmicos ao longo do período" />
        : <div className="chart-area chart-skeleton" style={{ height: 190 }} />}
    </Moldura>
  );
}

export default function SeismicCharts({ charts, theme, vazio }) {
  if (!charts) return null;

  // Sem nenhuma série, os três quadros ficariam em esqueleto para sempre, o que
  // se lê como carregamento travado. Quando não há evento, isso é um resultado
  // e precisa ser dito, e não uma espera.
  const semDados = !charts.magnitude && !charts.depth && !charts.timeline;
  if (semDados) {
    return (
      <div className="empty-state empty-state--inline">
        <div className="empty-icon"><Icon name="quake" size={26} /></div>
        <div className="empty-text">Sem eventos para os gráficos</div>
        <div className="empty-sub">{vazio ?? 'Nenhum sismo no período escolhido.'}</div>
      </div>
    );
  }

  return (
    <div className="charts-grid charts-grid--three">
      <Magnitude series={charts.magnitude} theme={theme} />
      <Profundidade series={charts.depth} theme={theme} />
      <LinhaDoTempo series={charts.timeline} theme={theme} />
    </div>
  );
}
