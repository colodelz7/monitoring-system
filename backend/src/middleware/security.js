import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('security');

// O que vale para toda resposta, seja JSON ou pagina.
const BASE_HELMET = {
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
};

function hsts() {
  // Atras de um proxy TLS a conexao e https de verdade, entao o
  // cabeçalho vale. Em desenvolvimento no loopback ele so atrapalharia.
  return config.isProd || config.trustProxy
    ? { maxAge: 15552000, includeSubDomains: true }
    : false;
}

/**
 * Cabecalhos das rotas de API. Ela so devolve JSON, entao a politica de
 * conteudo pode ser a mais restritiva possivel: nada deve ser carregado a
 * partir dela.
 */
export function securityHeaders() {
  return helmet({
    ...BASE_HELMET,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    hsts: hsts(),
  });
}

/**
 * Cabecalhos da pagina, quando o backend serve o build do frontend.
 *
 * Aqui a politica nao pode ser 'none', senao o proprio app nao carrega. Ela
 * lista exatamente o que a aplicacao precisa e nada alem disso: o bundle e os
 * assets sao proprios, as fontes vem do Google, os tiles do mapa vem do Stadia,
 * e o MapLibre precisa de blob para os workers e para as texturas que monta em
 * memoria. Qualquer origem fora dessa lista e bloqueada pelo navegador.
 */
export function appSecurityHeaders() {
  return helmet({
    ...BASE_HELMET,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", 'blob:'],
        // Plotly e MapLibre escrevem estilo inline em tempo de execucao, entao
        // 'unsafe-inline' aqui e requisito das bibliotecas, nao descuido.
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'worker-src': ["'self'", 'blob:'],
        'child-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", 'https://tiles.stadiamaps.com'],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        'object-src': ["'none'"],
      },
    },
    hsts: hsts(),
  });
}

/**
 * CORS restrito a lista de origens do frontend.
 *
 * Requisicoes sem Origin (curl, health check de container, same-origin atras do
 * proxy nginx) sao aceitas porque nao carregam credencial de navegador e nao
 * sao o vetor que o CORS protege. Qualquer origem de navegador fora da lista e
 * recusada, e e isso que impede o backend de virar proxy publico de cota.
 */
export function corsPolicy() {
  const allowed = new Set(config.corsOrigins);

  // A forma dinamica recebe a requisicao, e nao so a origem. E dela que sai o
  // host de verdade, que e o que permite reconhecer a propria pagina.
  return cors((req, callback) => {
    const origin = req.headers.origin;

    const opcoes = {
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Admin-Token', 'X-Confirm-Clear'],
      maxAge: 86400,
      credentials: false,
    };

    // Sem cabecalho de origem nao ha requisicao cruzada: e chamada direta,
    // de servidor ou de ferramenta de linha de comando.
    if (!origin) return callback(null, { ...opcoes, origin: true });

    if (allowed.has(origin)) return callback(null, { ...opcoes, origin: true });

    // Quando o backend serve o proprio frontend, a pagina fala com a API na
    // mesma origem. O navegador manda o cabecalho mesmo assim em POST com
    // corpo JSON, e sem esta checagem a propria pagina aparecia no log como
    // origem recusada. Nao e permissividade: e reconhecer o proprio endereco,
    // que por definicao ja passou pela porta de entrada.
    if (config.static.enabled && origin === `${req.protocol}://${req.headers.host}`) {
      return callback(null, { ...opcoes, origin: true });
    }

    log.warn(`origem recusada: ${origin}`);
    return callback(null, { ...opcoes, origin: false });
  });
}

/**
 * Respostas de API nunca devem ser guardadas por intermediarios compartilhados.
 * O cache que importa e o do servidor, que ja cuidamos em memoria.
 */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
