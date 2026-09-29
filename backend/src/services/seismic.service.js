import { config } from '../config/env.js';
import { TtlCache } from '../lib/cache.js';
import { fetchJSON } from '../lib/httpClient.js';
import { createLogger } from '../lib/logger.js';
import { SEISMIC_EVENT_LIMIT, SEISMIC_PALETTE } from '../domain/constants.js';

const log = createLogger('seismic');
const cache = new TtlCache({ maxEntries: 8 });

const SUMMARY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';
const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/**
 * Janelas oferecidas no painel.
 *
 * A USGS publica feed pronto so ate 30 dias. Alem disso e preciso consultar a
 * API de eventos, que recusa qualquer busca com mais de 20 mil resultados: 90
 * dias sem filtro daria 33 mil e um ano daria 132 mil. Por isso as janelas
 * longas trazem uma magnitude minima. Nao e limitacao de desenho, e o que a
 * fonte permite, e tambem o recorte mais util: em um ano, o que interessa em
 * um mapa global sao os eventos que realmente foram sentidos.
 */
const PERIODS = Object.freeze({
  day: { label: '24 horas', feed: `${SUMMARY}/all_day.geojson`, minMagnitude: 0 },
  week: { label: '7 dias', feed: `${SUMMARY}/all_week.geojson`, minMagnitude: 0 },
  month: { label: '30 dias', feed: `${SUMMARY}/all_month.geojson`, minMagnitude: 0 },
  quarter: { label: '90 dias', days: 90, minMagnitude: 4.5 },
  year: { label: '1 ano', days: 365, minMagnitude: 5 },
});

export const SEISMIC_PERIODS = Object.freeze(
  Object.entries(PERIODS).map(([value, p]) => ({
    value,
    label: p.label,
    minMagnitude: p.minMagnitude,
  })),
);

function feedUrl(period) {
  const spec = PERIODS[period] ?? PERIODS.day;
  if (spec.feed) return spec.feed;

  const start = new Date(Date.now() - spec.days * 86400000).toISOString();
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: start,
    minmagnitude: String(spec.minMagnitude),
    // Os mais fortes primeiro: o corte em SEISMIC_EVENT_LIMIT passa a
    // guardar o que importa, em vez do que chegou por ultimo.
    orderby: 'magnitude',
  });
  return `${FDSN}?${params.toString()}`;
}

const STRONG_MAGNITUDE = 6;

function round(value, digits = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

/**
 * Somente URLs de evento do proprio dominio da USGS sao repassadas adiante.
 * O link chega a ser renderizado como ancora, entao a origem e validada aqui e
 * nao na camada de view.
 */
function safeEventUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const okProtocol = url.protocol === 'https:';
    const okHost = url.hostname === 'earthquake.usgs.gov' || url.hostname.endsWith('.usgs.gov');
    return okProtocol && okHost ? url.toString() : null;
  } catch {
    return null;
  }
}

async function requestFeed(period) {
  // As janelas longas trazem mais de mil eventos e a resposta passa de um
  // megabyte, entao vale mais tempo de espera que o padrao das outras APIs.
  const timeoutMs = PERIODS[period]?.days ? 20000 : undefined;
  const data = await fetchJSON(feedUrl(period), { label: `usgs/${period}`, timeoutMs });
  const features = Array.isArray(data.features) ? data.features : [];

  return features
    .map((feature) => {
      const coords = feature.geometry?.coordinates || [];
      return {
        id: feature.id || null,
        place: feature.properties?.place || 'Desconhecido',
        magnitude: round(feature.properties?.mag ?? 0),
        depth: round(coords[2] ?? 0),
        latitude: coords[1] ?? null,
        longitude: coords[0] ?? null,
        time: feature.properties?.time ? new Date(feature.properties.time).toISOString() : null,
        url: safeEventUrl(feature.properties?.url),
      };
    })
    .filter((event) => event.magnitude > 0 && event.latitude != null && event.longitude != null)
    .sort((a, b) => b.magnitude - a.magnitude);
}

function classify(magnitude, threshold) {
  if (magnitude >= STRONG_MAGNITUDE) return 'strong';
  if (magnitude >= threshold) return 'alert';
  return 'mild';
}

const RAIO_DA_TERRA_KM = 6371;

/**
 * Distancia em linha reta entre dois pontos da esfera.
 *
 * A formula de haversine e suficiente aqui: o erro contra o elipsoide real fica
 * abaixo de meio por cento, e a pergunta que isto responde e "esta perto?", com
 * raios escolhidos em centenas de quilometros.
 */
