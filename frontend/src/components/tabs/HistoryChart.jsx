import { useMemo } from 'react';
import PlotlyChart from '../PlotlyChart';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * Temperatura registrada dia a dia (item 2).
 *
 * A previsão só olha 48 horas para frente. Para janelas maiores a resposta vem
 * do que o próprio sistema gravou, e por isso o gráfico mostra a faixa entre a
 * mínima e a máxima do dia além da média: em um agregado diário, dizer só a
 * média esconderia justamente a amplitude, que é o que distingue um dia estável
 * de um dia que variou dez graus.
 */
function baselinePorTraco(trace) {
  const valores = (trace?.y ?? []).filter(Number.isFinite);
  const piso = valores.length ? Math.min(...valores) : 0;
  return (trace?.y ?? []).map(() => piso);
}

export default function HistoryChart({ history, theme }) {
  const serie = history?.temperatura;

  const traces = useMemo(() => {
    if (!serie?.x?.length) return null;

    const faixa = cssColor('--chart-fill');

    return [
      // A faixa é desenhada primeiro, como duas linhas invisíveis preenchidas
      // entre si, para a média ficar por cima e legível.
      {
        x: serie.x,
        y: serie.max,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        x: serie.x,
        y: serie.min,
        type: 'scatter',
        mode: 'lines',
        line: { width: 0 },
        fill: 'tonexty',
        fillcolor: faixa,
        hoverinfo: 'skip',
        showlegend: false,
      },
      {
        x: serie.x,
        y: serie.y,
        name: 'Média',
        type: 'scatter',
        mode: 'lines+markers',
        line: { shape: 'spline', color: cssColor('--cyan'), width: 2.4, smoothing: 1.2 },
        marker: { size: 5, color: cssColor('--cyan') },
        hovertemplate: '<b>%{x|%d/%m}</b><br>média %{y:.1f}°C<extra></extra>',
      },
    ];
  }, [serie]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    xaxis: { ...axis(), tickformat: '%d/%m' },
    yaxis: { ...axis(), ticksuffix: '°' },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: cssColor('--bg3'),
      bordercolor: cssColor('--cyan'),
      font: { color: cssColor('--white'), size: 11 },
    },
  }), [theme]);

  const baseline = useMemo(() => baselinePorTraco, []);

  // Sem dias suficientes o servidor manda o motivo, e dizer isso é melhor que
  // mostrar um quadro vazio que parece defeito.
  if (history && !history.disponivel) {
    return (
      <section className="chart-card">
        <header className="chart-header">
          <h3 className="chart-title">
            <span className="chart-dot dot-cyan" />
            Temperatura registrada
          </h3>
          <div className="chart-badge">{history.dias} de {history.diasPedidos} dias</div>
        </header>
        <div className="empty-state" style={{ minHeight: 190 }}>
          <div className="empty-text">Histórico ainda curto</div>
          <div className="empty-sub">{history.aviso}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-cyan" />
          {serie?.title ?? 'Temperatura registrada'}
        </h3>
        <div className="chart-badge">{serie?.badge ?? '--'}</div>
      </header>
      {traces
        ? (
          <PlotlyChart
            traces={traces}
            layout={layout}
            baseline={baseline}
            ariaLabel="Temperatura média registrada por dia, com a faixa entre mínima e máxima"
          />
        )
        : <div className="chart-area chart-skeleton" />}
    </section>
  );
}
