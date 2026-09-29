/**
 * Cliente HTTP da API.
 *
 * Em produção o frontend é servido pelo mesmo host que faz proxy de /api, então
 * o padrão é caminho relativo e não existe requisição cross-origin. Em
 * desenvolvimento, o proxy do Vite cumpre o mesmo papel.
 */
export const API_BASE = import.meta.env.VITE_API_BASE || '';

const DEFAULT_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(
  path,
  { method = 'GET', signal, headers, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Aborta tanto por timeout quanto por cancelamento de quem chamou.
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      body,
      signal: controller.signal,
      headers: { accept: 'application/json', ...headers },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.error || `Erro ${response.status}`, response.status);
    }

    return response.status === 204 ? null : response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function qs(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  config: (options) => request('/api/config', options),
  geocode: (q, options) => request(`/api/geocode${qs({ q })}`, options),
  data: (params, options) => request(`/api/data${qs(params)}`, options),
  // Aceita duas cidades soltas ou uma lista, para os dois formatos de chamada
  // conviverem enquanto a tela de comparação evolui.
  compare: (cidades, options) => request(`/api/compare${qs({ cities: [].concat(cidades).join(',') })}`, options),
  alertsLog: (filters, options) => request(`/api/alerts-log${qs(filters)}`, options),
  alertDetail: (id, options) => request(`/api/alerts-log/${encodeURIComponent(id)}`, options),
  // O servidor exige confirmação explícita para apagar o histórico, então uma
  // chamada de passagem nunca destrói a trilha. Aqui a intenção já veio do
  // segundo clique no botão.
  clearAlertsLog: (options) =>
    request('/api/alerts-log', {
      ...options,
      method: 'DELETE',
      headers: { ...(options?.headers ?? {}), 'x-confirm-clear': 'apagar-historico' },
    }),
  alertsDaily: (days, options) => request(`/api/history/alerts-daily${qs({ days })}`, options),
  readings: (city, days, options) => request(`/api/history/readings${qs({ city, days })}`, options),
  worldClock: (options) => request('/api/world-clock', options),
  health: (options) => request('/api/health', options),

  // Leitura curta de várias cidades de uma vez, para a lista acompanhada.
  watchlist: (cities, thresholds, options) =>
    request(`/api/watchlist${qs({ cities: [].concat(cities).join(','), ...thresholds })}`, options),

  // Regras de alerta. A listagem traz junto o catálogo de métricas e os
  // limites que o servidor aceita, então o formulário nunca sai de sincronia
  // com o que a validação de lá permite.
  rules: (options) => request('/api/rules', options),
  createRule: (regra, options) => sendJSON('/api/rules', 'POST', regra, options),
  updateRule: (id, patch, options) => sendJSON(`/api/rules/${encodeURIComponent(id)}`, 'PATCH', patch, options),
  deleteRule: (id, options) => request(`/api/rules/${encodeURIComponent(id)}`, { ...options, method: 'DELETE' }),
};

/** Envio de corpo JSON, que só as rotas de escrita usam. */
function sendJSON(path, method, body, options) {
  return request(path, {
    ...options,
    method,
    body: JSON.stringify(body),
    headers: { ...(options?.headers ?? {}), 'content-type': 'application/json' },
  });
}

// ─── Estado local ────────────────────────────────────────────────────────────
// Só preferências do usuário e o último payload vivem no navegador. Toda regra
// de negócio ficou no servidor.

export const DEFAULT_STATE = {
  city: 'Curitiba',
  period: 'day',
  refreshSecs: 30,
  tempMin: 10,
  tempMax: 35,
  magThreshold: 4.0,
  // Zero quer dizer o planeta inteiro, que é como o mapa sísmico sempre
  // funcionou. Qualquer outro valor recorta o feed ao redor da cidade.
  seismicRadiusKm: 0,
};

const STORAGE_KEY = 'monitoringsystem_state';
const CACHE_KEY = 'monitoringsystem_cache';
const PREFS_KEY = 'monitoringsystem_prefs';

/**
 * Preferências de apresentação.
 *
 * Ficam separadas do recorte do painel de propósito. Cidade, período e limites
 * descrevem o que está sendo mostrado e por isso viajam no endereço; densidade,
 * ordem dos cartões e lista acompanhada descrevem como esta máquina gosta de
 * ver, e sujariam o link sem dizer nada sobre ele.
 */
export const DEFAULT_PREFS = {
  densidade: 'confortavel',
  // Ordem e visibilidade dos cartões. Vazio significa "a ordem que o servidor
  // mandar", que é o comportamento de quem nunca personalizou nada.
  ordemCartoes: [],
  cartoesOcultos: [],
  cidadesAcompanhadas: [],
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Modo privado ou storage cheio: a preferência vale só nesta sessão.
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Modo privado ou storage cheio: preferências simplesmente não persistem.
  }
}

export function loadCachedData() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCachedData(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Payload grande demais para o storage: seguimos sem cache local.
  }
}

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const WORLD_CLOCK_FALLBACK = [
  { name: 'São Paulo', offset: -3 }, { name: 'Nova York', offset: -5 },
  { name: 'Los Angeles', offset: -8 }, { name: 'Buenos Aires', offset: -3 },
  { name: 'Lima', offset: -5 }, { name: 'México', offset: -6 },
  { name: 'Miami', offset: -5 }, { name: 'Toronto', offset: -5 },
  { name: 'Londres', offset: 1 }, { name: 'Paris', offset: 2 },
  { name: 'Berlim', offset: 2 }, { name: 'Madri', offset: 2 },
  { name: 'Roma', offset: 2 }, { name: 'Lisboa', offset: 1 },
  { name: 'Moscou', offset: 3 }, { name: 'Cairo', offset: 2 },
  { name: 'Nairóbi', offset: 3 }, { name: 'Joanesburgo', offset: 2 },
  { name: 'Lagos', offset: 1 }, { name: 'Dubai', offset: 4 },
  { name: 'Mumbai', offset: 5.5 }, { name: 'Bangkok', offset: 7 },
  { name: 'Singapura', offset: 8 }, { name: 'Pequim', offset: 8 },
  { name: 'Seul', offset: 9 }, { name: 'Tóquio', offset: 9 },
  { name: 'Sydney', offset: 10 },
];
