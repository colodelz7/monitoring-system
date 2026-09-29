import { useRef } from 'react';
import { useParticles } from '../hooks/useParticles';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function ParticlesCanvas() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  useParticles(ref, { reduced });
  return <canvas id="particles-canvas" ref={ref} aria-hidden="true" />;
}
