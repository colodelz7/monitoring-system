import { METRICAS, formatarValor, rotuloDe } from './metrics.js';

/**
 * Deteccao de anomalia contra o proprio historico da cidade.
 *
 * Um limite fixo precisa ser escolhido, e escolher bem exige saber como e o
 * lugar: 8 graus e frio comum em Curitiba e evento raro em Belem. Esta
 * verificacao nao pede nada de ninguem. Ela olha os dias ja gravados daquela
 * cidade, calcula o que e normal ali, e avisa quando o dia de hoje sai da
 * faixa. Cidade nova no painel simplesmente nao gera anomalia ate ter historico
 * suficiente, o que e melhor que gerar uma baseada em tres dias.
 *
 * O criterio e o escore padronizado: a quantas vezes o desvio padrao o valor de
 * hoje esta da media. Em uma distribuicao bem comportada, passar de 2,5 acontece
 * em torno de uma vez a cada oitenta dias, que e a frequencia certa para algo
 * que se chama de anomalia.
 */

// Abaixo disso a media nao descreve nada: duas semanas de dados e o minimo para
// que um desvio tenha significado.
const DIAS_MINIMOS = 12;

// Quantos desvios padrao contam como fora do normal.
const ESCORE_LIMITE = 2.5;

/**
 * Piso do desvio padrao, por metrica.
 *
 * Sem ele, uma cidade com clima muito estavel produziria desvio perto de zero e
 * qualquer variacao trivial viraria escore alto. O piso responde "qual e a
 * menor diferenca que ainda merece ser chamada de anomalia nesta grandeza".
 */
const PISO_DESVIO = Object.freeze({
  temp: 1.5,
  humidity: 6,
  pressure: 4,
  wind: 1.5,
});

const OBSERVADAS = Object.freeze(['temp', 'humidity', 'pressure']);

const CAMPO_DIARIO = Object.freeze({
  temp: 'temperatura',
  humidity: 'umidade',
  pressure: 'pressao',
  wind: 'vento',
});

function estatisticas(valores) {
  if (valores.length < 2) return null;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const variancia = valores.reduce((soma, v) => soma + (v - media) ** 2, 0) / (valores.length - 1);
  return { media, desvio: Math.sqrt(variancia) };
}

/**
 * Procura a metrica mais fora do normal hoje.
 *
 * `dias` vem do agregado diario do historico, e `valores` sao as leituras do
 * ciclo atual. Os dias de referencia excluem o de hoje de proposito: comparar o
 * valor de agora com uma media que ja o contem puxa a media na direcao dele e
 * esconde justamente o que se quer detectar.
 */
export function detectarAnomalia({ dias = [], valores = {}, hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const anteriores = dias.filter((d) => d.dia !== hoje);
  if (anteriores.length < DIAS_MINIMOS) {
    return { disponivel: false, diasObservados: anteriores.length, diasMinimos: DIAS_MINIMOS, achados: [] };
  }

  const achados = [];

  for (const metrica of OBSERVADAS) {
    const atual = valores[metrica];
    if (!Number.isFinite(atual)) continue;

    const campo = CAMPO_DIARIO[metrica];
    const historico = anteriores.map((d) => d[campo]?.media).filter(Number.isFinite);

    const stats = estatisticas(historico);
    if (!stats) continue;

    const desvio = Math.max(stats.desvio, PISO_DESVIO[metrica] ?? 1);
    const escore = (atual - stats.media) / desvio;

    if (Math.abs(escore) < ESCORE_LIMITE) continue;

    const acima = escore > 0;
    const spec = METRICAS[metrica];

    achados.push({
      metrica,
      rotulo: rotuloDe(metrica),
      unidade: spec.unidade,
      valor: atual,
      media: Number(stats.media.toFixed(spec.decimais ?? 1)),
      desvio: Number(desvio.toFixed(2)),
      escore: Number(escore.toFixed(2)),
      direcao: acima ? 'acima' : 'abaixo',
      diasObservados: historico.length,
      mensagem:
        `${rotuloDe(metrica)} de ${formatarValor(metrica, atual)} está muito ${acima ? 'acima' : 'abaixo'} `
        + `do normal desta cidade: a média dos últimos ${historico.length} dias é ${formatarValor(metrica, stats.media)}.`,
    });
  }

  // O mais extremo primeiro. Quando tres metricas saem da faixa ao mesmo tempo,
  // a que mais saiu e a que descreve o evento.
  achados.sort((a, b) => Math.abs(b.escore) - Math.abs(a.escore));

  return {
    disponivel: true,
    diasObservados: anteriores.length,
    diasMinimos: DIAS_MINIMOS,
    limite: ESCORE_LIMITE,
    achados,
  };
}

export const ANOMALIA_DIAS_MINIMOS = DIAS_MINIMOS;
