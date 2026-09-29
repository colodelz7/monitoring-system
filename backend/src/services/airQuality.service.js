import { config } from '../config/env.js';
import { TtlCache } from '../lib/cache.js';
import { fetchJSON } from '../lib/httpClient.js';
import { createLogger } from '../lib/logger.js';
import { AQI_SCALE } from '../domain/constants.js';

const log = createLogger('air-quality');
const cache = new TtlCache({ maxEntries: 300 });

const EMPTY = { success: false, aqi: null, label: null, color: null, advice: null, components: [] };

function round(value, digits = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

async function requestAQI(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${config.keys.owm}`;
  const data = await fetchJSON(url, { label: 'openweathermap/air_pollution' });
  const reading = data.list?.[0];
  if (!reading) throw new Error('leitura vazia');

  const level = reading.main?.aqi ?? null;
  const scale = level ? AQI_SCALE[level] : null;
  const c = reading.components || {};

  return {
    success: true,
    aqi: level,
    label: scale?.label ?? null,
    color: scale?.color ?? null,
    advice: scale?.advice ?? null,
    measuredAt: reading.dt ? new Date(reading.dt * 1000).toISOString() : null,
    // Lista pronta para render, ja rotulada e com unidade, para que o frontend
    // nao precise conhecer a nomenclatura da OpenWeatherMap.
    components: [
      { key: 'pm25', label: 'PM2.5', value: round(c.pm2_5), unit: 'µg/m³' },
      { key: 'pm10', label: 'PM10', value: round(c.pm10), unit: 'µg/m³' },
      { key: 'no2', label: 'NO₂', value: round(c.no2), unit: 'µg/m³' },
      { key: 'o3', label: 'O₃', value: round(c.o3), unit: 'µg/m³' },
      { key: 'co', label: 'CO', value: round(c.co), unit: 'µg/m³' },
    ],
  };
}

export async function getAirQuality(lat, lon) {
  if (!config.keys.owm || lat == null || lon == null) return EMPTY;
  // Arredondar a chave agrupa coordenadas vizinhas no mesmo registro de cache.
  const key = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  try {
    const { value } = await cache.resolve(key, config.cacheTtlMs.airQuality, () => requestAQI(lat, lon));
    return value;
  } catch (error) {
    log.warn(`indisponivel para ${key}: ${error.message}`);
    return EMPTY;
  }
}

export function airQualityCacheStats() {
  return cache.stats;
}
