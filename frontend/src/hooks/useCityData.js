import { useCallback, useEffect, useRef, useState } from 'react';
import { api, loadCachedData, saveCachedData } from '../lib/api';

const OFFLINE_STATUS = { type: 'danger', text: 'SEM CONEXÃO' };
const BOOT_STATUS = { type: 'safe', text: 'INICIALIZANDO' };

/**
 * Busca o painel e mantém o ciclo de atualização automática.
 *
 * O status, os cartões e os alertas chegam prontos do servidor; aqui só resta
 * controlar o ciclo de vida da requisição. Uma busca em andamento é cancelada
 * quando a cidade muda, para que uma resposta antiga não sobrescreva a nova.
 */
export function useCityData(filters) {
  const { city, period, tempMin, tempMax, magThreshold, seismicRadiusKm, refreshSecs } = filters;

  const [data, setData] = useState(() => loadCachedData());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(BOOT_STATUS);
  const [countdown, setCountdown] = useState(refreshSecs);

  const abortRef = useRef(null);
  const inFlightRef = useRef(false);
  const refreshRef = useRef(refreshSecs);
  refreshRef.current = refreshSecs;

  // O próximo disparo é um instante no tempo, não um contador decrescente.
  // Assim o relógio continua correto mesmo se a aba ficar suspensa e o
  // intervalo perder batidas.
  const deadlineRef = useRef(Date.now() + refreshSecs * 1000);

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;

    setLoading(true);
    try {
      const result = await api.data(
        { city, period, tempMin, tempMax, magThreshold, seismicRadiusKm },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      setData(result);
      setStatus(result.status ?? BOOT_STATUS);
      setError(null);
      saveCachedData(result);
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus(OFFLINE_STATUS);
      setError(e.message || 'Falha ao buscar dados');
    } finally {
      inFlightRef.current = false;
      if (!controller.signal.aborted) {
        setLoading(false);
        deadlineRef.current = Date.now() + refreshRef.current * 1000;
        setCountdown(refreshRef.current);
      }
    }
  }, [city, period, tempMin, tempMax, magThreshold, seismicRadiusKm]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  // Um único intervalo conduz a contagem e o disparo. O fetch acontece fora do
  // atualizador de estado, para que o modo estrito do React não o execute duas
  // vezes, e a trava de requisição em voo impede chamadas sobrepostas.
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setCountdown(remaining);

      if (remaining === 0 && !inFlightRef.current) {
        deadlineRef.current = Date.now() + refreshRef.current * 1000;
        fetchData();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [fetchData]);

  // Mexer no intervalo reprograma o próximo disparo a partir de agora.
  useEffect(() => {
    deadlineRef.current = Date.now() + refreshSecs * 1000;
    setCountdown(refreshSecs);
  }, [refreshSecs]);

  return { data, loading, error, status, countdown, refetch: fetchData };
}
