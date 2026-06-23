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
  showgrid: true,
  gridcolor: 'rgba(0,229,255,0.06)',
  zeroline: false,
  tickfont: { color: 'rgba(255,255,255,0.3)', size: 10 },
  linecolor: 'rgba(255,255,255,0.06)',
};

// ═══════════════════════════════════════════════════════════
//  ESTADO & PERSISTÊNCIA (localStorage)
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
    city:         document.getElementById('citySelect').value,
    period:       document.getElementById('periodSelect').value,
    refreshSecs:  parseInt(document.getElementById('refreshSlider').value),
    tempMin:      parseInt(document.getElementById('tempMinSlider').value),
    tempMax:      parseInt(document.getElementById('tempMaxSlider').value),
    magThreshold: parseFloat(document.getElementById('magSlider').value),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function applyState(state) {
  document.getElementById('citySelect').value    = state.city;
  document.getElementById('periodSelect').value  = state.period;
  document.getElementById('refreshSlider').value = state.refreshSecs;
  document.getElementById('tempMinSlider').value = state.tempMin;
  document.getElementById('tempMaxSlider').value = state.tempMax;
  document.getElementById('magSlider').value     = state.magThreshold;

  document.getElementById('refreshVal').textContent = state.refreshSecs;
  document.getElementById('tempMinVal').textContent = state.tempMin;
  document.getElementById('tempMaxVal').textContent = state.tempMax;
  document.getElementById('magVal').textContent     = 'M ' + parseFloat(state.magThreshold).toFixed(1);
  document.getElementById('topRefresh')             && (document.getElementById('topRefresh').textContent = state.refreshSecs + 's');
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
      x:   Math.random() * W,
      y:   Math.random() * H,
      r:   Math.random() * 1.2 + 0.3,
      vx:  (Math.random() - .5) * .3,
      vy:  (Math.random() - .5) * .3,
      a:   Math.random(),
      va:  (Math.random() - .5) * .005,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 90 }, makeParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x  += p.vx; p.y += p.vy;
      p.a  += p.va;
      if (p.a > 1 || p.a < 0) p.va *= -1;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,229,255,${p.a * 0.4})`;
      ctx.fill();
    });

    // linhas entre partículas próximas
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

  window.addEventListener('resize', () => { resize(); particles.forEach(p => { p.x = Math.min(p.x, W); p.y = Math.min(p.y, H); }); });
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
    if (id === 'dashboard') { drawForecast(lastData); drawConditions(lastData); }
    if (id === 'seismic')   drawMap(lastData);
  }
}

// ═══════════════════════════════════════════════════════════
//  COUNTDOWN TIMER
// ═══════════════════════════════════════════════════════════
let refreshTimer    = null;
let countdownTimer  = null;
let countdownVal    = 30;

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
//  FETCH
// ═══════════════════════════════════════════════════════════
let lastData = null;

async function fetchData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');

  const params = new URLSearchParams({
    city:         document.getElementById('citySelect').value,
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
    // 5. Persiste os últimos dados recebidos para restaurar no F5
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    render(data);
  } catch (e) {
    console.error('[MONITORING] Erro ao buscar dados:', e);
    setStatus('danger', 'SEM CONEXÃO');
  } finally {
    btn.classList.remove('spinning');
    // reinicia countdown
    startCountdown(parseInt(document.getElementById('refreshSlider').value));
  }
}

// ═══════════════════════════════════════════════════════════
//  RENDER PRINCIPAL
// ═══════════════════════════════════════════════════════════
function render(data) {
  const { weather, forecast, seismic, alerts, cityTime, isMock } = data;
  const tMin = parseFloat(document.getElementById('tempMinSlider').value);
  const tMax = parseFloat(document.getElementById('tempMaxSlider').value);
  const mag  = parseFloat(document.getElementById('magSlider').value);

  renderTopbar(alerts, cityTime, isMock);
  renderCards(weather, seismic, alerts, tMin, tMax, mag);
  renderAlerts(alerts);

  if (activeTab === 'dashboard') { drawForecast(data); drawConditions(data); }
  if (activeTab === 'seismic')   drawMap(data);
}

// ─── Topbar ────────────────────────────────────────────────
function setStatus(type, text) {
  const pill = document.getElementById('statusPill');
  const txt  = document.getElementById('statusText');
  pill.className = 'status-pill ' + (type === 'safe' ? '' : type);
  txt.textContent = text;
}

function renderTopbar(alerts, cityTime, isMock) {
  const hasDanger = alerts.some(a => a.type === 'danger');
  const count     = alerts.length;

  if (hasDanger)   setStatus('danger',  'ALERTA CRÍTICO');
  else if (count)  setStatus('warning', 'ALERTAS ATIVOS');
  else             setStatus('safe',    'SISTEMA SEGURO');

  document.getElementById('modeBadge').style.display = !isMock ? '' : 'none';
  document.getElementById('demoBadge').style.display = isMock  ? '' : 'none';
  document.getElementById('topCity').textContent     = document.getElementById('citySelect').value;
  document.getElementById('topTime').textContent     = cityTime;

  const nav = document.getElementById('navBadge');
  if (count > 0) { nav.style.display = ''; nav.textContent = count; }
  else nav.style.display = 'none';
}

// ─── Cards ─────────────────────────────────────────────────
function animateNumber(el, target, suffix = '') {
  const start   = parseFloat(el.dataset.prev ?? 0);
  const end     = parseFloat(target);
  const dur     = 600;
  const startTs = performance.now();
  el.dataset.prev = target;
  function step(now) {
    const p = Math.min((now - startTs) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val  = (start + (end - start) * ease).toFixed(target % 1 ? 1 : 0);
    el.textContent = val + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderCards(weather, seismic, alerts, tMin, tMax, mag) {
  // Temp
  if (weather.success) {
    const t     = weather.temp;
    const color = t >= tMax ? 'var(--red)' : t <= tMin ? 'var(--blue2)' : 'var(--cyan)';
    const el    = document.getElementById('metricTemp');
    el.innerHTML = `<span style="color:${color}" data-prev="${el.querySelector('span')?.dataset.prev ?? 0}">${t}°C</span>`;
    document.getElementById('metricTempDesc').textContent = `↓ ${weather.temp_min}°C  ·  ↑ ${weather.temp_max}°C  ·  ${weather.description}`;
    document.getElementById('cardTemp').style.setProperty('--card-accent-color', color);
  }

  // Humidity
  if (weather.success) {
    document.getElementById('metricHumidity').innerHTML  = `${weather.humidity}<span style="font-size:.95rem;color:var(--w20)">%</span>`;
    document.getElementById('metricHumidityDesc').textContent = `💨 ${weather.wind_speed} m/s  ·  🔵 ${weather.pressure} hPa`;
  }

  // Seismic
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

  // Alerts
  const count  = alerts.length;
  const danger = alerts.some(a => a.type === 'danger');
  const color  = danger ? 'var(--red)' : count > 0 ? 'var(--orange)' : 'var(--green)';
  const wA     = alerts.filter(a => a.sensor === 'clima').length;
  const sA     = alerts.filter(a => a.sensor === 'sismo').length;
  document.getElementById('metricAlerts').innerHTML       = `<span style="color:${color}">${count}</span>`;
  document.getElementById('metricAlertsDesc').textContent = `🌤 ${wA} clima  ·  🌐 ${sA} sismo`;
  document.getElementById('alertsCountLabel').textContent = `${count} alerta${count !== 1 ? 's' : ''} ativo${count !== 1 ? 's' : ''}`;
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
    height: 260,
    xaxis: { ...AXIS, tickformat: '%d/%m\n%H:%M' },
    yaxis: { ...AXIS, ticksuffix: '°' },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#00e5ff', font: { color: '#fff', size: 11 } },
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
    height: 260,
    margin: { l: 40, r: 40, t: 20, b: 20 },
    polar: {
      bgcolor: 'rgba(0,0,0,0)',
      angularaxis: { color: 'rgba(0,229,255,.15)', gridcolor: 'rgba(0,229,255,.08)', tickfont: { color: 'rgba(255,255,255,.4)', size: 11 } },
      radialaxis:  { color: 'rgba(0,229,255,.15)', gridcolor: 'rgba(0,229,255,.06)', tickfont: { color: 'rgba(255,255,255,.25)', size: 9 }, range: [0, 100] },
    },
    showlegend: false,
  }, { responsive: true, displayModeBar: false });
}

function drawMap(data) {
  const allEvents = data.seismic?.events || [];
  const mag       = parseFloat(document.getElementById('magSlider').value);

  if (!allEvents.length) {
    document.getElementById('chartMap').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:300px;color:rgba(255,255,255,.2);font-size:.8rem;">Nenhum evento sísmico no período.</div>';
    return;
  }

  // 7. Limita a 200 eventos de maior magnitude para não travar a UI
  const events = [...allEvents]
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 200);

  // 7. Envolve em rAF para não bloquear a thread principal
  requestAnimationFrame(() => {
  Plotly.react('chartMap', [{
    type: 'scattergeo',
    lat:  events.map(e => e.latitude),
    lon:  events.map(e => e.longitude),
    text: events.map(e => `<b>${e.place}</b><br>M${e.magnitude.toFixed(1)} · Prof: ${e.depth}km<br>${new Date(e.time).toLocaleString('pt-BR')}`),
    hoverinfo: 'text',
    marker: {
      size:    events.map(e => Math.max(e.magnitude * 3.5, 5)),
      color:   events.map(e => e.magnitude >= 6 ? '#ff2d55' : e.magnitude >= mag ? '#ff8c00' : '#7c3aed'),
      opacity: 0.85,
      line: { width: .5, color: '#010812' },
    },
  }], {
    ...PLOTLY_BASE,
    height: null,
    margin: { l: 0, r: 0, t: 0, b: 0 },
    geo: {
      showland: true,       landcolor:       '#0d1f38',
      showocean: true,      oceancolor:      '#050f1e',
      showcoastlines: true, coastlinecolor:  'rgba(0,229,255,.18)',
      showcountries: true,  countrycolor:    'rgba(255,255,255,.06)',
      bgcolor: 'rgba(0,0,0,0)',
      projection: { type: 'natural earth' },
    },
    hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#00e5ff', font: { color: '#fff', size: 11 } },
  }, { responsive: true, displayModeBar: false });
  }); // fim requestAnimationFrame
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
  // Partículas
  initParticles();

  // Restaura estado salvo
  const state = loadState();
  applyState(state);

  // Sliders de limite → só atualizam display, NÃO disparam fetch
  const limitSliders = [
    { id: 'tempMinSlider', display: 'tempMinVal', fmt: v => v },
    { id: 'tempMaxSlider', display: 'tempMaxVal', fmt: v => v },
    { id: 'magSlider',     display: 'magVal',     fmt: v => 'M ' + parseFloat(v).toFixed(1) },
  ];
  limitSliders.forEach(({ id, display, fmt }) => {
    document.getElementById(id).addEventListener('input', e => {
      document.getElementById(display).textContent = fmt(e.target.value);
      // Marca botão como pendente
      const btn = document.getElementById('saveLimitsBtn');
      btn.classList.add('pending');
      btn.textContent = '💾 Salvar Limites *';
    });
  });

  // Slider de refresh → atualiza display e reinicia timer imediatamente
  document.getElementById('refreshSlider').addEventListener('input', e => {
    document.getElementById('refreshVal').textContent = e.target.value;
    document.getElementById('topCountdown').textContent = e.target.value + 's';
    saveState();
    resetTimer();
  });

  // Botão Salvar Limites → aplica, salva e refaz fetch
  document.getElementById('saveLimitsBtn').addEventListener('click', () => {
    const btn = document.getElementById('saveLimitsBtn');
    btn.classList.remove('pending');
    btn.textContent = '✅ Limites Salvos!';
    setTimeout(() => { btn.textContent = '💾 Salvar Limites'; }, 2000);
    saveState();
    fetchData();
  });

  // Selects
  ['citySelect', 'periodSelect'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => { saveState(); fetchData(); })
  );

  // Refresh manual
  document.getElementById('refreshBtn').addEventListener('click', fetchData);

  // Tabs
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // Menu mobile
  document.getElementById('menuBtn').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open')
  );

  // 5. Restaura cache da última requisição para evitar tela em branco no F5
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      lastData = JSON.parse(cached);
      render(lastData); // renderiza imediatamente com dados antigos
    }
  } catch {}

  // Loading → fetch (atualiza em background) → timer
  runLoadingSequence(() => {
    fetchData();
    resetTimer();
  });
});