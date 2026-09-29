import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

function num(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function list(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

export const config = Object.freeze({
  nodeEnv: NODE_ENV,
  isProd,

  // O servidor escuta apenas no loopback por padrao. Em container, HOST=0.0.0.0
  // e definido explicitamente no Dockerfile, onde a rede ja e isolada.
  host: process.env.HOST || '127.0.0.1',
  port: num(process.env.PORT, 3001),
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // Origens permitidas pelo CORS. Apenas o frontend, nunca curinga.
  corsOrigins: list(process.env.CORS_ORIGIN, [
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:4175',
    'http://127.0.0.1:4175',
  ]),

  keys: Object.freeze({
    owm: process.env.OWM_KEY || '',
    stadia: process.env.STADIA_KEY || '',
  }),

  email: Object.freeze({
    enabled: bool(process.env.ALERT_EMAILS_ENABLED, true),
    from: process.env.EMAIL_FROM || '',
    to: process.env.EMAIL_TO || '',
    host: process.env.EMAIL_SMTP_HOST || '',
    port: num(process.env.EMAIL_SMTP_PORT, 587),
    user: process.env.EMAIL_SMTP_USER || '',
    pass: process.env.EMAIL_SMTP_PASS || '',
    debounceMs: num(process.env.EMAIL_DEBOUNCE_MS, 10 * 60 * 1000),
    // Limites do servidor para disparo de e-mail. Nunca os do cliente, para que
    // ninguem consiga forcar envio manipulando a query string.
    tempMin: num(process.env.EMAIL_TEMP_MIN, 0),
    tempMax: num(process.env.EMAIL_TEMP_MAX, 38),
    magThreshold: num(process.env.EMAIL_MAG_THRESHOLD, 6),
  }),

  upstream: Object.freeze({
    timeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 8000),
    maxBytes: num(process.env.UPSTREAM_MAX_BYTES, 24 * 1024 * 1024),
  }),

  cacheTtlMs: Object.freeze({
    weather: num(process.env.CACHE_TTL_WEATHER_MS, 120_000),
    forecast: num(process.env.CACHE_TTL_FORECAST_MS, 600_000),
    airQuality: num(process.env.CACHE_TTL_AQI_MS, 600_000),
    seismic: num(process.env.CACHE_TTL_SEISMIC_MS, 180_000),
    geocode: num(process.env.CACHE_TTL_GEOCODE_MS, 3_600_000),
  }),

  rateLimit: Object.freeze({
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    upstream: num(process.env.RATE_LIMIT_UPSTREAM, 60),
    search: num(process.env.RATE_LIMIT_SEARCH, 30),
    write: num(process.env.RATE_LIMIT_WRITE, 10),
    global: num(process.env.RATE_LIMIT_GLOBAL, 300),
    assistant: num(process.env.RATE_LIMIT_ASSISTANT, 12),
    history: num(process.env.RATE_LIMIT_HISTORY, 40),
  }),

  storage: Object.freeze({
    dataDir: process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(BACKEND_ROOT, 'data'),
    maxAlerts: num(process.env.ALERTS_MAX_ENTRIES, 5000),
    dedupeWindowMs: num(process.env.ALERTS_DEDUPE_WINDOW_MS, 30 * 60 * 1000),
  }),

  // Assistente. Sem chave o recurso simplesmente nao aparece na interface, em
  // vez de aparecer quebrado.
  assistant: Object.freeze({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    maxHistory: num(process.env.ASSISTANT_MAX_HISTORY, 12),
    maxMessageChars: num(process.env.ASSISTANT_MAX_MESSAGE_CHARS, 2000),
    timeoutMs: num(process.env.ASSISTANT_TIMEOUT_MS, 45000),
  }),

  // Porta de entrada para quando o sistema sai do loopback e passa a ser
  // alcancavel de fora, por rede ou por proxy. Sem senha, nao ha porta.
  access: Object.freeze({
    user: process.env.ACCESS_USER || 'monitor',
    password: process.env.ACCESS_PASSWORD || '',
  }),

  // O backend pode servir o build do frontend, colocando pagina e API na mesma
  // origem sem precisar do nginx. E o mesmo arranjo do container, em um
  // processo so, expondo uma porta publica apenas.
  static: Object.freeze({
    enabled: bool(process.env.SERVE_STATIC, false),
    dir: process.env.STATIC_DIR
      ? path.resolve(process.env.STATIC_DIR)
      : path.resolve(BACKEND_ROOT, '..', 'frontend', 'dist'),
  }),

  // Token opcional para operacoes destrutivas. Sem ele, limpar o historico
  // fica desabilitado em producao.
  adminToken: process.env.ADMIN_TOKEN || '',

  bodyLimit: process.env.BODY_LIMIT || '16kb',
});

export function describeConfig() {
  return {
    nodeEnv: config.nodeEnv,
    host: config.host,
    port: config.port,
    corsOrigins: config.corsOrigins,
    dataDir: config.storage.dataDir,
    owmKey: config.keys.owm ? 'configurada' : 'ausente (modo demo)',
    stadiaKey: config.keys.stadia ? 'configurada' : 'ausente',
    email: config.email.host && config.email.user ? 'configurado' : 'desabilitado',
    acesso: config.access.password ? `protegido (usuário "${config.access.user}")` : 'aberto (só loopback)',
    estaticos: config.static.enabled ? config.static.dir : 'desligado',
    assistente: config.assistant.apiKey ? `ativo (${config.assistant.model})` : 'sem GEMINI_API_KEY',
  };
}
