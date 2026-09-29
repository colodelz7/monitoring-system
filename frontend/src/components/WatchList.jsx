import { useWatchlist } from '../hooks/useWatchlist';
import Icon from './Icon';

/**
 * Cidades acompanhadas.
 *
 * O painel mostra uma cidade por vez, e conferir as outras significava trocar,
 * esperar o ciclo e trocar de volta. Aqui elas ficam todas visíveis em uma
 * linha cada, e um clique leva o painel inteiro para a escolhida.
 *
 * A lista vive no navegador desta máquina: é preferência de quem olha, não
 * estado do sistema. O servidor não guarda nada, só responde sobre as cidades
 * que vierem na pergunta.
 */
export default function WatchList({ cidades, cidadeAtual, thresholds, max, onToggle, onSelect }) {
  const { status, cidades: leituras } = useWatchlist(cidades, thresholds);

  const jaAcompanha = cidades.some((c) => c.toLowerCase() === String(cidadeAtual).toLowerCase());
  const cheio = cidades.length >= max;

  return (
    <div className="sidebar-section">
      <div className="section-label">
        <Icon name="pin" size={12} /> Acompanhando
        {cidades.length > 0 && <span className="section-count">{cidades.length}/{max}</span>}
      </div>

      {cidades.length === 0 && (
        <p className="section-empty">
          Nenhuma cidade na lista. Adicione a que está no painel para vê-la aqui sem trocar de cidade.
        </p>
      )}

      <div className="watch-list">
        {cidades.map((cidade) => {
          const leitura = leituras.find((l) => l.cidade.toLowerCase() === cidade.toLowerCase());
          const atual = cidade.toLowerCase() === String(cidadeAtual).toLowerCase();

          return (
            <div className={`watch-item${atual ? ' is-current' : ''}`} key={cidade}>
              <button
                className="watch-main"
                onClick={() => onSelect(cidade)}
                title={`Abrir ${cidade} no painel`}
              >
                <span className="watch-name">{leitura?.nome ?? cidade}</span>
                <span className={`watch-temp watch-temp--${leitura?.situacao ?? 'normal'}`}>
                  {leitura?.disponivel ? `${Math.round(leitura.temp)}°` : status === 'loading' ? '··' : '--'}
                </span>
              </button>

              <button
                className="icon-btn"
                onClick={() => onToggle(cidade)}
                aria-label={`Parar de acompanhar ${cidade}`}
                title="Tirar da lista"
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        className="ghost-btn ghost-btn--block"
        onClick={() => onToggle(cidadeAtual)}
        disabled={!jaAcompanha && cheio}
        title={!jaAcompanha && cheio ? `A lista cabe ${max} cidades` : undefined}
      >
        <Icon name={jaAcompanha ? 'check' : 'plus'} size={12} />
        {jaAcompanha ? `${cidadeAtual} está na lista` : `Acompanhar ${cidadeAtual}`}
      </button>
    </div>
  );
}
