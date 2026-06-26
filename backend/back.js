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
//  API KEY INTEGRADA
// ═══════════════════════════════════════════════════════════
const OWM_KEY = '4800d0c64893b98a932d0dfb387292b0';

// ═══════════════════════════════════════════════════════════
//  NODEMAILER — ALERTAS POR E-MAIL
// ═══════════════════════════════════════════════════════════
const EMAIL_DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutos
const emailLastSent     = new Map();       // tipo → timestamp

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
  if (now - last < EMAIL_DEBOUNCE_MS) return; // debounce por cidade+tipo

  const transporter = getTransporter();
  if (!transporter) return; // e-mail não configurado, ignora silenciosamente

  const from = process.env.EMAIL_FROM;
  const to   = process.env.EMAIL_TO;
  if (!from || !to) return;

  const linhas = alerts.map(a => `• [${a.sensor.toUpperCase()}] ${a.message}`).join('\n');
  const html   = alerts.map(a =>
    `<li><b>[${a.sensor.toUpperCase()}]</b> ${a.message}${a.url ? ` <a href="${a.url}">Ver USGS</a>` : ''}</li>`
  ).join('');

  try {
    await transporter.sendMail({
      from,
      to,
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
//  CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
const TIMEZONES = {
  'Curitiba': -3, 'São Paulo': -3, 'Rio de Janeiro': -3,
  'Brasília': -3, 'Manaus': -4, 'Tóquio': 9,
  'Nova York': -5, 'Londres': 1
};

const MOCK_WEATHER = {
  'Curitiba':       { temp: 18.2, temp_min: 14.0, temp_max: 22.5, humidity: 78,  wind_speed: 3.5, pressure: 1018, description: 'Nublado'             },
  'São Paulo':      { temp: 24.5, temp_min: 20.0, temp_max: 28.0, humidity: 65,  wind_speed: 2.8, pressure: 1012, description: 'Parcialmente nublado' },
  'Rio de Janeiro': { temp: 30.1, temp_min: 25.0, temp_max: 34.0, humidity: 80,  wind_speed: 4.2, pressure: 1008, description: 'Ensolarado'           },
  'Brasília':       { temp: 27.3, temp_min: 22.0, temp_max: 31.0, humidity: 55,  wind_speed: 3.0, pressure: 1014, description: 'Céu claro'            },
  'Manaus':         { temp: 33.0, temp_min: 28.0, temp_max: 36.5, humidity: 85,  wind_speed: 1.5, pressure: 1005, description: 'Chuva leve'           },
  'Tóquio':         { temp: 22.0, temp_min: 17.0, temp_max: 25.0, humidity: 60,  wind_speed: 5.1, pressure: 1020, description: 'Limpo'                },
  'Nova York':      { temp: 19.5, temp_min: 15.0, temp_max: 23.0, humidity: 70,  wind_speed: 6.3, pressure: 1016, description: 'Nublado'              },
  'Londres':        { temp: 15.0, temp_min: 11.0, temp_max: 18.0, humidity: 82,  wind_speed: 4.8, pressure: 1010, description: 'Chuvoso'              },
};

// ═══════════════════════════════════════════════════════════
//  MOCK FALLBACK
// ═══════════════════════════════════════════════════════════
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
    })),
  };
}

// ═══════════════════════════════════════════════════════════
//  OPENWEATHERMAP — DADOS REAIS
// ═══════════════════════════════════════════════════════════
async function getRealWeather(city) {
  try {
    const res  = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=pt_br`);
    const d    = await res.json();
    if (d.cod !== 200) throw new Error(d.message);
    return {
      success: true, mock: false, city,
      temp:        parseFloat(d.main.temp.toFixed(1)),
      temp_min:    parseFloat(d.main.temp_min.toFixed(1)),
      temp_max:    parseFloat(d.main.temp_max.toFixed(1)),
      humidity:    d.main.humidity,
      wind_speed:  d.wind.speed,
      pressure:    d.main.pressure,
      description: d.weather[0].description,
      icon:        d.weather[0].icon,
    };
  } catch (e) {
    console.warn(`[OWM] Weather fallback para ${city}:`, e.message);
    return getMockWeather(city);
  }
}

async function getRealForecast(city) {
  try {
    const res  = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OWM_KEY}&units=metric&lang=pt_br`);
    const d    = await res.json();
    if (d.cod !== '200') throw new Error(d.message);
    return {
      success: true, mock: false,
      points: d.list.slice(0, 16).map(item => ({
        datetime: new Date(item.dt * 1000).toISOString(),
        temp:     parseFloat(item.main.temp.toFixed(1)),
      })),
    };
  } catch (e) {
    console.warn(`[OWM] Forecast fallback para ${city}:`, e.message);
    return getMockForecast(city);
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
app.get('/api/data', async (req, res) => {
  const city         = req.query.city         || 'Curitiba';
  const period       = req.query.period       || 'day';
  const tMin         = parseFloat(req.query.tempMin      ?? 10);
  const tMax         = parseFloat(req.query.tempMax      ?? 35);
  const mag          = parseFloat(req.query.magThreshold ?? 5.0);

  const [weather, forecast, seismic] = await Promise.all([
    getRealWeather(city),
    getRealForecast(city),
    getSeismicData(period),
  ]);

  const alerts = buildAlerts(weather, forecast, seismic, tMin, tMax, mag);

  // 6. Dispara e-mails de alerta em background (não bloqueia a resposta)
  //    Envia para QUALQUER alerta (warning e danger), de clima e sismo.
  const climaAlerts = alerts.filter(a => a.sensor === 'clima');
  const sismoAlerts = alerts.filter(a => a.sensor === 'sismo');
  if (climaAlerts.length) sendAlertEmail('clima', climaAlerts, city);
  if (sismoAlerts.length) sendAlertEmail('sismo', sismoAlerts, city);

  const offset   = TIMEZONES[city] ?? -3;
  const cityTime = new Date(Date.now() + offset * 3600000);

  res.json({
    weather,
    forecast,
    seismic,
    alerts,
    cityTime: cityTime.toTimeString().slice(0, 8),
    isMock:   weather.mock,
  });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => console.log(`\n🌍  Backend rodando em http://localhost:${PORT}\n`));