import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/colodelbot.css';
import { useAssistant } from '../hooks/useAssistant';
import { Markdown } from '../lib/miniMarkdown';
import RobotAvatar from './RobotAvatar';
import Icon from './Icon';

const SUGESTOES = [
  'Resuma a situação desta cidade',
  'Por que esses alertas dispararam?',
  'Qual foi o maior sismo do período?',
  'Como funciona o histórico de alertas?',
];

const MS_ATE_DORMIR = 45000;

/**
 * Assistente flutuante.
 *
 * Fica fora do fluxo do painel de propósito: é uma ajuda de leitura, não mais
 * um cartão disputando espaço. O botão carrega o próprio robô, então quem vê a
 * tela pela primeira vez entende o que aquilo é antes de clicar.
 */
export default function ColodelBot({ city, period, open, onOpenChange, onAction }) {
  const [draft, setDraft] = useState('');
  const [asleep, setAsleep] = useState(false);

  // Aberto e fechado vivem no App, porque o atalho de teclado e o botão
  // flutuante comandam o mesmo painel. Aqui só se usa o que veio por prop.
  const setOpen = useCallback((next) => {
    onOpenChange(typeof next === 'function' ? next(open) : next);
  }, [onOpenChange, open]);

  const { status, messages, state, error, send, stop, reset, busy } = useAssistant({ city, period, onAction });

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sleepTimer = useRef(null);

  const wake = useCallback(() => {
    setAsleep(false);
    clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => setAsleep(true), MS_ATE_DORMIR);
  }, []);

  useEffect(() => {
    wake();
    return () => clearTimeout(sleepTimer.current);
  }, [wake, messages, open]);

  // A conversa acompanha o texto que está chegando, sem arrancar o scroll de
  // quem subiu para reler algo.
  useEffect(() => {
    const node = listRef.current;
    if (!node || !open) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape fecha, como qualquer painel sobreposto.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const submit = useCallback((event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    send(text);
  }, [draft, busy, send]);

  const onKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }, [submit]);

  // Sem chave no servidor o recurso não existe, em vez de existir quebrado.
  if (status && !status.enabled) return null;

  const mood = state === 'pensando' ? 'pensando'
    : state === 'respondendo' ? 'falando'
    : asleep && !open ? 'dormindo'
    : 'feliz';

  const statusText = state === 'pensando' ? 'Pensando'
    : state === 'respondendo' ? 'Respondendo'
    : 'Pronto';

  return (
    <>
      <button
        className={`bot-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        title={open ? 'Fechar o ColodelBot' : 'Abrir o ColodelBot'}
        aria-label={open ? 'Fechar o ColodelBot' : 'Abrir o ColodelBot'}
        aria-expanded={open}
      >
        <RobotAvatar mood={mood} size={52} track={!open} className="robot--fab" />
      </button>

      <section className={`bot-panel${open ? ' is-open' : ''}`} aria-hidden={!open} aria-label="ColodelBot">
        <header className="bot-head">
          <RobotAvatar mood={mood} size={46} track={open} />
          <div className="bot-head__text">
            <div className="bot-head__name">ColodelBot</div>
            <div className={`bot-head__status bot-head__status--${state}`}>
              <span className="bot-head__dot" />
              {statusText}
              {city && <span className="bot-head__city">olhando {city}</span>}
            </div>
          </div>
          <button className="bot-icon-btn" onClick={reset} title="Nova conversa" aria-label="Nova conversa">
            <Icon name="refresh" size={15} />
          </button>
          <button className="bot-icon-btn" onClick={() => setOpen(false)} title="Fechar" aria-label="Fechar">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="bot-log" ref={listRef}>
          {messages.map((turn, index) => (
            <div className={`bot-msg bot-msg--${turn.role}`} key={index}>
              {turn.role === 'bot' && <span className="bot-msg__mark"><Icon name="bot" size={13} /></span>}
              <div className="bot-msg__bubble">
                {turn.role === 'user'
                  ? <p className="md-p">{turn.text}</p>
                  : <Markdown text={turn.text} />}
                {turn.pending && !turn.text && (
                  <span className="bot-typing" aria-label="Escrevendo">
                    <i /><i /><i />
                  </span>
                )}
                {turn.pending && turn.text && <span className="bot-caret" aria-hidden="true" />}
              </div>
            </div>
          ))}

          {error && (
            <div className="bot-error">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}
        </div>

        {messages.length <= 1 && !busy && (
          <div className="bot-suggestions">
            {SUGESTOES.map((suggestion) => (
              <button key={suggestion} className="bot-chip" onClick={() => send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <form className="bot-composer" onSubmit={submit}>
          <textarea
            ref={inputRef}
            className="bot-input"
            rows={1}
            placeholder="Pergunte sobre o painel ou qualquer outra coisa"
            value={draft}
            maxLength={status?.maxMessageChars ?? 2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          {busy ? (
            <button type="button" className="bot-send bot-send--stop" onClick={stop} title="Parar">
              <Icon name="close" size={15} />
            </button>
          ) : (
            <button type="submit" className="bot-send" disabled={!draft.trim()} title="Enviar">
              <Icon name="send" size={15} />
            </button>
          )}
        </form>
      </section>
    </>
  );
}
