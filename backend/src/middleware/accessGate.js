import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('access');

/**
 * Porta de entrada do sistema quando ele deixa de morar no loopback.
 *
 * Dentro da rede local o backend era protegido pelo proprio endereco: so quem
 * estava na maquina alcancava. Servido para fora, esse muro deixa de
 * existir, e o backend continua sendo uma ponte para APIs que cobram por cota.
 * Sem uma porta, qualquer um que descobrisse a URL gastaria a cota alheia.
 *
 * A escolha e HTTP Basic sobre HTTPS. Nao e a autenticacao mais bonita, mas o
 * navegador cuida do formulario, a credencial acompanha toda requisicao sem
 * cookie nem sessao no servidor, e vale igual para o HTML, para os assets e
 * para o stream do assistente. Menos codigo proprio no caminho da autenticacao
 * significa menos lugar para eu errar.
 */

// Comparar os digests, e nao os textos, deixa o tempo de resposta constante
// mesmo quando os tamanhos diferem, que e o que timingSafeEqual exige.
function matches(received, expected) {
  const a = createHash('sha256').update(String(received)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

function parseBasic(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return null;
  return { user: decoded.slice(0, separator), pass: decoded.slice(separator + 1) };
}

export function accessGate() {
  const { user, password } = config.access;

  // Sem senha configurada a porta simplesmente nao existe, e o servidor segue
  // como sempre foi em desenvolvimento no loopback.
  if (!password) return (_req, _res, next) => next();

  log.info(`acesso protegido por senha para o usuario "${user}"`);

  return function requireAccess(req, res, next) {
    // O healthcheck fica de fora para que o container consiga medir
    // que o servico esta vivo. Ele revela apenas tempo de atividade.
    if (req.path === '/api/health') return next();

    const credentials = parseBasic(req.get('authorization'));
    const ok = credentials
      && matches(credentials.user, user)
      && matches(credentials.pass, password);

    if (ok) return next();

    if (credentials) log.warn(`credencial recusada de ${req.ip}`);

    res.set('WWW-Authenticate', 'Basic realm="Monitoring System", charset="UTF-8"');
    return res.status(401).json({ error: 'Acesso restrito. Informe usuário e senha.' });
  };
}
