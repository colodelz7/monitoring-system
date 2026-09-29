import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

const DURATION_MS = 620;

// Desaceleração no fim: o número corre rápido e assenta no valor, o que faz a
// leitura terminar no lugar certo em vez de parecer que ainda está mudando.
function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Interpola um número até o valor alvo com requestAnimationFrame.
 *
 * Anima a partir do valor anterior, não de zero, para que um refresh que muda
 * 24.1°C para 24.3°C seja um ajuste sutil e não uma contagem inteira. Com
 * prefers-reduced-motion o valor é aplicado direto.
 */
export function useCountUp(target, { decimals = 0, duration = DURATION_MS } = {}) {
  const reduced = useReducedMotion();
  const numeric = Number.isFinite(target) ? target : null;
  const [value, setValue] = useState(numeric);
  const fromRef = useRef(numeric);
  const frameRef = useRef(0);

  useEffect(() => {
    if (numeric == null) {
      setValue(null);
      fromRef.current = null;
      return undefined;
    }

    const from = fromRef.current;

    if (reduced || from == null || from === numeric) {
      fromRef.current = numeric;
      setValue(numeric);
      return undefined;
    }

    const started = performance.now();
    const delta = numeric - from;

    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const current = from + delta * easeOutCubic(progress);
      setValue(Number(current.toFixed(decimals)));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = numeric;
        setValue(numeric);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [numeric, decimals, duration, reduced]);

  return value;
}
