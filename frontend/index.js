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

// Remove acentos para busca tolerante
function normalizeText(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function initCitySearch() {
  const input    = document.getElementById('cityInput');
  const dropdown = document.getElementById('cityDropdown');

  input.addEventListener('input', () => {
    clearTimeout(geocodeTimer);
    const q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    // Debounce de 400ms para não disparar a cada tecla
    geocodeTimer = setTimeout(() => doGeocode(q), 400);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.style.display = 'none'; input.blur(); }
    if (e.key === 'Enter') {
      // Se tem só uma opção no dropdown, seleciona direto
      const first = dropdown.querySelector('.city-option');
      if (first) first.click();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#citySearchWrap')) dropdown.style.display = 'none';
  });
}

async function doGeocode(q) {
  const dropdown = document.getElementById('cityDropdown');
  // Loading visual
  dropdown.innerHTML = '<div class="city-option" style="color:var(--w20);pointer-events:none">🔍 Buscando...</div>';
  dropdown.style.display = 'block';

  try {
    const res     = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(q)}`);
    const results = await res.json();
    showDropdown(results, q);
  } catch {
    dropdown.innerHTML = '<div class="city-option" style="color:var(--w20);pointer-events:none">Sem conexão com servidor</div>';
  }
}

function showDropdown(results, query) {
  const dropdown = document.getElementById('cityDropdown');
  if (!results.length) {
    dropdown.innerHTML = '<div class="city-option" style="color:var(--w20);pointer-events:none">Nenhuma cidade encontrada</div>';
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = results.map((r, i) => {
    // Destaca o trecho digitado no nome
    const norm  = normalizeText(r.label);
    const qNorm = normalizeText(query);
    const idx   = norm.indexOf(qNorm);
    let display = r.label;
    if (idx !== -1) {
      display = r.label.slice(0, idx)
        + `<b style="color:var(--cyan)">${r.label.slice(idx, idx + query.length)}</b>`
        + r.label.slice(idx + query.length);
    }
    return `<div class="city-option" data-idx="${i}" data-label="${r.label}" data-name="${r.name}">${display}</div>`;
  }).join('');

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
      { name: 'São Paulo',    offset: -3   },
      { name: 'Nova York',    offset: -5   },
      { name: 'Los Angeles',  offset: -8   },
      { name: 'Buenos Aires', offset: -3   },
      { name: 'Lima',         offset: -5   },
      { name: 'México',       offset: -6   },
      { name: 'Miami',        offset: -5   },
      { name: 'Toronto',      offset: -5   },
      { name: 'Londres',      offset:  1   },
      { name: 'Paris',        offset:  2   },
      { name: 'Berlim',       offset:  2   },
      { name: 'Madri',        offset:  2   },
      { name: 'Roma',         offset:  2   },
      { name: 'Lisboa',       offset:  1   },
      { name: 'Moscou',       offset:  3   },
      { name: 'Cairo',        offset:  2   },
      { name: 'Nairóbi',      offset:  3   },
      { name: 'Joanesburgo',  offset:  2   },
      { name: 'Lagos',        offset:  1   },
      { name: 'Dubai',        offset:  4   },
      { name: 'Mumbai',       offset:  5.5 },
      { name: 'Bangkok',      offset:  7   },
      { name: 'Singapura',    offset:  8   },
      { name: 'Pequim',       offset:  8   },
      { name: 'Seul',         offset:  9   },
      { name: 'Tóquio',       offset:  9   },
      { name: 'Sydney',       offset:  10  },
    ];
  }
  renderWorldClock();
  setInterval(renderWorldClock, 1000);
}

function renderWorldClock() {
  const bar = document.getElementById('worldClockBar');
  const now = Date.now();
  bar.innerHTML = worldClocks.map(c => {
    const d      = new Date(now + c.offset * 3600000);
    const time   = d.toTimeString().slice(0, 8);
    const date   = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const active = c.name === currentCity ? ' wc-item--active' : '';
    return `<div class="wc-item${active}" data-city="${c.name}" title="Clique para monitorar ${c.name}">
      <span class="wc-name">${c.name}</span>
      <span class="wc-time">${time}</span>
      <span class="wc-date">${date}</span>
    </div>`;
  }).join('');

  // Clique para trocar cidade
  bar.querySelectorAll('.wc-item').forEach(el => {
    el.addEventListener('click', () => {
      const city = el.dataset.city;
      if (city === currentCity) return;
      currentCity = city;
      document.getElementById('cityInput').value = city;
      saveState();
      fetchData();
      // Atualiza destaque imediatamente sem esperar o próximo segundo
      bar.querySelectorAll('.wc-item').forEach(i => i.classList.remove('wc-item--active'));
      el.classList.add('wc-item--active');
    });
  });
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
    if (id === 'dashboard') { drawForecast(lastData); drawRain(lastData); }
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

  if (activeTab === 'dashboard') { drawForecast(data); drawRain(data); }
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

// ═══════════════════════════════════════════════════════════
//  FEATURE 8 — MAPA MAPLIBRE GL (GLOBO 3D)
// ═══════════════════════════════════════════════════════════
let glMap            = null;
let mapLoaded        = false;
let pendingData      = null;
let lastSeismicEvents = [];
let lastSeismicMag   = 4.0;

function drawLeafletMap(data) {
  const allEvents = data.seismic?.events || [];
  const mag       = parseFloat(document.getElementById('magSlider').value);
  const mapEl     = document.getElementById('leafletMap');

  if (!allEvents.length) {
    mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,.2);font-size:.8rem;font-family:var(--mono)">◉ Nenhum evento sísmico no período.</div>';
    return;
  }

  const events = [...allEvents].sort((a, b) => b.magnitude - a.magnitude).slice(0, 300);
  lastSeismicEvents = events;
  lastSeismicMag   = mag;

  // Atualiza badges
  updateSeismicBadges(events, mag);

  if (!glMap) {
    mapEl.innerHTML = '';
    mapEl.style.background = '#0a0f1e';

    glMap = new maplibregl.Map({
      container: 'leafletMap',
      style: `API`,
      center: [0, 20],
      zoom: 1.5,
      projection: 'globe',
      attributionControl: false,
    });

    // Sem attribution (removido)
    glMap.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    glMap.on('load', () => {
      try {
        glMap.setFog({
          color:            'rgba(10, 15, 30, 0.9)',
          'high-color':     'rgba(0, 20, 60, 0.8)',
          'horizon-blend':  0.04,
          'space-color':    '#010812',
          'star-intensity': 0.6,
        });
      } catch(e) { /* setFog pode não existir em todas versões */ }

      mapLoaded = true;

      const eventsToRender = lastSeismicEvents.length ? lastSeismicEvents : events;
      const geoData = buildGeoJSON(eventsToRender, lastSeismicMag);

      glMap.addSource('seismic', { type: 'geojson', data: geoData });

      // Halo para eventos fortes — adicionado ANTES dos círculos (fica atrás)
      glMap.addLayer({
        id: 'seismic-halo',
        type: 'circle',
        source: 'seismic',
        filter: ['>=', ['get', 'magnitude'], 6],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 6, 16, 8, 24, 10, 30],
          'circle-color': '#ff2d55',
          'circle-opacity': 0.15,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ff2d55',
          'circle-stroke-opacity': 0.35,
        },
      });

      // Círculos principais
      glMap.addLayer({
        id: 'seismic-circles',
        type: 'circle',
        source: 'seismic',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 1, 2, 4, 4, 6, 7, 8, 11, 10, 14],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': 1,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.9,
        },
      });

      // Popup ao clicar
      glMap.on('click', 'seismic-circles', e => {
        const p    = e.features[0].properties;
        const time = new Date(p.time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        const badgeColor = p.magnitude >= 6 ? '#ff2d55' : p.magnitude >= lastSeismicMag ? '#ff8c00' : '#7c3aed';
        const badgeLabel = p.magnitude >= 6 ? 'FORTE' : p.magnitude >= lastSeismicMag ? 'ALERTA' : 'LEVE';

        new maplibregl.Popup({ className: 'ml-popup', maxWidth: '280px', closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family:'JetBrains Mono',monospace;padding:2px;">
              <div style="font-size:15px;font-weight:700;color:${badgeColor};margin-bottom:6px">
                M ${parseFloat(p.magnitude).toFixed(1)}
                <span style="background:${badgeColor};color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;margin-left:6px">${badgeLabel}</span>
              </div>
              <div style="font-size:11px;color:#ccc;margin-bottom:3px">📍 ${p.place || 'Local desconhecido'}</div>
              <div style="font-size:10px;color:#888">🕓 ${time}</div>
              <div style="font-size:10px;color:#888">⬇ Prof: ${p.depth ?? '?'} km</div>
              ${p.url ? `<a href="${p.url}" target="_blank" style="color:#00e5ff;font-size:10px;display:block;margin-top:8px">↗ Ver no USGS</a>` : ''}
            </div>
          `)
          .addTo(glMap);
      });

      glMap.on('mouseenter', 'seismic-circles', () => { glMap.getCanvas().style.cursor = 'pointer'; });
      glMap.on('mouseleave', 'seismic-circles', () => { glMap.getCanvas().style.cursor = ''; });

      renderMapOverlays(lastSeismicMag);

      if (pendingData) { updateGeoJSON(pendingData, lastSeismicMag); pendingData = null; }
    });

  } else if (mapLoaded) {
    updateGeoJSON(events, mag);
  } else {
    // Mapa criado mas style ainda carregando — guarda para quando terminar
    pendingData = events;
  }
}

