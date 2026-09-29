import { config } from '../config/env.js';
import { TtlCache } from '../lib/cache.js';
import { createLogger } from '../lib/logger.js';
import { TIMEZONES } from '../domain/constants.js';
import { detectarAnomalia } from '../domain/anomaly.js';
import { lerMetricas } from '../domain/metrics.js';
import { buildAlerts, deriveStatus, summarizeAlerts } from './alerts.service.js';
import { alertStore } from './alertStore.js';
import { notifyByEmail } from './email.service.js';
import { daily, record, series } from './readingStore.js';
import { ativas as regrasAtivas } from './rulesStore.js';
import { getAirQuality } from './airQuality.service.js';
import { getExtendedForecast } from './extendedForecast.service.js';
import { getForecast, getWeather } from './weather.service.js';
import { filtrarPorRaio, getSeismic } from './seismic.service.js';

const log = createLogger('dashboard');

// Cache do payload ja montado. Uma rajada de clientes pedindo a mesma cidade com
// os mesmos limites recebe a mesma resposta sem refazer o trabalho de montagem.
const payloadCache = new TtlCache({ maxEntries: 120 });

// Ultimo payload bem-sucedido por cidade, para servir quando tudo cair.
// O sistema anterior guardava um unico cache global e acabava devolvendo os
// dados de uma cidade como se fossem de outra.
const offlineByCity = new Map();
const OFFLINE_LIMIT = 50;

// Referências à paleta do cliente, não valores fixos: quem resolve o token
// é o CSS, que sabe em qual tema está. Ver o bloco de variáveis em style.css.
const CARD_COLORS = {
  cyan: 'var(--cyan)',
  blue: 'var(--blue2)',
  red: 'var(--red)',
  orange: 'var(--orange)',
  green: 'var(--green)',
  indigo: 'var(--violet)',
  muted: 'var(--w20)',
};

function localTimeFor(city) {
  const offset = TIMEZONES[city] ?? -3;
  const shifted = new Date(Date.now() + offset * 3600000);
  return { offset, time: shifted.toISOString().slice(11, 19) };
}

/**
 * Monta os cartoes do painel ja resolvidos: valor, unidade, cor e legenda.
 * Cor e formatacao sao regra de negocio (o que conta como temperatura critica),
 * entao vivem aqui e nao espalhadas por componentes React.
 */
function buildCards({ weather, seismic, airQuality, alertSummary, thresholds }) {
  const { tempMin, tempMax } = thresholds;

  const tempColor = !weather.success
    ? CARD_COLORS.muted
    : weather.temp >= tempMax
      ? CARD_COLORS.red
      : weather.temp <= tempMin
        ? CARD_COLORS.blue
        : CARD_COLORS.cyan;

  const summary = seismic.summary;
  const seismicColor = summary.maxMagnitude >= 6
    ? CARD_COLORS.red
    : summary.maxMagnitude >= thresholds.magThreshold
      ? CARD_COLORS.orange
      : CARD_COLORS.indigo;

  const alertsColor = alertSummary.danger
    ? CARD_COLORS.red
    : alertSummary.total
      ? CARD_COLORS.orange
      : CARD_COLORS.green;

  const strongest = summary.strongest;
  const place = strongest ? truncate(strongest.place, 26) : null;

  const aqiPreview = airQuality.components
    .filter((c) => ['pm25', 'no2', 'o3'].includes(c.key) && c.value != null)
    .map((c) => `${c.label}: ${c.value}`)
    .join(' · ');

  return [
    {
      id: 'temp',
      variant: 'cyan',
      icon: 'thermometer',
      label: 'Temperatura Atual',
      value: weather.success ? weather.temp : null,
      display: weather.success ? `${weather.temp}°C` : null,
      numeric: weather.success ? weather.temp : null,
      decimals: 1,
      suffix: '°C',
      color: tempColor,
      description: weather.success
        ? `mín ${weather.temp_min}°C · máx ${weather.temp_max}°C · ${weather.description}`
        : '--',
    },
    {
      id: 'humidity',
      variant: 'blue',
      icon: 'droplet',
      label: 'Umidade & Ventos',
      value: weather.success ? weather.humidity : null,
      display: weather.success ? `${weather.humidity}%` : null,
      numeric: weather.success ? weather.humidity : null,
      decimals: 0,
      suffix: '%',
      color: CARD_COLORS.blue,
      description: weather.success
        ? `${weather.wind_speed} m/s ${weather.windCompass} · ${weather.pressure} hPa`
        : '--',
    },
    {
      id: 'air',
      variant: 'aqi',
      icon: 'leaf',
      label: 'Qualidade do Ar',
      value: airQuality.aqi,
      display: airQuality.label ?? '--',
      numeric: null,
      color: airQuality.color ?? CARD_COLORS.muted,
      description: aqiPreview || 'Indisponível',
      tooltip: airQuality.advice ?? null,
    },
    {
      id: 'seismic',
      variant: 'ind',
      icon: 'quake',
      label: 'Eventos Sísmicos',
      value: summary.total,
      display: String(summary.total),
      numeric: summary.total,
      decimals: 0,
      color: summary.total ? seismicColor : CARD_COLORS.muted,
      description: summary.total
        ? `Máx M${summary.maxMagnitude.toFixed(1)} · ${place}`
        : 'Sem eventos no período',
    },
    {
      id: 'alerts',
      variant: 'alert',
      icon: 'bell',
      label: 'Alertas Ativos',
      value: alertSummary.total,
      display: String(alertSummary.total),
      numeric: alertSummary.total,
      decimals: 0,
      color: alertsColor,
      description: `${alertSummary.clima} clima · ${alertSummary.sismo} sismo`,
    },
  ];
}