export function distanciaKm(latA, lonA, latB, lonB) {
  if (![latA, lonA, latB, lonB].every(Number.isFinite)) return null;

  const rad = Math.PI / 180;
  const dLat = (latB - latA) * rad;
  const dLon = (lonB - lonA) * rad;

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;

  return Number((2 * RAIO_DA_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(a)))).toFixed(1));
}

/**
 * Recorta o feed sismico ao redor de um ponto.
 *
 * O feed da USGS e global, e para quem acompanha uma cidade a maior parte dele
 * e ruido: um M5 do outro lado do planeta nao muda nada, e um M4 a duzentos
 * quilometros muda. O filtro roda aqui, depois do cache, e nao na busca: o
 * feed continua sendo um so para todo mundo, entao acompanhar cidades
 * diferentes nao multiplica chamada a USGS.
 *
 * Devolve o proprio objeto quando nao ha raio ou nao ha coordenada, para que o
 * comportamento global continue sendo o caminho sem custo.
 */
export function filtrarPorRaio(seismic, { lat, lon, raioKm }) {
  if (!seismic || !Number.isFinite(raioKm) || raioKm <= 0) return seismic;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return seismic;

  const dentro = [];
  for (const evento of seismic.events) {
    const distancia = distanciaKm(lat, lon, evento.latitude, evento.longitude);
    if (distancia == null || distancia > raioKm) continue;
    dentro.push({ ...evento, distanciaKm: distancia });
  }

  dentro.sort((a, b) => b.magnitude - a.magnitude);

  const maisProximo = dentro.length
    ? dentro.reduce((a, b) => (b.distanciaKm < a.distanciaKm ? b : a))
    : null;

  return {
    ...seismic,
    events: dentro,
    charts: {
      magnitude: magnitudeHistogram(dentro),
      depth: depthScatter(dentro),
      timeline: timeline(dentro, seismic.period),
    },
    summary: {
      ...seismic.summary,
      total: dentro.length,
      // `totalAvailable` continua sendo o que a fonte tinha. O que muda e o
      // motivo do corte, e a tela precisa saber diferenciar "a janela e grande
      // demais" de "voce pediu so o que esta perto".
      strong: dentro.filter((e) => e.severity === 'strong').length,
      alert: dentro.filter((e) => e.severity === 'alert').length,
      mild: dentro.filter((e) => e.severity === 'mild').length,
      maxMagnitude: dentro.length ? dentro[0].magnitude : 0,
      strongest: dentro[0] ?? null,
      maisProximo: maisProximo
        ? { place: maisProximo.place, magnitude: maisProximo.magnitude, distanciaKm: maisProximo.distanciaKm }
        : null,
    },
    geojson: toGeoJSON(dentro),
    raio: { km: raioKm, lat, lon, encontrados: dentro.length, deUmTotalDe: seismic.events.length },
  };
}

/**
 * Distribuicao de magnitude em faixas de 0,5 (item 9).
 *
 * O mapa mostra onde tremeu, nao com que forca. O histograma responde a
 * outra metade: a atividade sismica e dominada por eventos leves, e ver essa
 * forma deixa claro o quanto um M6 e excepcional.
 */
function magnitudeHistogram(events) {
  const faixas = new Map();

  for (const evento of events) {
    if (!Number.isFinite(evento.magnitude)) continue;
    const base = Math.floor(evento.magnitude * 2) / 2;
    faixas.set(base, (faixas.get(base) ?? 0) + 1);
  }

  if (!faixas.size) return null;

  const chaves = [...faixas.keys()].sort((a, b) => a - b);
  // Faixas vazias no meio entram com zero, senao o eixo mente sobre a
  // continuidade da escala.
  const todas = [];
  for (let m = chaves[0]; m <= chaves.at(-1); m += 0.5) todas.push(Number(m.toFixed(1)));

  return {
    x: todas.map((m) => `M${m.toFixed(1)}`),
    y: todas.map((m) => faixas.get(m) ?? 0),
    title: 'Distribuição de magnitude',
    unit: ' eventos',
  };
}

/**
 * Profundidade contra magnitude (item 10).
 *
 * A dispersao revela a geometria das zonas de subducao: eventos profundos se
 * concentram em faixas, e os rasos sao os que costumam ser sentidos.
 */
function depthScatter(events) {
  const pontos = events.filter((e) => Number.isFinite(e.magnitude) && Number.isFinite(e.depth));
  if (!pontos.length) return null;

  return {
    x: pontos.map((e) => e.magnitude),
    y: pontos.map((e) => e.depth),
    cor: pontos.map((e) => e.color),
    rotulo: pontos.map((e) => e.place),
    title: 'Profundidade por magnitude',
    unitX: 'M',
    unitY: 'km',
  };
}

