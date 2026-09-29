import { useState, useEffect } from 'react';
import { api, WORLD_CLOCK_FALLBACK } from '../lib/api';

export function useWorldClock() {
  const [cities, setCities] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    api.worldClock()
      .then((r) => { if (mounted) setCities(r); })
      .catch(() => { if (mounted) setCities(WORLD_CLOCK_FALLBACK); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const clocks = cities.map((c) => {
    const d = new Date(now + c.offset * 3600000);
    return {
      name: c.name,
      time: d.toTimeString().slice(0, 8),
      date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    };
  });

  return clocks;
}
