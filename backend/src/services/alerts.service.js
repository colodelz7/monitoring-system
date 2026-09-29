import { randomUUID } from 'node:crypto';
import { METRIC_LABELS, SENSOR_LABELS, SEVERITY_LABELS } from '../domain/constants.js';
import { rotuloDe } from '../domain/metrics.js';
import { avaliarRegra, descreverRegra } from '../domain/rules.js';

const STRONG_MAGNITUDE = 6;
const SWING_THRESHOLD_C = 10;
const SEISMIC_ALERT_LIMIT = 5;

/**
 * Cada alerta carrega a trilha completa do que o disparou: metrica, valor
 * medido, limite ultrapassado e comparador. Sem esses campos o historico nao
 * consegue responder "por que isso disparou", que e justamente o que a aba de
 * histórico precisa mostrar.
 */
function makeAlert({
  sensor,
  severity,
  metric,
  metricLabel,
  value,
  threshold,
  unit,
  comparator,
  city,
  message,
  url,
  place,
  occurredAt,
  ruleId,
  ruleName,
  detail,
  fingerprint,
}) {
  const at = occurredAt || new Date().toISOString();
  return {
    id: randomUUID(),
    at,
    // Mantido para compatibilidade com o formato antigo do log.
    timestamp: new Date(at).toLocaleString('pt-BR'),
    sensor,
    sensorLabel: SENSOR_LABELS[sensor] || sensor,
    type: severity,
    severity,
    severityLabel: SEVERITY_LABELS[severity] || severity,
    metric,
    metricLabel: metricLabel || METRIC_LABELS[metric] || metric,
    value,
    threshold,
    unit,
    comparator,
    exceededBy: value != null && threshold != null ? Number(Math.abs(value - threshold).toFixed(2)) : null,
    city: city || null,
    place: place || null,
    message,
    url: url || null,
    // Alertas de regra guardam de qual regra vieram, senao o historico mostra
    // o disparo sem dizer o que o pediu, e apagar a regra torna a trilha
    // ilegivel depois.
    ruleId: ruleId || null,
    ruleName: ruleName || null,
    detail: detail ?? null,
    fingerprint: fingerprint || fingerprintFor({ sensor, metric, city, severity, url }),
  };
}

/**
 * Identidade estavel de um alerta, usada para nao gravar o mesmo evento a cada
 * ciclo de polling. Um sismo e identificado pela propria URL do evento na USGS;
 * uma condicao climatica, pela combinacao cidade + metrica + gravidade, que
 * persiste enquanto a condicao durar.
 */
function fingerprintFor({ sensor, metric, city, severity, url }) {
  if (sensor === 'sismo' && url) return `sismo:${url}`;
  return `${sensor}:${metric}:${city || 'global'}:${severity}`;
}

/**
 * Alertas vindos das regras que a pessoa criou.
 *
 * Rodam ao lado dos limites embutidos, nao no lugar deles: quem nao criou
 * regra nenhuma continua com o painel que sempre teve, e quem criou ganha o
 * resto. Uma regra que estoura nao pode derrubar o ciclo do painel, entao cada
 * avaliacao e isolada da seguinte.
 */
function alertsFromRules({ regras, city, valores, serie, agora }) {
  const alerts = [];

  for (const regra of regras) {
    let disparo = null;
    try {
      disparo = avaliarRegra(regra, { cidade: city, valores, serie, agora });
    } catch {
      // Regra malformada que escapou da validacao. Ignorar uma e melhor que
      // perder as outras e o painel junto.
      continue;
    }
    if (!disparo) continue;

    alerts.push(makeAlert({
      sensor: 'regra',
      severity: regra.severidade,
      metric: disparo.metrica,
      metricLabel: rotuloDe(disparo.metrica),
      value: disparo.valor,
      threshold: disparo.limite,
      unit: disparo.unidade,
      comparator: disparo.comparador,
      city,
      message: disparo.mensagem,
      ruleId: regra.id,
      ruleName: regra.nome,
      detail: { condicao: descreverRegra(regra), medida: disparo.detalhe },
      // A identidade e a regra na cidade. Enquanto a condicao persistir entre
      // ciclos, e o mesmo alerta, nao um novo a cada 30 segundos.
      fingerprint: `regra:${regra.id}:${String(city ?? 'global').toLowerCase()}`,
    }));
  }

  return alerts;
}

/**
 * Alertas de anomalia: o valor de hoje contra o que aquela cidade costuma ser.
 *
 * A identidade inclui o dia. Uma anomalia e um fato do dia, entao ela e
 * registrada uma vez por dia e por metrica, e nao a cada ciclo enquanto a
 * condicao durar.
 */
