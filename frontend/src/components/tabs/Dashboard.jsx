import { Suspense, lazy } from 'react';
import Cards from './Cards';
import TrendStrip from './TrendStrip';

// Os cartões são a primeira leitura útil da tela e não dependem de biblioteca
// nenhuma. Os gráficos trazem o Plotly junto, então entram depois, com o
// esqueleto já ocupando a altura final para o layout não saltar quando chegam.
const ForecastChart = lazy(() => import('./ForecastChart'));
const RainChart = lazy(() => import('./RainChart'));
const HumidityChart = lazy(() => import('./HumidityChart'));
const AirChart = lazy(() => import('./AirChart'));
const HistoryChart = lazy(() => import('./HistoryChart'));

function ChartPlaceholder() {
  return (
    <section className="chart-card">
      <header className="chart-header">
        <h3 className="chart-title"><span className="chart-dot dot-cyan" />Carregando gráfico</h3>
      </header>
      <div className="chart-area chart-skeleton" style={{ height: 220 }} />
    </section>
  );
}

export default function Dashboard({ data, loading, theme, prefs }) {
  const charts = data?.charts;

  // O período muda o que o painel responde. Em 24 horas a pergunta é "o que
  // vem", e quem responde é a previsão. Em janelas maiores a pergunta é "como
  // foi", e aí só o histórico que gravamos pode responder, porque previsão
  // gratuita não olha para trás.
  const olhandoParaTras = Boolean(charts?.history);

  return (
    <>
      <Cards
        cards={data?.cards}
        loading={loading}
        prefs={prefs?.prefs}
        onToggleCard={prefs?.toggleCartao}
        onMoveCard={prefs?.moverCartao}
        onRestore={prefs?.restaurarCartoes}
        personalizado={prefs?.personalizado}
      />

      <TrendStrip trend={data?.trend} anomalia={data?.anomalia} />

      <div className="charts-grid">
        {olhandoParaTras ? (
          <Suspense fallback={<ChartPlaceholder />}>
            <HistoryChart history={charts.history} theme={theme} />
          </Suspense>
        ) : (
          <Suspense fallback={<ChartPlaceholder />}>
            <ForecastChart series={charts?.temperature} theme={theme} />
          </Suspense>
        )}

        <Suspense fallback={<ChartPlaceholder />}>
          <RainChart series={charts?.rain} theme={theme} />
        </Suspense>

        <Suspense fallback={<ChartPlaceholder />}>
          <HumidityChart
            humidity={charts?.humidity}
            pressure={charts?.pressure}
            theme={theme}
          />
        </Suspense>

        {charts?.airBreakdown && (
          <Suspense fallback={<ChartPlaceholder />}>
            <AirChart series={charts.airBreakdown} theme={theme} />
          </Suspense>
        )}
      </div>
    </>
  );
}
