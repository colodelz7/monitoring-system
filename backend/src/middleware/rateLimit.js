import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('rate-limit');

function build({ max, name }) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Sem TRUST_PROXY o express usa o IP da conexao, que e o comportamento
    // correto quando o servico nao esta atras de um proxy confiavel.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler(req, res) {
      log.warn(`${name}: limite atingido por ${req.ip} em ${req.originalUrl}`);
      res.status(429).json({
        error: 'Muitas requisições. Aguarde um instante antes de tentar novamente.',
        retryAfterSeconds: Math.ceil(config.rateLimit.windowMs / 1000),
      });
    },
  });
}

// Teto geral, para que nenhuma rota fique completamente descoberta.
export const globalLimiter = build({ max: config.rateLimit.global, name: 'global' });

// Rotas que consomem cota de API externa.
export const upstreamLimiter = build({ max: config.rateLimit.upstream, name: 'upstream' });

// Autocomplete dispara a cada digitacao, entao tem teto proprio e mais apertado.
export const searchLimiter = build({ max: config.rateLimit.search, name: 'busca' });

// Operacoes destrutivas.
export const writeLimiter = build({ max: config.rateLimit.write, name: 'escrita' });

// O assistente e a rota mais cara do sistema: cada mensagem vira uma chamada
// paga ao modelo e mantem uma conexao aberta enquanto a resposta e transmitida.
// Teto proprio, bem mais apertado que o de clima.
export const assistantLimiter = build({ max: config.rateLimit.assistant, name: 'assistente' });

// Consultas ao historico gravado em disco.
//
// Custam pouco para quem pede e muito para quem responde: uma janela de um
// ano abre centenas de arquivos e analisa dezenas de milhares de linhas. Sem
// teto proprio, elas herdavam o global de 300 por minuto, o que transforma um
// pedido trivial em trabalho pesado multiplicado por trezentos.
export const historyLimiter = build({ max: config.rateLimit.history, name: 'historico' });
