import { Suspense, lazy, useMemo } from 'react';
import Icon from '../Icon';

const WeeklyChart = lazy(() => import('./WeeklyChart'));

/**
 * Previsão de sete dias.
 *
 * O painel respondia "o que vem nas próximas 48 horas" e "como foi até aqui".
 * Faltava a semana, que é o recorte em que as pessoas decidem coisas. Os dados
 * vêm da Open-Meteo, que publica sete dias sem exigir chave, então isto não
 * custa cota nenhuma da OpenWeatherMap.
 */

// Ícones do conjunto que já existe. Chuva vira gota e tempestade vira raio, em
// vez de desenhos novos só para esta tela.
const ICONE = { sun: 'sun', cloud: 'cloud', rain: 'droplet', snow: 'sparkle', storm: 'bolt' };

function nomeDoDia(iso, indice) {
  if (indice === 0) return 'Hoje';
  if (indice === 1) return 'Amanhã';
  const data = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
}

function dataCurta(iso) {
  const [, mes, dia] = String(iso).split('-');
  return dia && mes ? `${dia}/${mes}` : iso;
}

export default function Weekly({ weekly, cidade, theme }) {
  const dias = weekly?.dias ?? [];

  // A barra de temperatura de cada dia é desenhada dentro da faixa da semana
  // inteira, não da faixa do próprio dia. É o que deixa comparar os dias de
  // relance: uma barra curta e alta é um dia quente e estável.
  const faixa = useMemo(() => {
    const minimas = dias.map((d) => d.minima).filter(Number.isFinite);
    const maximas = dias.map((d) => d.maxima).filter(Number.isFinite);
    if (!minimas.length || !maximas.length) return null;
    const min = Math.min(...minimas);
    const max = Math.max(...maximas);
    return { min, max, span: Math.max(max - min, 1) };
  }, [dias]);

  if (!dias.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Icon name="cloud" size={30} /></div>
        <div className="empty-text">Previsão da semana indisponível</div>
        <div className="empty-sub">O painel volta a tentar no próximo ciclo.</div>
      </div>
    );
  }

  return (
    <>
      <div className="alerts-header">
        <div>
          <h2 className="alerts-title">Próximos 7 dias</h2>
          <span className="alerts-count">
            {cidade}
            {weekly?.resumo?.texto ? ` · ${weekly.resumo.texto}` : ''}
          </span>
        </div>
      </div>

      {weekly?.mock && (
        <div className="inline-notice">
          Dados simulados: a fonte da previsão estendida não respondeu agora.
        </div>
      )}

      <div className="week-grid">
        {dias.map((dia, i) => {
          const altura = faixa ? ((dia.maxima - dia.minima) / faixa.span) * 100 : 0;
          const topo = faixa ? ((faixa.max - dia.maxima) / faixa.span) * 100 : 0;

          return (
            <article className={`week-day${i === 0 ? ' is-today' : ''}`} key={dia.dia}>
              <div className="week-name">{nomeDoDia(dia.dia, i)}</div>
              <div className="week-date">{dataCurta(dia.dia)}</div>

              <div className="week-icon" title={dia.ceu}>
                <Icon name={ICONE[dia.icone] ?? 'cloud'} size={22} />
              </div>

              <div className="week-bar-track" aria-hidden="true">
                <div
                  className="week-bar"
                  style={{ top: `${topo}%`, height: `${Math.max(altura, 4)}%` }}
                />
              </div>

              <div className="week-temps">
                <span className="week-max">{dia.maxima != null ? `${Math.round(dia.maxima)}°` : '--'}</span>
                <span className="week-min">{dia.minima != null ? `${Math.round(dia.minima)}°` : '--'}</span>
              </div>

              <div className={`week-rain${(dia.chanceDeChuva ?? 0) >= 50 ? ' is-wet' : ''}`}>
                <Icon name="droplet" size={11} />
                {dia.chanceDeChuva != null ? `${dia.chanceDeChuva}%` : '--'}
                {(dia.chuva ?? 0) > 0 && <span className="week-mm">{dia.chuva}mm</span>}
              </div>

              <div className="week-sky">{dia.ceu}</div>
            </article>
          );
        })}
      </div>

      {weekly?.resumo && (
        <div className="stat-strip">
          <span className="stat-chip"><Icon name="thermometer" size={12} /> máx {weekly.resumo.maxima}°C</span>
          <span className="stat-chip"><Icon name="thermometer" size={12} /> mín {weekly.resumo.minima}°C</span>
          <span className="stat-chip"><Icon name="droplet" size={12} /> {weekly.resumo.chuvaTotal}mm na semana</span>
          <span className="stat-chip"><Icon name="clock" size={12} /> {weekly.resumo.diasComChuva} dia{weekly.resumo.diasComChuva === 1 ? '' : 's'} com chuva</span>
        </div>
      )}

      <div className="charts-grid">
        <Suspense fallback={<div className="chart-card"><div className="chart-area chart-skeleton" style={{ height: 220 }} /></div>}>
          <WeeklyChart dias={dias} theme={theme} />
        </Suspense>
      </div>
    </>
  );
}
