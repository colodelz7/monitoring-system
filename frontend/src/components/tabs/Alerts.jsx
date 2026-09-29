import { useState } from 'react';
import AlertDetail from '../AlertDetail';
import Icon, { Bullet } from '../Icon';

function measurement(alert) {
  if (alert.value == null) return null;
  const value = `${alert.value}${alert.unit ?? ''}`;
  if (alert.threshold == null) return value;
  const symbol = alert.comparator === '<=' ? '≤' : alert.comparator === '>' ? '>' : '≥';
  return `${value} ${symbol} ${alert.threshold}${alert.unit ?? ''}`;
}

export default function Alerts({ alerts = [], summary }) {
  const [selected, setSelected] = useState(null);

  return (
    <>
      <div className="alerts-header">
        <div>
          <h2 className="alerts-title">Central de Alertas</h2>
          <span className="alerts-count">
            {alerts.length} alerta{alerts.length === 1 ? '' : 's'} ativo{alerts.length === 1 ? '' : 's'}
          </span>
        </div>
        {summary && summary.total > 0 && (
          <div className="stat-strip">
            <span className="stat-chip stat-chip--danger">{summary.danger} crítico{summary.danger === 1 ? '' : 's'}</span>
            <span className="stat-chip stat-chip--warning">{summary.warning} atenção</span>
          </div>
        )}
      </div>

      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Icon name="check" size={30} /></div>
            <div className="empty-text">Nenhum alerta ativo</div>
            <div className="empty-sub">Sistema operando normalmente</div>
          </div>
        ) : (
          alerts.map((alert, index) => {
            const reading = measurement(alert);
            return (
              <button
                type="button"
                className={`alert-item alert-item--clickable ${alert.severity}`}
                key={alert.id}
                style={{ '--stagger': `${Math.min(index, 12) * 0.06}s` }}
                onClick={() => setSelected(alert)}
                aria-label={`Ver detalhes: ${alert.message}`}
              >
                <div className="alert-ico"><Bullet color={alert.severity === 'danger' ? 'var(--red)' : 'var(--orange)'} size={11} /></div>
                <div className="alert-body">
                  <div className="alert-tags">
                    <span className="alert-sensor">{alert.sensorLabel}</span>
                    <span className="alert-tag">{alert.metricLabel}</span>
                    {reading && <span className="alert-tag alert-tag--metric">{reading}</span>}
                  </div>
                  <div className="alert-msg">{alert.message}</div>
                </div>
                <div className="alert-time">
                  {alert.timestamp}
                  <span className="alert-chevron"><Icon name="chevronRight" size={14} /></span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <AlertDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
