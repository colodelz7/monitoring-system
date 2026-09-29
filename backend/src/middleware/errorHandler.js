import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('http');

export function notFound(_req, res) {
  res.status(404).json({ error: 'Rota não encontrada.' });
}

/**
 * Converte qualquer excecao em JSON. A mensagem interna e o stack so aparecem
 * fora de producao; em producao o cliente recebe um texto generico, para que
 * detalhe de upstream ou caminho de arquivo nao vaze na resposta.
 */
export function errorHandler(error, req, res, _next) {
  const status = Number.isInteger(error?.status) ? error.status : 500;

  if (status >= 500) log.error(`${req.method} ${req.originalUrl}: ${error?.message}`, error?.stack);
  else log.warn(`${req.method} ${req.originalUrl}: ${error?.message}`);

  const body = { error: status >= 500 && config.isProd ? 'Erro interno do servidor.' : error?.message || 'Erro inesperado.' };
  if (error?.field) body.field = error.field;

  res.status(status).json(body);
}

/** Encaminha rejeicoes de handlers async para o errorHandler. */
export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Porta de entrada das operacoes destrutivas.
 * Em producao exige ADMIN_TOKEN; sem token configurado, a operacao fica
 * indisponivel em vez de aberta.
 */
export function requireAdmin(req, res, next) {
  if (!config.isProd && !config.adminToken) return next();

  if (!config.adminToken) {
    return res.status(503).json({ error: 'Operação indisponível: ADMIN_TOKEN não configurado.' });
  }

  const provided = req.get('x-admin-token');
  if (provided && provided === config.adminToken) return next();

  return res.status(401).json({ error: 'Token administrativo inválido ou ausente.' });
}
