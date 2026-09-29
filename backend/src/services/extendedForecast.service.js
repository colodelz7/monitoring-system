import { TtlCache } from '../lib/cache.js';
import { fetchJSON } from '../lib/httpClient.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('previsao7d');
const cache = new TtlCache({ maxEntries: 120 });

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

/**
 * Previsao de sete dias.
 *
 * A OpenWeatherMap gratuita para em 48 horas, e o plano que vai alem e pago.
 * A Open-Meteo publica sete dias sem chave nenhuma, o que faz dela a fonte
 * certa para esta janela: nao ha credencial nova para vazar, nao ha cota para
 * estourar e nao ha nada de novo no `.env`.
 *
 * Ela pede coordenada, nao nome de cidade. Isso nao e um problema porque a
 * leitura do clima ja devolve `lat` e `lon` da cidade resolvida, entao esta
 * previsao usa exatamente o mesmo ponto que o resto do painel, sem uma segunda
 * busca de geocodificacao e sem risco de cair em uma cidade homonima
 * diferente da que esta na tela.
 */

// A janela e diaria e muda devagar. Meia hora de cache derruba o trafego sem
// que ninguem perceba diferenca no que ve.
const TTL_MS = 30 * 60 * 1000;

const DIAS = 7;

/**
 * Codigos WMO, que e o vocabulario que a Open-Meteo devolve.
 * Agrupados: o painel precisa saber se e chuva, nao se e "chuva moderada
 * congelante", e cada variante com nome proprio viraria uma legenda ilegivel.
 */
const CEU = new Map([
  [0, { texto: 'Céu limpo', icone: 'sun' }],
  [1, { texto: 'Predominantemente limpo', icone: 'sun' }],
  [2, { texto: 'Parcialmente nublado', icone: 'cloud' }],
  [3, { texto: 'Encoberto', icone: 'cloud' }],
  [45, { texto: 'Neblina', icone: 'cloud' }],
  [48, { texto: 'Neblina com geada', icone: 'cloud' }],
  [51, { texto: 'Garoa fraca', icone: 'rain' }],
  [53, { texto: 'Garoa', icone: 'rain' }],
  [55, { texto: 'Garoa forte', icone: 'rain' }],
  [61, { texto: 'Chuva fraca', icone: 'rain' }],
  [63, { texto: 'Chuva', icone: 'rain' }],
  [65, { texto: 'Chuva forte', icone: 'rain' }],
  [71, { texto: 'Neve fraca', icone: 'snow' }],
  [73, { texto: 'Neve', icone: 'snow' }],
  [75, { texto: 'Neve forte', icone: 'snow' }],
  [80, { texto: 'Pancadas de chuva', icone: 'rain' }],
  [81, { texto: 'Pancadas fortes', icone: 'rain' }],
  [82, { texto: 'Temporal', icone: 'rain' }],
  [95, { texto: 'Tempestade', icone: 'storm' }],
  [96, { texto: 'Tempestade com granizo', icone: 'storm' }],
  [99, { texto: 'Tempestade com granizo', icone: 'storm' }],
]);

function descreverCeu(codigo) {
  return CEU.get(Number(codigo)) ?? { texto: 'Indefinido', icone: 'cloud' };
}

function round(value, digits = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

async function requestForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
    ].join(','),
    // O resto do sistema fala metro por segundo. Pedir na unidade certa evita
    // uma conversao esquecida em algum ponto da tela.
    wind_speed_unit: 'ms',
    timezone: 'auto',
    forecast_days: String(DIAS),
  });

  const data = await fetchJSON(`${OPEN_METEO}?${params.toString()}`, { label: 'open-meteo/daily' });
  const diario = data?.daily;
  if (!Array.isArray(diario?.time) || !diario.time.length) throw new Error('resposta sem série diária');

  return diario.time.map((dia, i) => {
    const ceu = descreverCeu(diario.weather_code?.[i]);
    return {
      dia,
      maxima: round(diario.temperature_2m_max?.[i]),
      minima: round(diario.temperature_2m_min?.[i]),
      chuva: round(diario.precipitation_sum?.[i], 1),
      chanceDeChuva: round(diario.precipitation_probability_max?.[i], 0),
      vento: round(diario.wind_speed_10m_max?.[i]),
      codigo: Number(diario.weather_code?.[i]) || 0,
      ceu: ceu.texto,
      icone: ceu.icone,
    };
  });
}

