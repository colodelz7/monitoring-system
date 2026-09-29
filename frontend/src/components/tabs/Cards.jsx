import { useMemo, useState } from 'react';
import AnimatedNumber from '../AnimatedNumber';
import Icon from '../Icon';

/**
 * Cartões do painel.
 *
 * Valor, cor, legenda e formatação chegam prontos do servidor. Este componente
 * só decide como apresentar, e mantém a altura fixa mesmo sem dados, para que
 * a chegada do primeiro payload não empurre o restante da página.
 *
 * A ordem e a visibilidade são preferência de quem olha. Quem acompanha sismos
 * quer esse cartão primeiro; quem acompanha o clima de casa talvez nem queira
 * o cartão de sismos na tela. A escolha fica no navegador e é aplicada sobre o
 * que o servidor mandou, nunca no lugar dele: um cartão novo aparece mesmo para
 * quem já personalizou, porque o que está salvo é a ordem, não a lista.
 */

function ordenar(cards, ordem, ocultos) {
  const visiveis = cards.filter((card) => !ocultos.includes(card.id));
  if (!ordem.length) return visiveis;

  const posicao = new Map(ordem.map((id, i) => [id, i]));
  // Cartão que não está na ordem salva é novidade do servidor, e novidade vai
  // para o fim em vez de sumir.
  return [...visiveis].sort((a, b) => (posicao.get(a.id) ?? 999) - (posicao.get(b.id) ?? 999));
}

export default function Cards({ cards, loading, prefs, onToggleCard, onMoveCard, onRestore, personalizado }) {
  const [editando, setEditando] = useState(false);

  const originais = cards?.length ? cards : PLACEHOLDERS;
  const ocultos = prefs?.cartoesOcultos ?? [];
  const ordem = prefs?.ordemCartoes ?? [];

  const lista = useMemo(() => ordenar(originais, ordem, ocultos), [originais, ordem, ocultos]);

  // A ordem em vigor, que é o ponto de partida quando alguém move um cartão
  // pela primeira vez.
  const ordemAtual = useMemo(() => ordenar(originais, ordem, []).map((c) => c.id), [originais, ordem]);

  const temDados = Boolean(cards?.length);

  return (
    <>
      <div className="cards-toolbar">
        <button
          className={`ghost-btn${editando ? ' is-armed' : ''}`}
          onClick={() => setEditando((v) => !v)}
          disabled={!temDados}
          aria-pressed={editando}
        >
          <Icon name={editando ? 'check' : 'layers'} size={12} />
          {editando ? 'Pronto' : 'Personalizar'}
        </button>

        {editando && personalizado && (
          <button className="ghost-btn" onClick={onRestore}>
            <Icon name="refresh" size={12} /> Restaurar padrão
          </button>
        )}

        {editando && (
          <span className="cards-hint">Use as setas para reordenar e o olho para esconder.</span>
        )}
      </div>

      <div className="cards-grid">
        {lista.map((card, index) => (
          <article
            className={`card card--${card.variant}${loading && !temDados ? ' is-loading' : ''}${editando ? ' is-editing' : ''}`}
            key={card.id}
            style={{ '--stagger': `${index * 0.05}s`, '--card-accent-color': card.color }}
            title={editando ? undefined : card.tooltip || undefined}
          >
            <div className="card-accent" />

            {editando && (
              <div className="card-edit">
                <button
                  className="icon-btn"
                  onClick={() => onMoveCard(card.id, -1, ordemAtual)}
                  disabled={index === 0}
                  aria-label={`Mover ${card.label} para antes`}
                >
                  <Icon name="chevronLeft" size={12} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onToggleCard(card.id)}
                  aria-label={`Esconder ${card.label}`}
                  title="Esconder"
                >
                  <Icon name="eyeOff" size={12} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onMoveCard(card.id, 1, ordemAtual)}
                  disabled={index === lista.length - 1}
                  aria-label={`Mover ${card.label} para depois`}
                >
                  <Icon name="chevronRight" size={12} />
                </button>
              </div>
            )}

            <div className="card-icon"><Icon name={card.icon} size={19} /></div>
            <div className="card-body">
              <div className="card-label">{card.label}</div>
              <div className="card-value" style={{ color: card.color }}>
                {card.numeric != null ? (
                  <AnimatedNumber value={card.numeric} decimals={card.decimals ?? 0} suffix={card.suffix ?? ''} />
                ) : (
                  <span>{card.display ?? '--'}</span>
                )}
              </div>
              <div className="card-desc">{card.description}</div>
            </div>
            <div className="card-glow" />
          </article>
        ))}
      </div>

      {/* Os escondidos ficam listados enquanto se edita, senão não haveria como
          trazer de volta o que sumiu. */}
      {editando && ocultos.length > 0 && (
        <div className="cards-hidden">
          <span className="cards-hint">Escondidos:</span>
          {ocultos.map((id) => {
            const card = originais.find((c) => c.id === id);
            return (
              <button className="ghost-btn" key={id} onClick={() => onToggleCard(id)}>
                <Icon name="plus" size={11} /> {card?.label ?? id}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// Estrutura vazia com as mesmas dimensões dos cartões reais, usada enquanto o
// primeiro payload não chegou.
const PLACEHOLDERS = [
  { id: 'temp', variant: 'cyan', icon: 'thermometer', label: 'Temperatura Atual', display: '--', description: '--' },
  { id: 'humidity', variant: 'blue', icon: 'droplet', label: 'Umidade & Ventos', display: '--', description: '--' },
  { id: 'air', variant: 'aqi', icon: 'leaf', label: 'Qualidade do Ar', display: '--', description: '--' },
  { id: 'seismic', variant: 'ind', icon: 'quake', label: 'Eventos Sísmicos', display: '--', description: '--' },
  { id: 'alerts', variant: 'alert', icon: 'bell', label: 'Alertas Ativos', display: '--', description: '--' },
];
