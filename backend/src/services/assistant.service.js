import { config } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { alertStore } from './alertStore.js';
import { getDashboard } from './dashboard.service.js';
import { getAirQuality } from './airQuality.service.js';
import { getWeather } from './weather.service.js';
import { sanitizeCity } from '../domain/validation.js';
import { compareCities } from './compare.service.js';
import { anotar, lembrar } from './memoryStore.js';
import { LIMITS } from '../domain/validation.js';
import { CHAVES_METRICA, METRICAS } from '../domain/metrics.js';
import { detectarAnomalia } from '../domain/anomaly.js';
import { daily as dailyReadings } from './readingStore.js';
import { criar as criarRegra, listar as listarRegras } from './rulesStore.js';

const log = createLogger('assistente');

/** Nome do campo de cada metrica dentro do agregado diario do historico. */
const CAMPO_DIARIO = Object.freeze({
  temp: 'temperatura',
  humidity: 'umidade',
  pressure: 'pressao',
  wind: 'vento',
  aqi: 'aqi',
});

/**
 * Menor variacao acumulada que ainda merece ser chamada de tendencia.
 *
 * Sem este piso, meio grau de diferenca em duas semanas viraria "esquentando",
 * o que e ler sinal em ruido e faz o assistente soar confiante sobre nada.
 */
const RUIDO_TENDENCIA = Object.freeze({
  temp: 1.5,
  humidity: 5,
  pressure: 3,
  wind: 1,
  aqi: 0.5,
});

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Uma consulta e a resposta. Mais que isso seria o modelo em laço.
const MAX_TOOL_ROUNDS = 3;

const PERSONA = `
Você é o ColodelBot, o assistente do MONITORING SYSTEM, um painel de
monitoramento ambiental em tempo real. Fala português do Brasil, é direto e
cordial, e não enrola.

Você tem acesso ao estado real do sistema, que chega no bloco de contexto
abaixo. Sempre que a pergunta puder ser respondida com esses dados, use os
números de lá e cite a unidade. Nunca invente medição, horário ou limite: se o
dado não estiver no contexto, diga que não está e explique onde a pessoa
encontra na interface.

Quando perguntarem sobre uma cidade diferente da que está no painel, não mande
a pessoa trocar a cidade na barra lateral: use a ferramenta consultar_cidade
para buscar a leitura dessa cidade e responda com o número. A ferramenta serve
para qualquer cidade do mundo, inclusive as pequenas.

Para perguntas sobre o que está subindo, caindo ou fora do normal, use
consultar_tendencia em vez de olhar só o valor do momento: o contexto é um
instante, e um instante não diz para onde as coisas estão indo.

Quando pedirem para ser avisados de alguma condição, use criar_regra. Antes de
criar, repita em uma frase o que entendeu, com a métrica, o valor e a janela.
Se a criação for recusada, explique o motivo que voltou e proponha um ajuste.
Nunca diga que criou uma regra sem que a ferramenta tenha confirmado.

Você também responde perguntas gerais que não sejam sobre o sistema. Nesse caso
deixe claro que a resposta não vem dos dados do painel.

Respostas curtas, no máximo dois ou três parágrafos, a menos que peçam
detalhe. Pode usar markdown simples: negrito, listas e blocos de código.
Não use travessão em nenhum texto.

Se, e somente se, a pessoa contar algo estável sobre ela mesma que valha
lembrar em outra conversa, como onde mora, qual cidade acompanha sempre, o que
faz ou uma preferência duradoura, acrescente ao final da resposta, em uma linha
própria, exatamente neste formato:
[[MEM: o fato em uma frase curta]]
No máximo uma por resposta. Nunca explique nem mencione essa linha. Não use
para pedido pontual nem para pergunta única.
`.trim();

