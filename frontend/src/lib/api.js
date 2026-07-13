export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

export const api = {
  config: () => getJSON('/api/config'),
  geocode: (q) => getJSON(`/api/geocode?q=${encodeURIComponent(q)}`),
  data: (params) => getJSON(`/api/data?${new URLSearchParams(params)}`),
  compare: (city1, city2) => getJSON(`/api/compare?cities=${encodeURIComponent(city1)},${encodeURIComponent(city2)}`),
  alertsLog: () => getJSON('/api/alerts-log'),
  clearAlertsLog: () => fetch(`${API_BASE}/api/alerts-log`, { method: 'DELETE' }),
  worldClock: () => getJSON('/api/world-clock'),
  health: () => getJSON('/api/health'),
};

export function normalizeText(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function degToCompass(deg) {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
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

export const DEFAULT_STATE = {
  city: 'Curitiba',
  period: 'day',
  refreshSecs: 30,
  tempMin: 10,
  tempMax: 35,
  magThreshold: 4.0,
};

const STORAGE_KEY = 'monitoringsystem_state';
const CACHE_KEY = 'monitoringsystem_cache';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch { return { ...DEFAULT_STATE }; }
}

export function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function loadCachedData() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveCachedData(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}