function truncate(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 3)}…` : value;
}

/**
 * Series prontas para os graficos. O frontend so mapeia x e y; decidir quais
 * pontos entram, como agregar e o que vai no rodape e trabalho do servidor.
 */
// Quantos dias cada janela cobre. É o que transforma o seletor de período em
// um filtro do painel inteiro, e não só do mapa sísmico.
const PERIOD_DAYS = Object.freeze({ day: 1, week: 7, month: 30, quarter: 90, year: 365 });

/**
 * Séries do histórico que o próprio sistema gravou.
 *
 * A previsão da OpenWeatherMap olha 48 horas para frente, então ela responde
 * "o que vem". Para "como foi na última semana" não existe fonte gratuita: a
 * resposta tem que vir do que gravamos. Enquanto não houver dias suficientes,
 * isso é dito na cara em vez de devolver um gráfico vazio que parece defeito.
 */
function buildHistoryCharts(historico, period) {
  const days = PERIOD_DAYS[period] ?? 1;
  if (days <= 1) return null;

  // O histórico vem com pelo menos trinta dias, porque a comparação precisa
  // dessa base. O gráfico mostra só a janela pedida.
  const comTemp = historico.slice(-days).filter((d) => d.temperatura);

  if (comTemp.length < 2) {
    return {
      disponivel: false,
      dias: comTemp.length,
      diasPedidos: days,
      aviso: comTemp.length === 0
        ? 'O histórico desta cidade começa a ser gravado agora. Volte em algumas horas.'
        : 'Ainda há só um dia gravado. O gráfico aparece a partir do segundo.',
    };
  }

  const eixoX = comTemp.map((d) => d.dia);

  return {
    disponivel: true,
    dias: comTemp.length,
    diasPedidos: days,
    temperatura: {
      x: eixoX,
      y: comTemp.map((d) => d.temperatura.media),
      min: comTemp.map((d) => d.temperatura.min),
      max: comTemp.map((d) => d.temperatura.max),
      title: `Temperatura registrada, ${comTemp.length} dia${comTemp.length === 1 ? '' : 's'}`,
      badge: `média ${media(comTemp.map((d) => d.temperatura.media))}°C`,
      unit: '°C',
    },
    umidade: {
      x: eixoX,
      y: comTemp.map((d) => d.umidade?.media ?? null),
      min: comTemp.map((d) => d.umidade?.min ?? null),
      max: comTemp.map((d) => d.umidade?.max ?? null),
      title: 'Umidade registrada',
      unit: '%',
    },
    amostras: comTemp.reduce((soma, d) => soma + d.amostras, 0),
  };
}

function media(valores) {
  const validos = valores.filter(Number.isFinite);
  if (!validos.length) return null;
  return Number((validos.reduce((a, b) => a + b, 0) / validos.length).toFixed(1));
}

function buildCharts(forecast, airQuality) {
  const points = forecast?.points ?? [];
  const temps = points.map((p) => p.temp).filter(Number.isFinite);
  const rainTotal = points.reduce((sum, p) => sum + (p.rain || 0), 0);

  const ultimo = (campo) => {
    const valores = points.map((p) => p[campo]).filter(Number.isFinite);
    return valores.length ? valores[valores.length - 1] : null;
  };

  return {
    temperature: {
      x: points.map((p) => p.datetime),
      y: points.map((p) => p.temp),
      title: 'Previsão de temperatura, 48h',
      badge: points[1]?.temp != null ? `próx: ${points[1].temp.toFixed(1)}°C` : '--',
      unit: '°C',
      min: temps.length ? Math.min(...temps) : null,
      max: temps.length ? Math.max(...temps) : null,
    },
    rain: {
      x: points.map((p) => p.datetime),
      y: points.map((p) => p.rain || 0),
      title: 'Precipitação prevista, 48h',
      badge: points.length ? `total: ${rainTotal.toFixed(1)}mm` : '--',
      unit: 'mm',
      total: Number(rainTotal.toFixed(2)),
    },

    // Umidade e pressão saem da mesma resposta de previsão que já é
    // buscada para a temperatura. Duas leituras a mais, nenhuma chamada a
    // mais. Ficam no mesmo quadro porque uma explica a outra: pressão
    // caindo com umidade subindo é a assinatura de frente chegando.
    humidity: {
      x: points.map((p) => p.datetime),
      y: points.map((p) => p.humidity ?? null),
      title: 'Umidade e pressão, 48h',
      badge: ultimo('humidity') != null ? `fim: ${ultimo('humidity')}%` : '--',
      unit: '%',
    },
    pressure: {
      x: points.map((p) => p.datetime),
      y: points.map((p) => p.pressure ?? null),
      title: 'Pressão',
      unit: 'hPa',
    },

    // Item 12: a composição do ar já é buscada e só aparecia como quatro
    // números miúdos embaixo do cartão.
    airBreakdown: airQuality?.success && Array.isArray(airQuality.components)
      ? {
        x: airQuality.components.map((c) => c.label),
        y: airQuality.components.map((c) => c.value),
        title: 'Composição do ar',
        badge: airQuality.label ?? '--',
        unit: 'µg/m³',
        color: airQuality.color ?? null,
      }
      : null,
  };
}

// Quantos dias de anomalia olham para trás. Trinta é curto o suficiente para
// que a estação do ano não entre na conta: comparar um dia de setembro com a
// média de doze meses diz mais sobre o calendário que sobre o tempo.
const DIAS_PARA_ANOMALIA = 30;

/**
 * Serie recente que as regras de variacao precisam.
 *
 * So e buscada se existir alguma regra desse tipo, e a janela e a maior entre
 * elas. Quem nao criou regra de variacao nao paga leitura de disco nenhuma por
 * causa desta funcionalidade.
 */
async function serieParaRegras(city, regras) {
  const janela = regras
    .filter((regra) => regra.tipo === 'variacao')
    .reduce((maior, regra) => Math.max(maior, regra.variacao.janelaHoras), 0);

  if (!janela) return [];

  try {
    return await series(city, { from: new Date(Date.now() - janela * 3600000) });
  } catch (error) {
    log.warn(`série para regras de variação indisponível: ${error.message}`);
    return [];
  }
}

async function assemble(city, period, thresholds) {
  const [weather, forecast] = await Promise.all([getWeather(city), getForecast(city)]);
  const seismicGlobal = await getSeismic(period, thresholds.magThreshold);
  const airQuality = weather.lat != null && weather.lon != null
    ? await getAirQuality(weather.lat, weather.lon)
    : await getAirQuality(null, null);

  // O feed sismico e global e fica assim no cache. O recorte por distancia
  // acontece depois, sobre a resposta ja em memoria, para que acompanhar
  // cidades diferentes nao multiplique chamadas a USGS.
  const seismic = filtrarPorRaio(seismicGlobal, {
    lat: weather.lat,
    lon: weather.lon,
    raioKm: thresholds.seismicRadiusKm,
  });

  const historico = await historicoDaCidade(city, period);
  const valores = lerMetricas(weather, airQuality);

  const regras = await regrasAtivas().catch((error) => {
    log.warn(`regras indisponíveis: ${error.message}`);
    return [];
  });

  const serieRecente = await serieParaRegras(city, regras);
  const anomalia = detectarAnomalia({ dias: historico.slice(-DIAS_PARA_ANOMALIA), valores });

  const alerts = buildAlerts({
    weather,
    forecast,
    seismic,
    thresholds,
    regras,
    valores,
    serie: serieRecente,
    anomalia,
  });

  const alertSummary = summarizeAlerts(alerts);
  const { offset, time } = localTimeFor(city);
  const trend = buildTrend(historico, weather, period);
  const history = buildHistoryCharts(historico, period);

  // Sete dias a frente. Depende da coordenada que a leitura do clima resolveu,
  // entao usa exatamente o mesmo ponto que o resto do painel.
  const weekly = await getExtendedForecast(weather.lat, weather.lon);

  return {
    city,
    period,
    thresholds,
    generatedAt: new Date().toISOString(),
    weather,
    forecast,
    weekly,
    seismic,
    aqi: airQuality,
    alerts,
    alertSummary,
    // O que o sistema considera normal nesta cidade, junto com o que fugiu
    // disso hoje. Vai no payload mesmo quando não há achado, porque a tela
    // precisa saber diferenciar "nada fora do normal" de "ainda não dá para
    // dizer o que é normal aqui".
    anomalia,
    status: deriveStatus(alerts),
    cards: buildCards({ weather, seismic, airQuality, alertSummary, thresholds }),
    charts: {
      ...buildCharts(forecast, airQuality),
      // Só existe quando a janela escolhida é maior que 24 horas.
      history,
    },
    periodDays: PERIOD_DAYS[period] ?? 1,
    // Comparação com o próprio histórico. Null enquanto não houver dias
    // suficientes gravados, e a interface omite o bloco nesse caso.
    trend,
    cityTime: time,
    utcOffset: offset,
    isMock: Boolean(weather.mock),
    isCached: false,
    cacheAge: 0,
  };
}

/**
 * Agregado diario da cidade, buscado uma vez por ciclo.
 *
 * Tres coisas precisam dele: o grafico historico, a comparacao com a media e a
 * deteccao de anomalia. Antes cada uma chamava `daily` por conta propria, o que
 * significava repetir a mesma agregacao tres vezes no mesmo ciclo.
 *
 * A janela acompanha o periodo escolhido, com piso de trinta dias: em 24 horas
 * ou 7 dias a base de comparacao continua sendo o mes, porque uma media de
 * sete pontos nao e base de nada.
 */
async function historicoDaCidade(city, period) {
  const dias = Math.max(DIAS_PARA_ANOMALIA, PERIOD_DAYS[period] ?? 1);
  try {
    return await daily(city, { days: dias });
  } catch (error) {
    log.warn(`histórico de ${city} indisponível: ${error.message}`);
    return [];
  }
}

export async function getDashboard({ city, period, thresholds }) {
  // O raio entra na chave. Sem ele, mudar de "planeta inteiro" para "500 km"
  // devolveria o payload global guardado, e o filtro pareceria não funcionar.
  const key = [
    city,
    period,
    thresholds.tempMin,
    thresholds.tempMax,
    thresholds.magThreshold,
    thresholds.seismicRadiusKm,
  ].join('|');

  try {
    const { value, cached, ageMs } = await payloadCache.resolve(
      key,
      config.cacheTtlMs.weather,
      () => assemble(city, period, thresholds),
      { staleIfError: false },
    );

    rememberOffline(city, value);

    // Os efeitos colaterais rodam apenas quando o payload foi realmente
    // recalculado. Servir do cache nao deve regravar historico nem reenviar
    // e-mail, senao o polling dos clientes vira volume de escrita.
    if (!cached) {
      // A leitura é gravada sempre, com ou sem alerta: é dela que sai a série
      // histórica. O alerta continua tendo caminho próprio.
      void persistReading(city, value.weather, value.aqi);
      if (value.alerts.length) void persistAndNotify(value.alerts, city);
    }

    return { ...value, isCached: cached, cacheAge: Math.floor(ageMs / 1000) };
  } catch (error) {
    const fallback = offlineByCity.get(city);
    if (fallback) {
      log.warn(`servindo cache offline de ${city}: ${error.message}`);
      return {
        ...fallback.payload,
        isCached: true,
        isStale: true,
        cacheAge: Math.floor((Date.now() - fallback.storedAt) / 1000),
      };
    }
    throw error;
  }
}

function rememberOffline(city, payload) {
  if (offlineByCity.size >= OFFLINE_LIMIT && !offlineByCity.has(city)) {
    const oldest = offlineByCity.keys().next().value;
    if (oldest !== undefined) offlineByCity.delete(oldest);
  }
  offlineByCity.set(city, { payload, storedAt: Date.now() });
}

/**
 * Guarda a leitura desta cidade na serie historica.
 *
 * Roda junto do registro de alertas, no mesmo ponto: so no cache miss, ou seja,
 * uma vez por ciclo real de busca, nunca a cada requisicao servida de cache.
 * O proprio armazenamento ainda aplica um intervalo minimo por cidade.
 */
async function persistReading(city, weather, airQuality) {
  try {
    await record({ city, weather, airQuality });
  } catch (error) {
    // Serie historica e um extra. Falhar aqui nao pode estragar o painel.
    log.warn(`nao consegui gravar a leitura de ${city}: ${error.message}`);
  }
}

/**
 * Compara a leitura de agora com o que essa cidade costuma ser.
 *
 * Um numero sozinho nao diz se o dia esta quente: 18 graus e frio em Cuiaba e
 * ameno em Curitiba. A media dos ultimos dias da a referencia, e os extremos
 * dizem se hoje encostou em algum limite conhecido. Enquanto nao houver
 * historico suficiente, devolve null e a interface simplesmente nao mostra o
 * bloco, em vez de inventar uma base a partir de dois pontos.
 */
/**
 * Extremo de uma metrica dentro da janela, com o dia em que aconteceu.
 *
 * Recebe qual ponta interessa, porque "recorde" quer dizer coisas diferentes
 * por metrica: da temperatura importam as duas pontas, do vento so a maxima,
 * e da pressao a minima e que e sinal de tempo ruim chegando.
 */
function recordeDe(dias, campo, ponta) {
  const comDado = dias.filter((d) => d[campo] && Number.isFinite(d[campo][ponta]));
  if (!comDado.length) return null;

  const escolhido = comDado.reduce((a, b) => {
    const melhor = ponta === 'max' ? b[campo].max > a[campo].max : b[campo].min < a[campo].min;
    return melhor ? b : a;
  });

  return { dia: escolhido.dia, valor: escolhido[campo][ponta] };
}

function buildTrend(historico, weather, period) {
  if (!weather?.success) return null;

  // A janela acompanha o período escolhido, com piso de trinta dias. Em 24
  // horas ou 7 dias o recorde de uma janela igual ao período seria quase
  // sempre o próprio dia de hoje, o que não é recorde nenhum.
  const janela = Math.max(DIAS_PARA_ANOMALIA, PERIOD_DAYS[period] ?? 1);
  const dias = historico.slice(-janela);

  const comTemp = dias.filter((d) => d.temperatura);
  if (comTemp.length < 2) return null;

  const mediaDe = (lista) => {
    const valores = lista.map((d) => d.temperatura.media).filter(Number.isFinite);
    if (!valores.length) return null;
    return Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1));
  };

  const media7 = mediaDe(comTemp.slice(-7));
  const mediaJanela = mediaDe(comTemp);
  const diferenca = media7 == null ? null : Number((weather.temp - media7).toFixed(1));

  return {
    diasObservados: comTemp.length,
    janelaDias: janela,
    media7,
    // O nome antigo continua por compatibilidade com quem já lia este campo.
    media30: mediaJanela,
    mediaJanela,
    diferenca,
    // Texto pronto, porque decidir o que conta como "acima do normal" e regra
    // de negocio e nao formatacao de tela.
    resumo: diferenca == null
      ? null
      : Math.abs(diferenca) < 1
        ? 'dentro da média dos últimos 7 dias'
        : `${Math.abs(diferenca).toFixed(1)}°C ${diferenca > 0 ? 'acima' : 'abaixo'} da média de 7 dias`,
    recordes: {
      maisQuente: recordeDe(dias, 'temperatura', 'max'),
      maisFrio: recordeDe(dias, 'temperatura', 'min'),
      maisVentoso: recordeDe(dias, 'vento', 'max'),
      maisUmido: recordeDe(dias, 'umidade', 'max'),
      maisSeco: recordeDe(dias, 'umidade', 'min'),
      // Pressão baixa é o sinal que antecede tempo ruim, então dela interessa
      // o fundo, não o topo.
      menorPressao: recordeDe(dias, 'pressao', 'min'),
    },
  };
}

async function persistAndNotify(alerts, city) {
  try {
    const stored = await alertStore.append(alerts);
    // Apenas alertas realmente novos viram e-mail. Repeticoes de uma condicao ja
    // registrada nao geram nova mensagem.
    if (stored.length) await notifyByEmail(stored, city);
  } catch (error) {
    log.error(`pos-processamento de alertas falhou: ${error.message}`);
  }
}

/**
 * Descarta o payload guardado.
 *
 * O cache existe para que uma rajada de clientes não vire uma rajada de
 * chamadas na API paga, e por isso ele guarda o painel inteiro montado. Só que
 * o painel montado inclui os alertas das regras, e as regras mudam fora deste
 * ciclo: criar uma regra e esperar dois minutos para ela valer parece que a
 * criação não funcionou. Quem mexe nas regras chama isto e a próxima requisição
 * remonta.
 */
export function invalidateDashboardCache() {
  payloadCache.clear();
}

export function dashboardCacheStats() {
  return { payload: payloadCache.stats, offlineCities: offlineByCity.size };
}

export function offlineSnapshot() {
  const cities = [...offlineByCity.entries()].map(([city, entry]) => ({
    city,
    ageSeconds: Math.floor((Date.now() - entry.storedAt) / 1000),
  }));
  return { hasCached: cities.length > 0, cities };
}
