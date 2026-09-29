import { config } from '../config/env.js';
import { TtlCache } from '../lib/cache.js';
import { fetchJSON } from '../lib/httpClient.js';
import { createLogger } from '../lib/logger.js';
import { normalizeText } from '../domain/validation.js';

const log = createLogger('geocode');
const cache = new TtlCache({ maxEntries: 500 });

const RESULT_LIMIT = 6;

async function requestGeocode(query) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=${RESULT_LIMIT}&appid=${config.keys.owm}`;
  const data = await fetchJSON(url, { label: 'openweathermap/geocode' });
  return Array.isArray(data) ? data : [];
}

/**
 * Busca de cidades com deduplicacao por coordenada e preferencia por nome em
 * portugues. Duas variacoes de escrita sao tentadas, como no comportamento
 * original, porem o resultado inteiro fica em cache por chave normalizada, de
 * modo que digitar a mesma cidade nao gera uma nova chamada de cota.
 */
export async function searchCities(query) {
  if (!config.keys.owm || query.length < 2) return [];

  const key = normalizeText(query);

  try {
    const { value } = await cache.resolve(key, config.cacheTtlMs.geocode, async () => {
      const capitalized = query.charAt(0).toUpperCase() + query.slice(1);
      const attempts = capitalized === query ? [query] : [query, capitalized];

      const seen = new Set();
      const results = [];

      for (const attempt of attempts) {
        const found = await requestGeocode(attempt);
        for (const city of found) {
          const coordKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
          if (seen.has(coordKey)) continue;
          seen.add(coordKey);

          const name = city.local_names?.pt || city.local_names?.['pt-BR'] || city.name;
          results.push({
            name,
            state: city.state || '',
            country: city.country || '',
            lat: city.lat,
            lon: city.lon,
            label: [name, city.state, city.country].filter(Boolean).join(', '),
          });
        }
        if (results.length >= RESULT_LIMIT) break;
      }

      return results.slice(0, RESULT_LIMIT);
    });

    return value;
  } catch (error) {
    log.warn(`busca "${query}" falhou: ${error.message}`);
    return [];
  }
}

export function geocodeCacheStats() {
  return cache.stats;
}