/**
 * Contagem de eventos ao longo do tempo (item 11).
 *
 * O intervalo do agrupamento acompanha a janela: por hora em 24 horas, por dia
 * em janelas longas. Agrupar um ano por hora daria oito mil colunas.
 */
function timeline(events, period) {
  const porHora = period === 'day';
  const baldes = new Map();

  for (const evento of events) {
    const quando = new Date(evento.time);
    if (Number.isNaN(quando.getTime())) continue;
    const chave = porHora
      ? quando.toISOString().slice(0, 13) + ':00:00.000Z'
      : quando.toISOString().slice(0, 10) + 'T00:00:00.000Z';
    baldes.set(chave, (baldes.get(chave) ?? 0) + 1);
  }

  if (!baldes.size) return null;

  const chaves = [...baldes.keys()].sort();
  return {
    x: chaves,
    y: chaves.map((c) => baldes.get(c)),
    title: porHora ? 'Eventos por hora' : 'Eventos por dia',
    unit: ' eventos',
  };
}
/**
 * Feed sismico ja recortado, classificado e com o GeoJSON montado.
 * O recorte importa: o feed semanal bruto traz milhares de eventos e nada disso
 * chega a ser util no mapa.
 */
export async function getSeismic(period, magThreshold) {
  let events = [];
  let available = true;

  try {
    const { value } = await cache.resolve(period, config.cacheTtlMs.seismic, () => requestFeed(period));
    events = value;
  } catch (error) {
    log.warn(`feed ${period} indisponivel: ${error.message}`);
    available = false;
  }

  const totalAvailable = events.length;

  // Ordenar por magnitude antes de cortar. Em 30 dias o feed traz mais de dez
  // mil eventos, e pegar os primeiros por data mostraria so o ultimo dia, o que
  // faria a janela larga parecer vazia de atividade forte.
  const ranked = [...events].sort((a, b) => b.magnitude - a.magnitude);

  const visible = ranked.slice(0, SEISMIC_EVENT_LIMIT).map((event) => {
    const severity = classify(event.magnitude, magThreshold);
    return { ...event, severity, color: SEISMIC_PALETTE[severity] };
  });

  // Os graficos usam o mesmo recorte que o mapa: os eventos ja classificados
  // e limitados, para que numero no grafico e ponto no mapa nunca divirjam.
  const charts = {
    magnitude: magnitudeHistogram(visible),
    depth: depthScatter(visible),
    timeline: timeline(visible, period),
  };

  const summary = {
    total: visible.length,
    totalAvailable,
    truncated: totalAvailable > visible.length,
    strong: visible.filter((e) => e.severity === 'strong').length,
    alert: visible.filter((e) => e.severity === 'alert').length,
    mild: visible.filter((e) => e.severity === 'mild').length,
    maxMagnitude: visible.length ? visible[0].magnitude : 0,
    periodLabel: (PERIODS[period] ?? PERIODS.day).label,
    // A tela precisa dizer que a janela longa so mostra eventos acima de um
    // limite, senao um ano com menos pontos que uma semana parece defeito.
    minMagnitude: (PERIODS[period] ?? PERIODS.day).minMagnitude,
    strongest: visible[0] ?? null,
  };

  return {
    success: available,
    period,
    magThreshold,
    events: visible,
    summary,
    charts,
    geojson: toGeoJSON(visible),
    legend: [
      { key: 'strong', color: SEISMIC_PALETTE.strong, label: `M ≥ ${STRONG_MAGNITUDE.toFixed(1)} ou mais, forte` },
      { key: 'alert', color: SEISMIC_PALETTE.alert, label: `${magThreshold.toFixed(1)} ≤ M < ${STRONG_MAGNITUDE.toFixed(1)}, alerta` },
      { key: 'mild', color: SEISMIC_PALETTE.mild, label: `M < ${magThreshold.toFixed(1)}, leve` },
    ],
  };
}

function toGeoJSON(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
      properties: {
        id: event.id,
        place: event.place,
        magnitude: event.magnitude,
        depth: event.depth,
        time: event.time,
        url: event.url,
        severity: event.severity,
        color: event.color,
        opacity: event.severity === 'strong' ? 0.9 : event.severity === 'alert' ? 0.8 : 0.5,
      },
    })),
  };
}

export function seismicCacheStats() {
  return cache.stats;
}
