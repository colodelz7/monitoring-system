import path from 'node:path';
import express, { Router } from 'express';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { asyncRoute, requireAdmin } from '../middleware/errorHandler.js';
import { assistantLimiter, historyLimiter, searchLimiter, upstreamLimiter, writeLimiter } from '../middleware/rateLimit.js';
import {
  parseIsoDate,
  parsePositiveInt,
  resolveThresholds,
  sanitizeCity,
  sanitizePeriod,
  sanitizeQuery,
} from '../domain/validation.js';
import { WORLD_CLOCK_CITIES } from '../domain/constants.js';
import { METRICAS, SIMBOLO_OPERADOR } from '../domain/metrics.js';
import { DIRECOES, LIMITES_REGRA, SEVERIDADES, TIPOS_REGRA } from '../domain/rules.js';
import { dashboardCacheStats, getDashboard, invalidateDashboardCache, offlineSnapshot } from '../services/dashboard.service.js';
import { compareCities, MAX_CIDADES } from '../services/compare.service.js';
import { assistantStatus, buildContext, streamAnswer } from '../services/assistant.service.js';
import { searchCities, geocodeCacheStats } from '../services/geocode.service.js';
import { alertStore } from '../services/alertStore.js';
import { daily as dailyReadings, readingStats, series as readingSeries } from '../services/readingStore.js';
import { emailConfigured } from '../services/email.service.js';
import {
  atualizar as atualizarRegra,
  criar as criarRegra,
  listar as listarRegras,
  remover as removerRegra,
  rulesStats,
} from '../services/rulesStore.js';
import { extendedForecastCacheStats } from '../services/extendedForecast.service.js';
import { getWeather, weatherCacheStats } from '../services/weather.service.js';
import { seismicCacheStats } from '../services/seismic.service.js';
import { airQualityCacheStats } from '../services/airQuality.service.js';

export const router = Router();

const log = createLogger('rotas');

// ─── Painel principal ───────────────────────────────────────────────────────
router.get(
  '/data',
  upstreamLimiter,
  asyncRoute(async (req, res) => {
    const city = sanitizeCity(req.query.city);
    const period = sanitizePeriod(req.query.period);
    const thresholds = resolveThresholds(req.query);

    const payload = await getDashboard({ city, period, thresholds });
    res.json(payload);
  }),
);

// ─── Comparativo entre duas cidades ─────────────────────────────────────────
router.get(
  '/compare',
  upstreamLimiter,
  asyncRoute(async (req, res) => {
    const cities = String(req.query.cities || '')
      .split(',')
      .map((item) => sanitizeCity(item, ''))
      .filter(Boolean)
      // Nomes repetidos viram um só: comparar Curitiba com Curitiba não
      // responde nada e ainda gastaria uma chamada à API paga.
      .filter((cidade, i, todas) => todas.indexOf(cidade) === i)
      .slice(0, MAX_CIDADES);

    if (cities.length < 2) {
      return res.status(400).json({ error: `Informe de 2 a ${MAX_CIDADES} cidades diferentes, separadas por vírgula.` });
    }

    res.json(await compareCities(cities));
  }),
);

// ─── Cidades acompanhadas ───────────────────────────────────────────────────

/**
 * Leitura curta de várias cidades de uma vez.
 *
 * O painel mostra uma cidade por vez, e trocar para conferir as outras é a
 * pergunta "e as minhas?" respondida do jeito mais lento possível. Aqui vem só
 * o que cabe em uma linha por cidade, e o custo continua controlado: cada
 * cidade passa pelo mesmo cache do clima que o painel usa, então acompanhar as
 * mesmas seis cidades de duas abas não dobra a chamada à API paga.
 *
 * A lista de quem é acompanhado vive no navegador, não aqui. Esta rota não
 * guarda nada: ela responde sobre as cidades que vierem na pergunta.
 */
router.get(
  '/watchlist',
  upstreamLimiter,
  asyncRoute(async (req, res) => {
    const cidades = String(req.query.cities || '')
      .split(',')
      .map((item) => sanitizeCity(item, ''))
      .filter(Boolean)
      .filter((cidade, i, todas) => todas.indexOf(cidade) === i)
      .slice(0, MAX_ACOMPANHADAS);

    if (!cidades.length) return res.json({ cidades: [], limite: MAX_ACOMPANHADAS });

    const thresholds = resolveThresholds(req.query);

    // Em paralelo, porque são chamadas independentes e a maior parte do tempo
    // é espera de rede. Uma cidade que falhar não derruba as outras.
    const leituras = await Promise.all(cidades.map((cidade) => leituraCurta(cidade, thresholds)));

    res.json({ cidades: leituras, limite: MAX_ACOMPANHADAS, thresholds });
  }),
);

