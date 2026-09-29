import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import { config } from './config/env.js';
import { appSecurityHeaders, corsPolicy, noStore, securityHeaders } from './middleware/security.js';
import { accessGate } from './middleware/accessGate.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { router } from './routes/index.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('app');

export function createApp() {
  const app = express();

  // Nao anunciar a stack do servidor.
  app.disable('x-powered-by');
  app.set('etag', false);

  // Só confia em X-Forwarded-For quando o deploy realmente tem um proxy na
  // frente. Confiar por padrão permitiria burlar o rate limit forjando o header.
  app.set('trust proxy', config.trustProxy ? 1 : false);

  // A porta de entrada vem antes de tudo: nem asset, nem rota, nem erro
  // respondem a quem não passou por ela.
  app.use(accessGate());

  app.use(compression());

  // Teto de corpo. Só o assistente recebe POST, e mesmo ele é texto curto.
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

  app.use('/api', securityHeaders(), corsPolicy(), noStore, globalLimiter, router);

  mountStatic(app);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Serve o build do frontend a partir do próprio backend.
 *
 * Com isso a página e a API compartilham a origem sem nginx no meio, que é o
 * arranjo de uma porta pública só. É o mesmo desenho do
 * container, reduzido a um processo.
 */
function mountStatic(app) {
  if (!config.static.enabled) return;

  const dir = config.static.dir;
  const indexFile = path.join(dir, 'index.html');

  if (!fs.existsSync(indexFile)) {
    log.warn(`SERVE_STATIC ligado mas ${indexFile} não existe. Rode "npm run build" no frontend.`);
    return;
  }

  const headers = appSecurityHeaders();

  // Os assets levam hash no nome, então podem ser guardados indefinidamente.
  app.use(
    '/assets',
    headers,
    express.static(path.join(dir, 'assets'), {
      immutable: true,
      maxAge: '1y',
      fallthrough: false,
    }),
  );

  app.use(headers, express.static(dir, { index: false, maxAge: '1h' }));

  // Qualquer caminho que não seja da API devolve o index: o roteamento é do
  // React, e recarregar a página numa aba interna precisa continuar valendo.
  app.get(/^\/(?!api\/).*/, headers, (_req, res) => {
    // O index nunca é cacheado: é ele que aponta para os assets novos a cada
    // build, e um index velho serviria arquivos que já não existem.
    res.set('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });

  log.info(`servindo o frontend de ${dir}`);
}