const GUIA = `
Como o sistema funciona, para quando perguntarem:

- O painel mostra temperatura, umidade, vento, pressão, qualidade do ar e
  contagem de eventos sísmicos da cidade escolhida, e atualiza sozinho no
  intervalo configurado na barra lateral.
- O mapa sísmico traz os eventos das últimas 24 horas ou dos últimos 7 dias
  sobre um globo. Dá para filtrar por faixa de magnitude clicando na legenda,
  alternar entre globo e mapa plano, e voar até a cidade atual.
- A aba Comparar coloca duas cidades lado a lado e marca o melhor valor de
  cada métrica.
- A aba Alertas lista o que está disparado agora. A aba Histórico guarda a
  trilha de tudo que já disparou, com valor medido, limite ultrapassado,
  filtros por tipo, cidade, gravidade e período, e busca por texto.
- Os limites de alerta ficam na barra lateral: temperatura mínima, máxima e
  magnitude sísmica. Eles mudam o que aparece no painel. O envio de e-mail usa
  limites próprios do servidor, que o cliente não controla.
- Além desses limites existem regras criadas por quem usa, na aba Regras. Uma
  regra de valor combina condições que precisam valer ao mesmo tempo, como
  temperatura acima de 30 com umidade acima de 80. Uma regra de variação
  dispara quando a métrica anda muito dentro de uma janela, como cair 8 graus
  em 3 horas, que é o tipo de coisa que limite fixo nunca pega.
- O sistema também avisa sozinho quando o dia está fora do normal daquela
  cidade, comparando com os últimos 30 dias gravados. Isso não precisa ser
  configurado, mas só começa a valer depois de umas duas semanas de histórico.
- A aba Semana mostra a previsão de 7 dias. As primeiras 48 horas vêm da
  OpenWeatherMap e os 7 dias da Open-Meteo.
- A barra lateral também guarda uma lista de cidades acompanhadas, que aparecem
  com a temperatura atual sem precisar trocar o painel de cidade.
- Dados de clima e qualidade do ar vêm da OpenWeatherMap, sismos do USGS e os
  tiles do mapa da Stadia Maps.
`.trim();