/** Quantas cidades cabem na lista. Teto do servidor, não sugestão da tela. */
const MAX_ACOMPANHADAS = 6;

async function leituraCurta(cidade, thresholds) {
  try {
    const weather = await getWeather(cidade);
    if (!weather.success) return { cidade, disponivel: false };

    const temp = weather.temp;
    const situacao = temp >= thresholds.tempMax
      ? 'quente'
      : temp <= thresholds.tempMin
        ? 'frio'
        : 'normal';

    return {
      cidade,
      disponivel: true,
      simulado: Boolean(weather.mock),
      nome: weather.resolvedName || cidade,
      temp,
      minima: weather.temp_min,
      maxima: weather.temp_max,
      umidade: weather.humidity,
      vento: weather.wind_speed,
      ceu: weather.description,
      icone: weather.icon,
      situacao,
    };
  } catch (error) {
    log.warn(`cidade acompanhada ${cidade} indisponível: ${error.message}`);
    return { cidade, disponivel: false };
  }
}

// ─── Regras de alerta ───────────────────────────────────────────────────────

/**
 * Regras criadas por quem usa o painel.
 *
 * A listagem vai junto com o catálogo de métricas e os limites do formato, para
 * que a interface monte o formulário a partir do que o servidor aceita de
 * verdade, em vez de manter a própria cópia da lista e sair de sincronia na
 * primeira métrica nova.
 */
router.get(
  '/rules',
  asyncRoute(async (_req, res) => {
    res.json({
      regras: await listarRegras(),
      limites: LIMITES_REGRA,
      metricas: Object.entries(METRICAS).map(([chave, spec]) => ({
        chave,
        label: spec.label,
        unidade: spec.unidade,
        min: spec.min,
        max: spec.max,
        decimais: spec.decimais,
      })),
      operadores: Object.entries(SIMBOLO_OPERADOR).map(([valor, label]) => ({ valor, label })),
      tipos: TIPOS_REGRA,
      direcoes: DIRECOES,
      severidades: SEVERIDADES,
    });
  }),
);

router.post(
  '/rules',
  writeLimiter,
  asyncRoute(async (req, res) => {
    const regra = await criarRegra(req.body ?? {});
    // O painel guarda o payload montado, e ele inclui os alertas das regras.
    // Sem descartar, a regra nova so passaria a valer no fim do TTL, e quem
    // acabou de criá-la concluiria que nao funcionou.
    invalidateDashboardCache();
    log.info(`nova regra: ${regra.nome}`);
    res.status(201).json(regra);
  }),
);

router.patch(
  '/rules/:id',
  writeLimiter,
  asyncRoute(async (req, res) => {
    const regra = await atualizarRegra(String(req.params.id), req.body ?? {});
    if (!regra) return res.status(404).json({ error: 'Regra não encontrada.' });
    invalidateDashboardCache();
    res.json(regra);
  }),
);

router.delete(
  '/rules/:id',
  writeLimiter,
  asyncRoute(async (req, res) => {
    const removida = await removerRegra(String(req.params.id));
    if (!removida) return res.status(404).json({ error: 'Regra não encontrada.' });
    invalidateDashboardCache();
    res.json({ ok: true });
  }),
);

// ─── Autocomplete de cidades ────────────────────────────────────────────────
router.get(
  '/geocode',
  searchLimiter,
  asyncRoute(async (req, res) => {
    const query = sanitizeQuery(req.query.q);
    if (query.length < 2) return res.json([]);
    res.json(await searchCities(query));
  }),
);

