import { useCallback, useMemo, useRef, useState } from 'react';

const DEBOUNCE_MS = 10 * 60 * 1000;

export function usePushNotifications() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [enabled, setEnabled] = useState(() => supported && Notification.permission === 'granted');
  const lastSentRef = useRef(new Map());

  const toggle = useCallback(async () => {
    if (!supported) return;

    if (Notification.permission === 'granted') {
      setEnabled((current) => !current);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setEnabled(true);
      new Notification('MONITORING SYSTEM', { body: 'Notificações de alerta ativadas.' });
    }
  }, [supported]);

  const notify = useCallback((alerts) => {
    if (!supported || !enabled || Notification.permission !== 'granted') return;

    for (const alert of alerts) {
      // A impressão digital calculada no servidor já identifica a condição, então
      // uma condição que persiste entre ciclos não vira notificação repetida.
      const key = alert.fingerprint || `${alert.sensor}:${alert.message}`;
      const last = lastSentRef.current.get(key) ?? 0;
      if (Date.now() - last < DEBOUNCE_MS) continue;
      lastSentRef.current.set(key, Date.now());

      new Notification(`Alerta ${alert.severityLabel ?? ''}`.trim(), { body: alert.message });
    }
  }, [supported, enabled]);

  // Identidade estável: o objeto entra em listas de dependências no App.
  return useMemo(() => ({ supported, enabled, toggle, notify }), [supported, enabled, toggle, notify]);
}