function round(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

/**
 * Monta o retrato do sistema que vai junto com a pergunta.
 *
 * É isso que separa um chat genérico de um assistente que conhece o painel: ele
 * recebe a leitura atual da cidade que está na tela, os alertas disparados com
 * valor e limite, e o resumo do histórico. Tudo é lido pelos mesmos serviços que
 * alimentam a interface, então o que o bot afirma é o que a pessoa está vendo,
 * e não uma segunda fonte que pode divergir.
 */
export async function buildContext({ city, period, thresholds }) {
  const snapshot = { geradoEm: new Date().toISOString() };

  try {
    const dashboard = await getDashboard({ city, period, thresholds });
    const weather = dashboard.weather ?? {};
    const aqi = dashboard.aqi ?? {};

    snapshot.cidade = {
      nome: weather.resolvedName || dashboard.city || city,
      horaLocal: dashboard.cityTime ?? null,
      dadosSimulados: Boolean(dashboard.isMock),
      servidoDeCache: Boolean(dashboard.isCached),
    };

    snapshot.climaAgora = {
      temperaturaC: round(weather.temp),
      sensacaoC: round(weather.feels_like),
      minimaC: round(weather.temp_min),
      maximaC: round(weather.temp_max),
      umidadePct: weather.humidity ?? null,
      ventoMs: round(weather.wind_speed),
      direcaoVento: weather.windCompass ?? null,
      pressaoHpa: weather.pressure ?? null,
      descricao: weather.description ?? null,
      observadoEm: weather.observedAt ?? null,
    };

    snapshot.qualidadeDoAr = {
      indice: aqi.aqi ?? null,
      classificacao: aqi.label ?? null,
      pm25: round(aqi.pm2_5, 2),
      pm10: round(aqi.pm10, 2),
    };

    const previsao = Array.isArray(dashboard.forecast?.points) ? dashboard.forecast.points : [];
    snapshot.previsao = previsao.slice(0, 8).map((point) => ({
      quando: point.datetime,
      temperaturaC: round(point.temp),
      chuvaMm: round(point.rain, 2),
      descricao: point.description,
    }));

    snapshot.sismos = {
      periodo: period === 'week' ? 'últimos 7 dias' : 'últimas 24 horas',
      total: dashboard.seismic?.summary?.total ?? 0,
      fortes: dashboard.seismic?.summary?.strong ?? 0,
      emAlerta: dashboard.seismic?.summary?.alert ?? 0,
      leves: dashboard.seismic?.summary?.mild ?? 0,
      maiores: (dashboard.seismic?.geojson?.features ?? [])
        .slice(0, 5)
        .map((f) => ({
          magnitude: f.properties?.magnitude,
          local: f.properties?.place,
          quando: f.properties?.time,
          profundidadeKm: f.properties?.depth,
        })),
    };

    // Sete dias a frente. O bloco `previsao` acima cobre so 48 horas, entao
    // sem isto o assistente respondia "nao tenho" para qualquer pergunta sobre
    // o fim da semana.
    const semana = Array.isArray(dashboard.weekly?.dias) ? dashboard.weekly.dias : [];
    snapshot.previsaoDaSemana = {
      simulada: Boolean(dashboard.weekly?.mock),
      resumo: dashboard.weekly?.resumo?.texto ?? null,
      dias: semana.map((d) => ({
        dia: d.dia,
        minimaC: d.minima,
        maximaC: d.maxima,
        chuvaMm: d.chuva,
        chanceDeChuvaPct: d.chanceDeChuva,
        ceu: d.ceu,
      })),
    };

    snapshot.comparacaoComHistorico = dashboard.trend
      ? {
        diasObservados: dashboard.trend.diasObservados,
        mediaDe7DiasC: dashboard.trend.media7,
        diferencaParaMedia: dashboard.trend.diferenca,
        resumo: dashboard.trend.resumo,
        recordes: dashboard.trend.recordes,
      }
      : null;

    // O que esta fora do padrao desta cidade hoje. Vai mesmo quando nao ha
    // achado, para o assistente poder dizer "nada fora do normal" com base em
    // algo, e distinguir isso de "ainda nao da para saber".
    snapshot.foraDoNormal = dashboard.anomalia?.disponivel
      ? { baseDeDias: dashboard.anomalia.diasObservados, achados: dashboard.anomalia.achados }
      : {
        indisponivel: true,
        diasGravados: dashboard.anomalia?.diasObservados ?? 0,
        diasNecessarios: dashboard.anomalia?.diasMinimos ?? null,
      };

    snapshot.limitesAtivos = dashboard.thresholds ?? thresholds ?? null;
    snapshot.statusDoPainel = dashboard.status ?? null;

    snapshot.alertasAtivos = (dashboard.alerts ?? []).map((alert) => ({
      gravidade: alert.severity,
      sensor: alert.sensor,
      metrica: alert.metric,
      valorMedido: alert.value,
      limite: alert.threshold,
      unidade: alert.unit,
      comparador: alert.comparator,
      mensagem: alert.message,
    }));
  } catch (error) {
    log.warn(`contexto do painel indisponível: ${error.message}`);
    snapshot.painelIndisponivel = error.message;
  }

  // As regras ativas entram no contexto para que o assistente saiba o que ja
  // existe. Sem isso ele criaria uma regra igual a uma que ja esta la, e nao
  // conseguiria responder "do que voce ja me avisa".
  try {
    const regras = await listarRegras();
    snapshot.regrasDeAlerta = regras.map((regra) => ({
      id: regra.id,
      nome: regra.nome,
      condicao: regra.descricao,
      tipo: regra.tipo,
      gravidade: regra.severidade,
      cidade: regra.cidade ?? 'qualquer',
      ativa: regra.ativa,
    }));
  } catch (error) {
    log.warn(`regras indisponíveis para o contexto: ${error.message}`);
  }

  try {
    const facets = await alertStore.facets();
    snapshot.historico = {
      totalRegistros: facets.total,
      maisAntigo: facets.oldest,
      maisRecente: facets.newest,
      porSensor: facets.sensors,
      porGravidade: facets.severities,
      cidades: facets.cities?.slice(0, 10),
    };
  } catch (error) {
    log.warn(`facetas do histórico indisponíveis: ${error.message}`);
  }

  return snapshot;
}

/**
 * Ferramenta que o modelo pode acionar sozinho.
 *
 * Sem isso o assistente só enxergava a cidade aberta no painel e respondia
 * "troque a cidade na barra lateral" para qualquer outra, o que é uma recusa
 * inútil: o servidor já sabe consultar qualquer cidade, faltava deixar o
 * modelo pedir. A busca passa pelo mesmo saneamento e pelo mesmo cache das
 * rotas normais, então a ferramenta não abre um caminho paralelo para a API
 * paga nem escapa do rate limit da conversa.
 */
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'consultar_cidade',
        description:
          'Busca a leitura meteorológica atual de qualquer cidade do mundo: temperatura, '
          + 'sensação, mínima, máxima, umidade, vento, pressão, descrição do céu e '
          + 'qualidade do ar. Use sempre que perguntarem sobre uma cidade que não é a '
          + 'que está aberta no painel.',
        parameters: {
          type: 'object',
          properties: {
            cidade: {
              type: 'string',
              description: 'Nome da cidade, opcionalmente com estado ou país. Ex: "Campo Magro", "Porto, Portugal".',
            },
          },
          required: ['cidade'],
        },
      },

      {
        name: 'comparar_cidades',
        description:
          'Compara a leitura atual de duas cidades lado a lado e diz qual leva '
          + 'vantagem em cada métrica. Use quando pedirem comparação, "onde está '
          + 'mais quente", "qual é melhor agora" ou parecido.',
        parameters: {
          type: 'object',
          properties: {
            cidadeA: { type: 'string', description: 'Primeira cidade.' },
            cidadeB: { type: 'string', description: 'Segunda cidade.' },
          },
          required: ['cidadeA', 'cidadeB'],
        },
      },

      {
        name: 'consultar_historico',
        description:
          'Consulta o histórico de alertas já disparados. Serve para perguntas '
          + 'como "quantos alertas de sismo essa semana", "qual foi o alerta mais '
          + 'grave", "o que disparou ontem". Devolve contagem por dia e os '
          + 'registros mais recentes que casarem com o filtro.',
        parameters: {
          type: 'object',
          properties: {
            dias: { type: 'number', description: 'Quantos dias para trás olhar. Padrão 7.' },
            sensor: { type: 'string', description: 'Filtrar por tipo: "clima" ou "sismo".' },
            gravidade: { type: 'string', description: 'Filtrar por gravidade: "danger" ou "warning".' },
            busca: { type: 'string', description: 'Termo livre para procurar na mensagem, cidade ou local.' },
          },
        },
      },

      {
        name: 'consultar_tendencia',
        description:
          'Responde se uma métrica está subindo ou caindo nos últimos dias, usando o '
          + 'histórico que o próprio sistema gravou. Use para perguntas como "está '
          + 'esquentando essa semana", "a umidade caiu", "como foi a temperatura nos '
          + 'últimos 10 dias", "hoje está fora do normal". Devolve a média do período, '
          + 'a inclinação da reta, os extremos e se o valor de hoje é uma anomalia '
          + 'para esta cidade.',
        parameters: {
          type: 'object',
          properties: {
            cidade: { type: 'string', description: 'Cidade a analisar. Padrão: a que está no painel.' },
            metrica: {
              type: 'string',
              description: 'Qual métrica: temp, humidity, pressure, wind ou aqi. Padrão: temp.',
            },
            dias: { type: 'number', description: 'Quantos dias para trás. Padrão 14, máximo 365.' },
          },
        },
      },

      {
        name: 'criar_regra',
        description:
          'Cria uma regra de alerta. Existem dois formatos. O de valor dispara quando '
          + 'todas as condições valem ao mesmo tempo, por exemplo "avise quando passar '
          + 'de 30 graus com umidade acima de 80". O de variação dispara quando a '
          + 'métrica anda muito dentro de uma janela, por exemplo "avise se a '
          + 'temperatura cair 8 graus em 3 horas". Use quando pedirem para ser '
          + 'avisado de alguma condição. Confirme o que entendeu antes de criar.',
        parameters: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Nome curto e descritivo da regra. Obrigatório.' },
            tipo: { type: 'string', description: '"valor" ou "variacao". Padrão: valor.' },
            severidade: { type: 'string', description: '"warning" para atenção, "danger" para crítico. Padrão: warning.' },
            cidade: { type: 'string', description: 'Restringe a regra a uma cidade. Vazio vale para qualquer uma.' },
            condicoes: {
              type: 'array',
              description: 'Para o tipo valor: lista de condições combinadas com "e". No máximo 4, uma por métrica.',
              items: {
                type: 'object',
                properties: {
                  metrica: { type: 'string', description: 'temp, humidity, pressure, wind ou aqi.' },
                  operador: { type: 'string', description: 'Um de: >, >=, < ou <=.' },
                  valor: { type: 'number', description: 'Valor de comparação, na unidade da métrica.' },
                },
                required: ['metrica', 'operador', 'valor'],
              },
            },
            variacao: {
              type: 'object',
              description: 'Para o tipo variacao.',
              properties: {
                metrica: { type: 'string', description: 'temp, humidity, pressure, wind ou aqi.' },
                direcao: { type: 'string', description: '"cai", "sobe" ou "qualquer".' },
                delta: { type: 'number', description: 'Quanto precisa variar, na unidade da métrica.' },
                janelaHoras: { type: 'number', description: 'Em quantas horas, de 1 a 48.' },
              },
            },
          },
          required: ['nome'],
        },
      },

      {
        name: 'ajustar_painel',
        description:
          'Muda o que o painel está mostrando: a cidade, a janela de tempo ou os '
          + 'limites de alerta. Use quando pedirem para trocar ou ajustar algo, '
          + 'por exemplo "muda para São Paulo", "mostra os últimos 7 dias", "sobe '
          + 'o limite de temperatura para 38". Só mude o que foi pedido.',
        parameters: {
          type: 'object',
          properties: {
            cidade: { type: 'string', description: 'Nova cidade a exibir.' },
            periodo: {
              type: 'string',
              description: 'Janela de tempo: day (24h), week (7 dias), month (30 dias), quarter (90 dias) ou year (1 ano).',
            },
            tempMin: { type: 'number', description: 'Limite de temperatura mínima, em graus Celsius.' },
            tempMax: { type: 'number', description: 'Limite de temperatura máxima, em graus Celsius.' },
            magThreshold: { type: 'number', description: 'Limite de magnitude sísmica.' },
          },
        },
      },
    ],
  },
];

