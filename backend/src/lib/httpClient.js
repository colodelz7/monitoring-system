import { config } from '../config/env.js';
import { createLogger } from './logger.js';

const log = createLogger('http');

export class UpstreamError extends Error {
  constructor(message, { status, url, cause } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status ?? 502;
    this.url = url;
    this.cause = cause;
  }
}

/**
 * Busca JSON de uma API externa usando o fetch nativo do Node.
 * Aplica timeout, teto de tamanho de resposta e validacao de content-type,
 * para que um upstream lento ou hostil nao derrube o processo.
 */
export async function fetchJSON(url, { timeoutMs, maxBytes, label = 'upstream' } = {}) {
  const limitMs = timeoutMs ?? config.upstream.timeoutMs;
  const limitBytes = maxBytes ?? config.upstream.maxBytes;
  const started = Date.now();

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(limitMs),
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'user-agent': 'monitoring-system/2.0 (+https://github.com/)',
      },
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new UpstreamError(
      timedOut ? `${label}: tempo esgotado apos ${limitMs}ms` : `${label}: falha de rede`,
      { status: timedOut ? 504 : 502, url, cause: error },
    );
  }

  const declared = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(declared) && declared > limitBytes) {
    throw new UpstreamError(`${label}: resposta maior que o limite de ${limitBytes} bytes`, {
      status: 502,
      url,
    });
  }

  const raw = await readCapped(response, limitBytes, label, url);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UpstreamError(`${label}: resposta nao e JSON valido`, { status: 502, url, cause: error });
  }

  log.debug(`${label} ${response.status} em ${Date.now() - started}ms`);

  if (!response.ok) {
    const detail = parsed?.message || response.statusText;
    throw new UpstreamError(`${label}: HTTP ${response.status} ${detail}`, {
      status: response.status >= 500 ? 502 : response.status,
      url,
    });
  }

  return parsed;
}

async function readCapped(response, limitBytes, label, url) {
  if (!response.body) return response.text();

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limitBytes) {
        await reader.cancel();
        throw new UpstreamError(`${label}: resposta excedeu ${limitBytes} bytes`, { status: 502, url });
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock?.();
  }

  return text + decoder.decode();
}
