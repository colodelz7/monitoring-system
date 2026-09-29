import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('leituras');

const DIR = path.join(config.storage.dataDir, 'readings');

/**
 * Serie historica das leituras do painel.
 *
 * O sistema buscava, mostrava e esquecia: so o alerta disparado virava
 * registro. Guardando cada leitura, o painel passa a acumular historico
 * proprio, de graca, sem depender da API paga de dados passados. E isso que
 * permite responder "como estava ha uma semana", comparar com a media e
 * desenhar qualquer janela maior que as 48 horas da previsao.
 *
 * Um arquivo por dia, em NDJSON. A escolha repete a do historico de alertas
 * pelos mesmos motivos: append em uma chamada, linha truncada por queda de
 * energia e descartada sozinha na leitura, e o descarte do que envelheceu vira
 * apagar arquivo em vez de reescrever base. Ler "os ultimos 7 dias" abre 7
 * arquivos pequenos em vez de varrer um arquivo unico que so cresce.
 */

// Intervalo minimo entre duas gravacoes da mesma cidade. Sem isso, um painel
// atualizando a cada 10 segundos escreveria mais de oito mil linhas por dia
// para dizer praticamente a mesma coisa.
const MIN_INTERVAL_MS = num(process.env.READINGS_MIN_INTERVAL_MS, 10 * 60 * 1000);

// Quanto tempo o historico e mantido. Um ano e alguns dias, para a janela de
// 365 dias nunca esbarrar na borda do que foi apagado.
const RETENTION_DAYS = num(process.env.READINGS_RETENTION_DAYS, 400);

// Aceita zero como valor legitimo. Com 'Number(x) || padrao', definir o
// intervalo como 0 para gravar todo ciclo caia no padrao em silencio.
function num(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Agregado de um dia ja fechado nunca muda.
 *
 * Sem este cache, pedir um ano abria trezentos e sessenta e cinco arquivos e
 * analisava dezenas de milhares de linhas a cada requisicao, sempre chegando
 * ao mesmo resultado para todos os dias menos o de hoje. A chave inclui a
 * cidade e o dia, e so o dia corrente fica de fora, porque e o unico que ainda
 * recebe leitura.
 *
 * O teto existe para o cache nao virar um vazamento lento de memoria em um
 * processo que fica meses no ar: vinte cidades por um ano cabem, alem disso o
 * mais antigo sai.
 */
const MAX_DIAS_EM_CACHE = 8000;
const diasFechados = new Map();

function guardarDiaFechado(chave, resumo) {
  if (diasFechados.size >= MAX_DIAS_EM_CACHE) {
    const maisAntigo = diasFechados.keys().next().value;
    if (maisAntigo !== undefined) diasFechados.delete(maisAntigo);
  }
  diasFechados.set(chave, resumo);
}

const lastWriteByCity = new Map();
let writeQueue = Promise.resolve();
let lastPrune = 0;

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function fileFor(key) {
  return path.join(DIR, `${key}.ndjson`);
}

function round(value, digits = 1) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : null;
}

async function ensureDir() {
  await fsp.mkdir(DIR, { recursive: true }).catch(() => {});
}

/**
 * Guarda a leitura atual de uma cidade.
 *
 * Silencioso por natureza: e efeito colateral de servir o painel, entao uma
 * falha aqui nunca pode derrubar a resposta de quem pediu os dados.
 */
export async function record({ city, weather, airQuality }) {
  if (!city || !weather?.success || weather.mock) return null;

  const now = Date.now();
  const last = lastWriteByCity.get(city) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return null;
  lastWriteByCity.set(city, now);

  const reading = {
    at: new Date(now).toISOString(),
    city,
    temp: round(weather.temp),
    feels: round(weather.feels_like),
    tempMin: round(weather.temp_min),
    tempMax: round(weather.temp_max),
    humidity: round(weather.humidity, 0),
    pressure: round(weather.pressure, 0),
    wind: round(weather.wind_speed),
    windDeg: round(weather.wind_deg, 0),
    sky: weather.description ?? null,
    aqi: airQuality?.success ? airQuality.aqi : null,
  };

  writeQueue = writeQueue
    .then(async () => {
      await ensureDir();
      await fsp.appendFile(fileFor(dayKey(new Date(now))), `${JSON.stringify(reading)}\n`, 'utf8');
    })
    .catch((error) => log.warn(`falha ao gravar leitura: ${error.message}`));

  await writeQueue;
  await maybePrune();
  return reading;
}