async function consultarCidade(nomeBruto) {
  const cidade = sanitizeCity(nomeBruto);
  if (!cidade) return { erro: 'Nome de cidade inválido.' };

  const weather = await getWeather(cidade);
  if (!weather.success) {
    return { erro: `Não encontrei dados para "${cidade}".`, cidade };
  }

  const resultado = {
    cidade: weather.resolvedName || cidade,
    simulado: Boolean(weather.mock),
    temperatura: { valor: weather.temp, unidade: '°C' },
    sensacao: { valor: weather.feels_like, unidade: '°C' },
    minima: { valor: weather.temp_min, unidade: '°C' },
    maxima: { valor: weather.temp_max, unidade: '°C' },
    umidade: { valor: weather.humidity, unidade: '%' },
    vento: { valor: weather.wind_speed, unidade: 'm/s', direcao: weather.windCompass },
    pressao: { valor: weather.pressure, unidade: 'hPa' },
    ceu: weather.description,
    medidoEm: weather.observedAt,
  };

  // A qualidade do ar depende das coordenadas, que só existem se o clima veio.
  if (Number.isFinite(weather.lat) && Number.isFinite(weather.lon)) {
    try {
      const ar = await getAirQuality(weather.lat, weather.lon);
      if (ar?.success) resultado.qualidadeDoAr = { indice: ar.aqi, rotulo: ar.label };
    } catch {
      // Ar é complemento. Sem ele a resposta de clima continua boa.
    }
  }

  return resultado;
}