function mockForecast() {
  const hoje = new Date();
  return Array.from({ length: DIAS }, (_, i) => {
    const dia = new Date(hoje.getTime() + i * 86400000).toISOString().slice(0, 10);
    const base = 20 + Math.sin(i * 0.8) * 5;
    const ceu = descreverCeu(i % 3 === 0 ? 61 : i % 3 === 1 ? 2 : 0);
    return {
      dia,
      maxima: round(base + 5),
      minima: round(base - 4),
      chuva: round(i % 3 === 0 ? 6.4 : 0.2, 1),
      chanceDeChuva: i % 3 === 0 ? 70 : 10,
      vento: round(3 + (i % 4)),
      codigo: 0,
      ceu: ceu.texto,
      icone: ceu.icone,
      simulado: true,
    };
  });
}

/**
 * Sete dias a frente para um ponto.
 *
 * Sem coordenada, ou com a fonte fora do ar, devolve uma serie simulada e
 * marca `mock`, que e o mesmo contrato do clima atual: o painel nunca fica com
 * um buraco onde deveria haver um grafico, e a tela sabe avisar que aquilo nao
 * e medicao.
 */
export async function getExtendedForecast(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { success: true, mock: true, dias: mockForecast(), resumo: resumir(mockForecast()) };
  }

  // A chave arredonda a coordenada: duas buscas pela mesma cidade nao precisam
  // virar duas chamadas so porque a API devolveu a sexta casa decimal diferente.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;

  try {
    const { value } = await cache.resolve(key, TTL_MS, () => requestForecast(lat, lon));
    return { success: true, mock: false, dias: value, resumo: resumir(value) };
  } catch (error) {
    log.warn(`previsão estendida indisponível para ${key}: ${error.message}`);
    const dias = mockForecast();
    return { success: false, mock: true, dias, resumo: resumir(dias), erro: error.message };
  }
}

/**
 * Leitura pronta da semana.
 *
 * Sete linhas de numeros nao respondem "como vai ser a semana". Estes tres
 * campos respondem, e como sao regra de negocio (o que conta como "semana
 * chuvosa") ficam aqui e nao no componente.
 */
function resumir(dias) {
  const maximas = dias.map((d) => d.maxima).filter(Number.isFinite);
  const minimas = dias.map((d) => d.minima).filter(Number.isFinite);
  const chuvaTotal = dias.reduce((soma, d) => soma + (d.chuva ?? 0), 0);
  const diasComChuva = dias.filter((d) => (d.chuva ?? 0) >= 1).length;

  if (!maximas.length) return null;

  const maisQuente = dias.reduce((a, b) => ((b.maxima ?? -Infinity) > (a.maxima ?? -Infinity) ? b : a));
  const maisFrio = dias.reduce((a, b) => ((b.minima ?? Infinity) < (a.minima ?? Infinity) ? b : a));

  return {
    maxima: Math.max(...maximas),
    minima: Math.min(...minimas),
    chuvaTotal: round(chuvaTotal, 1),
    diasComChuva,
    diaMaisQuente: maisQuente.dia,
    diaMaisFrio: maisFrio.dia,
    texto: diasComChuva === 0
      ? 'Semana sem chuva prevista'
      : `${diasComChuva} dia${diasComChuva === 1 ? '' : 's'} com chuva, ${round(chuvaTotal, 1)}mm no total`,
  };
}

export function extendedForecastCacheStats() {
  return cache.stats;
}

export const DIAS_PREVISTOS = DIAS;
