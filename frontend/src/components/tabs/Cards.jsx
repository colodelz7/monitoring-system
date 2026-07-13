import { degToCompass } from '../../lib/api';

export default function Cards({ weather, seismic, aqi, alerts, tMin, tMax, mag }) {
  const events = seismic?.events || [];
  const total = events.length;
  const maxMag = total ? Math.max(...events.map((e) => e.magnitude)) : 0;
  const top = total ? events.find((e) => e.magnitude === maxMag) : null;
  const topPlace = top ? (top.place.length > 26 ? top.place.slice(0, 23) + '…' : top.place) : '';
  const seismicColor = maxMag >= 6 ? 'var(--red)' : maxMag >= mag ? 'var(--orange)' : '#a78bfa';

  const alertsCount = alerts.length;
  const danger = alerts.some((a) => a.type === 'danger');
  const alertsColor = danger ? 'var(--red)' : alertsCount > 0 ? 'var(--orange)' : 'var(--green)';
  const wA = alerts.filter((a) => a.sensor === 'clima').length;
  const sA = alerts.filter((a) => a.sensor === 'sismo').length;

  const aqiLabels = ['', 'Boa', 'Razoável', 'Moderada', 'Ruim', 'Péssima'];
  const aqiColors = ['', 'var(--green)', '#a3e635', 'var(--orange)', '#f97316', 'var(--red)'];

  const tempColor = weather?.success
    ? (weather.temp >= tMax ? 'var(--red)' : weather.temp <= tMin ? 'var(--blue2)' : 'var(--cyan)')
    : 'var(--w20)';

  return (
    <div className="cards-grid">
      <div className="card card--cyan" id="cardTemp" style={{ '--card-accent-color': tempColor }}>
        <div className="card-accent"></div>
        <div className="card-icon">🌡</div>
        <div className="card-body">
          <div className="card-label">Temperatura Atual</div>
          <div className="card-value">
            {weather?.success ? <span style={{ color: tempColor }}>{weather.temp}°C</span> : <span className="spinner"></span>}
          </div>
          <div className="card-desc">
            {weather?.success ? `↓ ${weather.temp_min}°C  ·  ↑ ${weather.temp_max}°C  ·  ${weather.description}` : '—'}
          </div>
        </div>
        <div className="card-glow"></div>
      </div>

      <div className="card card--blue" id="cardHumidity">
        <div className="card-accent"></div>
        <div className="card-icon">💧</div>
        <div className="card-body">
          <div className="card-label">Umidade & Ventos</div>
          <div className="card-value">
            {weather?.success ? <>{weather.humidity}<span style={{ fontSize: '.95rem', color: 'var(--w20)' }}>%</span></> : <span className="spinner"></span>}
          </div>
          <div className="card-desc">
            {weather?.success ? `💨 ${weather.wind_speed} m/s ${degToCompass(weather.wind_deg || 0)}  ·  🔵 ${weather.pressure} hPa` : '—'}
          </div>
        </div>
        <div className="card-glow"></div>
      </div>

      <div className="card card--aqi" id="cardAQI" style={{ '--card-accent-color': aqiColors[aqi?.aqi] || 'var(--w50)' }}>
        <div className="card-accent"></div>
        <div className="card-icon">🌿</div>
        <div className="card-body">
          <div className="card-label">Qualidade do Ar</div>
          <div className="card-value">
            {aqi?.success && aqi.aqi != null
              ? <span style={{ color: aqiColors[aqi.aqi] }}>{aqiLabels[aqi.aqi]}</span>
              : <span style={{ color: 'var(--w20)' }}>—</span>}
          </div>
          <div className="card-desc">
            {aqi?.success && aqi.aqi != null
              ? `PM2.5: ${aqi.pm25?.toFixed(1)} · NO₂: ${aqi.no2?.toFixed(1)} · O₃: ${aqi.o3?.toFixed(1)}`
              : 'Indisponível'}
          </div>
        </div>
        <div className="card-glow"></div>
      </div>

      <div className="card card--ind" id="cardSeismic">
        <div className="card-accent"></div>
        <div className="card-icon">🌐</div>
        <div className="card-body">
          <div className="card-label">Eventos Sísmicos</div>
          <div className="card-value">
            {total > 0 ? <span style={{ color: seismicColor }}>{total}</span> : <span style={{ color: 'var(--w20)' }}>0</span>}
          </div>
          <div className="card-desc">
            {total > 0 ? `Máx M${maxMag.toFixed(1)} · ${topPlace}` : 'Sem eventos no período'}
          </div>
        </div>
        <div className="card-glow"></div>
      </div>

      <div className="card card--alert" id="cardAlerts">
        <div className="card-accent"></div>
        <div className="card-icon">🔔</div>
        <div className="card-body">
          <div className="card-label">Alertas Ativos</div>
          <div className="card-value"><span style={{ color: alertsColor }}>{alertsCount}</span></div>
          <div className="card-desc">🌤 {wA} clima  ·  🌐 {sA} sismo</div>
        </div>
        <div className="card-glow"></div>
      </div>
    </div>
  );
}
