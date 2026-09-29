import { config, describeConfig } from './config/env.js';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';
import { alertStore } from './services/alertStore.js';

const log = createLogger('server');

async function start() {
  await alertStore.init();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log.info(`monitoring system escutando em http://${config.host}:${config.port}`);
    log.info('configuração', describeConfig());
  });

  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 10_000;

  const shutdown = (signal) => {
    log.info(`${signal} recebido, encerrando`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => log.error('rejeição não tratada', reason));
  process.on('uncaughtException', (error) => {
    log.error('exceção não capturada', error);
    process.exit(1);
  });
}

start().catch((error) => {
  log.error(`falha ao iniciar: ${error.message}`, error);
  process.exit(1);
});