function alertsFromAnomaly({ anomalia, city, agora }) {
  if (!anomalia?.disponivel || !anomalia.achados?.length) return [];

  const dia = new Date(agora).toISOString().slice(0, 10);

  return anomalia.achados.map((achado) => makeAlert({
    sensor: 'anomalia',
    // Anomalia descreve o incomum, nao necessariamente o perigoso. Quem decide
    // o que e critico e o limite, que continua tendo caminho proprio.
    severity: 'warning',
    metric: achado.metrica,
    metricLabel: `${achado.rotulo} fora do normal`,
    value: achado.valor,
    threshold: achado.media,
    unit: achado.unidade,
    comparator: achado.direcao === 'acima' ? '>' : '<',
    city,
    message: achado.mensagem,
    detail: {
      escore: achado.escore,
      desvio: achado.desvio,
      media: achado.media,
      diasObservados: achado.diasObservados,
    },
    fingerprint: `anomalia:${achado.metrica}:${String(city ?? 'global').toLowerCase()}:${dia}`,
  }));
}

export function buildAlerts({
  weather,
  forecast,
  seismic,
  thresholds,
  regras = [],
  valores = null,
  serie = [],
  anomalia = null,
  agora = Date.now(),
}) {
  const { tempMin, tempMax, magThreshold } = thresholds;
  const alerts = [];
  const city = weather?.city || null;

  if (weather?.success) {
    if (weather.temp >= tempMax) {
      alerts.push(makeAlert({
        sensor: 'clima',
        severity: 'danger',
        metric: 'temperature_high',
        value: weather.temp,
        threshold: tempMax,
        unit: '°C',
        comparator: '>=',
        city,
        message: `Temperatura crítica de ${weather.temp}°C em ${city}. Limite: ${tempMax}°C.`,
      }));
    }

    if (weather.temp <= tempMin) {
      alerts.push(makeAlert({
        sensor: 'clima',
        severity: 'warning',
        metric: 'temperature_low',
        value: weather.temp,
        threshold: tempMin,
        unit: '°C',
        comparator: '<=',
        city,
        message: `Temperatura baixa de ${weather.temp}°C em ${city}. Limite: ${tempMin}°C.`,
      }));
    }

    const points = forecast?.points ?? [];
    if (points.length >= 3) {
      const temps = points.slice(0, 3).map((p) => p.temp).filter((t) => Number.isFinite(t));
      if (temps.length >= 2) {
        const delta = Number((Math.max(...temps) - Math.min(...temps)).toFixed(1));
        if (delta > SWING_THRESHOLD_C) {
          alerts.push(makeAlert({
            sensor: 'clima',
            severity: 'warning',
            metric: 'temperature_swing',
            value: delta,
            threshold: SWING_THRESHOLD_C,
            unit: '°C',
            comparator: '>',
            city,
            message: `Variação brusca de ${delta}°C prevista nas próximas 6h em ${city}.`,
          }));
        }
      }
    }
  }

  const events = seismic?.events ?? [];
  events
    .filter((event) => event.magnitude >= magThreshold)
    .slice(0, SEISMIC_ALERT_LIMIT)
    .forEach((event) => {
      alerts.push(makeAlert({
        sensor: 'sismo',
        severity: event.magnitude >= STRONG_MAGNITUDE ? 'danger' : 'warning',
        metric: 'magnitude',
        value: event.magnitude,
        threshold: magThreshold,
        unit: 'M',
        comparator: '>=',
        city,
        place: event.place,
        url: event.url,
        occurredAt: event.time,
        message: `Sismo M${event.magnitude.toFixed(1)} detectado: ${event.place}.`,
      }));
    });

  if (weather?.success && valores) {
    alerts.push(...alertsFromRules({ regras, city, valores, serie, agora }));
    alerts.push(...alertsFromAnomaly({ anomalia, city, agora }));
  }

  return alerts;
}

export function summarizeAlerts(alerts) {
  const danger = alerts.filter((a) => a.severity === 'danger').length;
  const warning = alerts.length - danger;
  return {
    total: alerts.length,
    danger,
    warning,
    clima: alerts.filter((a) => a.sensor === 'clima').length,
    sismo: alerts.filter((a) => a.sensor === 'sismo').length,
    regra: alerts.filter((a) => a.sensor === 'regra').length,
    anomalia: alerts.filter((a) => a.sensor === 'anomalia').length,
  };
}

export function deriveStatus(alerts) {
  if (alerts.some((a) => a.severity === 'danger')) {
    return { type: 'danger', text: 'ALERTA CRÍTICO' };
  }
  if (alerts.length) return { type: 'warning', text: 'ALERTAS ATIVOS' };
  return { type: 'safe', text: 'SISTEMA SEGURO' };
}
