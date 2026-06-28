const express    = require('express');
const fetch      = require('node-fetch');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');

// ═══════════════════════════════════════════════════════════
//  CARREGAR .env MANUALMENTE (sem dependência extra)
// ═══════════════════════════════════════════════════════════
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && !key.startsWith('#') && vals.length) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    });
  }
} catch (e) { console.warn('[ENV] Falha ao carregar .env:', e.message); }

const app  = express();
const PORT = 3001;

// ═══════════════════════════════════════════════════════════
//  API KEY
// ═══════════════════════════════════════════════════════════
const OWM_KEY = '';

// ═══════════════════════════════════════════════════════════
//  CACHE OFFLINE (feature 7)
//  Guarda o último resultado bem-sucedido de /api/data em memória.
//  Se a OWM estiver fora, o endpoint devolve esses dados com flag isCached.
// ═══════════════════════════════════════════════════════════
let offlineCache = null; // { data, ts }

// ═══════════════════════════════════════════════════════════
//  LOG DE ALERTAS (feature 5)
//  Cada alerta disparado é appendado em alerts_log.json.
// ═══════════════════════════════════════════════════════════
const ALERTS_LOG = path.join(__dirname, 'alerts_log.json');

function appendAlertLog(alerts, city) {
  if (!alerts.length) return;
  const entries = alerts.map(a => ({
    ...a,
    city,
    loggedAt: new Date().toISOString(),
  }));
  try {
    let existing = [];
    if (fs.existsSync(ALERTS_LOG)) {
      existing = JSON.parse(fs.readFileSync(ALERTS_LOG, 'utf8'));
    }
    // Mantém último 1000 alertas
    const updated = [...existing, ...entries].slice(-1000);
    fs.writeFileSync(ALERTS_LOG, JSON.stringify(updated, null, 2));
  } catch (e) {
    console.warn('[LOG] Falha ao gravar alerta:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  NODEMAILER — ALERTAS POR E-MAIL
// ═══════════════════════════════════════════════════════════
const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000;
const emailLastSent     = new Map();

function getTransporter() {
  const host = process.env.EMAIL_SMTP_HOST;
  const port = process.env.EMAIL_SMTP_PORT;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port: parseInt(port || 587),
    secure: parseInt(port) === 465,
    auth: { user, pass },
  });
}

async function sendAlertEmail(type, alerts, city = '') {
  const key  = city ? `${type}:${city}` : type;
  const now  = Date.now();
  const last = emailLastSent.get(key) || 0;
  if (now - last < EMAIL_DEBOUNCE_MS) return;

  const transporter = getTransporter();
  if (!transporter) return;

  const from = process.env.EMAIL_FROM;
  const to   = process.env.EMAIL_TO;
  if (!from || !to) return;

  const linhas = alerts.map(a => `• [${a.sensor.toUpperCase()}] ${a.message}`).join('\n');
  const html   = alerts.map(a =>
    `<li><b>[${a.sensor.toUpperCase()}]</b> ${a.message}${a.url ? ` <a href="${a.url}">Ver USGS</a>` : ''}</li>`
  ).join('');

  try {
    await transporter.sendMail({
      from, to,
      subject: `⚠ Alerta Crítico — MONITORING SYSTEM`,
      text:    `MONITORING SYSTEM — Alertas Críticos\n\n${linhas}\n\nHorário: ${new Date().toLocaleString('pt-BR')}`,
      html:    `<h2 style="color:#ff2d55">⚠ Alerta Crítico — MONITORING SYSTEM</h2><ul>${html}</ul><p style="color:#888">Horário: ${new Date().toLocaleString('pt-BR')}</p>`,
    });
    emailLastSent.set(key, now);
    console.log(`[EMAIL] Alerta "${type}" (${city || 'global'}) enviado para ${to}`);
  } catch (e) {
    console.warn(`[EMAIL] Falha ao enviar alerta "${type}":`, e.message);
  }
}

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════
//  CONFIGURAÇÃO DE TIMEZONES
// ═══════════════════════════════════════════════════════════
const TIMEZONES = {
  // Brasil
  'Curitiba': -3, 'São Paulo': -3, 'Rio de Janeiro': -3,
  'Brasília': -3, 'Manaus': -4, 'Belém': -3, 'Fortaleza': -3,
  'Recife': -3, 'Salvador': -3, 'Porto Alegre': -3,
  'Belo Horizonte': -3, 'Florianópolis': -3, 'Goiânia': -3,
  // Américas
  'Nova York': -5, 'Los Angeles': -8, 'Chicago': -6,
  'Toronto': -5, 'México': -6, 'Buenos Aires': -3,
  'Lima': -5, 'Santiago': -4, 'Bogotá': -5, 'Miami': -5,
  // Europa
  'Londres': 1, 'Paris': 2, 'Berlim': 2, 'Madri': 2,
  'Roma': 2, 'Lisboa': 1, 'Amsterdã': 2, 'Moscou': 3,
  // Ásia/Oceania
  'Tóquio': 9, 'Dubai': 4, 'Singapura': 8, 'Pequim': 8,
  'Mumbai': 5.5, 'Bangkok': 7, 'Seul': 9, 'Sydney': 10,
  // África
  'Cairo': 2, 'Joanesburgo': 2, 'Lagos': 1, 'Nairóbi': 3,
};

// Cidades para widget de hora mundial (feature 9)
const WORLD_CLOCK_CITIES = [
  { name: 'São Paulo',     offset: -3   },
  { name: 'Nova York',     offset: -5   },
  { name: 'Los Angeles',   offset: -8   },
  { name: 'Buenos Aires',  offset: -3   },
  { name: 'Lima',          offset: -5   },
  { name: 'México',        offset: -6   },
  { name: 'Miami',         offset: -5   },
  { name: 'Toronto',       offset: -5   },
  { name: 'Londres',       offset:  1   },
  { name: 'Paris',         offset:  2   },
  { name: 'Berlim',        offset:  2   },
  { name: 'Madri',         offset:  2   },
  { name: 'Roma',          offset:  2   },
  { name: 'Lisboa',        offset:  1   },
  { name: 'Moscou',        offset:  3   },
  { name: 'Cairo',         offset:  2   },
  { name: 'Nairóbi',       offset:  3   },
  { name: 'Joanesburgo',   offset:  2   },
  { name: 'Lagos',         offset:  1   },
  { name: 'Dubai',         offset:  4   },
  { name: 'Mumbai',        offset:  5.5 },
  { name: 'Bangkok',       offset:  7   },
  { name: 'Singapura',     offset:  8   },
  { name: 'Pequim',        offset:  8   },
  { name: 'Seul',          offset:  9   },
  { name: 'Tóquio',        offset:  9   },
  { name: 'Sydney',        offset:  10  },
];

// ═══════════════════════════════════════════════════════════
//  MOCK WEATHER
// ═══════════════════════════════════════════════════════════
const MOCK_WEATHER = {
  'Curitiba':       { temp: 18.2, temp_min: 14.0, temp_max: 22.5, humidity: 78,  wind_speed: 3.5, wind_deg: 120, pressure: 1018, description: 'Nublado'             },
  'São Paulo':      { temp: 24.5, temp_min: 20.0, temp_max: 28.0, humidity: 65,  wind_speed: 2.8, wind_deg: 200, pressure: 1012, description: 'Parcialmente nublado' },
  'Rio de Janeiro': { temp: 30.1, temp_min: 25.0, temp_max: 34.0, humidity: 80,  wind_speed: 4.2, wind_deg: 90,  pressure: 1008, description: 'Ensolarado'           },
  'Brasília':       { temp: 27.3, temp_min: 22.0, temp_max: 31.0, humidity: 55,  wind_speed: 3.0, wind_deg: 45,  pressure: 1014, description: 'Céu claro'            },
  'Manaus':         { temp: 33.0, temp_min: 28.0, temp_max: 36.5, humidity: 85,  wind_speed: 1.5, wind_deg: 270, pressure: 1005, description: 'Chuva leve'           },
  'Tóquio':         { temp: 22.0, temp_min: 17.0, temp_max: 25.0, humidity: 60,  wind_speed: 5.1, wind_deg: 180, pressure: 1020, description: 'Limpo'                },
  'Nova York':      { temp: 19.5, temp_min: 15.0, temp_max: 23.0, humidity: 70,  wind_speed: 6.3, wind_deg: 315, pressure: 1016, description: 'Nublado'              },
  'Londres':        { temp: 15.0, temp_min: 11.0, temp_max: 18.0, humidity: 82,  wind_speed: 4.8, wind_deg: 240, pressure: 1010, description: 'Chuvoso'              },
};

function getMockWeather(city) {
  return { success: true, mock: true, city, ...(MOCK_WEATHER[city] || MOCK_WEATHER['Curitiba']) };
}

function getMockForecast(city) {
  const base = MOCK_WEATHER[city] || MOCK_WEATHER['Curitiba'];
  const now  = Date.now();
  return {
    success: true, mock: true,
    points: Array.from({ length: 16 }, (_, i) => ({
      datetime: new Date(now + i * 3 * 3600 * 1000).toISOString(),
      temp:     parseFloat((base.temp + Math.sin(i * 0.7) * 3.5 + (Math.random() * 2 - 1)).toFixed(1)),
      rain:     parseFloat((Math.random() * (i % 4 === 0 ? 3 : 0.5)).toFixed(2)),
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  OPENWEATHERMAP — DADOS REAIS
// ═══════════════════════════════════════════════════════════
async function getRealWeather(city) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=pt_br`);
    const d   = await res.json();
    if (d.cod !== 200) throw new Error(d.message);
    return {
      success: true, mock: false, city,
      temp:        parseFloat(d.main.temp.toFixed(1)),
      temp_min:    parseFloat(d.main.temp_min.toFixed(1)),
      temp_max:    parseFloat(d.main.temp_max.toFixed(1)),
      humidity:    d.main.humidity,
      wind_speed:  d.wind.speed,
      wind_deg:    d.wind.deg || 0,
      pressure:    d.main.pressure,
      description: d.weather[0].description,
      icon:        d.weather[0].icon,
      lat:         d.coord.lat,
      lon:         d.coord.lon,
    };
  } catch (e) {
    console.warn(`[OWM] Weather fallback para ${city}:`, e.message);
    return getMockWeather(city);
  }
}

async function getRealForecast(city) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=pt_br`);
    const d   = await res.json();
    if (d.cod !== '200') throw new Error(d.message);
    return {
      success: true, mock: false,
      points: d.list.slice(0, 16).map(item => ({
        datetime: new Date(item.dt * 1000).toISOString(),
        temp:     parseFloat(item.main.temp.toFixed(1)),
        rain:     parseFloat((item.rain?.['3h'] || 0).toFixed(2)),
      })),
    };
  } catch (e) {
    console.warn(`[OWM] Forecast fallback para ${city}:`, e.message);
    return getMockForecast(city);
  }
}

// ═══════════════════════════════════════════════════════════
//  QUALIDADE DO AR — AQI (feature 2)
// ═══════════════════════════════════════════════════════════
async function getAQI(lat, lon) {
  try {
    const res = await fetch(`http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`);
    const d   = await res.json();
    const c   = d.list[0];
    return {
      success: true,
      aqi:     c.main.aqi,          // 1–5
      co:      c.components.co,
      no2:     c.components.no2,
      pm25:    c.components.pm2_5,
      pm10:    c.components.pm10,
      o3:      c.components.o3,
    };
  } catch (e) {
    console.warn('[AQI] Falha:', e.message);
    return { success: false, aqi: null };
  }
}

// ═══════════════════════════════════════════════════════════
//  USGS — DADOS SÍSMICOS
// ═══════════════════════════════════════════════════════════
async function getSeismicData(period) {
  const url = period === 'week'
    ? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson'
    : 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
  try {
    const res    = await fetch(url);
    const d      = await res.json();
    const events = d.features
      .map(f => ({
        place:     f.properties.place || 'Desconhecido',
        magnitude: f.properties.mag   || 0,
        depth:     parseFloat((f.geometry.coordinates[2] || 0).toFixed(1)),
        latitude:  f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        time:      new Date(f.properties.time).toISOString(),
        url:       f.properties.url,
      }))
      .filter(e => e.magnitude > 0);
    return { success: true, events };
  } catch (e) {
    console.warn('[USGS] Erro:', e.message);
    return { success: false, error: e.message, events: [] };
  }
}

// ═══════════════════════════════════════════════════════════
//  ALERTAS
// ═══════════════════════════════════════════════════════════
function buildAlerts(weather, forecast, seismic, tMin, tMax, mag) {
  const alerts = [];
  const now    = new Date().toLocaleString('pt-BR');

  if (weather.success) {
    if (weather.temp >= tMax)
      alerts.push({ type: 'danger',  sensor: 'clima', timestamp: now,
        message: `Temperatura crítica de ${weather.temp}°C em ${weather.city}. Limite: ${tMax}°C.` });
    if (weather.temp <= tMin)
      alerts.push({ type: 'warning', sensor: 'clima', timestamp: now,
        message: `Temperatura baixa de ${weather.temp}°C em ${weather.city}. Limite: ${tMin}°C.` });
    if (forecast?.points?.length >= 3) {
      const temps = forecast.points.slice(0, 3).map(p => p.temp);
      const delta = Math.max(...temps) - Math.min(...temps);
      if (delta > 10)
        alerts.push({ type: 'warning', sensor: 'clima', timestamp: now,
          message: `Variação brusca de ${delta.toFixed(1)}°C prevista nas próximas 6h em ${weather.city}.` });
    }
  }

  seismic.events
    .filter(e => e.magnitude >= mag)
    .slice(0, 5)
    .forEach(e => alerts.push({
      type:      e.magnitude >= 6.0 ? 'danger' : 'warning',
      sensor:    'sismo',
      timestamp: now,
      message:   `Sismo M${e.magnitude.toFixed(1)} detectado: ${e.place}.`,
      url:       e.url,
    }));

  return alerts;
}

// ═══════════════════════════════════════════════════════════
//  ROTAS
// ═══════════════════════════════════════════════════════════

// ─── /api/geocode — busca livre de cidades (feature 1) ───
app.get('/api/geocode', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);

  // Normaliza: remove acentos para busca mais tolerante
  const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  try {
    // Tenta primeiro com o texto original, depois sem acento se diferente
    const queries = [q];
    const qNorm = normalize(q);
    // Reconstrói com primeira letra maiúscula para melhorar resultados
    const qCapital = q.charAt(0).toUpperCase() + q.slice(1);
    if (qCapital !== q) queries.push(qCapital);

    const seen = new Set();
    let results = [];

    for (const query of queries) {
      const r = await fetch(
        `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=6&appid=${OWM_KEY}`
      );
      const d = await r.json();
      if (!Array.isArray(d)) continue;

      for (const c of d) {
        const key = `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Prefere nome em português, fallback para nome original
        const ptName = c.local_names?.pt || c.local_names?.['pt-BR'] || c.name;
        const label  = [ptName, c.state, c.country].filter(Boolean).join(', ');

        results.push({
          name:    ptName,
          state:   c.state || '',
          country: c.country,
          lat:     c.lat,
          lon:     c.lon,
          label,
        });
      }
      if (results.length >= 6) break;
    }

    res.json(results.slice(0, 6));
  } catch (e) {
    console.warn('[GEOCODE] Erro:', e.message);
    res.json([]);
  }
});

// ─── /api/data — principal ────────────────────────────────
app.get('/api/data', async (req, res) => {
  const city    = req.query.city    || 'Curitiba';
  const period  = req.query.period  || 'day';
  const tMin    = parseFloat(req.query.tempMin      ?? 10);
  const tMax    = parseFloat(req.query.tempMax      ?? 35);
  const mag     = parseFloat(req.query.magThreshold ?? 5.0);

  let weather, forecast, seismic, aqi;
  let isCached = false;

  try {
    [weather, forecast, seismic] = await Promise.all([
      getRealWeather(city),
      getRealForecast(city),
      getSeismicData(period),
    ]);

    // AQI só se tivermos coordenadas reais
    if (weather.lat && weather.lon) {
      aqi = await getAQI(weather.lat, weather.lon);
    } else {
      aqi = { success: false };
    }

  } catch (e) {
    // Feature 7: serve cache offline se tudo falhar
    if (offlineCache) {
      console.warn('[CACHE] Usando cache offline de', new Date(offlineCache.ts).toLocaleString('pt-BR'));
      return res.json({ ...offlineCache.data, isCached: true, cacheAge: Math.floor((Date.now() - offlineCache.ts) / 1000) });
    }
    return res.status(503).json({ error: 'API indisponível e sem cache.' });
  }

  const alerts = buildAlerts(weather, forecast, seismic, tMin, tMax, mag);

  // Feature 5: loga alertas
  if (alerts.length) appendAlertLog(alerts, city);

  // E-mails
  const climaAlerts = alerts.filter(a => a.sensor === 'clima');
  const sismoAlerts = alerts.filter(a => a.sensor === 'sismo');
  if (climaAlerts.length) sendAlertEmail('clima', climaAlerts, city);
  if (sismoAlerts.length) sendAlertEmail('sismo', sismoAlerts, city);

  const offset   = TIMEZONES[city] ?? -3;
  const cityTime = new Date(Date.now() + offset * 3600000);

  const payload = {
    weather,
    forecast,
    seismic,
    aqi,
    alerts,
    cityTime:  cityTime.toTimeString().slice(0, 8),
    isMock:    weather.mock,
    isCached:  false,
  };

  // Feature 7: atualiza cache offline
  offlineCache = { data: payload, ts: Date.now() };

  res.json(payload);
});

// ─── /api/compare — comparativo de 2 cidades (feature 4) ──
app.get('/api/compare', async (req, res) => {
  const cities = (req.query.cities || '').split(',').map(c => c.trim()).filter(Boolean).slice(0, 2);
  if (cities.length < 2) return res.status(400).json({ error: 'Informe 2 cidades separadas por vírgula.' });

  try {
    const results = await Promise.all(cities.map(async city => {
      const [weather, forecast] = await Promise.all([getRealWeather(city), getRealForecast(city)]);
      return { city, weather, forecast };
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/alerts-log — histórico (feature 5) ──────────────
app.get('/api/alerts-log', (req, res) => {
  try {
    if (!fs.existsSync(ALERTS_LOG)) return res.json([]);
    const data = JSON.parse(fs.readFileSync(ALERTS_LOG, 'utf8'));
    res.json(data.slice(-200).reverse());
  } catch (e) {
    res.json([]);
  }
});

app.delete('/api/alerts-log', (req, res) => {
  try {
    fs.writeFileSync(ALERTS_LOG, JSON.stringify([]));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── /api/world-clock — cidades para widget (feature 9) ───
app.get('/api/world-clock', (req, res) => {
  const now = Date.now();
  const clocks = WORLD_CLOCK_CITIES.map(c => {
    const d = new Date(now + c.offset * 3600000);
    return {
      name:   c.name,
      offset: c.offset,
      time:   d.toTimeString().slice(0, 8),
      date:   d.toISOString().slice(0, 10),
    };
  });
  res.json(clocks);
});

// ─── /api/cache-status — status do cache offline (feature 7)
app.get('/api/cache-status', (req, res) => {
  if (!offlineCache) return res.json({ hasCached: false });
  res.json({
    hasCached: true,
    ageSeconds: Math.floor((Date.now() - offlineCache.ts) / 1000),
    city: offlineCache.data?.weather?.city,
  });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`\n🌍  Backend rodando em http://localhost:${PORT}\n`));