async function compararCidades(a, b) {
  const cidadeA = sanitizeCity(a);
  const cidadeB = sanitizeCity(b);
  if (!cidadeA || !cidadeB) return { erro: 'Informe duas cidades válidas.' };

  const resultado = await compareCities(cidadeA, cidadeB);

  // O serviço devolve o payload inteiro da tela, com séries de previsão que não
  // cabem numa conversa. Aqui só vai o que responde a pergunta.
  return {
    cidades: resultado.results.map((r) => ({
      cidade: r.city,
      encontrada: r.found,
      temperatura: r.weather?.temp ?? null,
      umidade: r.weather?.humidity ?? null,
      vento: r.weather?.wind_speed ?? null,
      pressao: r.weather?.pressure ?? null,
      ceu: r.weather?.description ?? null,
    })),
    metricas: resultado.metrics,
    veredito: resultado.verdict,
  };
}

async function consultarHistorico(args = {}) {
  const dias = Number.isFinite(args.dias) ? Math.min(Math.max(1, args.dias), 365) : 7;
  const sensor = ['clima', 'sismo'].includes(args.sensor) ? args.sensor : null;
  const gravidade = ['danger', 'warning'].includes(args.gravidade) ? args.gravidade : null;

  const [porDia, resultado] = await Promise.all([
    alertStore.daily({ days: dias }),
    alertStore.query({
      sensor,
      severity: gravidade,
      search: args.busca ? String(args.busca).slice(0, 120) : null,
      from: new Date(Date.now() - dias * 86400000),
      page: 1,
      // Poucos registros de propósito: o modelo precisa de exemplos concretos,
      // não do histórico inteiro dentro do prompt.
      pageSize: 8,
    }),
  ]);

  return {
    janelaDias: dias,
    totalNoPeriodo: resultado.total,
    porDia: porDia.filter((d) => d.total > 0),
    resumo: resultado.stats,
    maisRecentes: resultado.items.map((item) => ({
      quando: item.at,
      sensor: item.sensor,
      gravidade: item.severity,
      cidade: item.city,
      local: item.place,
      medido: item.value,
      limite: item.threshold,
      unidade: item.unit,
      mensagem: item.message,
    })),
  };
}

/**
 * Valida um pedido de mudança no painel.
 *
 * O modelo pede, o servidor decide. A ferramenta nao aplica nada sozinha: ela
 * devolve um pedido ja limpo, e quem aplica e a interface, depois de receber o
 * evento. Assim uma alucinacao do modelo nao consegue mandar o painel para uma
 * cidade inexistente nem colocar um limite fora da faixa segura, que sao as
 * mesmas travas que valem para a query string.
 */