function buildGeoJSON(events, mag) {
  return {
    type: 'FeatureCollection',
    features: events.map(e => {
      let color, opacity, strokeWidth;
      if (e.magnitude >= 6)      { color = '#ff2d55'; opacity = 0.9; strokeWidth = 1.5; }
      else if (e.magnitude >= mag) { color = '#ff8c00'; opacity = 0.8; strokeWidth = 1; }
      else                         { color = '#7c3aed'; opacity = 0.5; strokeWidth = 0.5; }
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
        properties: { ...e, color, opacity, strokeWidth },
      };
    }),
  };
}

function updateGeoJSON(events, mag) {
  const src = glMap.getSource('seismic');
  if (src) src.setData(buildGeoJSON(events, mag));
  updateSeismicBadges(events, mag);
}

function updateSeismicBadges(events, mag) {
  const critical = events.filter(e => e.magnitude >= 6).length;
  const alert    = events.filter(e => e.magnitude >= mag && e.magnitude < 6).length;
  const mild     = events.filter(e => e.magnitude < mag).length;

  const seismicCountEl = document.getElementById('seismicCount');
  if (seismicCountEl) seismicCountEl.textContent = `${events.length} eventos`;

  const counterEl = document.getElementById('mapCounter');
  if (counterEl) counterEl.innerHTML = `
    <div class="map-counter-title">◉ EVENTOS: ${events.length}</div>
    <div class="map-counter-row" style="color:#ff2d55">⬤ Fortes: ${critical}</div>
    <div class="map-counter-row" style="color:#ff8c00">⬤ Alertas: ${alert}</div>
    <div class="map-counter-row" style="color:#7c3aed">⬤ Leves: ${mild}</div>
  `;
}