/** Apaga os arquivos que passaram do tempo de retencao, no maximo uma vez por hora. */
async function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 3600_000) return;
  lastPrune = now;

  const limite = dayKey(new Date(now - RETENTION_DAYS * 86400000));
  const nomes = await fsp.readdir(DIR).catch(() => []);

  for (const nome of nomes) {
    if (!nome.endsWith('.ndjson')) continue;
    if (nome.slice(0, 10) >= limite) continue;
    await fsp.rm(path.join(DIR, nome), { force: true }).catch(() => {});
  }
}

function parseLines(raw) {
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // Linha truncada por escrita interrompida. Descartar uma nao invalida o resto.
    }
  }
  return out;
}

function daysBetween(from, to) {
  const keys = [];
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor <= to) {
    keys.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/**
 * Leituras de uma cidade dentro de um intervalo, em ordem cronologica.
 */
export async function series(city, { from, to = new Date() } = {}) {
  if (!city || !from) return [];
  if (!fs.existsSync(DIR)) return [];

  const alvo = String(city).toLowerCase();
  const encontradas = [];

  for (const key of daysBetween(from, to)) {
    const raw = await fsp.readFile(fileFor(key), 'utf8').catch(() => '');
    if (!raw) continue;
    for (const item of parseLines(raw)) {
      if (String(item.city).toLowerCase() !== alvo) continue;
      const quando = new Date(item.at);
      if (quando >= from && quando <= to) encontradas.push(item);
    }
  }

  encontradas.sort((a, b) => new Date(a.at) - new Date(b.at));
  return encontradas;
}

function resumoDe(itens, campo) {
  const valores = itens.map((i) => i[campo]).filter((v) => Number.isFinite(v));
  if (!valores.length) return null;
  const soma = valores.reduce((a, b) => a + b, 0);
  return {
    min: round(Math.min(...valores)),
    max: round(Math.max(...valores)),
    media: round(soma / valores.length),
    amostras: valores.length,
  };
}

/**
 * Agregado por dia, que e o recorte util para janelas longas: sete dias de
 * leituras a cada dez minutos sao mil pontos, e nenhum grafico precisa disso.
 */
function resumirDia(dia, itens) {
  return {
    dia,
    temperatura: resumoDe(itens, 'temp'),
    umidade: resumoDe(itens, 'humidity'),
    pressao: resumoDe(itens, 'pressure'),
    vento: resumoDe(itens, 'wind'),
    aqi: resumoDe(itens, 'aqi'),
    amostras: itens.length,
  };
}

export async function daily(city, { days = 7 } = {}) {
  const to = new Date();
  const hoje = dayKey(to);
  const alvo = String(city ?? '').toLowerCase();

  const from = new Date(to.getTime() - days * 86400000);
  const chaves = daysBetween(from, to);

  // Dias ja fechados saem do cache; so os que faltam vao ao disco. Numa janela
  // de um ano isso troca centenas de leituras de arquivo por uma.
  const pendentes = chaves.filter((dia) => dia === hoje || !diasFechados.has(`${alvo}|${dia}`));

  const porDia = new Map();

  if (pendentes.length) {
    const inicio = new Date(`${pendentes[0]}T00:00:00.000Z`);
    const leituras = await series(city, { from: inicio, to });

    for (const leitura of leituras) {
      const key = leitura.at.slice(0, 10);
      if (!porDia.has(key)) porDia.set(key, []);
      porDia.get(key).push(leitura);
    }
  }

  const resultado = [];

  for (const dia of chaves) {
    const chave = `${alvo}|${dia}`;

    if (dia !== hoje && diasFechados.has(chave)) {
      resultado.push(diasFechados.get(chave));
      continue;
    }

    const itens = porDia.get(dia);
    if (!itens?.length) continue;

    const resumo = resumirDia(dia, itens);
    // Só o que já fechou entra no cache. O dia corrente ainda recebe leitura.
    if (dia !== hoje) guardarDiaFechado(chave, resumo);
    resultado.push(resumo);
  }

  return resultado.sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Estado do armazenamento, para a rota de diagnostico. */
export async function readingStats() {
  if (!fs.existsSync(DIR)) return { dias: 0, cidades: 0, primeiroDia: null };
  const nomes = (await fsp.readdir(DIR).catch(() => [])).filter((n) => n.endsWith('.ndjson')).sort();
  return {
    dias: nomes.length,
    primeiroDia: nomes[0]?.slice(0, 10) ?? null,
    ultimoDia: nomes.at(-1)?.slice(0, 10) ?? null,
    intervaloMinutos: Math.round(MIN_INTERVAL_MS / 60000),
    retencaoDias: RETENTION_DAYS,
  };
}

export const READINGS_DIR = DIR;
