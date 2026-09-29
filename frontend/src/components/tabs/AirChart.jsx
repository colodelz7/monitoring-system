import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * Composição do ar em barras (item 12).
 *
 * Os poluentes já eram buscados e apareciam como quatro números miúdos embaixo
 * do cartão, onde ninguém compara um com o outro. Em barras dá para ver de
 * relance qual deles está puxando o índice para cima.
 *
 * As barras são horizontais porque os rótulos são nomes, e nome deitado se lê
 * sem virar a cabeça.
 */
function baselineFor(series) {
  return () => (series?.y ?? []).map(() => 0);
}

export default function AirChart({ series, theme }) {
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;

    return [{
      // Verticais: os nomes são curtos e cabem, e a animação de entrada cresce
      // pelo eixo Y, que aqui precisa ser o dos valores.
      x: series.x,
      y: series.y,
      type: 'bar',
      marker: {
        color: series.color || cssColor('--green'),
        opacity: 0.85,
        line: { color: series.color || cssColor('--green'), width: 1 },
      },
      hovertemplate: '<b>%{x}</b><br>%{y:.1f} µg/m³<extra></extra>',
    }];
  }, [series]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    margin: { l: 46, r: 16, t: 8, b: 30 },
    xaxis: { ...axis(), showgrid: false, automargin: true },
    yaxis: { ...axis(), rangemode: 'nonnegative' },
    showlegend: false,
    bargap: 0.35,
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: series?.color || cssColor('--green'),
      font: { color: cssColor('--white'), size: 11 },
    },
  }), [theme, series?.color]);

  const baseline = useMemo(() => baselineFor(series), [series]);

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-aqi" />
          {series?.title ?? 'Composição do ar'}
        </h3>
        <div className="chart-badge">{series?.badge ?? '--'}</div>
      </header>
      {traces ? (
        <PlotlyChart
          traces={traces}
          layout={layout}
          baseline={baseline}
          height={200}
          ariaLabel="Concentração de cada poluente no ar, em microgramas por metro cúbico"
        />
      ) : (
        <div className="chart-area chart-skeleton" style={{ height: 200 }} />
      )}
    </section>
  );
}
