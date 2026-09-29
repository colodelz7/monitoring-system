/**
 * Verificação dos controles de segurança.
 *
 * Sobe o app em porta efêmera dentro do próprio processo e exercita cada
 * proteção: CORS, rate limit, guarda administrativa, saneamento de entrada e
 * formato de erro.
 *
 *   npm run check:security
 *
 * Um dos testes apaga o histórico de alertas, então o script força DATA_DIR
 * para um diretório temporário antes de carregar qualquer módulo do servidor.
 * Sem isso, rodar a verificação destruiria o histórico real.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitoring-check-'));
process.env.DATA_DIR = sandboxDir;
// A porta de entrada é desligada aqui de propósito. O .env da máquina pode ter
// ACCESS_PASSWORD para publicar o sistema, e sem isto toda asserção receberia
// 401 e a verificação passaria a medir a senha em vez do que ela deveria medir.
// O gate tem cenário próprio no check:security.
process.env.ACCESS_PASSWORD = '';


// Carregados só depois de DATA_DIR estar definido: a configuração é lida uma
// única vez, no momento do import.
const { createApp } = await import('../src/app.js');
const { alertStore } = await import('../src/services/alertStore.js');
const { config } = await import('../src/config/env.js');

const lines = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  lines.push(`${ok ? 'ok   ' : 'FALHA'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  if (path.resolve(config.storage.dataDir) !== path.resolve(sandboxDir)) {
    throw new Error('DATA_DIR não foi isolado; abortando para não tocar no histórico real');
  }

  await alertStore.init();
  await alertStore.append([sampleAlert()]);

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // ─── Cabeçalhos ───────────────────────────────────────────────────────────
  const health = await fetch(`${base}/api/health`);
  check('x-powered-by ausente', health.headers.get('x-powered-by') === null);
  check('CSP restritiva', (health.headers.get('content-security-policy') || '').includes("default-src 'none'"));
  check('nosniff', health.headers.get('x-content-type-options') === 'nosniff');
  check('no-referrer', health.headers.get('referrer-policy') === 'no-referrer');
  check('cache-control no-store', health.headers.get('cache-control') === 'no-store');

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const evil = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  check('origem desconhecida não recebe allow-origin', evil.headers.get('access-control-allow-origin') === null);

  const allowedOrigin = config.corsOrigins[0];
  const friendly = await fetch(`${base}/api/health`, { headers: { Origin: allowedOrigin } });
  check('origem do frontend é liberada', friendly.headers.get('access-control-allow-origin') === allowedOrigin);

  // ─── Rate limit ───────────────────────────────────────────────────────────
  const limit = config.rateLimit.search;
  const codes = [];
  for (let i = 0; i <= limit; i += 1) {
    const res = await fetch(`${base}/api/geocode?q=teste${i}`);
    codes.push(res.status);
  }
  check(`busca bloqueia após ${limit} requisições`, codes.at(-1) === 429, `códigos: ${codes.join(',')}`);

  // ─── Guarda administrativa ────────────────────────────────────────────────
  const before = await alertStore.size();
  const del = await fetch(`${base}/api/alerts-log`, { method: 'DELETE' });

  if (config.adminToken) {
    check('DELETE sem token é recusado', del.status === 401, `status ${del.status}`);
    check('histórico preservado após recusa', (await alertStore.size()) === before);

    const unconfirmed = await fetch(`${base}/api/alerts-log`, {
      method: 'DELETE',
      headers: { 'x-admin-token': config.adminToken },
    });
    check('DELETE com token mas sem confirmação é recusado', unconfirmed.status === 428, `status ${unconfirmed.status}`);
    check('histórico preservado sem confirmação', (await alertStore.size()) === before);

    const authorized = await fetch(`${base}/api/alerts-log`, {
      method: 'DELETE',
      headers: { 'x-admin-token': config.adminToken, 'x-confirm-clear': 'apagar-historico' },
    });
    check('DELETE com token e confirmação é aceito', authorized.status === 200, `status ${authorized.status}`);
  } else if (config.isProd) {
    check('DELETE indisponível sem ADMIN_TOKEN em produção', del.status === 503, `status ${del.status}`);
    check('histórico preservado', (await alertStore.size()) === before);
  } else {
    // Sem token, desenvolvimento ainda exige a confirmação explícita. Um DELETE
    // de passagem não pode apagar o histórico de quem está desenvolvendo.
    check('DELETE sem confirmação é recusado em desenvolvimento', del.status === 428, `status ${del.status}`);
    check('histórico preservado sem confirmação', (await alertStore.size()) === before);

    const confirmed = await fetch(`${base}/api/alerts-log`, {
      method: 'DELETE',
      headers: { 'x-confirm-clear': 'apagar-historico' },
    });
    check('DELETE com confirmação é aceito', confirmed.status === 200, `status ${confirmed.status}`);

    const body = await confirmed.json();
    check('limpeza guarda cópia do que apagou', before === 0 || Boolean(body.snapshot), JSON.stringify(body));
  }

  // ─── Assistente ───────────────────────────────────────────────────────────
  const semMensagem = await fetch(`${base}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  // Sem chave a rota fica indisponível (503); com chave, uma mensagem vazia é
  // recusada (400). As duas respostas são corretas, uma falha silenciosa não.
  check(
    'assistente recusa requisição sem mensagem',
    [400, 503].includes(semMensagem.status),
    `status ${semMensagem.status}`,
  );

  const gigante = await fetch(`${base}/api/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'a'.repeat(50000) }),
  });
  check(
    'assistente recusa mensagem gigante',
    [413, 503].includes(gigante.status),
    `status ${gigante.status}`,
  );

  const corpoErro = await semMensagem.text();
  check(
    'erro do assistente não vaza a chave',
    !corpoErro.includes(config.assistant.apiKey) || !config.assistant.apiKey,
    `corpo de ${corpoErro.length} bytes inspecionado`,
  );

  const statusAssistente = await (await fetch(`${base}/api/assistant/status`)).json();
  check(
    'status do assistente não expõe a chave',
    !JSON.stringify(statusAssistente).includes(config.assistant.apiKey) || !config.assistant.apiKey,
    JSON.stringify(statusAssistente),
  );

  // ─── Saneamento de entrada ────────────────────────────────────────────────
  const injected = await fetch(`${base}/api/data?city=${encodeURIComponent('Curitiba&appid=vazou<script>')}`);
  const payload = await injected.json();
  check(
    'nome de cidade é higienizado antes de virar URL',
    !String(payload.city).includes('<') && !String(payload.city).includes('&appid'),
    `cidade resolvida: ${payload.city}`,
  );
  check(
    'limites do cliente são fixados na faixa segura',
    payload.thresholds.magThreshold <= 10 && payload.thresholds.tempMax <= 60,
    JSON.stringify(payload.thresholds),
  );

  // ─── URLs de terceiros ────────────────────────────────────────────────────
  const feature = payload.seismic?.geojson?.features?.[0];
  if (feature) {
    const url = feature.properties.url;
    const safe = url === null || /^https:\/\/([a-z0-9-]+\.)*usgs\.gov\//.test(url);
    check('URL de evento é https da USGS ou nula', safe, String(url));
  } else {
    lines.push('pular  sem eventos sísmicos para checar URL');
  }

  // ─── Formato de erro ──────────────────────────────────────────────────────
  const missing = await fetch(`${base}/api/rota-que-nao-existe`);
  const missingBody = await missing.json();
  check('404 responde JSON', missing.status === 404 && typeof missingBody.error === 'string', JSON.stringify(missingBody));

  server.close();

  console.log(`\nCenário: NODE_ENV=${config.nodeEnv}, adminToken=${config.adminToken ? 'definido' : 'ausente'}`);
  console.log(`DATA_DIR isolado: ${sandboxDir}\n`);
  console.log(lines.join('\n'));
  console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
}

function sampleAlert() {
  return {
    id: 'teste-0001',
    at: new Date().toISOString(),
    sensor: 'clima',
    severity: 'danger',
    metric: 'temperature_high',
    value: 41,
    threshold: 35,
    unit: '°C',
    comparator: '>=',
    city: 'Cidade de Teste',
    message: 'Registro sintético usado apenas pela verificação.',
    fingerprint: 'teste:fixture',
  };
}

try {
  await main();
} catch (error) {
  console.error('verificação falhou:', error);
  failures = failures || 1;
} finally {
  fs.rmSync(sandboxDir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
