import { useEffect, useMemo, useState } from 'react';
import PlotlyChart from '../PlotlyChart';
import { api } from '../../lib/api';
import { axis, cssColor, plotlyBase } from '../../lib/plotlyTheme';

/**
 * Alertas disparados por dia (item 13).
 *
 * É o gráfico que responde a pergunta que faz alguém mexer nos limites: se o
 * painel avisa todo dia, ninguém mais olha o aviso. Barras empilhadas por
 * gravidade, porque trinta avisos de atenção e três críticos no mesmo dia são
 * situações diferentes e a soma sozinha esconderia isso.
 */


export default function AlertsDailyChart({ days = 30, theme }) {
  const [pontos, setPontos] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.alertsDaily(days, { signal: controller.signal })
      .then((r) => setPontos(r.pontos ?? []))
      .catch((e) => {
        if (!controller.signal.aborted) setErro(e.message);
      });
    return () => controller.abort();
  }, [days]);

  const traces = useMemo(() => {
    if (!pontos?.length) return null;
    const dias = pontos.map((p) => p.dia);

    return [
      {
        x: dias,
        y: pontos.map((p) => p.warning),
        name: 'Atenção',
        type: 'bar',
        marker: { color: cssColor('--orange'), opacity: 0.85 },
        hovertemplate: '<b>%{x|%d/%m}</b><br>%{y} de atenção<extra></extra>',
      },
      {
        x: dias,
        y: pontos.map((p) => p.danger),
        name: 'Crítico',
        type: 'bar',
        marker: { color: cssColor('--red'), opacity: 0.9 },
        hovertemplate: '<b>%{x|%d/%m}</b><br>%{y} críticos<extra></extra>',
      },
    ];
  }, [pontos]);

  const layout = useMemo(() => ({
    ...plotlyBase(),
    autosize: true,
    barmode: 'stack',
    xaxis: { ...axis(), tickformat: '%d/%m', showgrid: false },
    yaxis: { ...axis(), rangemode: 'nonnegative', dtick: 1 },
    showlegend: false,
    bargap: 0.25,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: cssColor('--bg3'), bordercolor: cssColor('--orange'), font: { color: cssColor('--white'), size: 11 } },
  }), [theme]);

  // Memoizado: função nova a cada render reexecutaria o desenho do Plotly e
  // cancelaria a animação no meio.
  const baseline = useMemo(() => () => (pontos ?? []).map(() => 0), [pontos]);

  const total = pontos?.reduce((soma, p) => soma + p.total, 0) ?? 0;
  const diasComAlerta = pontos?.filter((p) => p.total > 0).length ?? 0;

  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-alert" />
          Alertas por dia, {days} dias
        </h3>
        <div className="chart-badge">
          {erro ? 'indisponível' : `${total} em ${diasComAlerta} dia${diasComAlerta === 1 ? '' : 's'}`}
        </div>
      </header>
      {traces
        ? (
          <PlotlyChart
            traces={traces}
            layout={layout}
            baseline={baseline}
            height={190}
            ariaLabel={`Quantidade de alertas disparados por dia nos últimos ${days} dias, separados por gravidade`}
          />
        )
        : <div className="chart-area chart-skeleton" style={{ height: 190 }} />}
    </section>
  );
}
