import { useCallback, useState } from 'react';
import CitySearchInput from '../CitySearchInput';
import AnimatedNumber from '../AnimatedNumber';
import { api } from '../../lib/api';
import Icon from '../Icon';

// O mesmo teto do servidor. Cada cidade custa duas chamadas à API paga, e mais
// de quatro cartões lado a lado deixam de caber sem virar rolagem horizontal.
const MAX_CIDADES = 4;

function CompareCard({ result, metrics, index }) {
  const weather = result?.weather;

  if (!result?.found || !weather) {
    return (
      <article className="compare-card">
        <div className="compare-city-name">{result?.city ?? '--'}</div>
        <div className="empty-sub" style={{ marginTop: 12 }}>Cidade não encontrada</div>
      </article>
    );
  }

  return (
    <article className="compare-card">
      <div className="compare-city-name">{weather.resolvedName || result.city}</div>
      <div className="compare-temp">
        <AnimatedNumber value={weather.temp} decimals={1} suffix="°C" />
      </div>
      <div className="compare-desc">{weather.description || '--'}</div>

      <div className="compare-stats">
        {metrics.map((metric) => {
          const cell = metric.valores?.[index] ?? { value: null, wins: false };
          return (
            <div className={`cstat${cell.wins ? ' cstat--winner' : ''}`} key={metric.key}>
              <span className="cstat-l">
                {metric.label}
                {cell.wins && <span className="cstat-trophy" title="Melhor valor"><Icon name="trophy" size={13} /></span>}
              </span>
              <span className="cstat-v">
                {cell.value ?? '--'}{cell.value != null ? metric.unit : ''}
              </span>
            </div>
          );
        })}
      </div>

      {weather.mock && <div className="compare-mock"><Icon name="alert" size={11} /> DADOS SIMULADOS</div>}
    </article>
  );
}

export default function Compare() {
  // Lista e não dois campos fixos: é o que permite a terceira e a quarta cidade
  // sem duplicar o formulário a cada uma.
  const [cidades, setCidades] = useState(['São Paulo', 'Tóquio']);
  const [state, setState] = useState({ status: 'idle' });

  const trocar = useCallback((indice, valor) => {
    setCidades((prev) => prev.map((c, i) => (i === indice ? valor : c)));
  }, []);

  const adicionar = useCallback(() => {
    setCidades((prev) => (prev.length >= MAX_CIDADES ? prev : [...prev, '']));
  }, []);

  const remover = useCallback((indice) => {
    setCidades((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== indice)));
  }, []);

  const runCompare = useCallback(async () => {
    // O autocomplete devolve "Cidade, Estado, País"; a API de clima só quer o
    // primeiro trecho.
    const limpas = cidades.map((c) => c.split(',')[0].trim()).filter(Boolean);
    const unicas = [...new Set(limpas)];

    if (unicas.length < 2) {
      setState({ status: 'error', message: 'Preencha ao menos duas cidades diferentes.' });
      return;
    }

    setState({ status: 'loading', quantas: unicas.length });
    try {
      const data = await api.compare(unicas);
      if (!data.results?.length) throw new Error('Resposta inválida do servidor.');
      setState({ status: 'done', ...data });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  }, [cidades]);

  const quantasNoResultado = state.results?.length ?? 2;

  return (
    <>
      <div className="compare-controls">
        <div className="compare-inputs">
          {cidades.map((cidade, indice) => (
            // O índice como chave é o certo aqui: a lista é ordenada pela
            // posição e o campo pertence à posição, não ao nome digitado.
            // eslint-disable-next-line react/no-array-index-key
            <div className="compare-city-wrap" key={indice}>
              <label className="field-label">
                Cidade {String.fromCharCode(65 + indice)}
                {cidades.length > 2 && (
                  <button
                    type="button"
                    className="compare-remove"
                    onClick={() => remover(indice)}
                    title="Remover esta cidade"
                    aria-label={`Remover cidade ${String.fromCharCode(65 + indice)}`}
                  >
                    <Icon name="close" size={11} />
                  </button>
                )}
              </label>
              <CitySearchInput
                placeholder="Ex: São Paulo"
                defaultValue={cidade}
                onSelect={(result) => trocar(indice, result.label)}
              />
            </div>
          ))}

          {cidades.length < MAX_CIDADES && (
            <button className="ghost-btn compare-add" onClick={adicionar} title="Comparar mais uma cidade">
              <Icon name="compare" size={13} /> Mais uma
            </button>
          )}

          <button className="primary-btn" onClick={runCompare} disabled={state.status === 'loading'}>
            <Icon name="compare" size={14} />
            {state.status === 'loading' ? 'Comparando...' : 'Comparar'}
          </button>
        </div>
      </div>

      <div className="compare-result">
        {state.status === 'idle' && (
          <div className="empty-state">
            <div className="empty-icon"><Icon name="compare" size={30} /></div>
            <div className="empty-text">Selecione as cidades para comparar</div>
            <div className="empty-sub">De duas a {MAX_CIDADES} cidades, com dados de clima em tempo real lado a lado</div>
          </div>
        )}

        {state.status === 'loading' && (
          <div className="compare-grid" data-cidades={state.quantas}>
            {Array.from({ length: state.quantas ?? 2 }, (_, i) => <div className="compare-skeleton" key={i} />)}
          </div>
        )}

        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-icon" style={{ color: 'var(--red)' }}><Icon name="alert" size={30} /></div>
            <div className="empty-text">Erro ao comparar cidades</div>
            <div className="empty-sub">{state.message}</div>
          </div>
        )}

        {state.status === 'done' && (
          <>
            {state.verdict?.warmer && (
              <div className="compare-verdict">
                {/* Com duas cidades a diferença direta é a leitura natural. Com
                    três ou mais ela não existe, e o que informa é a amplitude
                    entre os extremos. */}
                {quantasNoResultado === 2 && state.verdict.tempDelta != null ? (
                  <><b>{state.verdict.warmer}</b> está {Math.abs(state.verdict.tempDelta).toFixed(1)}°C mais quente agora.</>
                ) : (
                  <>
                    <b>{state.verdict.warmer}</b> é a mais quente e <b>{state.verdict.colder}</b> a mais fria,
                    {' '}com {state.verdict.amplitude}°C entre as duas.
                  </>
                )}
              </div>
            )}
            <div className="compare-grid" data-cidades={quantasNoResultado}>
              {state.results.map((result, indice) => (
                <CompareCard
                  key={result.city}
                  result={result}
                  metrics={state.metrics}
                  index={indice}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
