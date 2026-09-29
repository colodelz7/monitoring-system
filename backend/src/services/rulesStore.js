import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { ValidationError } from '../domain/validation.js';
import { LIMITES_REGRA, descreverRegra, normalizarRegra } from '../domain/rules.js';

const log = createLogger('regras');

const FILE = path.join(config.storage.dataDir, 'alert-rules.json');

/**
 * Armazenamento das regras de alerta.
 *
 * JSON e nao NDJSON, ao contrario do historico: regra e editada e apagada, nao
 * so acrescentada, e sao dezenas de itens, nao milhares. Um arquivo pequeno
 * reescrito inteiro e o formato certo para esse uso.
 *
 * A escrita passa por arquivo temporario e rename. Reescrever no lugar deixa
 * uma janela em que uma queda no meio da gravacao corrompe o arquivo e leva
 * todas as regras junto; o rename e atomico no sistema de arquivos, entao ou a
 * versao nova esta la inteira, ou a antiga continua intacta.
 *
 * As regras valem para o painel todo, como a memoria do assistente: nao existe
 * conta de usuario aqui, e quem tem a senha ve as mesmas regras.
 */

let cache = null;
let fila = Promise.resolve();

async function carregar() {
  if (cache) return cache;

  try {
    const raw = await fsp.readFile(FILE, 'utf8');
    const lido = JSON.parse(raw);
    const brutas = Array.isArray(lido?.regras) ? lido.regras : [];

    // Cada regra lida do disco volta a passar pela validacao. Um arquivo
    // editado a mao, ou escrito por uma versao anterior do formato, nao pode
    // derrubar a avaliacao do painel no primeiro ciclo.
    cache = brutas
      .map((regra) => {
        try {
          return normalizarRegra(regra, { existente: regra });
        } catch (error) {
          log.warn(`regra ignorada por ser inválida: ${error.message}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    // Primeira execucao, ou arquivo ilegivel. Comecar sem regra e melhor que
    // impedir o painel de responder.
    cache = [];
  }

  return cache;
}

async function gravar() {
  const conteudo = JSON.stringify({ regras: cache, atualizadoEm: new Date().toISOString() }, null, 1);
  const temporario = `${FILE}.${process.pid}.tmp`;

  await fsp.mkdir(config.storage.dataDir, { recursive: true }).catch(() => {});
  await fsp.writeFile(temporario, conteudo, 'utf8');
  await fsp.rename(temporario, FILE);
}

/** Serializa as escritas: duas edicoes simultaneas nao podem se sobrepor. */
function enfileirar(tarefa) {
  const resultado = fila.then(tarefa, tarefa);
  fila = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}

/** Todas as regras, na ordem em que foram criadas. */
export async function listar() {
  const regras = await carregar();
  return regras.map((regra) => ({ ...regra, descricao: descreverRegra(regra) }));
}

/** Só as que estão ligadas, que é o que a avaliação do painel consome. */
export async function ativas() {
  return (await carregar()).filter((regra) => regra.ativa);
}

export async function criar(bruta) {
  const regra = normalizarRegra(bruta);

  return enfileirar(async () => {
    const regras = await carregar();
    if (regras.length >= LIMITES_REGRA.maxRegras) {
      throw new ValidationError(`Limite de ${LIMITES_REGRA.maxRegras} regras atingido. Apague alguma antes de criar outra.`);
    }

    // Nome repetido nao quebra nada, mas duas linhas iguais na tela nao dizem
    // qual e qual, e o alerta gravado fica impossivel de rastrear de volta.
    const chave = regra.nome.toLowerCase();
    if (regras.some((r) => r.nome.toLowerCase() === chave)) {
      throw new ValidationError('Já existe uma regra com esse nome.', 'nome');
    }

    cache = [...regras, regra];
    await gravar();
    log.info(`regra criada: ${regra.nome} (${descreverRegra(regra)})`);
    return { ...regra, descricao: descreverRegra(regra) };
  });
}

export async function atualizar(id, patch) {
  return enfileirar(async () => {
    const regras = await carregar();
    const indice = regras.findIndex((regra) => regra.id === id);
    if (indice < 0) return null;

    const atualizada = normalizarRegra(patch, { existente: regras[indice] });

    const chave = atualizada.nome.toLowerCase();
    if (regras.some((r, i) => i !== indice && r.nome.toLowerCase() === chave)) {
      throw new ValidationError('Já existe uma regra com esse nome.', 'nome');
    }

    cache = regras.map((regra, i) => (i === indice ? atualizada : regra));
    await gravar();
    return { ...atualizada, descricao: descreverRegra(atualizada) };
  });
}

export async function remover(id) {
  return enfileirar(async () => {
    const regras = await carregar();
    const restantes = regras.filter((regra) => regra.id !== id);
    if (restantes.length === regras.length) return false;

    cache = restantes;
    await gravar();
    log.info(`regra removida: ${id}`);
    return true;
  });
}

export async function rulesStats() {
  const regras = await carregar();
  return {
    total: regras.length,
    ativas: regras.filter((r) => r.ativa).length,
    porTipo: {
      valor: regras.filter((r) => r.tipo === 'valor').length,
      variacao: regras.filter((r) => r.tipo === 'variacao').length,
    },
  };
}

/** Usado pelos testes, que precisam de um estado limpo entre cenários. */
export function resetRulesCache() {
  cache = null;
}

export const RULES_FILE = FILE;
