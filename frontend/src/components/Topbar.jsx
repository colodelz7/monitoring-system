export default function Topbar({
  status, city, cityTime, countdown, isMock, isCached, cacheAge,
  loading, onMenuClick, onRefresh,
}) {
  return (
    <header className="topbar">
      <button className="menu-btn" id="menuBtn" onClick={onMenuClick}>☰</button>

      <div className="topbar-left">
        <div className="status-pill" id="statusPill">
          <div className={`status-dot ${status.type === 'safe' ? '' : status.type}`} id="statusDot"></div>
          <span className="status-text" id="statusText">{status.text}</span>
        </div>
        {!isMock && !isCached && <span id="modeBadge" className="badge-live">● LIVE</span>}
        {isMock && <span id="demoBadge" className="badge-demo">⚠ DEMO</span>}
        {isCached && (
          <span id="cacheBadge" className="badge-cache" title={`Cache de ${Math.floor((cacheAge || 0) / 60)}min atrás`}>
            📦 CACHE
          </span>
        )}
      </div>

      <div className="topbar-right">
        <div className="topbar-stat">
          <span className="stat-label">Cidade</span>
          <span className="stat-val" id="topCity">{city || '—'}</span>
        </div>
        <div className="divider"></div>
        <div className="topbar-stat">
          <span className="stat-label">Hora Local</span>
          <span className="stat-val" id="topTime">{cityTime || '--:--:--'}</span>
        </div>
        <div className="divider"></div>
        <div className="topbar-stat">
          <span className="stat-label">Próx. Update</span>
          <span className="stat-val" id="topCountdown">{countdown}s</span>
        </div>
        <button
          className={`refresh-btn${loading ? ' spinning' : ''}`}
          id="refreshBtn" title="Atualizar agora"
          onClick={onRefresh}
        >↻</button>
      </div>
    </header>
  );
}
