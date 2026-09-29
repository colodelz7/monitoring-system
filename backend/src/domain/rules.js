import { randomUUID } from 'node:crypto';
import { CHAVES_METRICA, METRICAS, OPERADORES, SIMBOLO_OPERADOR, formatarValor, rotuloDe } from './metrics.js';
import { ValidationError, sanitizeCity, sanitizeQuery } from './validation.js';

/**
 * Regras de alerta definidas por quem usa o sistema.
 *
 * Os limites embutidos respondem uma pergunta so: "esta quente demais ou frio
 * demais". Muita coisa que importa nao cabe nisso. Calor com umidade alta e
 * abafado de um jeito que 30 graus secos nao sao, e pressao caindo junto com
 * umidade subindo e frente chegando. Nenhuma das duas e expressavel com um
 * slider de temperatura.
 *
 * Dois formatos cobrem o que faltava:
 *
 * - `valor`, que combina condicoes sobre a leitura atual e dispara quando
 *   todas valem ao mesmo tempo. O "e" e proposital: "ou" se escreve criando
 *   duas regras, e deixar as duas coisas no mesmo lugar tornaria a leitura da
 *   regra ambigua sem ganhar nada.
 *
 * - `variacao`, que olha o quanto a metrica andou dentro de uma janela. Limite
 *   fixo nunca pega frente fria: cair de 28 para 18 graus em tres horas nao
 *   cruza nenhuma linha, e e exatamente o que faz diferenca para quem esta la
 *   fora.
 */

export const TIPOS_REGRA = Object.freeze(['valor', 'variacao']);
export const DIRECOES = Object.freeze(['sobe', 'cai', 'qualquer']);
export const SEVERIDADES = Object.freeze(['warning', 'danger']);

export const LIMITES_REGRA = Object.freeze({
  maxRegras: 40,
  maxCondicoes: 4,
  nomeMaxChars: 60,
  janelaMinHoras: 1,
  janelaMaxHoras: 48,
});

function erro(mensagem, campo) {
  throw new ValidationError(mensagem, campo);
}

function numeroNaFaixa(valor, { min, max }, campo) {
  const parsed = Number.parseFloat(valor);
  if (!Number.isFinite(parsed)) erro(`${campo} precisa ser um número.`, campo);
  if (parsed < min || parsed > max) erro(`${campo} precisa estar entre ${min} e ${max}.`, campo);
  return parsed;
}

function normalizarCondicao(bruta, indice) {
  const campo = `condicoes[${indice}]`;
  if (!bruta || typeof bruta !== 'object') erro(`${campo} está vazia.`, campo);

  const metrica = String(bruta.metrica ?? '');
  if (!CHAVES_METRICA.includes(metrica)) {
    erro(`Métrica desconhecida em ${campo}. Use uma de: ${CHAVES_METRICA.join(', ')}.`, campo);
  }

  const operador = String(bruta.operador ?? '');
  if (!Object.hasOwn(OPERADORES, operador)) {
    erro(`Operador inválido em ${campo}. Use >, >=, < ou <=.`, campo);
  }

  const valor = numeroNaFaixa(bruta.valor, METRICAS[metrica], `${campo}.valor`);
  return { metrica, operador, valor };
}

/**
 * Valida e normaliza uma regra vinda do cliente ou do assistente.
 *
 * Toda regra que entra passa por aqui, inclusive as que o modelo cria: o
 * assistente e um cliente como outro qualquer, e uma regra malformada dele
 * quebraria a avaliacao do painel inteiro no proximo ciclo.
 */
