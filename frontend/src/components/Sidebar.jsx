import { useState } from 'react';
import CitySearchInput from './CitySearchInput';

const TABS = [
  { id: 'dashboard', icon: '◈', label: 'Dashboard' },
  { id: 'seismic', icon: '◉', label: 'Mapa Sísmico' },
  { id: 'compare', icon: '⊞', label: 'Comparar' },
  { id: 'alerts', icon: '◆', label: 'Alertas' },
  { id: 'history', icon: '◎', label: 'Histórico' },
];

export default function Sidebar({ open, filters, onChange, pushNotif, activeTab, onTabChange, alertsCount }) {
  const [pendingLimits, setPendingLimits] = useState(false);
  const [localTempMin, setLocalTempMin] = useState(filters.tempMin);
  const [localTempMax, setLocalTempMax] = useState(filters.tempMax);
  const [localMag, setLocalMag] = useState(filters.magThreshold);
  const [saved, setSaved] = useState(false);

  function handleSaveLimits() {
    onChange({ tempMin: localTempMin, tempMax: localTempMax, magThreshold: localMag });
    setPendingLimits(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} id="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🌍</div>
        <div>
          <div className="logo-title">MONITORING SYSTEM</div>
          <div className="logo-sub">Tempo Real</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn${activeTab === t.id ? ' active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            <span className="nav-icon">{t.icon}</span> {t.label}
            {t.id === 'alerts' && alertsCount > 0 && (
              <span className="nav-badge" id="navBadge">{alertsCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="section-label">⚙ Configurações</div>

        <div className="field">
          <label className="field-label">Cidade</label>
          <CitySearchInput
            id="cityInput"
            wrapId="citySearchWrap"
            placeholder="Pesquisar cidade..."
            defaultValue={filters.city}
            onSelect={(r) => onChange({ city: r.name })}
          />
        </div>

        <div className="field">
          <label className="field-label">Período Sísmico</label>
          <select
            id="periodSelect"
            className="input-select"
            value={filters.period}
            onChange={(e) => onChange({ period: e.target.value })}
          >
            <option value="day">Últimas 24 Horas</option>
            <option value="week">Últimos 7 Dias</option>
          </select>
        </div>

        <div className="field">
          <label className="field-label">Auto-refresh: <span className="val-hi">{filters.refreshSecs}</span>s</label>
          <input
            type="range" id="refreshSlider" className="slider"
            min="10" max="300" step="10"
            value={filters.refreshSecs}
            onChange={(e) => onChange({ refreshSecs: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-label">⚠ Limites de Alerta</div>

        <div className="field">
          <label className="field-label">Temp. Mín: <span className="val-blue">{localTempMin}</span>°C</label>
          <input
            type="range" className="slider slider-blue" min="-10" max="25" step="1"
            value={localTempMin}
            onChange={(e) => { setLocalTempMin(parseInt(e.target.value)); setPendingLimits(true); }}
          />
        </div>

        <div className="field">
          <label className="field-label">Temp. Máx: <span className="val-red">{localTempMax}</span>°C</label>
          <input
            type="range" className="slider slider-red" min="20" max="45" step="1"
            value={localTempMax}
            onChange={(e) => { setLocalTempMax(parseInt(e.target.value)); setPendingLimits(true); }}
          />
        </div>

        <div className="field">
          <label className="field-label">Magnitude: <span className="val-orange">M {parseFloat(localMag).toFixed(1)}</span></label>
          <input
            type="range" className="slider slider-orange" min="1" max="9" step="0.5"
            value={localMag}
            onChange={(e) => { setLocalMag(parseFloat(e.target.value)); setPendingLimits(true); }}
          />
        </div>

        <button
          className={`save-limits-btn${pendingLimits ? ' pending' : ''}`}
          onClick={handleSaveLimits}
        >
          {saved ? '✅ Limites Salvos!' : pendingLimits ? '💾 Salvar Limites *' : '💾 Salvar Limites'}
        </button>
      </div>

      <div className="sidebar-section">
        <div className="section-label">🔔 Notificações</div>
        <button
          className="save-limits-btn"
          style={{
            background: 'rgba(124,58,237,0.15)', borderColor: 'rgba(124,58,237,0.3)',
            color: pushNotif.enabled ? '#00ff88' : '#a78bfa',
          }}
          onClick={pushNotif.toggle}
          disabled={!pushNotif.supported}
        >
          {!pushNotif.supported ? 'Push não suportado' : pushNotif.enabled ? '✅ Push Ativo' : 'Ativar Push Alerts'}
        </button>
      </div>
    </aside>
  );
}
