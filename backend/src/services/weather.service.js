import { config } from '../config/env.js';
import { TtlCache } from '../lib/cache.js';
import { fetchJSON } from '../lib/httpClient.js';
import { createLogger } from '../lib/logger.js';
import { COMPASS, FORECAST_POINTS, MOCK_WEATHER } from '../domain/constants.js';
import { normalizeText } from '../domain/validation.js';

const log = createLogger('weather');
const weatherCache = new TtlCache({ maxEntries: 200 });
const forecastCache = new TtlCache({ maxEntries: 200 });

const OWM = 'https://api.openweathermap.org';

export function degToCompass(deg) {
  return COMPASS[Math.round(Number(deg || 0) / 45) % 8];
}

function round(value, digits = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

function mockWeather(city) {
  const base = MOCK_WEATHER[city] || MOCK_WEATHER['Curitiba'];
  return { success: true, mock: true, city, ...base, windCompass: degToCompass(base.wind_deg) };
}

function mockForecast(city) {
  const base = MOCK_WEATHER[city] || MOCK_WEATHER['Curitiba'];
  const now = Date.now();
  return {
    success: true,
    mock: true,
    points: Array.from({ length: FORECAST_POINTS }, (_, i) => ({
      datetime: new Date(now + i * 3 * 3600 * 1000).toISOString(),
      temp: round(base.temp + Math.sin(i * 0.7) * 3.5 + (Math.random() * 2 - 1)),
      rain: round(Math.random() * (i % 4 === 0 ? 3 : 0.5), 2),
      humidity: round(65 + Math.sin(i * 0.5) * 20, 0),
      pressure: round(1013 + Math.sin(i * 0.3) * 6, 0),
      wind: round(3 + Math.abs(Math.sin(i * 0.9)) * 4),
      windDeg: round((i * 37) % 360, 0),
    })),
  };
}

async function requestWeather(city) {
  const url = `${OWM}/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${config.keys.owm}&units=metric&lang=pt_br`;
  const data = await fetchJSON(url, { label: 'openweathermap/weather' });
  if (Number(data.cod) !== 200) throw new Error(data.message || 'resposta inesperada');

  return {
    success: true,
    mock: false,
    city,
    resolvedName: data.name || city,
    temp: round(data.main.temp),
    temp_min: round(data.main.temp_min),
    temp_max: round(data.main.temp_max),
    feels_like: round(data.main.feels_like),
    humidity: data.main.humidity,
    wind_speed: data.wind?.speed ?? 0,
    wind_deg: data.wind?.deg ?? 0,
    windCompass: degToCompass(data.wind?.deg ?? 0),
    pressure: data.main.pressure,
    description: data.weather?.[0]?.description ?? '',
    icon: data.weather?.[0]?.icon ?? null,
    lat: data.coord?.lat ?? null,
    lon: data.coord?.lon ?? null,
    observedAt: data.dt ? new Date(data.dt * 1000).toISOString() : new Date().toISOString(),
  };
}

async function requestForecast(city) {
  const url = `${OWM}/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${config.keys.owm}&units=metric&lang=pt_br`;
  const data = await fetchJSON(url, { label: 'openweathermap/forecast' });
  if (String(data.cod) !== '200') throw new Error(data.message || 'resposta inesperada');

  return {
    success: true,
    mock: false,
    points: (data.list || []).slice(0, FORECAST_POINTS).map((item) => ({
      datetime: new Date(item.dt * 1000).toISOString(),
      temp: round(item.main.temp),
      rain: round(item.rain?.['3h'] || 0, 2),
      // Vinham na mesma resposta e eram descartados. Custam zero a mais.
      humidity: round(item.main.humidity, 0),
      pressure: round(item.main.pressure, 0),
      wind: round(item.wind?.speed),
      windDeg: round(item.wind?.deg, 0),
      description: item.weather?.[0]?.description ?? '',
    })),
  };
}

/**
 * Clima atual com cache por cidade. Quando a OWM falha, cai para dados
 * simulados e marca `mock`, preservando o comportamento original de nunca
 * deixar o painel vazio.
 */
export async function getWeather(city) {
  if (!config.keys.owm) return mockWeather(city);
  const key = normalizeText(city);
  try {
    const { value } = await weatherCache.resolve(key, config.cacheTtlMs.weather, () => requestWeather(city));
    return value;
  } catch (error) {
    log.warn(`fallback simulado para ${city}: ${error.message}`);
    return mockWeather(city);
  }
}

export async function getForecast(city) {
  if (!config.keys.owm) return mockForecast(city);
  const key = normalizeText(city);
  try {
    const { value } = await forecastCache.resolve(key, config.cacheTtlMs.forecast, () => requestForecast(city));
    return value;
  } catch (error) {
    log.warn(`previsao simulada para ${city}: ${error.message}`);
    return mockForecast(city);
  }
}

export function weatherCacheStats() {
  return { weather: weatherCache.stats, forecast: forecastCache.stats };
}
