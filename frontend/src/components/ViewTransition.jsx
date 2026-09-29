import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const FADE_OUT_MS = 140;

/**
 * Troca de conteúdo em dois tempos: o que estava na tela sai, o novo entra.
 * Sem isso a mudança de aba ou de cidade é um corte seco e o olho perde a
 * referência de onde estava.
 *
 * O ponto delicado é quando a vista nova pode montar. A versão anterior
 * guardava a vista antiga dentro de um efeito, ou seja, já tinha renderizado a
 * nova uma vez antes de decidir segurá-la. Com uma aba carregada por lazy isso
 * virava montar, suspender, desmontar e montar de novo em 140ms, e a troca de
 * árvore com o Suspense no meio deixava o React e o DOM em desacordo.
 *
 * Aqui a vista exibida é estado. Enquanto a chave nova não vence o tempo de
 * saída, o que vai para a tela continua sendo a árvore antiga, e a nova monta
 * uma vez só, no fim. Enquanto a chave não muda os filhos vivos passam direto,
 * para que uma atualização de dados na mesma vista apareça na hora.
 */
export default function ViewTransition({ transitionKey, children, className = '' }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(() => ({ key: transitionKey, children }));
  const [phase, setPhase] = useState('in');

  // Atualizado depois da renderização, nunca durante: o timeout abaixo só lê
  // isto 140ms adiante, quando o efeito certamente já rodou.
  const latestChildren = useRef(children);

  const changing = transitionKey !== shown.key;

  useEffect(() => {
    if (!changing) return undefined;

    if (reduced) {
      setShown({ key: transitionKey, children: latestChildren.current });
      setPhase('in');
      return undefined;
    }

    setPhase('out');
    const timer = setTimeout(() => {
      setShown({ key: transitionKey, children: latestChildren.current });
      setPhase('in');
    }, FADE_OUT_MS);

    return () => clearTimeout(timer);
  }, [changing, transitionKey, reduced]);

  useEffect(() => {
    latestChildren.current = children;
  });

  return (
    <div className={`view-transition view-transition--${phase} ${className}`.trim()}>
      {changing ? shown.children : children}
    </div>
  );
}
