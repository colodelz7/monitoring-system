/**
 * Saneamento de entrada. Todo parametro vindo do cliente passa por aqui antes de
 * virar chave de cache, limite de alerta ou parte de uma URL de upstream.
 */

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.field = field;
  }
}

export const LIMITS = Object.freeze({
  tempMin: { min: -40, max: 30, fallback: 10 },
  tempMax: { min: 0, max: 60, fallback: 35 },
  magThreshold: { min: 0.5, max: 10, fallback: 4 },
  // Raio de interesse para sismos, em quilometros. Zero e o padrao e quer dizer
  // "o planeta inteiro", que e como o painel sempre funcionou. O teto de 20 mil
  // e meia volta na Terra: alem disso, todo ponto ja esta dentro.
  seismicRadiusKm: { min: 0, max: 20000, fallback: 0 },
});

export function clampNumber(value, { min, max, fallback }) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// Nomes de cidade e termos de busca viram parte de uma URL de terceiros, entao
// so passam letras, numeros e a pontuacao usada em toponimos.
const SAFE_TEXT = /[^\p{L}\p{M}\p{N}\s'.,()-]/gu;

export function sanitizeCity(value, fallback = 'Curitiba') {
  const cleaned = sanitizeQuery(value, { maxLength: 80 });
  return cleaned || fallback;
}

export function sanitizeQuery(value, { maxLength = 80 } = {}) {
  return String(value ?? '')
    .replace(SAFE_TEXT, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

const PERIOD_VALUES = new Set(['day', 'week', 'month', 'quarter', 'year']);

export function sanitizePeriod(value) {
  return PERIOD_VALUES.has(value) ? value : 'day';
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Limites de alerta vindos do cliente sao fixados dentro de uma faixa sensata e
 * reordenados, para que nao exista combinacao capaz de tornar todo dado um
 * alerta critico e, por tabela, forcar gravacao em disco.
 */
export function resolveThresholds(query) {
  let tempMin = clampNumber(query.tempMin, LIMITS.tempMin);
  let tempMax = clampNumber(query.tempMax, LIMITS.tempMax);
  const magThreshold = clampNumber(query.magThreshold, LIMITS.magThreshold);
  const seismicRadiusKm = clampNumber(query.seismicRadiusKm, LIMITS.seismicRadiusKm);

  if (tempMin >= tempMax) {
    tempMin = LIMITS.tempMin.fallback;
    tempMax = LIMITS.tempMax.fallback;
  }

  return { tempMin, tempMax, magThreshold, seismicRadiusKm };
}

export function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

export function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