export function normalizarRegra(bruta, { existente = null } = {}) {
  if (!bruta || typeof bruta !== 'object') erro('Envie os dados da regra.');

  const base = existente ?? {};

  const nome = sanitizeQuery(bruta.nome ?? base.nome, { maxLength: LIMITES_REGRA.nomeMaxChars });
  if (!nome) erro('Dê um nome para a regra.', 'nome');

  const tipo = String(bruta.tipo ?? base.tipo ?? 'valor');
  if (!TIPOS_REGRA.includes(tipo)) erro(`Tipo inválido. Use ${TIPOS_REGRA.join(' ou ')}.`, 'tipo');

  const severidade = String(bruta.severidade ?? base.severidade ?? 'warning');
  if (!SEVERIDADES.includes(severidade)) erro('Gravidade inválida. Use warning ou danger.', 'severidade');

  // Cidade vazia quer dizer "qualquer cidade". Passa pelo mesmo saneamento dos
  // nomes que viram URL de terceiros, ainda que aqui so sirva para comparar.
  const cidadeBruta = bruta.cidade ?? base.cidade ?? '';
  const cidade = cidadeBruta ? sanitizeCity(cidadeBruta, '') : '';

  const ativa = bruta.ativa == null ? (base.ativa ?? true) : Boolean(bruta.ativa);

  const regra = {
    id: existente?.id ?? randomUUID(),
    nome,
    tipo,
    severidade,
    cidade: cidade || null,
    ativa,
    criadaEm: existente?.criadaEm ?? new Date().toISOString(),
    atualizadaEm: new Date().toISOString(),
  };

  if (tipo === 'valor') {
    const lista = bruta.condicoes ?? base.condicoes;
    if (!Array.isArray(lista) || !lista.length) erro('Uma regra de valor precisa de pelo menos uma condição.', 'condicoes');
    if (lista.length > LIMITES_REGRA.maxCondicoes) {
      erro(`No máximo ${LIMITES_REGRA.maxCondicoes} condições por regra.`, 'condicoes');
    }
    regra.condicoes = lista.map(normalizarCondicao);

    // Duas condicoes sobre a mesma metrica costumam ser engano de digitacao e,
    // quando nao sao, uma anula a outra e a regra nunca dispara.
    const metricas = regra.condicoes.map((c) => c.metrica);
    if (new Set(metricas).size !== metricas.length) {
      erro('Cada métrica pode aparecer uma vez só na mesma regra.', 'condicoes');
    }
  } else {
    const fonte = bruta.variacao ?? base.variacao ?? {};
    const metrica = String(fonte.metrica ?? '');
    if (!CHAVES_METRICA.includes(metrica)) erro('Escolha a métrica que deve variar.', 'variacao.metrica');

    const direcao = String(fonte.direcao ?? 'qualquer');
    if (!DIRECOES.includes(direcao)) erro(`Direção inválida. Use ${DIRECOES.join(', ')}.`, 'variacao.direcao');

    const spec = METRICAS[metrica];
    const delta = numeroNaFaixa(fonte.delta, { min: 0.1, max: spec.max - spec.min }, 'variacao.delta');
    const janelaHoras = numeroNaFaixa(
      fonte.janelaHoras,
      { min: LIMITES_REGRA.janelaMinHoras, max: LIMITES_REGRA.janelaMaxHoras },
      'variacao.janelaHoras',
    );

    regra.variacao = { metrica, direcao, delta, janelaHoras };
  }

  return regra;
}

function descreverCondicao({ metrica, operador, valor }) {
  return `${rotuloDe(metrica)} ${SIMBOLO_OPERADOR[operador]} ${formatarValor(metrica, valor)}`;
}

/** Texto legivel da regra, usado na interface e na resposta do assistente. */
export function descreverRegra(regra) {
  if (regra.tipo === 'variacao') {
    const { metrica, direcao, delta, janelaHoras } = regra.variacao;
    const verbo = direcao === 'sobe' ? 'subir' : direcao === 'cai' ? 'cair' : 'variar';
    return `${rotuloDe(metrica)} ${verbo} ${formatarValor(metrica, delta)} em ${janelaHoras}h`;
  }
  return regra.condicoes.map(descreverCondicao).join(' e ');
}