function ajustarPainel(args = {}) {
  const mudancas = {};

  if (args.cidade) {
    const cidade = sanitizeCity(args.cidade);
    if (cidade) mudancas.city = cidade;
  }

  const periodos = ['day', 'week', 'month', 'quarter', 'year'];
  if (periodos.includes(args.periodo)) mudancas.period = args.periodo;

  const dentro = (valor, faixa) =>
    Number.isFinite(valor) && valor >= faixa.min && valor <= faixa.max;

  if (dentro(args.tempMin, LIMITS.tempMin)) mudancas.tempMin = args.tempMin;
  if (dentro(args.tempMax, LIMITS.tempMax)) mudancas.tempMax = args.tempMax;
  if (dentro(args.magThreshold, LIMITS.magThreshold)) mudancas.magThreshold = args.magThreshold;

  if (mudancas.tempMin != null && mudancas.tempMax != null && mudancas.tempMin >= mudancas.tempMax) {
    return { aplicado: false, motivo: 'A mínima precisa ser menor que a máxima.' };
  }

  if (!Object.keys(mudancas).length) {
    return { aplicado: false, motivo: 'Nada reconhecido no pedido, ou os valores estão fora da faixa permitida.' };
  }

  return { aplicado: true, mudancas };
}

/**
 * Tendencia de uma metrica no historico proprio da cidade.
 *
 * O painel responde "quanto esta agora". Esta ferramenta responde "para onde
 * isso esta indo", que o assistente nao tinha como saber: o contexto que ele
 * recebe e um instante, e olhar um instante nunca diz se esta esquentando.
 *
 * A inclinacao vem de uma regressao linear simples sobre as medias diarias.
 * Comparar so o primeiro dia com o ultimo daria a mesma resposta para uma
 * subida constante e para uma semana estavel que teve um dia quente no fim.
 */
async function consultarTendencia(args = {}) {
  const cidade = sanitizeCity(args.cidade);
  const metrica = CHAVES_METRICA.includes(args.metrica) ? args.metrica : 'temp';
  const dias = Math.min(Math.max(Number.parseInt(args.dias, 10) || 14, 3), 365);

  const campo = CAMPO_DIARIO[metrica];
  const historico = await dailyReadings(cidade, { days: dias });
  const pontos = historico.filter((d) => Number.isFinite(d[campo]?.media));

  if (pontos.length < 3) {
    return {
      cidade,
      metrica,
      disponivel: false,
      diasGravados: pontos.length,
      motivo:
        'O sistema ainda não gravou dias suficientes desta cidade para falar de tendência. '
        + 'O histórico começa a ser gravado quando a cidade passa a ser consultada no painel.',
    };
  }

  const valores = pontos.map((d) => d[campo].media);

  // Regressao linear: a inclinacao e a variacao media por dia.
  const n = valores.length;
  const somaX = (n * (n - 1)) / 2;
  const somaY = valores.reduce((a, b) => a + b, 0);
  const somaXY = valores.reduce((soma, y, x) => soma + x * y, 0);
  const somaXX = valores.reduce((soma, _y, x) => soma + x * x, 0);
  const inclinacao = (n * somaXY - somaX * somaY) / (n * somaXX - somaX * somaX);

  const spec = METRICAS[metrica];
  const porDia = Number(inclinacao.toFixed(2));
  const total = Number((inclinacao * (n - 1)).toFixed(1));

  // Abaixo do piso de ruido a reta nao significa nada: e a mesma oscilacao do
  // dia a dia com uma leve sorte de ordenacao.
  const relevante = Math.abs(total) >= (RUIDO_TENDENCIA[metrica] ?? 1);
  const direcao = !relevante ? 'estável' : inclinacao > 0 ? 'subindo' : 'caindo';

  const maior = pontos.reduce((a, b) => (b[campo].max > a[campo].max ? b : a));
  const menor = pontos.reduce((a, b) => (b[campo].min < a[campo].min ? b : a));

  const atual = await getWeather(cidade);
  const valorAtual = atual.success ? METRICAS[metrica].atual(atual, null) : null;
  const anomalia = detectarAnomalia({
    dias: historico.slice(-30),
    valores: { [metrica]: valorAtual },
  });

  return {
    cidade,
    metrica,
    rotulo: spec.label,
    unidade: spec.unidade,
    disponivel: true,
    diasAnalisados: n,
    // Com poucos dias a reta existe, mas nao descreve nada estavel. A ressalva
    // vai junto do resultado para o modelo dizer isso em vez de afirmar uma
    // tendencia com a mesma confianca de quando ha um mes de historico.
    ressalva: n < 7
      ? `Atenção: a base é curta, só ${n} dias gravados. Diga isso na resposta e trate como indício, não como tendência firme.`
      : null,
    direcao,
    variacaoPorDia: porDia,
    variacaoNoPeriodo: total,
    media: Number((somaY / n).toFixed(1)),
    primeiroDia: { dia: pontos[0].dia, valor: pontos[0][campo].media },
    ultimoDia: { dia: pontos.at(-1).dia, valor: pontos.at(-1)[campo].media },
    maiorValor: { dia: maior.dia, valor: maior[campo].max },
    menorValor: { dia: menor.dia, valor: menor[campo].min },
    valorAgora: valorAtual,
    foraDoNormal: anomalia.disponivel ? (anomalia.achados[0] ?? null) : null,
    resumo: relevante
      ? `${spec.label} ${direcao} em ${cidade}: ${Math.abs(total).toFixed(1)}${spec.unidade} em ${n} dias, `
        + `cerca de ${Math.abs(porDia).toFixed(2)}${spec.unidade} por dia.`
      : `${spec.label} estável em ${cidade} nos últimos ${n} dias, em torno de ${(somaY / n).toFixed(1)}${spec.unidade}.`,
  };
}

