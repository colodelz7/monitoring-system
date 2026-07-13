import { useState, useCallback, useRef } from 'react';

export function usePushNotifications() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [, setPermission] = useState(supported ? Notification.permission : 'unsupported');
  const [enabled, setEnabled] = useState(supported && Notification.permission === 'granted');
  const debounceRef = useRef(new Map());

  const toggle = useCallback(async () => {
    if (!supported) return;
    if (Notification.permission === 'granted') {
      setEnabled((e) => !e);
    } else {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm === 'granted') {
        setEnabled(true);
        new Notification('MONITORING SYSTEM', { body: 'Notificações de alerta ativadas!' });
      }
    }
  }, [supported]);

  const notify = useCallback((alerts) => {
    if (!supported || !enabled || Notification.permission !== 'granted') return;
    alerts.forEach((a) => {
      const key = `${a.sensor}:${a.message}`;
      const last = debounceRef.current.get(key) || 0;
      if (Date.now() - last < 10 * 60 * 1000) return;
      debounceRef.current.set(key, Date.now());
      new Notification(`⚠ Alerta ${a.type === 'danger' ? 'Crítico' : 'de Atenção'}`, { body: a.message });
    });
  }, [supported, enabled]);

  return { supported, enabled, toggle, notify };
}
