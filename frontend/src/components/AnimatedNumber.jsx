import { useCountUp } from '../hooks/useCountUp';

/**
 * Número que interpola até o valor novo.
 *
 * `tabular-nums` no CSS mantém a largura de cada dígito constante, então o
 * contador anima sem empurrar o texto ao lado enquanto os dígitos trocam.
 */
export default function AnimatedNumber({ value, decimals = 0, suffix = '', placeholder = '--', className = '', style }) {
  const animated = useCountUp(value, { decimals });

  if (animated == null) {
    return <span className={className} style={style}>{placeholder}</span>;
  }

  return (
    <span className={`tabular ${className}`} style={style}>
      {animated.toFixed(decimals)}
      {suffix}
    </span>
  );
}
