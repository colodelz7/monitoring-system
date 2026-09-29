import { useEffect, useRef } from 'react';
import Icon from './Icon';

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' });
}

const COMPARATOR_TEXT = {
  '>=': 'atingiu ou passou do limite de',
  '<=': 'ficou no limite de ou abaixo de',
  '>': 'passou do limite de',
};

function Row({ label, children }) {
  if (children == null || children === '') return null;
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
    </div>
  );
}

/**
 * Painel lateral com o evento completo.
 *
 * Abre por cima do conteúdo em vez de expandir a linha na lista, para que
 * nenhum item saia do lugar quando um alerta é aberto ou fechado.
 */
export default function AlertDetail({ entry, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!entry) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [entry, onClose]);

  if (!entry) return null;

  const unit = entry.unit ?? '';
  const comparator = COMPARATOR_TEXT[entry.comparator] ?? 'cruzou o limite de';

  return (
    <div className="detail-backdrop" onClick={onClose} role="presentation">
      <aside
        className={`detail-panel detail-panel--${entry.severity}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detailTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="detail-header">
          <div>
            <span className="alert-sensor">{entry.sensorLabel}</span>
            <span className={`detail-severity detail-severity--${entry.severity}`}>{entry.severityLabel}</span>
          </div>
          <button ref={closeRef} className="detail-close" onClick={onClose} aria-label="Fechar detalhes"><Icon name="close" size={15} /></button>
        </header>

        <h3 className="detail-title" id="detailTitle">{entry.message}</h3>

        {entry.value != null && (
          <div className="detail-measure">
            <div className="detail-measure-item">
              <span className="detail-measure-label">Valor medido</span>
              <span className="detail-measure-value">{entry.value}{unit}</span>
            </div>
            <div className="detail-measure-arrow" aria-hidden="true">
              <Icon name={entry.comparator === '<=' ? 'arrowDown' : 'arrowUp'} size={14} />
            </div>
            <div className="detail-measure-item">
              <span className="detail-measure-label">Limite configurado</span>
              <span className="detail-measure-value detail-measure-value--muted">
                {entry.threshold != null ? `${entry.threshold}${unit}` : 'não registrado'}
              </span>
            </div>
          </div>
        )}

        {entry.value != null && entry.threshold != null && (
          <p className="detail-sentence">
            A leitura de <b>{entry.value}{unit}</b> {comparator} <b>{entry.threshold}{unit}</b>
            {entry.exceededBy != null && <> , uma diferença de <b>{entry.exceededBy}{unit}</b></>}.
          </p>
        )}

        <div className="detail-grid">
          <Row label="Quando disparou">{formatDateTime(entry.at)}</Row>
          <Row label="Registrado em">{formatDateTime(entry.loggedAt)}</Row>
          <Row label="Cidade monitorada">{entry.city}</Row>
          <Row label="Local do evento">{entry.place}</Row>
          <Row label="Métrica">{entry.metricLabel}</Row>
          <Row label="Sensor">{entry.sensorLabel}</Row>
          <Row label="Gravidade">{entry.severityLabel}</Row>
          <Row label="Identificador">
            <code className="detail-code">{entry.id}</code>
          </Row>
        </div>

        {entry.url && (
          <a className="detail-link" href={entry.url} target="_blank" rel="noreferrer noopener">
            <Icon name="external" size={13} /> Abrir evento no USGS
          </a>
        )}

        {entry.legacy && (
          <p className="detail-legacy">
            Registro anterior à trilha completa. Valor e limite foram recuperados do texto da
            mensagem quando possível, então alguns campos podem estar vazios.
          </p>
        )}
      </aside>
    </div>
  );
}
