import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

// Barras crescem de zero, que é a leitura natural para volume acumulado.
function baselineFor(series) {
  return () => (series?.y ?? []).map(() => 0);
}

export default function RainChart({ series, theme }) {
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;
    const values = series.y ?? [];
    return [{
      x: series.x,
      y: values,
      type: 'bar',
      marker: {
        color: values.map((v) => (v > 2 ? '#4dabf7' : v > 0.5 ? '#74c0fc' : 'rgba(77,171,247,0.3)')),
        line: { color: 'rgba(0,180,255,0.2)', width: 0.5 },
      },
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.2f} mm<extra></extra>',
    }];
  }, [series]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...axis(), ticksuffix: ' mm', rangemode: 'nonnegative' },
    showlegend: false,
    bargap: 0.15,
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: cssColor('--blue2'),
      font: { color: cssColor('--white'), size: 11 },
    },
  // O tema nas dependências: sem isso o eixo ficaria com a cor do tema antigo.
  }), [theme]);

  const baseline = useMemo(() => baselineFor(series), [series]);

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-blue" />
          {series?.title ?? 'Precipitação prevista, 48h'}
        </h3>
        <div className="chart-badge">{series?.badge ?? '--'}</div>
      </header>
      {traces ? (
        <PlotlyChart traces={traces} layout={layout} baseline={baseline} ariaLabel="Precipitação prevista para as próximas 48 horas" />
      ) : (
        <div className="chart-area chart-skeleton" />
      )}
    </section>
  );
}
