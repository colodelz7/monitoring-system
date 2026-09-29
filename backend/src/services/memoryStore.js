import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('memoria');

const FILE = path.join(config.storage.dataDir, 'assistant-memory.json');

/**
 * Fatos estaveis que o assistente aprendeu sobre quem usa o painel.
 *
 * Sem isto, cada conversa comeca do zero: dizer "moro em Campo Magro" numa
 * sessao nao valia nada na seguinte. Guardar no servidor e nao no navegador e
 * deliberado, porque o painel agora e acessivel de outra maquina e a memoria
 * deve acompanhar a pessoa, nao o aparelho.
 *
 * Nao ha conta de usuario neste sistema: a memoria e do painel, e quem tem a
 * senha ve as mesmas anotacoes. Para um painel pessoal isso e o esperado, e
 * esta escrito no README para nao ser surpresa.
 */

const MAX_FATOS = 40;
const MAX_TAMANHO = 200;

let cache = null;

async function carregar() {
  if (cache) return cache;

  try {
    const raw = await fsp.readFile(FILE, 'utf8');
    const lido = JSON.parse(raw);
    cache = Array.isArray(lido?.fatos) ? lido.fatos : [];
  } catch {
    // Arquivo ausente na primeira execucao, ou ilegivel. Comecar vazio e
    // melhor que impedir o assistente de funcionar.
    cache = [];
  }

  return cache;
}

async function gravar() {
  await fsp.mkdir(config.storage.dataDir, { recursive: true }).catch(() => {});
  await fsp
    .writeFile(FILE, JSON.stringify({ fatos: cache, atualizadoEm: new Date().toISOString() }, null, 1), 'utf8')
    .catch((error) => log.warn(`nao consegui gravar a memoria: ${error.message}`));
}

/** Os fatos conhecidos, do mais antigo para o mais recente. */
export async function lembrar() {
  return [...(await carregar())];
}

/**
 * Guarda um fato novo.
 *
 * Fatos parecidos nao se acumulam: comparar sem acento e sem caixa evita que
 * "Mora em Curitiba" e "mora em curitiba" virem duas anotacoes.
 */
export async function anotar(texto) {
  const fato = String(texto ?? '').trim().slice(0, MAX_TAMANHO);
  if (fato.length < 4) return null;

  const fatos = await carregar();
  const chave = fato.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  if (fatos.some((f) => f.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === chave)) {
    return null;
  }

  fatos.push(fato);
  // O teto descarta o mais antigo, para a instrucao de sistema nao crescer sem
  // fim e acabar ocupando mais espaco que a propria conversa.
  if (fatos.length > MAX_FATOS) fatos.splice(0, fatos.length - MAX_FATOS);

  cache = fatos;
  await gravar();
  log.info(`anotado: ${fato}`);
  return fato;
}

/** Apaga tudo que foi aprendido. */
export async function esquecer() {
  const quantos = (await carregar()).length;
  cache = [];
  await gravar();
  return quantos;
}

export async function memoryStats() {
  return { fatos: (await carregar()).length, arquivo: fs.existsSync(FILE) };
}
