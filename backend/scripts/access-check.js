/**
 * Verificação da porta de entrada.
 *
 * Roda em processo separado porque a configuração é congelada no primeiro
 * import: para exercitar o modo protegido é preciso que ACCESS_PASSWORD já
 * exista antes de qualquer módulo do servidor ser carregado.
 *
 *   npm run check:access
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monitoring-access-'));
process.env.DATA_DIR = sandboxDir;

const USER = 'porteiro';
const PASSWORD = 'senha-de-teste-9273';
process.env.ACCESS_USER = USER;
process.env.ACCESS_PASSWORD = PASSWORD;

const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config/env.js');

const lines = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  lines.push(`${ok ? 'ok   ' : 'FALHA'} ${name}${detail ? `: ${detail}` : ''}`);
}

function basic(user, pass) {
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

async function main() {
  if (config.access.password !== PASSWORD) {
    throw new Error('ACCESS_PASSWORD não chegou à configuração; abortando');
  }

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const semNada = await fetch(`${base}/api/data?city=Curitiba`);
  check('sem credencial a API responde 401', semNada.status === 401, `status ${semNada.status}`);
  check(
    '401 traz o desafio que faz o navegador pedir a senha',
    (semNada.headers.get('www-authenticate') || '').startsWith('Basic'),
    semNada.headers.get('www-authenticate') || 'ausente',
  );

  const senhaErrada = await fetch(`${base}/api/data?city=Curitiba`, { headers: basic(USER, 'chute') });
  check('senha errada é recusada', senhaErrada.status === 401, `status ${senhaErrada.status}`);

  const usuarioErrado = await fetch(`${base}/api/data?city=Curitiba`, { headers: basic('outro', PASSWORD) });
  check('usuário errado é recusado', usuarioErrado.status === 401, `status ${usuarioErrado.status}`);

  const lixo = await fetch(`${base}/api/data?city=Curitiba`, { headers: { Authorization: 'Basic @@nao-e-base64@@' } });
  check('cabeçalho malformado não derruba o servidor', lixo.status === 401, `status ${lixo.status}`);

  const certo = await fetch(`${base}/api/config`, { headers: basic(USER, PASSWORD) });
  check('credencial correta passa', certo.status === 200, `status ${certo.status}`);

  // O healthcheck fica de fora por decisão explícita: é o que permite ao
  // container medir que o serviço está vivo.
  const saude = await fetch(`${base}/api/health`);
  check('health continua acessível sem credencial', saude.status === 200, `status ${saude.status}`);

  // A porta vale para a página também, não só para a API, senão o bundle
  // vazaria para qualquer um que abrisse o endereço.
  const pagina = await fetch(`${base}/`);
  check('a página também exige credencial', pagina.status === 401, `status ${pagina.status}`);

  server.close();

  console.log(`\nCenário: porta de entrada ligada, usuário "${USER}"`);
  console.log(`DATA_DIR isolado: ${sandboxDir}\n`);
  console.log(lines.join('\n'));
  console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
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
