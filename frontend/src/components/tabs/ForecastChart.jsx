import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

// A curva sobe a partir do piso do eixo, então a animação parece a linha sendo
// traçada e não o gráfico inteiro piscando na tela.
function baselineFor(series) {
  const values = (series?.y ?? []).filter(Number.isFinite);
  const floor = values.length ? Math.min(...values) : 0;
  return () => (series?.y ?? []).map(() => floor);
}

export default function ForecastChart({ series, theme }) {
  const traces = useMemo(() => {
    if (!series?.x?.length) return null;
    return [{
      x: series.x,
      y: series.y,
      type: 'scatter',
      mode: 'lines+markers',
      line: { shape: 'spline', color: cssColor('--cyan'), width: 2.5, smoothing: 1.3 },
      marker: { size: 4.5, color: cssColor('--cyan'), line: { color: cssColor('--bg2'), width: 1.5 } },
      fill: 'tozeroy',
      fillcolor: cssColor('--chart-fill'),
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.1f}°C<extra></extra>',
    }];
  }, [series]);

  // O tema entra nas dependências para o gráfico ser redesenhado quando a
  // paleta muda. Sem isso o texto do eixo ficaria com a cor do tema anterior.
  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...axis(), ticksuffix: '°' },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: cssColor('--cyan'),
      font: { color: cssColor('--white'), size: 11 },
    },
  }), [theme]);

  const baseline = useMemo(() => baselineFor(series), [series]);

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-cyan" />
          {series?.title ?? 'Previsão de temperatura, 48h'}
        </h3>
        <div className="chart-badge">{series?.badge ?? '--'}</div>
      </header>
      {traces ? (
        <PlotlyChart traces={traces} layout={layout} baseline={baseline} ariaLabel="Previsão de temperatura para as próximas 48 horas" />
      ) : (
        <div className="chart-area chart-skeleton" />
      )}
    </section>
  );
}
