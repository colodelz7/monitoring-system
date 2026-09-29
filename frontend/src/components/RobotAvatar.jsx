import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const MOUTHS = {
  feliz: 'M104 116 Q120 128 136 116',
  pensando: 'M106 120 Q120 116 134 120',
  falando: 'M104 116 Q120 130 136 116',
  dormindo: 'M110 120 Q120 123 130 120',
};

/**
 * O robô do ColodelBot.
 *
 * Os olhos acompanham o ponteiro e o corpo flutua. Não é só enfeite: o estado
 * do robô é o indicador de progresso do chat. Parado significa pronto, olhos
 * estreitos e anel girando significa que a pergunta foi enviada, boca em
 * movimento significa que a resposta está chegando. Quem olha entende em que
 * ponto a conversa está sem precisar de um texto dizendo.
 */
export default function RobotAvatar({ mood = 'feliz', size = 72, track = true, className = '' }) {
  const rootRef = useRef(null);
  const eyeLeftRef = useRef(null);
  const eyeRightRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!track || reduced) return undefined;

    function onMove(event) {
      const node = rootRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
      const dy = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
      const x = Math.max(-3.5, Math.min(3.5, dx * 16));
      const y = Math.max(-3, Math.min(3, dy * 16));
      const transform = `translate(${x}px, ${y}px)`;
      if (eyeLeftRef.current) eyeLeftRef.current.style.transform = transform;
      if (eyeRightRef.current) eyeRightRef.current.style.transform = transform;
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, [track, reduced]);

  const classes = [
    'robot',
    `robot--${mood}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={classes} style={{ width: size, height: size }}>
      <span className="robot__glow" aria-hidden="true" />
      <span className="robot__ring" aria-hidden="true" />

      <svg className="robot__svg" viewBox="0 0 240 240" aria-hidden="true">
        {/* A sombra encolhe quando ele sobe, que é o que vende o voo. */}
        <ellipse className="robot__shadow" cx="120" cy="224" rx="46" ry="7" />

        <line className="robot__stem" x1="120" y1="46" x2="120" y2="20" />
        <circle className="robot__tip" cx="120" cy="14" r="7" />

        <path className="robot__body" d="M62 224 C 58 180, 74 156, 120 156 C 166 156, 182 180, 178 224 Z" />

        <circle className="robot__ear" cx="188" cy="98" r="17" />
        <circle className="robot__ear-ring" cx="188" cy="98" r="11" />
        <circle className="robot__ear" cx="52" cy="98" r="13" />

        <rect className="robot__head" x="46" y="40" width="148" height="118" rx="46" />
        <rect className="robot__face" x="68" y="64" width="104" height="72" rx="26" />

        <path className="robot__brow robot__brow--l" d="M88 84 L104 90" />
        <path className="robot__brow robot__brow--r" d="M152 84 L136 90" />

        <g ref={eyeLeftRef} className="robot__eye-wrap">
          <ellipse className="robot__eye" cx="100" cy="100" rx="10" ry="14" />
        </g>
        <g ref={eyeRightRef} className="robot__eye-wrap">
          <ellipse className="robot__eye" cx="140" cy="100" rx="10" ry="14" />
        </g>

        <path className="robot__mouth" d={MOUTHS[mood] ?? MOUTHS.feliz} />

        <text className="robot__zzz robot__zzz--1" x="176" y="50">z</text>
        <text className="robot__zzz robot__zzz--2" x="190" y="32">Z</text>
      </svg>
    </div>
  );
}
