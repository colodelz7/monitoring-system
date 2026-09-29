import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { METRIC_LABELS, SENSOR_LABELS, SEVERITY_LABELS } from '../domain/constants.js';
import { normalizeText } from '../domain/validation.js';

const log = createLogger('alert-store');

const LOG_FILE = path.join(config.storage.dataDir, 'alerts.ndjson');
const LEGACY_FILE = path.join(config.storage.dataDir, '..', 'alerts_log.json');

// Quantas copias de seguranca de limpeza sao mantidas no diretorio de dados.
const SNAPSHOT_KEEP = 5;

/**
 * Historico de alertas em NDJSON append-only.
 *
 * Uma linha por alerta significa gravacao em uma unica chamada de append, sem
 * reescrever o arquivo inteiro a cada evento e sem janela para corromper o
 * conteudo em escritas concorrentes. Uma linha truncada por queda de energia e
 * simplesmente descartada na leitura, o resto do historico sobrevive.
 *
 * O arquivo vive em DATA_DIR, fora da arvore de codigo, e e montado como volume
 * no Docker. O estado do sistema deixa de depender do .gitignore para nao
 * entrar no repositorio.
 */
class AlertStore {
  #entries = [];
  #fingerprints = new Map();
  #ready = null;
  #writeQueue = Promise.resolve();

