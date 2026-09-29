import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * A semana em um quadro: faixa de temperatura e chuva prevista.
 *
 * A grade acima já diz o número de cada dia. O que ela não mostra é a forma da
 * semana, e é isso que o gráfico responde: onde a faixa se estreita, o dia é
 * estável; onde a chuva sobe junto com a mínima, é frente passando.
 *
 * A chuva tem eixo próprio à direita porque milímetro e grau não dividem
 * escala. Sem isso, um dia de 20mm achataria a temperatura inteira no rodapé.
 */
function baselinePorTraco(trace) {
  const valores = (trace?.y ?? []).filter(Number.isFinite);
  const piso = valores.length ? Math.min(...valores) : 0;
  return (trace?.y ?? []).map(() => piso);
}

export default function WeeklyChart({ dias, theme }) {
  const traces = useMemo(() => {
    if (!dias?.length) return null;

    const x = dias.map((d) => d.dia);

    return [
      {
        x,
        y: dias.map((d) => d.maxima),
        name: 'Máxima',
        type: 'scatter',
        mode: 'lines+markers',
        line: { shape: 'spline', color: cssColor('--orange'), width: 2.4, smoothing: 1.2 },
        marker: { size: 6, color: cssColor('--orange') },
        hovertemplate: '<b>%{x|%d/%m}</b><br>Máxima %{y:.1f}°C<extra></extra>',
      },
      {
        x,
        y: dias.map((d) => d.minima),
        name: 'Mínima',
        type: 'scatter',
        mode: 'lines+markers',
        line: { shape: 'spline', color: cssColor('--blue2'), width: 2.4, smoothing: 1.2 },
        marker: { size: 6, color: cssColor('--blue2') },
        // Preenche até a linha anterior, então a área entre mínima e máxima
        // vira a amplitude do dia, que é a leitura que interessa.
        fill: 'tonexty',
        fillcolor: cssColor('--chart-fill'),
        hovertemplate: '<b>%{x|%d/%m}</b><br>Mínima %{y:.1f}°C<extra></extra>',
      },
      {
        x,
        y: dias.map((d) => d.chuva ?? 0),
        name: 'Chuva',
        type: 'bar',
        yaxis: 'y2',
        marker: { color: cssColor('--cyan-glow'), line: { color: cssColor('--cyan'), width: 1 } },
        hovertemplate: '<b>%{x|%d/%m}</b><br>Chuva %{y:.1f} mm<extra></extra>',
      },
    ];
  }, [dias]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    // Só dia e mês. O Plotly escreve o nome do dia da semana em inglês, e o
    // nome já está nos cartões logo acima, em português.
    xaxis: { ...axis(), tickformat: '%d/%m' },
    yaxis: { ...axis(), ticksuffix: '°' },
    yaxis2: {
      ...axis(),
      overlaying: 'y',
      side: 'right',
      showgrid: false,
      ticksuffix: 'mm',
      rangemode: 'tozero',
    },
    barmode: 'overlay',
    showlegend: true,
    legend: { orientation: 'h', y: -0.22, font: { size: 10, color: cssColor('--w50') } },
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: cssColor('--cyan'),
      font: { color: cssColor('--white'), size: 11 },
    },
  }), [theme]);

  const baseline = useMemo(() => baselinePorTraco, []);

  return (
    <section className="chart-card chart-card--wide">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-orange" />
          Faixa de temperatura e chuva, 7 dias
        </h3>
      </header>
      {traces ? (
        <PlotlyChart
          traces={traces}
          layout={layout}
          baseline={baseline}
          ariaLabel="Mínima, máxima e chuva prevista para os próximos sete dias"
        />
      ) : (
        <div className="chart-area chart-skeleton" />
      )}
    </section>
  );
}
