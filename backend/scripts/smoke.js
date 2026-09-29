/**
 * Verificação rápida da API. Sobe o app em uma porta efêmera, chama cada rota e
 * confere formato e cabeçalhos de segurança. Não substitui testes, serve para
 * confirmar que a montagem do servidor não quebrou depois de uma mudança.
 *
 *   npm run smoke
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
 * O smoke chama GET /api/data, e essa rota avalia alertas e grava o que
 * disparou. Rodando contra o DATA_DIR real, uma verificação de rotina escrevia
 * no histórico de verdade, com limites artificiais vindos do próprio teste. O
 * histórico é dado do usuário, não rascunho de teste, então o script trabalha
 * em um diretório temporário e some com ele no fim. O mesmo cuidado que o
 * check:security já tomava.
 */
const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitoring-smoke-'));
process.env.DATA_DIR = sandboxDir;
// A porta de entrada é desligada aqui de propósito. O .env da máquina pode ter
// ACCESS_PASSWORD para publicar o sistema, e sem isto toda asserção receberia
// 401 e a verificação passaria a medir a senha em vez do que ela deveria medir.
// O gate tem cenário próprio no check:security.
process.env.ACCESS_PASSWORD = '';


// Importados só depois de DATA_DIR estar definido: a configuração é congelada
// na primeira leitura do módulo.
const { config } = await import('../src/config/env.js');
const { createApp } = await import('../src/app.js');
const { alertStore } = await import('../src/services/alertStore.js');

if (path.resolve(config.storage.dataDir) !== path.resolve(sandboxDir)) {
  throw new Error('DATA_DIR não foi isolado; abortando para não tocar no histórico real');
}

const checks = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  checks.push(`${ok ? 'ok  ' : 'FALHA'} ${name}${detail && !ok ? `: ${detail}` : ''}`);
}

async function main() {
  await alertStore.init();

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  check('GET /api/health responde 200', health.status === 200);
  check('x-powered-by removido', health.headers.get('x-powered-by') === null);
  check('cabeçalho CSP presente', Boolean(health.headers.get('content-security-policy')));
  check('cabeçalho no-store presente', health.headers.get('cache-control') === 'no-store');
  check('nosniff presente', health.headers.get('x-content-type-options') === 'nosniff');

  const cors = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  check('origem desconhecida sem allow-origin', cors.headers.get('access-control-allow-origin') === null);

  const cfg = await (await fetch(`${base}/api/config`)).json();
  check('GET /api/config traz bloco refresh', Boolean(cfg.refresh));

  const clock = await (await fetch(`${base}/api/world-clock`)).json();
  check('GET /api/world-clock traz 27 cidades', clock.length === 27, `recebeu ${clock.length}`);

  const log = await (await fetch(`${base}/api/alerts-log?pageSize=5`)).json();
  check('GET /api/alerts-log é paginado', Array.isArray(log.items) && typeof log.total === 'number');
  check('GET /api/alerts-log traz facetas', Boolean(log.facets?.sensors));

  const notFound = await fetch(`${base}/api/rota-inexistente`);
  check('rota desconhecida responde 404', notFound.status === 404);

  const data = await fetch(`${base}/api/data?city=Curitiba&tempMax=-999&magThreshold=99`);
  const payload = await data.json();
  check('GET /api/data responde 200', data.status === 200, `status ${data.status}`);
  // tempMax=-999 é fixado em 0, o que inverte o par min/max, então os dois
  // voltam para o padrão seguro. magThreshold=99 é fixado no teto de 10.
  check(
    'limites fora da faixa são fixados',
    payload.thresholds?.tempMin === 10 && payload.thresholds?.tempMax === 35 && payload.thresholds?.magThreshold === 10,
    JSON.stringify(payload.thresholds),
  );
  check('payload traz cartões prontos', Array.isArray(payload.cards) && payload.cards.length === 5);
  check('payload traz séries de gráfico', Boolean(payload.charts?.temperature?.x));
  check('payload traz geojson sísmico', payload.seismic?.geojson?.type === 'FeatureCollection');
  check('payload traz status derivado', Boolean(payload.status?.type));

  server.close();
  fs.rmSync(sandboxDir, { recursive: true, force: true });

  console.log(checks.join('\n'));
  console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('smoke falhou:', error);
  process.exit(1);
});
