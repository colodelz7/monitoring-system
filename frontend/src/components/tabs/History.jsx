import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { RANGE_OPTIONS, useAlertHistory } from '../../hooks/useAlertHistory';
import AlertDetail from '../AlertDetail';
import AlertsDailyChart from './AlertsDailyChart';
import Icon, { Bullet } from '../Icon';

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

/**
 * Resume o que cruzou o limite em uma linha curta.
 * É o que transforma a lista de "aconteceu algo" em "aconteceu isto, porque
 * passou daqui".
 */
function measurement(entry) {
  if (entry.value == null) return null;
  const value = `${entry.value}${entry.unit ?? ''}`;
  if (entry.threshold == null) return value;
  const symbol = entry.comparator === '<=' ? '≤' : entry.comparator === '>' ? '>' : '≥';
  return `${value} ${symbol} ${entry.threshold}${entry.unit ?? ''}`;
}

export default function History({ theme }) {
  const { filters, updateFilters, reset, activeCount, page, setPage, state, reload } = useAlertHistory();
  const [selected, setSelected] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState(null);
  const [armed, setArmed] = useState(false);

  const facets = state.facets;

  // Apagar a trilha e irreversivel pela interface, entao o primeiro clique so
  // arma o botao e o segundo executa. O estado armado se desfaz sozinho, para o
  // botao nao ficar perigoso esperando um clique distraido.
  const clearHistory = useCallback(async () => {
    if (!armed) {
      setArmed(true);
      setNotice(null);
      return;
    }

    setArmed(false);
    setClearing(true);
    setNotice(null);
    try {
      const result = await api.clearAlertsLog();
      setSelected(null);
      await reload();
      setNotice(
        result?.removed
          ? `${result.removed} registro${result.removed === 1 ? '' : 's'} apagado${result.removed === 1 ? '' : 's'}. Uma cópia ficou guardada no servidor.`
          : 'O histórico já estava vazio.',
      );
    } catch (error) {
      setNotice(error.message || 'Não foi possível limpar o histórico.');
    } finally {
      setClearing(false);
    }
  }, [armed, reload]);

  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);

  const busy = state.status === 'loading';
  const items = state.items;

  return (
    <>
      <div className="alerts-header">
        <div>
          <h2 className="alerts-title">Histórico de Alertas</h2>
          <span className="alerts-count">
            {state.total} registro{state.total === 1 ? '' : 's'}
            {activeCount > 0 && ' após filtros'}
            {facets?.newest && ` · último em ${formatDateTime(facets.newest)}`}
          </span>
        </div>
        <button
          className={`ghost-btn ghost-btn--danger${armed ? ' is-armed' : ''}`}
          onClick={clearHistory}
          disabled={clearing || state.total === 0}
          aria-live="polite"
        >
          <Icon name="trash" size={13} />
          {clearing ? 'Limpando...' : armed ? 'Confirmar exclusão?' : 'Limpar'}
        </button>
      </div>

      {notice && <div className="inline-notice">{notice}</div>}

      <div className="filter-bar">
        <div className="filter-field filter-field--grow">
          <label className="field-label" htmlFor="historySearch">Busca</label>
          <input
            id="historySearch"
            type="search"
            className="input-select"
            placeholder="Mensagem, cidade ou local..."
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
          />
        </div>

        <div className="filter-field">
          <label className="field-label" htmlFor="historySensor">Tipo</label>
          <select
            id="historySensor"
            className="input-select"
            value={filters.sensor}
            onChange={(event) => updateFilters({ sensor: event.target.value })}
          >
            <option value="">Todos</option>
            {(facets?.sensors ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label className="field-label" htmlFor="historyCity">Cidade</label>
          <select
            id="historyCity"
            className="input-select"
            value={filters.city}
            onChange={(event) => updateFilters({ city: event.target.value })}
          >
            <option value="">Todas</option>
            {(facets?.cities ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label className="field-label" htmlFor="historySeverity">Gravidade</label>
          <select
            id="historySeverity"
            className="input-select"
            value={filters.severity}
            onChange={(event) => updateFilters({ severity: event.target.value })}
          >
            <option value="">Todas</option>
            {(facets?.severities ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label className="field-label" htmlFor="historyRange">Período</label>
          <select
            id="historyRange"
            className="input-select"
            value={filters.range}
            onChange={(event) => updateFilters({ range: event.target.value })}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {/* Os dois campos de data só aparecem quando o período é personalizado.
            Deixá-los sempre visíveis ocuparia metade da barra de filtros para
            algo que quase nunca se usa. */}
        {filters.range === 'custom' && (
          <>
            <div className="filter-field">
              <label className="field-label" htmlFor="historyFrom">De</label>
              <input
                id="historyFrom"
                type="date"
                className="input-select"
                max={filters.to || undefined}
                value={filters.from}
                onChange={(event) => updateFilters({ from: event.target.value })}
              />
            </div>

            <div className="filter-field">
              <label className="field-label" htmlFor="historyTo">Até</label>
              <input
                id="historyTo"
                type="date"
                className="input-select"
                min={filters.from || undefined}
                value={filters.to}
                onChange={(event) => updateFilters({ to: event.target.value })}
              />
            </div>
          </>
        )}

        {activeCount > 0 && (
          <button className="ghost-btn" onClick={reset}><Icon name="close" size={12} /> Limpar filtros</button>
        )}
      </div>

      {state.stats && state.stats.total > 0 && (
        <div className="stat-strip">
          <span className="stat-chip stat-chip--danger">{state.stats.danger} crítico{state.stats.danger === 1 ? '' : 's'}</span>
          <span className="stat-chip stat-chip--warning">{state.stats.warning} atenção</span>
          <span className="stat-chip"><Icon name="cloud" size={12} /> {state.stats.clima} clima</span>
          <span className="stat-chip"><Icon name="quake" size={12} /> {state.stats.sismo} sismo</span>
          {state.stats.regra > 0 && <span className="stat-chip"><Icon name="sliders" size={12} /> {state.stats.regra} regra</span>}
          {state.stats.anomalia > 0 && <span className="stat-chip"><Icon name="sparkle" size={12} /> {state.stats.anomalia} anomalia</span>}
        </div>
      )}

      <AlertsDailyChart days={30} theme={theme} />

      <div className={`alerts-list${state.status === 'refreshing' ? ' is-refreshing' : ''}`}>
        {busy && (
          // Esqueletos com a altura da linha real, para a lista não saltar
          // quando os dados chegam.
          Array.from({ length: 6 }, (_, index) => <div className="alert-skeleton" key={index} />)
        )}

        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-icon"><Icon name="alert" size={30} /></div>
            <div className="empty-text">Erro ao carregar histórico</div>
            <div className="empty-sub">{state.error}</div>
          </div>
        )}

        {!busy && state.status !== 'error' && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Icon name="list" size={30} /></div>
            <div className="empty-text">
              {activeCount > 0 ? 'Nenhum alerta corresponde aos filtros' : 'Nenhum alerta registrado ainda'}
            </div>
            <div className="empty-sub">
              {activeCount > 0 ? 'Ajuste ou limpe os filtros para ver mais.' : 'O histórico é gravado automaticamente no servidor.'}
            </div>
          </div>
        )}

        {!busy && items.map((entry, index) => {
          const reading = measurement(entry);
          return (
            <button
              type="button"
              className={`alert-item alert-item--clickable ${entry.severity}`}
              key={entry.id}
              style={{ '--stagger': `${Math.min(index, 12) * 0.03}s` }}
              onClick={() => setSelected(entry)}
              aria-label={`Ver detalhes: ${entry.message}`}
            >
              <div className="alert-ico"><Bullet color={entry.severity === 'danger' ? 'var(--red)' : 'var(--orange)'} size={11} /></div>
              <div className="alert-body">
                <div className="alert-tags">
                  <span className="alert-sensor">{entry.sensorLabel}</span>
                  {entry.city && <span className="alert-tag"><Icon name="pin" size={11} /> {entry.city}</span>}
                  <span className="alert-tag">{entry.metricLabel}</span>
                  {reading && <span className="alert-tag alert-tag--metric">{reading}</span>}
                </div>
                <div className="alert-msg">{entry.message}</div>
              </div>
              <div className="alert-time">
                {formatDateTime(entry.loggedAt)}
                <span className="alert-chevron"><Icon name="chevronRight" size={14} /></span>
              </div>
            </button>
          );
        })}
      </div>

      {state.pageCount > 1 && (
        <div className="pagination">
          <button className="ghost-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="chevronLeft" size={12} /> Anterior</button>
          <span className="pagination-label">Página {page} de {state.pageCount}</span>
          <button className="ghost-btn" disabled={page >= state.pageCount} onClick={() => setPage(page + 1)}>Próxima <Icon name="chevronRight" size={12} /></button>
        </div>
      )}

      <AlertDetail entry={selected} onClose={() => setSelected(null)} />
    </>
  );
}