/**
 * Cria uma regra a pedido do modelo.
 *
 * Passa exatamente pela mesma validacao da rota HTTP. O assistente e um cliente
 * como outro qualquer: se ele alucinar uma metrica ou um valor impossivel, a
 * criacao e recusada com a mesma mensagem que apareceria na tela, e essa
 * recusa volta para o modelo, que consegue corrigir e tentar de novo.
 */
async function criarRegraPeloBot(args = {}) {
  try {
    const regra = await criarRegra(args);
    return {
      criada: true,
      id: regra.id,
      nome: regra.nome,
      descricao: regra.descricao,
      severidade: regra.severidade,
      cidade: regra.cidade ?? 'qualquer cidade',
      aviso: 'A regra já está valendo e será avaliada no próximo ciclo do painel.',
    };
  } catch (error) {
    return {
      criada: false,
      // A mensagem da validacao e escrita para ser lida, entao repassa-la deixa
      // o modelo explicar o problema em vez de dizer so que falhou.
      motivo: error?.message || 'Não consegui criar a regra.',
      campo: error?.field ?? null,
    };
  }
}

async function runTool(call) {
  try {
    switch (call.name) {
      case 'consultar_cidade':
        return await consultarCidade(call.args?.cidade);
      case 'comparar_cidades':
        return await compararCidades(call.args?.cidadeA, call.args?.cidadeB);
      case 'consultar_historico':
        return await consultarHistorico(call.args);
      case 'consultar_tendencia':
        return await consultarTendencia(call.args);
      case 'criar_regra':
        return await criarRegraPeloBot(call.args);
      case 'ajustar_painel':
        return ajustarPainel(call.args);
      default:
        return { erro: `Ferramenta desconhecida: ${call.name}` };
    }
  } catch (error) {
    log.warn(`${call.name} falhou: ${error.message}`);
    return { erro: 'Essa consulta falhou agora.' };
  }
}

function buildSystemInstruction(context, memorias = []) {
  const lembrancas = memorias.length
    ? ['', 'O que você já sabe sobre esta pessoa:', ...memorias.map((m) => `- ${m}`)]
    : [];

  return [
    PERSONA,
    '',
    GUIA,
    ...lembrancas,
    '',
    'Estado atual do sistema, em JSON:',
    '```json',
    JSON.stringify(context, null, 1),
    '```',
  ].join('\n');
}

function toGeminiContents(history, message) {
  const turns = [...history, { role: 'user', text: message }];
  return turns.map((turn) => ({
    role: turn.role === 'bot' || turn.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(turn.text ?? '').slice(0, config.assistant.maxMessageChars) }],
  }));
}

/**
 * Uma rodada de streaming. Devolve o texto emitido e, se houver, o pedido de
 * ferramenta que o modelo fez.
 */
