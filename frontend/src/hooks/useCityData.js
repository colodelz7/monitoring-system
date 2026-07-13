import { useState, useEffect, useRef, useCallback } from 'react';
import { api, loadCachedData, saveCachedData } from '../lib/api';

export function useCityData(filters) {
  const { city, period, tempMin, tempMax, magThreshold, refreshSecs } = filters;

  const [data, setData] = useState(() => loadCachedData());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: 'safe', text: 'INICIALIZANDO' });
  const [countdown, setCountdown] = useState(refreshSecs);

  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.data({
        city, period,
        tempMin: String(tempMin), tempMax: String(tempMax), magThreshold: String(magThreshold),
      });
      setData(result);
      saveCachedData(result);

      const hasDanger = result.alerts.some((a) => a.type === 'danger');
      const count = result.alerts.length;
      if (hasDanger) setStatus({ type: 'danger', text: 'ALERTA CRÍTICO' });
      else if (count) setStatus({ type: 'warning', text: 'ALERTAS ATIVOS' });
      else setStatus({ type: 'safe', text: 'SISTEMA SEGURO' });
    } catch (e) {
      console.error('[MONITORING] Erro ao buscar dados:', e);
      setStatus({ type: 'danger', text: 'SEM CONEXÃO' });
    } finally {
      setLoading(false);
      resetCountdown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, period, tempMin, tempMax, magThreshold]);

  const resetCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    setCountdown(refreshSecs);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? refreshSecs : c - 1));
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSecs]);

  // refetch quando filtros relevantes mudam
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, period, tempMin, tempMax, magThreshold]);

  // auto-refresh timer
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(fetchData, refreshSecs * 1000);
    resetCountdown();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSecs, fetchData]);

  return { data, loading, status, countdown, refetch: fetchData };
}