/**
 * Variacao de uma metrica dentro da janela.
 *
 * A referencia e a leitura mais antiga dentro da janela, nao o extremo. A
 * diferenca importa: com o extremo, uma queda que ja se recuperou continuaria
 * disparando alerta depois de a condicao ter passado. Com a leitura mais
 * antiga, a regra responde "onde estava contra onde esta", que e o que a frase
 * "caiu 8 graus em 3 horas" quer dizer.
 */
export function variacaoNaJanela(serie, metrica, janelaHoras, agora = Date.now()) {
  const campo = METRICAS[metrica]?.leitura;
  if (!campo) return null;

  const inicio = agora - janelaHoras * 3600000;
  const dentro = serie
    .filter((leitura) => Number.isFinite(leitura?.[campo]))
    .filter((leitura) => {
      const quando = new Date(leitura.at).getTime();
      return Number.isFinite(quando) && quando >= inicio && quando <= agora;
    });

  // Um ponto so nao e variacao: sem referencia anterior nao ha de onde medir.
  if (dentro.length < 2) return null;

  const referencia = dentro[0];
  const atual = dentro.at(-1);
  const valores = dentro.map((l) => l[campo]);

  return {
    referencia: referencia[campo],
    atual: atual[campo],
    delta: Number((atual[campo] - referencia[campo]).toFixed(2)),
    de: referencia.at,
    ate: atual.at,
    amostras: dentro.length,
    min: Math.min(...valores),
    max: Math.max(...valores),
  };
}

/**
 * Avalia uma regra e devolve o que disparou, ou null.
 *
 * Nao monta o alerta: devolve os dados do disparo e deixa a montagem para o
 * servico de alertas, que e quem sabe o formato do historico.
 */
export function avaliarRegra(regra, { cidade, valores, serie = [], agora = Date.now() }) {
  if (!regra?.ativa) return null;

  // Regra presa a uma cidade so vale naquela cidade. A comparacao ignora caixa
  // porque o nome chega do cliente do jeito que a pessoa digitou.
  if (regra.cidade && String(regra.cidade).toLowerCase() !== String(cidade ?? '').toLowerCase()) return null;

  if (regra.tipo === 'valor') {
    const medidas = [];

    for (const condicao of regra.condicoes) {
      const valor = valores?.[condicao.metrica];
      // Metrica sem leitura no ciclo atual nao conta como condicao satisfeita.
      // Silencio nao e confirmacao.
      if (!Number.isFinite(valor)) return null;
      if (!OPERADORES[condicao.operador](valor, condicao.valor)) return null;
      medidas.push({ ...condicao, valorMedido: valor });
    }

    const principal = medidas[0];
    const descricao = medidas
      .map((m) => `${rotuloDe(m.metrica)} em ${formatarValor(m.metrica, m.valorMedido)}`)
      .join(', ');

    return {
      regra,
      metrica: principal.metrica,
      valor: principal.valorMedido,
      limite: principal.valor,
      comparador: principal.operador,
      unidade: METRICAS[principal.metrica].unidade,
      detalhe: medidas,
      mensagem: `${regra.nome}: ${descricao}.`,
    };
  }

  const { metrica, direcao, delta, janelaHoras } = regra.variacao;
  const movimento = variacaoNaJanela(serie, metrica, janelaHoras, agora);
  if (!movimento) return null;

  const andou = direcao === 'cai' ? -movimento.delta : direcao === 'sobe' ? movimento.delta : Math.abs(movimento.delta);
  if (andou < delta) return null;

  const sentido = movimento.delta > 0 ? 'subiu' : 'caiu';
  const de = formatarValor(metrica, movimento.referencia);
  const para = formatarValor(metrica, movimento.atual);

  return {
    regra,
    metrica,
    valor: movimento.atual,
    limite: delta,
    comparador: '>=',
    unidade: METRICAS[metrica].unidade,
    detalhe: movimento,
    mensagem:
      `${regra.nome}: ${rotuloDe(metrica)} ${sentido} ${formatarValor(metrica, Math.abs(movimento.delta))} `
      + `em ${janelaHoras}h, de ${de} para ${para}.`,
  };
}
