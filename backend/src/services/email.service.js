import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('email');
const lastSent = new Map();
let transporter = null;
let transporterChecked = false;

function getTransporter() {
  if (transporterChecked) return transporter;
  transporterChecked = true;

  const { host, user, pass, port } = config.email;
  if (!config.email.enabled || !host || !user || !pass) {
    log.info('alertas por e-mail desabilitados');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Decide quais alertas merecem e-mail usando os limites do servidor, nunca os
 * que vieram na query string.
 *
 * Esse era o furo mais serio do sistema anterior: como tempMax e magThreshold
 * chegavam do cliente, um GET com tempMax=-50 forcava alerta critico e disparava
 * e-mail. Aqui o cliente controla o que ele ve no painel, e o servidor controla
 * o que sai pela caixa postal.
 */
function selectNotifiable(alerts) {
  const limits = config.email;
  return alerts.filter((alert) => {
    if (alert.value == null) return false;
    switch (alert.metric) {
      case 'temperature_high':
        return alert.value >= limits.tempMax;
      case 'temperature_low':
        return alert.value <= limits.tempMin;
      case 'magnitude':
        return alert.value >= limits.magThreshold;
      default:
        return false;
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function renderText(alerts) {
  return alerts
    .map((a) => `- [${a.sensorLabel}] ${a.message} (medido ${a.value}${a.unit}, limite ${a.threshold ?? '-'}${a.unit})`)
    .join('\n');
}

function renderHtml(alerts) {
  return alerts
    .map((a) => {
      const link = a.url ? ` <a href="${escapeHtml(a.url)}">Ver USGS</a>` : '';
      const measured = `medido <b>${escapeHtml(a.value)}${escapeHtml(a.unit)}</b>, limite <b>${escapeHtml(a.threshold ?? '-')}${escapeHtml(a.unit)}</b>`;
      return `<li><b>[${escapeHtml(a.sensorLabel)}]</b> ${escapeHtml(a.message)}<br><small style="color:#888">${measured}</small>${link}</li>`;
    })
    .join('');
}

export async function notifyByEmail(alerts, city = '') {
  const notifiable = selectNotifiable(alerts);
  if (!notifiable.length) return { sent: false, reason: 'nenhum alerta acima do limite do servidor' };

  const mailer = getTransporter();
  if (!mailer) return { sent: false, reason: 'transporte nao configurado' };

  const { from, to, debounceMs } = config.email;
  if (!from || !to) return { sent: false, reason: 'remetente ou destinatario ausente' };

  const groups = new Map();
  for (const alert of notifiable) {
    const key = `${alert.sensor}:${alert.sensor === 'sismo' ? 'global' : city}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(alert);
  }

  const now = Date.now();
  let sentCount = 0;

  for (const [key, group] of groups) {
    if (now - (lastSent.get(key) ?? 0) < debounceMs) continue;
    lastSent.set(key, now);

    try {
      await mailer.sendMail({
        from,
        to,
        subject: 'Alerta crítico no MONITORING SYSTEM',
        text: `MONITORING SYSTEM, alertas críticos\n\n${renderText(group)}\n\nHorário: ${new Date().toLocaleString('pt-BR')}`,
        html: `<h2 style="color:#ff2d55">Alerta crítico no MONITORING SYSTEM</h2><ul>${renderHtml(group)}</ul><p style="color:#888">Horário: ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>`,
      });
      sentCount += 1;
      log.info(`alerta "${key}" enviado`);
    } catch (error) {
      lastSent.delete(key);
      log.warn(`falha ao enviar "${key}": ${error.message}`);
    }
  }

  return { sent: sentCount > 0, groups: sentCount };
}

export function emailConfigured() {
  return Boolean(config.email.enabled && config.email.host && config.email.user && config.email.pass);
}