function renderMapOverlays(mag) {
  // Counter (canto superior esquerdo)
  const counterWrap = document.createElement('div');
  counterWrap.className = 'map-counter';
  counterWrap.id = 'mapCounter';
  document.getElementById('leafletMap').appendChild(counterWrap);

  // Legenda (canto superior direito)
  const legendWrap = document.createElement('div');
  legendWrap.className = 'map-legend';
  legendWrap.style.cssText = 'position:absolute;top:10px;right:10px;z-index:10;';
  legendWrap.innerHTML = `
    <div class="map-legend-title">⚡ MAGNITUDE</div>
    <div class="map-legend-row"><span class="map-legend-dot" style="background:#ff2d55;box-shadow:0 0 8px #ff2d55"></span>M ≥ 6.0 — Forte</div>
    <div class="map-legend-row"><span class="map-legend-dot" style="background:#ff8c00;box-shadow:0 0 8px #ff8c00"></span>M ≥ ${mag.toFixed(1)} — Alerta</div>
    <div class="map-legend-row"><span class="map-legend-dot" style="background:#7c3aed;box-shadow:0 0 6px #7c3aed"></span>M &lt; ${mag.toFixed(1)} — Leve</div>
  `;
  document.getElementById('leafletMap').appendChild(legendWrap);
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
  if (!c1 || !c2) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><div class="empty-text">Preencha as duas cidades</div></div>`;
    return;
  }

  box.innerHTML = `<div class="empty-state"><div class="empty-icon"><span class="spinner"></span></div><div class="empty-text">Comparando ${c1} e ${c2}...</div></div>`;

  try {
    const url = `${API_BASE}/api/compare?cities=${encodeURIComponent(c1)},${encodeURIComponent(c2)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Erro ${res.status}`);
    }

    const data = await res.json();
    if (!data.results || !data.results.length) throw new Error('Resposta inválida do servidor');

    // Define vencedor de cada métrica
    const [r1, r2] = data.results;
    const w1 = r1.weather, w2 = r2.weather;

    const winner = (v1, v2, higherIsBetter = false) => {
      if (v1 == null || v2 == null) return ['', ''];
      if (higherIsBetter) return v1 > v2 ? ['🏆', ''] : v1 < v2 ? ['', '🏆'] : ['', ''];
      return v1 < v2 ? ['🏆', ''] : v1 > v2 ? ['', '🏆'] : ['', ''];
    };

    const tempW  = winner(w1?.temp,       w2?.temp,       false);
    const humW   = winner(w1?.humidity,   w2?.humidity,   true);
    const windW  = winner(w1?.wind_speed, w2?.wind_speed, false);
    const presW  = winner(w1?.pressure,   w2?.pressure,   true);

    const renderCard = (r, idx) => {
      const w = r.weather;
      if (!w || !w.success) {
        return `<div class="compare-card">
          <div class="compare-city-name">${r.city}</div>
          <div class="empty-text" style="font-size:.75rem;margin-top:12px">Cidade não encontrada</div>
        </div>`;
      }
      const tw = idx === 0 ? tempW[0] : tempW[1];
      const hw = idx === 0 ? humW[0]  : humW[1];
      const ww = idx === 0 ? windW[0] : windW[1];
      const pw = idx === 0 ? presW[0] : presW[1];

      return `
        <div class="compare-card">
          <div class="compare-city-name">${w.city || r.city}</div>
          <div class="compare-temp">${w.temp?.toFixed(1) ?? '—'}°C</div>
          <div class="compare-desc">${w.description || '—'}</div>
          <div class="compare-stats">
            <div class="cstat"><span class="cstat-l">↓ Mín</span><span class="cstat-v">${w.temp_min ?? '—'}°C</span></div>
            <div class="cstat"><span class="cstat-l">↑ Máx</span><span class="cstat-v">${w.temp_max ?? '—'}°C</span></div>
            <div class="cstat"><span class="cstat-l">💧 Umidade ${hw}</span><span class="cstat-v">${w.humidity ?? '—'}%</span></div>
            <div class="cstat"><span class="cstat-l">💨 Vento ${ww}</span><span class="cstat-v">${w.wind_speed ?? '—'} m/s</span></div>
            <div class="cstat"><span class="cstat-l">🔵 Pressão ${pw}</span><span class="cstat-v">${w.pressure ?? '—'} hPa</span></div>
          </div>
          ${w.mock ? '<div style="margin-top:8px;font-size:.6rem;color:rgba(255,255,255,.25);font-family:var(--mono)">⚠ DADOS SIMULADOS</div>' : ''}
        </div>`;
    };

    box.innerHTML = `<div class="compare-grid">${data.results.map((r, i) => renderCard(r, i)).join('')}</div>`;

  } catch (e) {
    console.error('[COMPARE]', e);
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color:#ff2d55">✕</div>
        <div class="empty-text">Erro ao comparar cidades</div>
        <div class="empty-sub" style="font-size:.65rem;margin-top:4px">${e.message}</div>
        <div class="empty-sub" style="font-size:.6rem;margin-top:8px;opacity:.4">Verifique se o backend está rodando na porta 3001</div>
      </div>`;
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