async function streamRound({ contents, context, memorias, onDelta, signal }) {
  const apiKey = config.assistant.apiKey;
  const url = `${BASE_URL}/${config.assistant.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal ?? AbortSignal.timeout(config.assistant.timeoutMs),
    body: JSON.stringify({
      contents,
      tools: TOOLS,
      systemInstruction: { parts: [{ text: buildSystemInstruction(context, memorias) }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 900 },
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    // O corpo do erro pode conter a URL com a chave. Nunca propague para fora.
    log.error(`gemini respondeu ${response.status}: ${detail.slice(0, 1200)}`);
    // 429 do Gemini quase sempre é cota, não instabilidade. Dizer "tente de
    // novo em instantes" nesse caso manda a pessoa insistir num erro que não
    // vai passar sozinho, e some com a única informação acionável.
    const error = new Error(
      response.status === 429
        ? 'O assistente atingiu o limite de uso da API do Gemini. Se for o limite por minuto, aguarde um pouco; se for o diário, ele volta amanhã.'
        : 'O assistente não conseguiu responder agora.',
    );
    error.code = response.status === 429 ? 'COTA' : 'ERRO_UPSTREAM';
    error.status = response.status;
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let functionCall = null;

  const consume = (block) => {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        for (const part of event?.candidates?.[0]?.content?.parts ?? []) {
          if (part?.functionCall) {
            functionCall = part.functionCall;
            continue;
          }
          if (part?.text) {
            text += part.text;
            onDelta?.(part.text);
          }
        }
      } catch {
        // Fragmento inválido não derruba a conversa.
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      consume(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
    }
  }
  if (buffer.trim()) consume(buffer);

  return { text, functionCall };
}

/**
 * Conversa com o Gemini em streaming e entrega os pedaços conforme chegam.
 *
 * O streaming aqui não é enfeite: a resposta leva alguns segundos, e ver o
 * texto aparecendo é a diferença entre parecer travado e parecer vivo.
 *
 * O laço existe porque o modelo pode pedir uma consulta antes de responder,
 * por exemplo o clima de uma cidade que não é a do painel. Nesse caso a
 * ferramenta roda no servidor e a resposta dela volta para o modelo, que então
 * escreve a resposta final. O teto de rodadas evita que uma sequência de
 * chamadas de ferramenta prenda a requisição.
 */
export async function streamAnswer({ message, history = [], context, onDelta, onAction, signal }) {
  if (!config.assistant.apiKey) {
    const error = new Error('Assistente indisponível: GEMINI_API_KEY não configurada no servidor.');
    error.code = 'SEM_CHAVE';
    throw error;
  }

  const contents = toGeminiContents(history, message);
  const memorias = await lembrar().catch(() => []);
  let full = '';
  let agiu = false;

  // Um prazo só para a conversa inteira. Com ferramenta são duas ou três
  // idas ao modelo, e um prazo por ida deixaria a espera sem teto: três
  // rodadas lentas somariam minutos com a pessoa olhando o cursor piscar.
  const prazo = AbortSignal.timeout(config.assistant.timeoutMs);
  const limite = signal ? AbortSignal.any([signal, prazo]) : prazo;

  try {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const { text, functionCall } = await streamRound({ contents, context, memorias, onDelta, signal: limite });
    full += text;

    if (!functionCall) break;

    log.info(`ferramenta ${functionCall.name} pedida pelo modelo`);
    const result = await runTool(functionCall);

    // Mudança no painel não é resposta de texto: é um pedido para a
    // interface executar. Sobe pelo mesmo stream para chegar junto com a
    // explicação que o modelo escreve logo em seguida.
    if (functionCall.name === 'ajustar_painel' && result?.aplicado) {
      onAction?.({ tipo: 'ajustar_painel', mudancas: result.mudancas });
      agiu = true;
    }

    contents.push({ role: 'model', parts: [{ functionCall }] });
    contents.push({
      role: 'user',
      parts: [{ functionResponse: { name: functionCall.name, response: { result } } }],
    });
  }
  } catch (error) {
    // Texto parcial ou ação já executada valem mais que um erro seco: a
    // mudança no painel já aconteceu do lado de cá, e mostrar falha logo
    // depois de obedecer é a pior combinação possível.
    if (!full && !agiu) throw error;
    log.warn(`resposta interrompida, entregando o que já existe: ${error.message}`);
  }

  // A marca de memória é instrução interna e não pode aparecer na conversa.
  // Ela é retirada aqui, no fim, e não a cada pedaço do stream: o marcador
  // chega partido entre pedaços e um filtro por pedaço deixaria restos.
  const encontrado = full.match(/\n?\[\[MEM:\s*(.+?)\s*\]\]\s*$/i);
  if (encontrado) {
    full = full.replace(encontrado[0], '').trimEnd();
    anotar(encontrado[1]).catch(() => {});
  }

  if (!full) {
    if (agiu) return 'Pronto, ajustei o painel.';

    const error = new Error('O assistente respondeu vazio. Verifique o modelo configurado.');
    error.code = 'SEM_TEXTO';
    throw error;
  }

  return full;
}

export function assistantStatus() {
  return {
    enabled: Boolean(config.assistant.apiKey),
    model: config.assistant.apiKey ? config.assistant.model : null,
    maxMessageChars: config.assistant.maxMessageChars,
  };
}
