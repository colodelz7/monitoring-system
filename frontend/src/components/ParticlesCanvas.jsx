import { useRef } from 'react';
import { useParticles } from '../hooks/useParticles';

export default function ParticlesCanvas() {
  const ref = useRef(null);
  useParticles(ref);
  return <canvas id="particles-canvas" ref={ref} />;
}
