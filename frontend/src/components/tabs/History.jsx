import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';

export default function History() {
  const [state, setState] = useState({ status: 'loading', items: [] });

  const load = useCallback(async () => {
    setState({ status: 'loading', items: [] });
    try {
      const items = await api.alertsLog();
      setState({ status: 'done', items });
    } catch {
      setState({ status: 'error', items: [] });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearHistory() {
    try { await api.clearAlertsLog(); } catch {}
    load();
  }

  return (
    <>
      <div className="alerts-header">
        <h2 className="alerts-title">Histórico de Alertas</h2>
        <button className="save-limits-btn" style={{ fontSize: '.7rem', padding: '4px 12px' }} onClick={clearHistory}>
          🗑 Limpar
        </button>
      </div>
      <div className="alerts-list">
        {state.status === 'loading' && (
          <div className="empty-state"><div className="empty-icon"><span className="spinner"></span></div></div>
        )}
        {state.status === 'error' && (
          <div className="empty-state"><div className="empty-text">Erro ao carregar histórico</div></div>
        )}
        {state.status === 'done' && state.items.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-text">Nenhum alerta registrado ainda</div>
            <div className="empty-sub">O histórico é salvo automaticamente no servidor</div>
          </div>
        )}
        {state.status === 'done' && state.items.map((a, i) => (
          <div className={`alert-item ${a.type}`} key={i} style={{ animationDelay: `${i * 0.03}s` }}>
            <div className="alert-ico">{a.type === 'danger' ? '🔴' : '🟡'}</div>
            <div className="alert-body">
              <span className="alert-sensor">{a.sensor} · {a.city || ''}</span>
              <div className="alert-msg">{a.message}</div>
            </div>
            <div className="alert-time">{new Date(a.loggedAt).toLocaleString('pt-BR')}</div>
          </div>
        ))}
      </div>
    </>
  );
}
