/**
 * Sobe o sistema no modo publicado: um processo só, servindo a página e a API
 * na mesma origem, pronto para ficar atrás de um proxy reverso.
 *
 * Existe porque a alternativa era uma linha de variáveis de ambiente diferente
 * em cada sistema operacional, e isso é exatamente o tipo de detalhe que se
 * erra quando já faz semanas da última vez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const distDir = path.resolve(backendRoot, '..', 'frontend', 'dist');

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error(
    `\nO build do frontend não existe em ${distDir}.\n` +
      'Rode "npm run build" dentro de frontend/ antes de publicar.\n',
  );
  process.exit(1);
}

process.env.SERVE_STATIC = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Atrás de um proxy reverso é dele que vem o
// IP real de quem chama. Sem isso o rate limit contaria todo mundo como um só.
process.env.TRUST_PROXY = process.env.TRUST_PROXY || 'true';

// A configuração precisa ser lida antes da checagem, senão o valor vindo do
// .env ainda não existe em process.env e o guard acusaria falta de senha em
// quem configurou tudo certo. É o import de env.js que carrega o .env.
const { config } = await import('../src/config/env.js');

// Publicar sem senha deixaria a ponte para as APIs pagas aberta para quem
// descobrisse o endereço. Melhor recusar a subir do que subir desprotegido.
if (!config.access.password) {
  console.error(
    '\nACCESS_PASSWORD não está definida.\n' +
      'O modo publicado expõe a API para fora, e ela consome cota paga.\n' +
      'Defina ACCESS_USER e ACCESS_PASSWORD no backend/.env antes de continuar.\n',
  );
  process.exit(1);
}

await import('../src/server.js');
