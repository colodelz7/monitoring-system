import { getForecast, getWeather } from './weather.service.js';

/**
 * Marca quem leva a melhor numa metrica, entre quantas cidades houver.
 *
 * "Melhor" nem sempre e "maior": vento mais fraco e melhor, umidade e pressao
 * mais altas sao tratadas como melhores, seguindo a regra que ja existia.
 *
 * Empate nao tem vencedor. Com tres cidades e duas empatadas no topo, destacar
 * as duas sugeriria que uma ganhou de alguma coisa, quando na verdade nenhuma
 * se destacou.
 */
function marcarVencedores(valores, higherIsBetter) {
  const validos = valores.filter((v) => v != null);
  if (validos.length < 2) return valores.map(() => false);

  const alvo = higherIsBetter ? Math.max(...validos) : Math.min(...validos);
  const quantos = validos.filter((v) => v === alvo).length;
  if (quantos !== 1) return valores.map(() => false);

  return valores.map((v) => v === alvo);
}

const METRICS = [
  { key: 'temp_min', label: 'Mínima', unit: '°C', compare: null },
  { key: 'temp_max', label: 'Máxima', unit: '°C', compare: null },
  { key: 'humidity', label: 'Umidade', unit: '%', compare: 'higher' },
  { key: 'wind_speed', label: 'Vento', unit: ' m/s', compare: 'lower' },
  { key: 'pressure', label: 'Pressão', unit: ' hPa', compare: 'higher' },
];

// Cada cidade e uma chamada de clima e uma de previsao. O teto existe para que
// um pedido com vinte nomes nao vire quarenta chamadas a API paga de uma vez.
export const MAX_CIDADES = 4;

export async function compareCities(...cidades) {
  const lista = cidades.flat().filter(Boolean).slice(0, MAX_CIDADES);
  const results = await Promise.all(lista.map(loadCity));

  const metrics = METRICS.map((metric) => {
    const valores = results.map((r) => r.weather?.[metric.key] ?? null);
    const vencedores = metric.compare
      ? marcarVencedores(valores, metric.compare === 'higher')
      : valores.map(() => false);

    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      valores: valores.map((value, i) => ({ value, wins: vencedores[i] })),
      // Mantido para quem ainda le o formato de duas cidades.
      a: { value: valores[0] ?? null, wins: vencedores[0] ?? false },
      b: { value: valores[1] ?? null, wins: vencedores[1] ?? false },
    };
  });

  const temperaturas = results.map((r) => r.weather?.temp ?? null);
  const comTemp = temperaturas.filter((t) => t != null);

  const maisQuente = comTemp.length >= 2
    ? results[temperaturas.indexOf(Math.max(...comTemp))]?.city ?? null
    : null;
  const maisFrio = comTemp.length >= 2
    ? results[temperaturas.indexOf(Math.min(...comTemp))]?.city ?? null
    : null;

  // A diferenca so faz sentido entre duas. Com tres ou mais, o que informa e a
  // amplitude entre a mais quente e a mais fria.
  const tempDelta = comTemp.length === 2
    ? Number((comTemp[0] - comTemp[1]).toFixed(1))
    : null;

  return {
    results,
    metrics,
    verdict: {
      tempDelta,
      warmer: maisQuente === maisFrio ? null : maisQuente,
      colder: maisQuente === maisFrio ? null : maisFrio,
      amplitude: comTemp.length >= 2
        ? Number((Math.max(...comTemp) - Math.min(...comTemp)).toFixed(1))
        : null,
    },
  };
}

async function loadCity(city) {
  const [weather, forecast] = await Promise.all([getWeather(city), getForecast(city)]);
  return {
    city,
    found: Boolean(weather?.success),
    weather,
    forecast,
    // Miniserie para o sparkline, ja recortada.
    trend: (forecast?.points ?? []).slice(0, 8).map((point) => ({ at: point.datetime, temp: point.temp })),
  };
}