// ─── Histórico de alertas ───────────────────────────────────────────────────
router.get(
  '/alerts-log',
  historyLimiter,
  asyncRoute(async (req, res) => {
    const filters = {
      sensor: ['clima', 'sismo'].includes(req.query.sensor) ? req.query.sensor : null,
      severity: ['danger', 'warning'].includes(req.query.severity) ? req.query.severity : null,
      city: sanitizeQuery(req.query.city) || null,
      search: sanitizeQuery(req.query.search, { maxLength: 120 }) || null,
      from: parseIsoDate(req.query.from),
      to: parseIsoDate(req.query.to),
      page: parsePositiveInt(req.query.page, 1),
      pageSize: parsePositiveInt(req.query.pageSize, 50, 200),
    };

    const [result, facets] = await Promise.all([alertStore.query(filters), alertStore.facets()]);
    res.json({ ...result, facets });
  }),
);

router.get(
  '/alerts-log/:id',
  asyncRoute(async (req, res) => {
    const entry = await alertStore.findById(String(req.params.id));
    if (!entry) return res.status(404).json({ error: 'Alerta não encontrado no histórico.' });
    res.json(entry);
  }),
);

// Em producao o token ja barra quem nao deveria estar aqui. A confirmacao
// explicita resolve outro problema: em desenvolvimento nao existe token, e um
// DELETE disparado de passagem, por um script de teste ou por uma varredura de
// rotas, apagava o historico inteiro sem pedir nada. Agora precisa de intencao.
const CLEAR_CONFIRMATION = 'apagar-historico';

router.delete(
  '/alerts-log',
  writeLimiter,
  requireAdmin,
  asyncRoute(async (req, res) => {
    const confirm = req.get('x-confirm-clear') || req.query.confirm;
    if (confirm !== CLEAR_CONFIRMATION) {
      return res.status(428).json({
        error: 'Confirmação obrigatória para limpar o histórico.',
        hint: `Repita a chamada com o cabeçalho x-confirm-clear: ${CLEAR_CONFIRMATION}`,
      });
    }

    const { removed, snapshot } = await alertStore.clear();
    res.json({
      ok: true,
      removed,
      // O caminho da copia fica no servidor. Expor so o nome evita revelar a
      // arvore de diretorios de quem hospeda.
      snapshot: snapshot ? path.basename(snapshot) : null,
    });
  }),
);

// ─── Relógio mundial ────────────────────────────────────────────────────────
router.get('/world-clock', (_req, res) => {
  const now = Date.now();
  res.json(
    WORLD_CLOCK_CITIES.map((city) => {
      const shifted = new Date(now + city.offset * 3600000);
      return {
        name: city.name,
        offset: city.offset,
        time: shifted.toISOString().slice(11, 19),
        date: shifted.toISOString().slice(0, 10),
      };
    }),
  );
});

// ─── Série histórica própria ────────────────────────────────────────────────

/**
 * Leituras que o próprio sistema acumulou.
 *
 * A previsão da OpenWeatherMap só olha 48 horas para frente e o passado é
 * serviço pago. Como cada ciclo do painel já busca a leitura atual, gravá-la
 * dá histórico de graça. É daqui que saem as janelas maiores que dois dias.
 */
router.get(
  '/history/readings',
  historyLimiter,
  asyncRoute(async (req, res) => {
    const city = sanitizeCity(req.query.city);
    const days = parsePositiveInt(req.query.days, 7, 365);

    // Abaixo de três dias o agregado diário esconde a variação do dia, então
    // a resposta traz a série bruta. Acima disso seriam milhares de pontos e
    // nenhum gráfico ganha nada com isso.
    const detalhado = days <= 3;

    if (detalhado) {
      const from = new Date(Date.now() - days * 86400000);
      const pontos = await readingSeries(city, { from });
      return res.json({ city, days, resolucao: 'leitura', pontos });
    }

    const pontos = await dailyReadings(city, { days });
    return res.json({ city, days, resolucao: 'dia', pontos });
  }),
);

/** Quantos alertas por dia, para a leitura de "estou avisando demais?". */
router.get(
  '/history/alerts-daily',
  historyLimiter,
  asyncRoute(async (req, res) => {
    const days = parsePositiveInt(req.query.days, 30, 365);
    res.json({ days, pontos: await alertStore.daily({ days }) });
  }),
);