  async init() {
    if (!this.#ready) this.#ready = this.#load();
    return this.#ready;
  }

  async #load() {
    await fsp.mkdir(config.storage.dataDir, { recursive: true });

    if (!fs.existsSync(LOG_FILE)) {
      const migrated = await this.#migrateLegacy();
      if (migrated === 0) await fsp.writeFile(LOG_FILE, '', 'utf8');
    }

    const raw = await fsp.readFile(LOG_FILE, 'utf8').catch(() => '');
    const parsed = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        parsed.push(normalizeEntry(JSON.parse(trimmed)));
      } catch {
        // Linha truncada ou corrompida: descartada sem derrubar o resto.
      }
    }

    this.#entries = parsed.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    this.#rebuildFingerprints();
    log.info(`${this.#entries.length} alertas carregados de ${LOG_FILE}`);
  }

  /**
   * Migra o alerts_log.json antigo uma unica vez, deduplicando pelo caminho.
   * O arquivo legado guardava o mesmo sismo repetido a cada ciclo de polling,
   * entao a migracao e tambem uma limpeza.
   */
  async #migrateLegacy() {
    if (!fs.existsSync(LEGACY_FILE)) return 0;

    try {
      const legacy = JSON.parse(await fsp.readFile(LEGACY_FILE, 'utf8'));
      if (!Array.isArray(legacy) || legacy.length === 0) return 0;

      const seen = new Set();
      const lines = [];

      for (const item of legacy) {
        const entry = normalizeEntry(item);
        if (seen.has(entry.fingerprint)) continue;
        seen.add(entry.fingerprint);
        lines.push(JSON.stringify(entry));
      }

      await fsp.writeFile(LOG_FILE, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
      await fsp.rename(LEGACY_FILE, `${LEGACY_FILE}.migrado`).catch(() => {});
      log.info(`migrados ${lines.length} alertas de ${legacy.length} registros legados`);
      return lines.length;
    } catch (error) {
      log.warn(`migracao do log legado falhou: ${error.message}`);
      return 0;
    }
  }

  #rebuildFingerprints() {
    this.#fingerprints.clear();
    for (const entry of this.#entries) {
      const previous = this.#fingerprints.get(entry.fingerprint);
      const stamp = Date.parse(entry.loggedAt);
      if (!previous || stamp > previous) this.#fingerprints.set(entry.fingerprint, stamp);
    }
  }

  /**
   * Grava apenas alertas que ainda nao foram vistos dentro da janela de
   * deduplicacao. Sem isso, um painel com refresh de 30s escreve o mesmo sismo
   * 120 vezes por hora, que e exatamente o que o log antigo continha.
   */
  async append(alerts) {
    if (!alerts.length) return [];
    await this.init();

    const now = Date.now();
    const accepted = [];

    for (const alert of alerts) {
      const lastSeen = this.#fingerprints.get(alert.fingerprint) ?? 0;
      if (now - lastSeen < config.storage.dedupeWindowMs) continue;
      this.#fingerprints.set(alert.fingerprint, now);
      accepted.push(normalizeEntry({ ...alert, loggedAt: new Date(now).toISOString() }));
    }

    if (!accepted.length) return [];

    this.#entries = [...accepted, ...this.#entries].slice(0, config.storage.maxAlerts);

    const payload = `${accepted.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
    this.#writeQueue = this.#writeQueue
      .then(() => fsp.appendFile(LOG_FILE, payload, 'utf8'))
      .then(() => this.#compactIfNeeded())
      .catch((error) => log.error(`falha ao gravar historico: ${error.message}`));

    await this.#writeQueue;
    return accepted;
  }

  /**
   * Reescreve o arquivo quando ele passa do teto configurado, mantendo apenas
   * os registros mais recentes. A troca e atomica via arquivo temporario.
   */
  async #compactIfNeeded() {
    const stat = await fsp.stat(LOG_FILE).catch(() => null);
    if (!stat) return;

    const lineBudget = config.storage.maxAlerts;
    if (this.#entries.length < lineBudget) return;

    const temp = `${LOG_FILE}.${randomUUID()}.tmp`;
    const kept = this.#entries.slice(0, lineBudget);
    const body = kept.map((entry) => JSON.stringify(entry)).reverse().join('\n');
    await fsp.writeFile(temp, body ? `${body}\n` : '', 'utf8');
    await fsp.rename(temp, LOG_FILE);
    this.#entries = kept;
    this.#rebuildFingerprints();
    log.info(`historico compactado para ${kept.length} registros`);
  }

  async query(filters = {}) {
    await this.init();
    const { sensor, city, severity, search, from, to, page = 1, pageSize = 50 } = filters;

    const term = search ? normalizeText(search) : '';
    const fromStamp = from ? from.getTime() : null;
    const toStamp = to ? to.getTime() : null;

    const matched = this.#entries.filter((entry) => {
      if (sensor && entry.sensor !== sensor) return false;
      if (severity && entry.severity !== severity) return false;
      if (city && normalizeText(entry.city) !== normalizeText(city)) return false;

      const stamp = Date.parse(entry.loggedAt);
      if (fromStamp != null && stamp < fromStamp) return false;
      if (toStamp != null && stamp > toStamp) return false;

      if (term && !entry.searchBlob.includes(term)) return false;
      return true;
    });

    const start = (page - 1) * pageSize;

    return {
      items: matched.slice(start, start + pageSize),
      total: matched.length,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(matched.length / pageSize)),
      stats: summarize(matched),
    };
  }

  /**
   * Valores distintos presentes no historico, para popular os seletores de
   * filtro sem que o frontend precise varrer a lista inteira.
   */
  async facets() {
    await this.init();
    const cities = new Map();
    const sensors = new Map();
    const severities = new Map();

    for (const entry of this.#entries) {
      if (entry.city) cities.set(entry.city, (cities.get(entry.city) ?? 0) + 1);
      sensors.set(entry.sensor, (sensors.get(entry.sensor) ?? 0) + 1);
      severities.set(entry.severity, (severities.get(entry.severity) ?? 0) + 1);
    }

    const toList = (map, labels) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, label: labels?.[value] || value, count }));

    const timestamps = this.#entries.map((entry) => Date.parse(entry.loggedAt)).filter(Number.isFinite);

    return {
      cities: toList(cities),
      sensors: toList(sensors, SENSOR_LABELS),
      severities: toList(severities, SEVERITY_LABELS),
      total: this.#entries.length,
      oldest: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
      newest: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
    };
  }

  /**
   * Quantos alertas dispararam em cada dia, separados por gravidade.
   *
   * Responde a pergunta que faz alguem mexer nos limites: se o painel avisa
   * demais, ninguem mais olha o aviso. Dias sem nenhum alerta entram com zero
   * em vez de sumirem, senao o grafico encurta a linha do tempo e um periodo
   * calmo fica parecido com um periodo sem medicao.
   */
  async daily({ days = 30 } = {}) {
    await this.init();

    const fim = new Date();
    fim.setUTCHours(0, 0, 0, 0);
    const inicio = new Date(fim.getTime() - (days - 1) * 86400000);

    const porDia = new Map();
    for (let t = inicio.getTime(); t <= fim.getTime(); t += 86400000) {
      const dia = new Date(t).toISOString().slice(0, 10);
      porDia.set(dia, { dia, total: 0, danger: 0, warning: 0, clima: 0, sismo: 0, regra: 0, anomalia: 0 });
    }

    for (const entry of this.#entries) {
      const quando = entry.at || entry.loggedAt;
      if (!quando) continue;
      const alvoDia = porDia.get(String(quando).slice(0, 10));
      if (!alvoDia) continue;

      alvoDia.total += 1;
      if (entry.severity === 'danger') alvoDia.danger += 1;
      else alvoDia.warning += 1;
      // Cada sensor conta na propria coluna. Antes, tudo que nao era sismo
      // virava clima, e uma regra criada por quem usa apareceria no grafico
      // como se fosse um limite embutido.
      if (Object.hasOwn(alvoDia, entry.sensor)) alvoDia[entry.sensor] += 1;
      else alvoDia.clima += 1;
    }

    return [...porDia.values()];
  }

  async findById(id) {
    await this.init();
    return this.#entries.find((entry) => entry.id === id) ?? null;
  }

  /**
   * Limpar e a unica operacao que destroi dado, entao ela nunca apaga sem antes
   * guardar uma copia ao lado. O historico volta com um rename, sem depender de
   * backup externo nem de ter feito um antes por precaucao.
   */
  async clear() {
    await this.init();

    let snapshot = null;
    if (this.#entries.length > 0) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      snapshot = path.join(config.storage.dataDir, `alerts-${stamp}.snapshot.ndjson`);
      await fsp.copyFile(LOG_FILE, snapshot).catch((error) => {
        log.error(`falha ao salvar copia antes de limpar: ${error.message}`);
        snapshot = null;
      });
    }

    this.#writeQueue = this.#writeQueue
      .then(() => fsp.writeFile(LOG_FILE, '', 'utf8'))
      .catch((error) => log.error(`falha ao limpar historico: ${error.message}`));
    await this.#writeQueue;

    const removed = this.#entries.length;
    this.#entries = [];
    this.#fingerprints.clear();
    await this.#pruneSnapshots();

    log.info(
      snapshot
        ? `historico limpo, ${removed} registros preservados em ${snapshot}`
        : 'historico de alertas limpo',
    );
    return { removed, snapshot };
  }

  /** Guarda apenas as copias mais recentes, para o diretorio nao crescer sem fim. */
  async #pruneSnapshots(keep = SNAPSHOT_KEEP) {
    const names = await fsp.readdir(config.storage.dataDir).catch(() => []);
    const snapshots = names.filter((name) => name.endsWith('.snapshot.ndjson')).sort();
    for (const name of snapshots.slice(0, Math.max(0, snapshots.length - keep))) {
      await fsp.rm(path.join(config.storage.dataDir, name), { force: true }).catch(() => {});
    }
  }

  async size() {
    await this.init();
    return this.#entries.length;
  }
}

function summarize(entries) {
  return {
    total: entries.length,
    danger: entries.filter((e) => e.severity === 'danger').length,
    warning: entries.filter((e) => e.severity === 'warning').length,
    clima: entries.filter((e) => e.sensor === 'clima').length,
    sismo: entries.filter((e) => e.sensor === 'sismo').length,
    regra: entries.filter((e) => e.sensor === 'regra').length,
    anomalia: entries.filter((e) => e.sensor === 'anomalia').length,
  };
}

/**
 * Traz registros antigos e novos para o mesmo formato. O log legado so tinha
 * `type`, `sensor`, `message`, `city` e `loggedAt`, entao os campos de trilha
 * que faltam ficam nulos em vez de inventados, e os que dao para recuperar do
 * texto da mensagem sao extraidos.
 */
function normalizeEntry(raw) {
  const severity = raw.severity || raw.type || 'warning';
  const sensor = raw.sensor || 'clima';
  const loggedAt = raw.loggedAt || raw.at || new Date().toISOString();
  const recovered = raw.value == null ? recoverFromMessage(raw.message, sensor) : null;

  const value = raw.value ?? recovered?.value ?? null;
  const threshold = raw.threshold ?? recovered?.threshold ?? null;
  const metric = raw.metric || recovered?.metric || (sensor === 'sismo' ? 'magnitude' : 'temperature_high');

  const entry = {
    id: raw.id || randomUUID(),
    at: raw.at || loggedAt,
    loggedAt,
    timestamp: raw.timestamp || new Date(loggedAt).toLocaleString('pt-BR'),
    sensor,
    sensorLabel: raw.sensorLabel || SENSOR_LABELS[sensor] || sensor,
    severity,
    type: severity,
    severityLabel: raw.severityLabel || SEVERITY_LABELS[severity] || severity,
    metric,
    metricLabel: raw.metricLabel || METRIC_LABELS[metric] || metric,
    value,
    threshold,
    unit: raw.unit ?? recovered?.unit ?? null,
    comparator: raw.comparator ?? recovered?.comparator ?? null,
    exceededBy:
      raw.exceededBy ?? (value != null && threshold != null ? Number(Math.abs(value - threshold).toFixed(2)) : null),
    city: raw.city || null,
    place: raw.place || null,
    message: raw.message || '',
    url: raw.url || null,
    // Origem do disparo, quando veio de uma regra. Reconstruir a entrada sem
    // estes campos apagaria do historico a resposta de 'qual regra pediu isto'
    // assim que o processo reiniciasse e o arquivo fosse relido.
    ruleId: raw.ruleId || null,
    ruleName: raw.ruleName || null,
    detail: raw.detail ?? null,
    // O aviso de trilha incompleta acompanha o registro depois da migracao.
    legacy: raw.legacy ?? (raw.value == null && raw.metric == null),
    fingerprint: raw.fingerprint || legacyFingerprint({ sensor, metric, city: raw.city, severity, url: raw.url, message: raw.message }),
  };

  entry.searchBlob = normalizeText(
    [entry.message, entry.city, entry.place, entry.sensorLabel, entry.severityLabel, entry.metricLabel, entry.ruleName]
      .filter(Boolean)
      .join(' '),
  );

  return entry;
}

function legacyFingerprint({ sensor, metric, city, severity, url, message }) {
  if (sensor === 'sismo') return `sismo:${url || message}`;
  return `${sensor}:${metric}:${city || 'global'}:${severity}`;
}

const TEMP_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*°C.*?[Ll]imite:\s*(-?\d+(?:[.,]\d+)?)\s*°C/;
const SWING_PATTERN = /[Vv]aria[çc][ãa]o brusca de\s*(-?\d+(?:[.,]\d+)?)\s*°C/;
const MAG_PATTERN = /M\s*(\d+(?:[.,]\d+)?)/;

function toNumber(value) {
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function recoverFromMessage(message, sensor) {
  if (!message) return null;

  if (sensor === 'sismo') {
    const match = message.match(MAG_PATTERN);
    if (match) return { metric: 'magnitude', value: toNumber(match[1]), threshold: null, unit: 'M', comparator: '>=' };
    return null;
  }

  const swing = message.match(SWING_PATTERN);
  if (swing) {
    return { metric: 'temperature_swing', value: toNumber(swing[1]), threshold: 10, unit: '°C', comparator: '>' };
  }

  const temp = message.match(TEMP_PATTERN);
  if (temp) {
    const value = toNumber(temp[1]);
    const threshold = toNumber(temp[2]);
    const isHigh = /cr[íi]tica/i.test(message) || (value != null && threshold != null && value >= threshold);
    return {
      metric: isHigh ? 'temperature_high' : 'temperature_low',
      value,
      threshold,
      unit: '°C',
      comparator: isHigh ? '>=' : '<=',
    };
  }

  return null;
}

export const alertStore = new AlertStore();
export { LOG_FILE as ALERTS_LOG_FILE };
