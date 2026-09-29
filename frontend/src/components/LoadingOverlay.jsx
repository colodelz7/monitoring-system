import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import Icon from './Icon';

const MESSAGES = [
  'INICIALIZANDO SISTEMA...',
  'CONECTANDO AO SERVIDOR...',
  'CARREGANDO APIS...',
  'PRONTO.',
];

const STEP_MS = 420;
const FADE_MS = 600;

export default function LoadingOverlay({ onDone }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  // A abertura tem duração própria e não pode depender da identidade da função
  // que o pai passa. Quem chama costuma escrever onDone={() => ...} direto no
  // JSX, o que cria uma função nova a cada render, e o painel renderiza uma vez
  // por segundo por causa do contador de atualização. Com onDone nas
  // dependências, o efeito era desmontado e remontado antes de terminar, os
  // temporizadores voltavam ao começo e a tela de abertura ficava para sempre.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Quem tira esta tela do ar é o pai, através de onDone, e só ele. A versão
  // anterior fazia as duas coisas no mesmo instante: marcava um estado interno
  // para retornar null e avisava o pai para parar de renderizar o componente.
  // As duas remoções caíam no mesmo commit, a segunda não encontrava mais o nó,
  // e um erro de commit no React derruba a raiz inteira. O sintoma era a tela
  // ficar preta poucos segundos depois de abrir, com o app já montado.
  useEffect(() => {
    // Com movimento reduzido a abertura não é um espetáculo, é um atraso: some
    // imediatamente e entrega a tela.
    if (reduced) {
      onDoneRef.current?.();
      return undefined;
    }

    const timers = [];
    MESSAGES.forEach((_, position) => {
      timers.push(setTimeout(() => setIndex(position), position * STEP_MS));
    });

    const total = MESSAGES.length * STEP_MS;
    timers.push(setTimeout(() => setFading(true), total));
    timers.push(setTimeout(() => {
      onDoneRef.current?.();
    }, total + FADE_MS));

    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  return (
    <div className={`loading-overlay${fading ? ' is-hidden' : ''}`} role="status" aria-live="polite">
      <div className="loading-logo"><Icon name="globe" size={38} strokeWidth={1.4} /></div>
      <div className="loading-title">MONITORING SYSTEM</div>
      <div className="loading-bar-wrap"><div className="loading-bar" /></div>
      <div className="loading-sub">{MESSAGES[index]}</div>
    </div>
  );
}