// ─── Metadados e diagnóstico ────────────────────────────────────────────────
router.get('/config', (_req, res) => {
  res.json({
    // A chave nao vai mais como campo proprio. Ela continua embutida na URL
    // do estilo, que e inevitavel enquanto os tiles forem buscados pelo
    // navegador, mas mandar tambem um campo solto que ninguem le era
    // exposicao de graca.
    // Um estilo por tema. Mapa escuro dentro de uma página clara vira um
    // buraco no meio da tela, então trocar de tema troca o mapa junto.
    mapStyles: config.keys.stadia
      ? {
        dark: `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${config.keys.stadia}`,
        light: `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${config.keys.stadia}`,
      }
      : null,
    // Mantido para não quebrar quem já lia este campo.
    mapStyleUrl: config.keys.stadia
      ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${config.keys.stadia}`
      : null,
    demoMode: !config.keys.owm,
    emailAlerts: emailConfigured(),
    refresh: { minSeconds: 10, maxSeconds: 300, defaultSeconds: 30 },
  });
});

router.get('/cache-status', (_req, res) => {
  res.json(offlineSnapshot());
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()) });
});

router.get(
  '/stats',
  asyncRoute(async (_req, res) => {
    res.json({
      alerts: await alertStore.size(),
      readings: await readingStats(),
      rules: await rulesStats(),
      cache: {
        ...weatherCacheStats(),
        weekly: extendedForecastCacheStats(),
        seismic: seismicCacheStats(),
        airQuality: airQualityCacheStats(),
        geocode: geocodeCacheStats(),
        ...dashboardCacheStats(),
      },
    });
  }),
);

// ─── Assistente ─────────────────────────────────────────────────────────────

router.get('/assistant/status', (_req, res) => {
  res.json(assistantStatus());
});

/**
 * Conversa com o assistente, transmitindo a resposta em SSE.
 *
 * O contexto do sistema é montado aqui, no servidor, a partir dos mesmos
 * serviços que alimentam o painel. O cliente manda a pergunta e o que está
 * vendo na tela, nunca os dados em si: assim ele não tem como convencer o
 * assistente de uma leitura que não aconteceu.
 */
router.post(
  '/assistant/chat',
  assistantLimiter,
  express.json({ limit: '96kb' }),
  asyncRoute(async (req, res) => {
    const status = assistantStatus();
    if (!status.enabled) {
      return res.status(503).json({ error: 'Assistente indisponível: o servidor não tem GEMINI_API_KEY configurada.' });
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'Envie uma mensagem.' });
    }
    if (message.length > status.maxMessageChars) {
      return res.status(413).json({ error: `Mensagem muito longa. Máximo de ${status.maxMessageChars} caracteres.` });
    }

    const history = Array.isArray(req.body?.history)
      ? req.body.history
          .slice(-config.assistant.maxHistory)
          .filter((turn) => turn && typeof turn.text === 'string')
          .map((turn) => ({ role: turn.role === 'bot' ? 'bot' : 'user', text: turn.text.slice(0, status.maxMessageChars) }))
      : [];

    const city = sanitizeCity(req.body?.city);
    const period = sanitizePeriod(req.body?.period);
    const thresholds = resolveThresholds(req.body ?? {});

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // O nginx enfileira resposta por padrão, o que anularia o streaming.
      'X-Accel-Buffering': 'no',
    });

    const emit = (type, payload) => res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);

    // Se quem perguntou fechou o painel, não faz sentido seguir gastando cota.
    //
    // O evento tem que ser o da resposta, não o do pedido: num POST, o stream
    // do pedido termina assim que o corpo acaba de ser lido, e req.on('close')
    // disparava antes mesmo de o modelo começar a responder. A checagem de
    // writableEnded separa o cliente indo embora do fim normal da resposta.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    try {
      const context = await buildContext({ city, period, thresholds });
      emit('start', { model: status.model });

      const full = await streamAnswer({
        message,
        history,
        context,
        signal: abort.signal,
        onDelta: (chunk) => emit('delta', { chunk }),
        onAction: (acao) => emit('action', acao),
      });

      emit('end', { text: full });
    } catch (error) {
      if (!abort.signal.aborted) {
        log.error(`assistente falhou: ${error.message}`);
        // Falta de chave e estouro de cota são situações que a pessoa pode
        // resolver, então a mensagem real passa. O resto vira texto genérico
        // para não vazar detalhe interno do upstream.
        const explicavel = error.code === 'SEM_CHAVE' || error.code === 'COTA';
        emit('error', { message: explicavel ? error.message : 'O assistente não conseguiu responder agora. Tente de novo em instantes.' });
      }
    } finally {
      res.end();
    }
  }),
);
