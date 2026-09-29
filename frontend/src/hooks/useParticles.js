import { useEffect } from 'react';

const PARTICLE_COUNT = 90;
const LINK_DISTANCE = 100;

/**
 * Campo de partículas do fundo.
 *
 * Respeita prefers-reduced-motion desenhando um único quadro estático, e pausa
 * quando a aba sai de foco, para não consumir CPU em segundo plano.
 */
export function useParticles(canvasRef, { reduced = false } = {}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let particles = [];
    let frame = 0;
    let running = true;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }

    function spawn() {
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.2 + 0.3,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        a: Math.random(),
        va: (Math.random() - 0.5) * 0.005,
      };
    }

    function step() {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        if (p.a > 1 || p.a < 0) p.va *= -1;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
    }

    function paint() {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,229,255,${p.a * 0.4})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.hypot(dx, dy);
          if (distance >= LINK_DISTANCE) continue;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(0,229,255,${(1 - distance / LINK_DISTANCE) * 0.08})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    function loop() {
      if (!running) return;
      step();
      paint();
      frame = requestAnimationFrame(loop);
    }

    function onResize() {
      resize();
      for (const p of particles) {
        p.x = Math.min(p.x, width);
        p.y = Math.min(p.y, height);
      }
      if (reduced) paint();
    }

    function onVisibility() {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        loop();
      }
    }

    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, spawn);

    if (reduced) paint();
    else loop();

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frame);
    };
  }, [canvasRef, reduced]);
}
