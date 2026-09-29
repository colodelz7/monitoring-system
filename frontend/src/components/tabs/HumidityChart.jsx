import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * Umidade e pressão no mesmo quadro (item 8).
 *
 * As duas ficam juntas de propósito: uma explica a outra. Pressão caindo com
 * umidade subindo é a assinatura de frente chegando, e separadas em dois
 * cartões essa relação se perde. Como as escalas não têm nada a ver, a pressão
 * usa um eixo próprio à direita.
 */
/**
 * Piso de cada traço calculado a partir dos próprios valores dele.
 *
 * Usar um piso único para os dois seria misturar escalas: a umidade vive entre
 * 0 e 100, a pressão perto de 1013. Com o piso da umidade aplicado à pressão,
 * ela começava a animação em 63, e como a animação roda sem redesenhar os
 * eixos, o eixo da direita congelava nessa faixa e a linha sumia.
 */
function baselinePorTraco(trace) {
  const valores = (trace?.y ?? []).filter(Number.isFinite);
  const piso = valores.length ? Math.min(...valores) : 0;
  return (trace?.y ?? []).map(() => piso);
}

export default function HumidityChart({ humidity, pressure, theme }) {
  const traces = useMemo(() => {
    if (!humidity?.x?.length) return null;

    const lista = [{
      x: humidity.x,
      y: humidity.y,
      name: 'Umidade',
      type: 'scatter',
      mode: 'lines',
      line: { shape: 'spline', color: cssColor('--blue2'), width: 2.2, smoothing: 1.3 },
      fill: 'tozeroy',
      fillcolor: cssColor('--chart-fill'),
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>Umidade %{y:.0f}%<extra></extra>',
    }];

    if (pressure?.y?.some(Number.isFinite)) {
      lista.push({
        x: pressure.x,
        y: pressure.y,
        name: 'Pressão',
        type: 'scatter',
        mode: 'lines',
        yaxis: 'y2',
        line: { shape: 'spline', color: cssColor('--violet'), width: 1.8, dash: 'dot' },
        hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>Pressão %{y:.0f} hPa<extra></extra>',
      });
    }

    return lista;
  }, [humidity, pressure]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    margin: { l: 42, r: 62, t: 8, b: 34 },
    xaxis: { ...axis(), tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...axis(), ticksuffix: '%', range: [0, 100] },
    // Sem grade no eixo secundário: duas grades sobrepostas viram ruído.
    yaxis2: {
      ...axis(),
      showgrid: false,
      overlaying: 'y',
      side: 'right',
      ticksuffix: ' hPa',
    },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: cssColor('--blue2'),
      font: { color: cssColor('--white'), size: 11 },
    },
  }), [theme]);

  const baseline = useMemo(() => baselinePorTraco, []);

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-blue" />
          {humidity?.title ?? 'Umidade e pressão, 48h'}
        </h3>
        <div className="chart-badge">{humidity?.badge ?? '--'}</div>
      </header>
      {traces ? (
        <PlotlyChart
          traces={traces}
          layout={layout}
          baseline={baseline}
          ariaLabel="Umidade relativa e pressão atmosférica previstas para as próximas 48 horas"
        />
      ) : (
        <div className="chart-area chart-skeleton" />
      )}
    </section>
  );
}
