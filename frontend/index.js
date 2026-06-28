// ═══════════════════════════════════════════════════════════
//  CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
const API_BASE    = 'http://localhost:3001';
const STORAGE_KEY = 'monitoringsystem_state';
const CACHE_KEY   = 'monitoringsystem_cache';

const PLOTLY_BASE = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { family: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,0.3)', size: 10 },
  margin: { l: 42, r: 14, t: 8, b: 34 },
};

const AXIS = {
  showgrid:  true,
  gridcolor: 'rgba(0,229,255,0.06)',
  zeroline:  false,
  tickfont:  { color: 'rgba(255,255,255,0.3)', size: 10 },
  linecolor: 'rgba(255,255,255,0.06)',
};

// ═══════════════════════════════════════════════════════════
//  ESTADO & PERSISTÊNCIA
// ═══════════════════════════════════════════════════════════
const DEFAULT_STATE = {
  city:         'Curitiba',
  period:       'day',
  refreshSecs:  30,
  tempMin:      10,
  tempMax:      35,
  magThreshold: 4.0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch { return { ...DEFAULT_STATE }; }
}

function saveState() {
  const state = {
    city:         document.getElementById('cityInput').value,
    period:       document.getElementById('periodSelect').value,
    refreshSecs:  parseInt(document.getElementById('refreshSlider').value),
    tempMin:      parseInt(document.getElementById('tempMinSlider').value),
    tempMax:      parseInt(document.getElementById('tempMaxSlider').value),
    magThreshold: parseFloat(document.getElementById('magSlider').value),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyState(state) {
  document.getElementById('cityInput').value     = state.city;
  document.getElementById('periodSelect').value  = state.period;
  document.getElementById('refreshSlider').value = state.refreshSecs;
  document.getElementById('tempMinSlider').value = state.tempMin;
  document.getElementById('tempMaxSlider').value = state.tempMax;
  document.getElementById('magSlider').value     = state.magThreshold;

  document.getElementById('refreshVal').textContent  = state.refreshSecs;
  document.getElementById('tempMinVal').textContent  = state.tempMin;
  document.getElementById('tempMaxVal').textContent  = state.tempMax;
  document.getElementById('magVal').textContent      = 'M ' + parseFloat(state.magThreshold).toFixed(1);
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 1 — BUSCA LIVRE COM AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════
let geocodeTimer = null;
let currentCity  = 'Curitiba';

function initCitySearch() {
  const input    = document.getElementById('cityInput');
  const dropdown = document.getElementById('cityDropdown');

  input.addEventListener('input', () => {
    clearTimeout(geocodeTimer);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    geocodeTimer = setTimeout(() => doGeocode(q), 350);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.style.display = 'none'; }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#citySearchWrap')) dropdown.style.display = 'none';
  });
}

async function doGeocode(q) {
  try {
    const res     = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    showDropdown(results);
  } catch { /* silencia */ }
}

function showDropdown(results) {
  const dropdown = document.getElementById('cityDropdown');
  if (!results.length) { dropdown.style.display = 'none'; return; }

  dropdown.innerHTML = results.map((r, i) =>
    `<div class="city-option" data-idx="${i}" data-label="${r.label}" data-name="${r.name}">${r.label}</div>`
  ).join('');

  dropdown.querySelectorAll('.city-option').forEach(el => {
    el.addEventListener('click', () => {
      const name  = el.dataset.name;
      const label = el.dataset.label;
      document.getElementById('cityInput').value = label;
      currentCity = name;
      dropdown.style.display = 'none';
      saveState();
      fetchData();
    });
  });

  dropdown.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 6 — PUSH NOTIFICATIONS (Notification API)
// ═══════════════════════════════════════════════════════════
let notifEnabled = false;

function initNotifications() {
  const btn = document.getElementById('notifBtn');
  if (!('Notification' in window)) {
    btn.textContent = 'Push não suportado';
    btn.disabled    = true;
    return;
  }

  if (Notification.permission === 'granted') {
    notifEnabled = true;
    btn.textContent = '✅ Push Ativo';
    btn.style.color = '#00ff88';
  }

  btn.addEventListener('click', async () => {
    if (Notification.permission === 'granted') {
      notifEnabled = !notifEnabled;
      btn.textContent = notifEnabled ? '✅ Push Ativo' : 'Ativar Push Alerts';
      btn.style.color = notifEnabled ? '#00ff88' : '#a78bfa';
    } else {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        notifEnabled = true;
        btn.textContent = '✅ Push Ativo';
        btn.style.color = '#00ff88';
        new Notification('MONITORING SYSTEM', {
          body: 'Notificações de alerta ativadas!',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28">🌍</text></svg>',
        });
      }
    }
  });
}

const notifDebounce = new Map();

function sendPushNotification(alerts) {
  if (!notifEnabled || Notification.permission !== 'granted') return;
  alerts.forEach(a => {
    const key  = `${a.sensor}:${a.message}`;
    const last = notifDebounce.get(key) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return;
    notifDebounce.set(key, Date.now());
    new Notification(`⚠ Alerta ${a.type === 'danger' ? 'Crítico' : 'de Atenção'}`, {
      body: a.message,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28">⚠️</text></svg>',
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 9 — WIDGET DE HORA MUNDIAL
// ═══════════════════════════════════════════════════════════
let worldClocks = [];

async function initWorldClock() {
  try {
    const res = await fetch(`${API_BASE}/api/world-clock`);
    worldClocks = await res.json();
  } catch {
    // fallback hardcoded
    worldClocks = [
      { name: 'Curitiba', offset: -3 },
      { name: 'Nova York', offset: -5 },
      { name: 'Londres',   offset:  1 },
      { name: 'Tóquio',    offset:  9 },
      { name: 'Dubai',     offset:  4 },
    ];
  }
  renderWorldClock();
  setInterval(renderWorldClock, 1000);
}

function renderWorldClock() {
  const bar = document.getElementById('worldClockBar');
  const now = Date.now();
  bar.innerHTML = worldClocks.map(c => {
    const d    = new Date(now + c.offset * 3600000);
    const time = d.toTimeString().slice(0, 8);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `<div class="wc-item">
      <span class="wc-name">${c.name}</span>
      <span class="wc-time">${time}</span>
      <span class="wc-date">${date}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  PARTÍCULAS (canvas)
// ═══════════════════════════════════════════════════════════
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 1.2 + 0.3,
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      a:  Math.random(),
      va: (Math.random() - .5) * .005,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 90 }, makeParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.a += p.va;
      if (p.a > 1 || p.a < 0) p.va *= -1;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${p.a * 0.4})`;
      ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,229,255,${(1 - dist / 100) * 0.08})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    particles.forEach(p => { p.x = Math.min(p.x, W); p.y = Math.min(p.y, H); });
  });
  init();
  draw();
}

// ═══════════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════════
let activeTab = 'dashboard';

function switchTab(id) {
  activeTab = id;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${id}`).classList.add('active');
  document.querySelector(`[data-tab="${id}"]`).classList.add('active');

  if (lastData) {
    if (id === 'dashboard') { drawForecast(lastData); drawRain(lastData); drawConditions(lastData); }
    if (id === 'seismic')   drawLeafletMap(lastData);
  }
  if (id === 'history') loadHistory();
}

// ═══════════════════════════════════════════════════════════
//  COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════
let refreshTimer   = null;
let countdownTimer = null;
let countdownVal   = 30;

function startCountdown(secs) {
  clearInterval(countdownTimer);
  countdownVal = secs;
  const el = document.getElementById('topCountdown');
  if (el) el.textContent = countdownVal + 's';
  countdownTimer = setInterval(() => {
    countdownVal--;
    if (el) el.textContent = countdownVal + 's';
    if (countdownVal <= 0) countdownVal = secs;
  }, 1000);
}

function resetTimer() {
  clearInterval(refreshTimer);
  const secs = parseInt(document.getElementById('refreshSlider').value);
  startCountdown(secs);
  refreshTimer = setInterval(fetchData, secs * 1000);
}

// ═══════════════════════════════════════════════════════════
//  FETCH PRINCIPAL
// ═══════════════════════════════════════════════════════════
let lastData = null;

async function fetchData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');

  const city = currentCity || document.getElementById('cityInput').value || 'Curitiba';

  const params = new URLSearchParams({
    city,
    period:       document.getElementById('periodSelect').value,
    tempMin:      document.getElementById('tempMinSlider').value,
    tempMax:      document.getElementById('tempMaxSlider').value,
    magThreshold: document.getElementById('magSlider').value,
  });

  try {
    const res  = await fetch(`${API_BASE}/api/data?${params}`);
    const data = await res.json();
    lastData   = data;
    saveState();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    render(data);
  } catch (e) {
    console.error('[MONITORING] Erro ao buscar dados:', e);
    setStatus('danger', 'SEM CONEXÃO');
  } finally {
    btn.classList.remove('spinning');
    startCountdown(parseInt(document.getElementById('refreshSlider').value));
  }
}

// ═══════════════════════════════════════════════════════════
//  RENDER PRINCIPAL
// ═══════════════════════════════════════════════════════════
function render(data) {
  const { weather, forecast, seismic, aqi, alerts, cityTime, isMock, isCached, cacheAge } = data;
  const tMin = parseFloat(document.getElementById('tempMinSlider').value);
  const tMax = parseFloat(document.getElementById('tempMaxSlider').value);
  const mag  = parseFloat(document.getElementById('magSlider').value);

  renderTopbar(alerts, cityTime, isMock, isCached, cacheAge);
  renderCards(weather, seismic, aqi, alerts, tMin, tMax, mag);
  renderAlerts(alerts);

  // Feature 6: push notification
  if (alerts.length) sendPushNotification(alerts);

  if (activeTab === 'dashboard') { drawForecast(data); drawRain(data); drawConditions(data); }
  if (activeTab === 'seismic')   drawLeafletMap(data);
}

// ─── Topbar ────────────────────────────────────────────────
function setStatus(type, text) {
  const pill = document.getElementById('statusPill');
  const txt  = document.getElementById('statusText');
  pill.className = 'status-pill ' + (type === 'safe' ? '' : type);
  txt.textContent = text;
}

function renderTopbar(alerts, cityTime, isMock, isCached, cacheAge) {
  const hasDanger = alerts.some(a => a.type === 'danger');
  const count     = alerts.length;

  if (hasDanger)  setStatus('danger',  'ALERTA CRÍTICO');
  else if (count) setStatus('warning', 'ALERTAS ATIVOS');
  else            setStatus('safe',    'SISTEMA SEGURO');

  document.getElementById('modeBadge').style.display  = !isMock && !isCached ? '' : 'none';
  document.getElementById('demoBadge').style.display  = isMock               ? '' : 'none';
  // Feature 7: badge de cache
  const cacheBadge = document.getElementById('cacheBadge');
  if (isCached) {
    cacheBadge.style.display = '';
    cacheBadge.title = `Cache de ${Math.floor(cacheAge / 60)}min atrás`;
  } else {
    cacheBadge.style.display = 'none';
  }

  document.getElementById('topCity').textContent = document.getElementById('cityInput').value || currentCity;
  document.getElementById('topTime').textContent = cityTime;

  const nav = document.getElementById('navBadge');
  if (count > 0) { nav.style.display = ''; nav.textContent = count; }
  else nav.style.display = 'none';
}

// ─── Cards ─────────────────────────────────────────────────
function renderCards(weather, seismic, aqi, alerts, tMin, tMax, mag) {
  // Temperatura
  if (weather.success) {
    const t     = weather.temp;
    const color = t >= tMax ? 'var(--red)' : t <= tMin ? 'var(--blue2)' : 'var(--cyan)';
    document.getElementById('metricTemp').innerHTML     = `<span style="color:${color}">${t}°C</span>`;
    document.getElementById('metricTempDesc').textContent = `↓ ${weather.temp_min}°C  ·  ↑ ${weather.temp_max}°C  ·  ${weather.description}`;
    document.getElementById('cardTemp').style.setProperty('--card-accent-color', color);
  }

  // Umidade
  if (weather.success) {
    const windDir = degToCompass(weather.wind_deg || 0);
    document.getElementById('metricHumidity').innerHTML     = `${weather.humidity}<span style="font-size:.95rem;color:var(--w20)">%</span>`;
    document.getElementById('metricHumidityDesc').textContent = `💨 ${weather.wind_speed} m/s ${windDir}  ·  🔵 ${weather.pressure} hPa`;
  }

  // Feature 2: AQI
  if (aqi?.success && aqi.aqi != null) {
    const aqiLabels = ['', 'Boa', 'Razoável', 'Moderada', 'Ruim', 'Péssima'];
    const aqiColors = ['', 'var(--green)', '#a3e635', 'var(--orange)', '#f97316', 'var(--red)'];
    const label     = aqiLabels[aqi.aqi] || '—';
    const color     = aqiColors[aqi.aqi] || 'var(--w50)';
    document.getElementById('metricAQI').innerHTML      = `<span style="color:${color}">${label}</span>`;
    document.getElementById('metricAQIDesc').textContent = `PM2.5: ${aqi.pm25?.toFixed(1)} · NO₂: ${aqi.no2?.toFixed(1)} · O₃: ${aqi.o3?.toFixed(1)}`;
    document.getElementById('cardAQI').style.setProperty('--card-accent-color', color);
  } else {
    document.getElementById('metricAQI').innerHTML      = `<span style="color:var(--w20)">—</span>`;
    document.getElementById('metricAQIDesc').textContent = 'Indisponível';
  }

  // Sísmico
  const events = seismic.events || [];
  const total  = events.length;
  if (total > 0) {
    const maxMag = Math.max(...events.map(e => e.magnitude));
    const top    = events.find(e => e.magnitude === maxMag);
    const place  = top.place.length > 26 ? top.place.slice(0, 23) + '…' : top.place;
    const color  = maxMag >= 6 ? 'var(--red)' : maxMag >= mag ? 'var(--orange)' : '#a78bfa';
    document.getElementById('metricSeismic').innerHTML       = `<span style="color:${color}">${total}</span>`;
    document.getElementById('metricSeismicDesc').textContent = `Máx M${maxMag.toFixed(1)} · ${place}`;
    document.getElementById('seismicCount').textContent      = `${total} eventos`;
  } else {
    document.getElementById('metricSeismic').innerHTML       = `<span style="color:var(--w20)">0</span>`;
    document.getElementById('metricSeismicDesc').textContent = 'Sem eventos no período';
    document.getElementById('seismicCount').textContent      = '0 eventos';
  }

  // Alertas
  const count  = alerts.length;
  const danger = alerts.some(a => a.type === 'danger');
  const color  = danger ? 'var(--red)' : count > 0 ? 'var(--orange)' : 'var(--green)';
  const wA     = alerts.filter(a => a.sensor === 'clima').length;
  const sA     = alerts.filter(a => a.sensor === 'sismo').length;
  document.getElementById('metricAlerts').innerHTML       = `<span style="color:${color}">${count}</span>`;
  document.getElementById('metricAlertsDesc').textContent = `🌤 ${wA} clima  ·  🌐 ${sA} sismo`;
  document.getElementById('alertsCountLabel').textContent = `${count} alerta${count !== 1 ? 's' : ''} ativo${count !== 1 ? 's' : ''}`;
}

function degToCompass(deg) {
  const dirs = ['N','NE','L','SE','S','SO','O','NO'];
  return dirs[Math.round(deg / 45) % 8];
}

// ═══════════════════════════════════════════════════════════
//  GRÁFICOS
// ═══════════════════════════════════════════════════════════
function drawForecast(data) {
  const pts = data.forecast?.points;
  if (!pts?.length) return;

  const xs = pts.map(p => p.datetime);
  const ys = pts.map(p => p.temp);
  document.getElementById('forecastBadge').textContent = `próx: ${ys[1]?.toFixed(1)}°C`;

  Plotly.react('chartForecast', [{
    x: xs, y: ys,
    type: 'scatter', mode: 'lines+markers',
    line:   { shape: 'spline', color: '#00e5ff', width: 2.5, smoothing: 1.3 },
    marker: { size: 4.5, color: '#00e5ff', line: { color: '#010812', width: 1.5 } },
    fill: 'tozeroy', fillcolor: 'rgba(0,229,255,0.05)',
    hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.1f}°C<extra></extra>',
  }], {
    ...PLOTLY_BASE,
    height: 220,
    xaxis: { ...AXIS, tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...AXIS, ticksuffix: '°' },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#00e5ff', font: { color: '#fff', size: 11 } },
  }, { responsive: true, displayModeBar: false });
}

// Feature 3 — gráfico de precipitação
function drawRain(data) {
  const pts = data.forecast?.points;
  if (!pts?.length) return;

  const xs   = pts.map(p => p.datetime);
  const ys   = pts.map(p => p.rain || 0);
  const total = ys.reduce((a, b) => a + b, 0).toFixed(1);
  document.getElementById('rainBadge').textContent = `total: ${total}mm`;

  Plotly.react('chartRain', [{
    x: xs, y: ys,
    type: 'bar',
    marker: {
      color: ys.map(v => v > 2 ? '#4dabf7' : v > 0.5 ? '#74c0fc' : 'rgba(77,171,247,0.3)'),
      line:  { color: 'rgba(0,180,255,0.2)', width: 0.5 },
    },
    hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.2f} mm<extra></extra>',
  }], {
    ...PLOTLY_BASE,
    height: 220,
    xaxis: { ...AXIS, tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...AXIS, ticksuffix: ' mm', rangemode: 'nonnegative' },
    showlegend: false,
    bargap: 0.15,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#4dabf7', font: { color: '#fff', size: 11 } },
  }, { responsive: true, displayModeBar: false });
}

function drawConditions(data) {
  const w = data.weather;
  if (!w?.success) return;

  const tNorm = Math.min(100, Math.max(0, ((w.temp + 10) / 55) * 100));
  const wNorm = Math.min(100, w.wind_speed * 6);
  const pNorm = Math.min(100, Math.max(0, ((w.pressure - 980) / 60) * 100));
  const vals  = [tNorm, w.humidity, wNorm, pNorm];
  const cats  = ['Temp.', 'Umidade', 'Vento', 'Pressão'];

  Plotly.react('chartConditions', [{
    type: 'scatterpolar',
    r:     [...vals, vals[0]],
    theta: [...cats, cats[0]],
    fill: 'toself',
    fillcolor: 'rgba(0,180,255,0.1)',
    line: { color: '#4dabf7', width: 2 },
    marker: { color: '#4dabf7', size: 7, line: { color: '#010812', width: 1.5 } },
    hovertemplate: '<b>%{theta}</b>: %{r:.0f}%<extra></extra>',
  }], {
    ...PLOTLY_BASE,
    height: 220,
    margin: { l: 40, r: 40, t: 20, b: 20 },
    polar: {
      bgcolor: 'rgba(0,0,0,0)',
      angularaxis: { color: 'rgba(0,229,255,.15)', gridcolor: 'rgba(0,229,255,.08)', tickfont: { color: 'rgba(255,255,255,.4)', size: 11 } },
      radialaxis:  { color: 'rgba(0,229,255,.15)', gridcolor: 'rgba(0,229,255,.06)', tickfont: { color: 'rgba(255,255,255,.25)', size: 9 }, range: [0, 100] },
    },
    showlegend: false,
  }, { responsive: true, displayModeBar: false });
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 8 — MAPA LEAFLET INTERATIVO
// ═══════════════════════════════════════════════════════════
let leafletMap     = null;
let leafletMarkers = null;

function drawLeafletMap(data) {
  const allEvents = data.seismic?.events || [];
  const mag       = parseFloat(document.getElementById('magSlider').value);
  const mapEl     = document.getElementById('leafletMap');

  if (!allEvents.length) {
    mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.2);font-size:.8rem;">Nenhum evento sísmico no período.</div>';
    return;
  }

  // Inicializa o mapa Leaflet uma única vez
  if (!leafletMap) {
    mapEl.innerHTML = '';
    mapEl.style.background = '#050f1e';

    leafletMap = L.map('leafletMap', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });

    // Tile escuro — compatível com o tema sci-fi
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(leafletMap);

    leafletMarkers = L.layerGroup().addTo(leafletMap);
  }

  // Limpa marcadores anteriores
  leafletMarkers.clearLayers();

  // Limita a 200 eventos de maior magnitude
  const events = [...allEvents]
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 200);

  events.forEach(e => {
    const color  = e.magnitude >= 6 ? '#ff2d55' : e.magnitude >= mag ? '#ff8c00' : '#7c3aed';
    const radius = Math.max(e.magnitude * 3, 4);

    const circle = L.circleMarker([e.latitude, e.longitude], {
      radius,
      fillColor:   color,
      color:       color,
      weight:      1,
      opacity:     0.9,
      fillOpacity: 0.65,
    });

    const time = new Date(e.time).toLocaleString('pt-BR');
    circle.bindPopup(`
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#e0e0e0;background:#0d1f38;padding:4px;">
        <b style="color:${color}">M${e.magnitude.toFixed(1)}</b> — ${e.place}<br>
        <span style="color:#888">Profundidade: ${e.depth}km</span><br>
        <span style="color:#888">${time}</span><br>
        ${e.url ? `<a href="${e.url}" target="_blank" style="color:#00e5ff">↗ Ver USGS</a>` : ''}
      </div>
    `, { className: 'leaflet-popup-dark' });

    leafletMarkers.addLayer(circle);
  });

  // Força resize do mapa (necessário quando a aba estava inativa)
  setTimeout(() => leafletMap.invalidateSize(), 100);
}

// ═══════════════════════════════════════════════════════════
//  ALERTAS
// ═══════════════════════════════════════════════════════════
function renderAlerts(alerts) {
  const container = document.getElementById('alertsList');
  if (!alerts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-text">Nenhum alerta ativo</div>
        <div class="empty-sub">Sistema operando normalmente</div>
      </div>`;
    return;
  }
  container.innerHTML = alerts.map((a, i) => {
    const ico  = a.type === 'danger' ? '🔴' : '🟡';
    const link = a.url ? `<a href="${a.url}" target="_blank" class="alert-link">↗ USGS</a>` : '';
    return `
      <div class="alert-item ${a.type}" style="animation-delay:${i * 0.07}s">
        <div class="alert-ico">${ico}</div>
        <div class="alert-body">
          <span class="alert-sensor">${a.sensor}</span>
          <div class="alert-msg">${a.message}${link}</div>
        </div>
        <div class="alert-time">${a.timestamp}</div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 5 — HISTÓRICO DE ALERTAS
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<div class="empty-state"><div class="empty-icon"><span class="spinner"></span></div></div>';
  try {
    const res    = await fetch(`${API_BASE}/api/alerts-log`);
    const alerts = await res.json();
    if (!alerts.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-text">Nenhum alerta registrado ainda</div>
          <div class="empty-sub">O histórico é salvo automaticamente no servidor</div>
        </div>`;
      return;
    }
    container.innerHTML = alerts.map((a, i) => {
      const ico = a.type === 'danger' ? '🔴' : '🟡';
      return `
        <div class="alert-item ${a.type}" style="animation-delay:${i * 0.03}s">
          <div class="alert-ico">${ico}</div>
          <div class="alert-body">
            <span class="alert-sensor">${a.sensor} · ${a.city || ''}</span>
            <div class="alert-msg">${a.message}</div>
          </div>
          <div class="alert-time">${new Date(a.loggedAt).toLocaleString('pt-BR')}</div>
        </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<div class="empty-state"><div class="empty-text">Erro ao carregar histórico</div></div>';
  }
}

// ═══════════════════════════════════════════════════════════
//  FEATURE 4 — COMPARATIVO DE CIDADES
// ═══════════════════════════════════════════════════════════
async function doCompare() {
  const c1  = document.getElementById('compareCity1').value.trim();
  const c2  = document.getElementById('compareCity2').value.trim();
  const box = document.getElementById('compareResult');
  if (!c1 || !c2) return;

  box.innerHTML = '<div class="empty-state"><div class="empty-icon"><span class="spinner"></span></div><div class="empty-text">Carregando...</div></div>';

  try {
    const res  = await fetch(`${API_BASE}/api/compare?cities=${encodeURIComponent(c1)},${encodeURIComponent(c2)}`);
    const data = await res.json();

    if (!data.results) throw new Error('Sem dados');

    box.innerHTML = `<div class="compare-grid">${data.results.map(r => {
      const w = r.weather;
      if (!w.success) return `<div class="compare-card"><div class="empty-text">${r.city}: sem dados</div></div>`;
      return `
        <div class="compare-card">
          <div class="compare-city-name">${w.city}</div>
          <div class="compare-temp">${w.temp}°C</div>
          <div class="compare-desc">${w.description}</div>
          <div class="compare-stats">
            <div class="cstat"><span class="cstat-l">↓ Mín</span><span class="cstat-v">${w.temp_min}°C</span></div>
            <div class="cstat"><span class="cstat-l">↑ Máx</span><span class="cstat-v">${w.temp_max}°C</span></div>
            <div class="cstat"><span class="cstat-l">💧 Umidade</span><span class="cstat-v">${w.humidity}%</span></div>
            <div class="cstat"><span class="cstat-l">💨 Vento</span><span class="cstat-v">${w.wind_speed} m/s</span></div>
            <div class="cstat"><span class="cstat-l">🔵 Pressão</span><span class="cstat-v">${w.pressure} hPa</span></div>
          </div>
        </div>`;
    }).join('')}</div>`;

  } catch (e) {
    box.innerHTML = `<div class="empty-state"><div class="empty-text">Erro ao comparar cidades</div></div>`;
  }
}

// ═══════════════════════════════════════════════════════════
//  LOADING OVERLAY
// ═══════════════════════════════════════════════════════════
const LOADING_MSGS = [
  'INICIALIZANDO SISTEMA...',
  'CONECTANDO AO SERVIDOR...',
  'CARREGANDO APIS...',
  'PRONTO.',
];

function runLoadingSequence(cb) {
  const msgEl = document.getElementById('loadingMsg');
  let i = 0;
  const iv = setInterval(() => {
    if (msgEl) msgEl.textContent = LOADING_MSGS[i] || LOADING_MSGS[LOADING_MSGS.length - 1];
    i++;
    if (i >= LOADING_MSGS.length) {
      clearInterval(iv);
      setTimeout(() => {
        const ov = document.getElementById('loadingOverlay');
        if (ov) ov.classList.add('hidden');
        setTimeout(() => { if (ov) ov.remove(); cb(); }, 600);
      }, 300);
    }
  }, 420);
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initCitySearch();
  initNotifications();
  initWorldClock();

  const state = loadState();
  currentCity = state.city;
  applyState(state);

  // Sliders de limite → só display, NÃO disparam fetch
  [
    { id: 'tempMinSlider', display: 'tempMinVal', fmt: v => v },
    { id: 'tempMaxSlider', display: 'tempMaxVal', fmt: v => v },
    { id: 'magSlider',     display: 'magVal',     fmt: v => 'M ' + parseFloat(v).toFixed(1) },
  ].forEach(({ id, display, fmt }) => {
    document.getElementById(id).addEventListener('input', e => {
      document.getElementById(display).textContent = fmt(e.target.value);
      const btn = document.getElementById('saveLimitsBtn');
      btn.classList.add('pending');
      btn.textContent = '💾 Salvar Limites *';
    });
  });

  document.getElementById('refreshSlider').addEventListener('input', e => {
    document.getElementById('refreshVal').textContent      = e.target.value;
    document.getElementById('topCountdown').textContent    = e.target.value + 's';
    saveState();
    resetTimer();
  });

  document.getElementById('saveLimitsBtn').addEventListener('click', () => {
    const btn = document.getElementById('saveLimitsBtn');
    btn.classList.remove('pending');
    btn.textContent = '✅ Limites Salvos!';
    setTimeout(() => { btn.textContent = '💾 Salvar Limites'; }, 2000);
    saveState();
    fetchData();
  });

  document.getElementById('periodSelect').addEventListener('change', () => { saveState(); fetchData(); });

  document.getElementById('refreshBtn').addEventListener('click', fetchData);

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  document.getElementById('menuBtn').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open')
  );

  // Feature 4: comparativo
  document.getElementById('compareBtn').addEventListener('click', doCompare);

  // Feature 5: limpar histórico
  document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    try {
      // Limpa direto via endpoint ou via fetch POST
      await fetch(`${API_BASE}/api/alerts-log`, { method: 'DELETE' });
    } catch {}
    loadHistory();
  });

  // Restaura cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      lastData = JSON.parse(cached);
      render(lastData);
    }
  } catch {}

  runLoadingSequence(() => {
    fetchData();
    resetTimer();
  });
});