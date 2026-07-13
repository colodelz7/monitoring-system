export default function Alerts({ alerts }) {
  return (
    <>
      <div className="alerts-header">
        <h2 className="alerts-title">Central de Alertas</h2>
        <span className="alerts-count">{alerts.length} alerta{alerts.length !== 1 ? 's' : ''} ativo{alerts.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-text">Nenhum alerta ativo</div>
            <div className="empty-sub">Sistema operando normalmente</div>
          </div>
        ) : (
          alerts.map((a, i) => (
            <div className={`alert-item ${a.type}`} key={i} style={{ animationDelay: `${i * 0.07}s` }}>
              <div className="alert-ico">{a.type === 'danger' ? '🔴' : '🟡'}</div>
              <div className="alert-body">
                <span className="alert-sensor">{a.sensor}</span>
                <div className="alert-msg">
                  {a.message}
                  {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="alert-link">↗ USGS</a>}
                </div>
              </div>
              <div className="alert-time">{a.timestamp}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
