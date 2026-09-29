/**
 * Catalogo das metricas que o sistema sabe medir.
 *
 * Existe para que regra de alerta, deteccao de anomalia e as ferramentas do
 * assistente falem do mesmo conjunto. Sem um lugar unico, cada um desses tres
 * acabaria com a propria lista, e uma metrica nova teria que ser lembrada em
 * tres arquivos.
 *
 * O campo `leitura` aponta para o nome usado na serie historica, que nem sempre
 * e o mesmo do payload do clima: a leitura gravada chama `temp` o que a OWM
 * devolve como `temp`, mas chama `wind` o que ela devolve como `wind_speed`.
 */
export const METRICAS = Object.freeze({
  temp: {
    label: 'Temperatura',
    unidade: '°C',
    leitura: 'temp',
    atual: (weather) => weather?.temp ?? null,
    // Faixa fisicamente plausivel. Serve para recusar regra impossivel na
    // entrada, nao para limitar o que pode ser medido.
    min: -60,
    max: 60,
    decimais: 1,
  },
  humidity: {
    label: 'Umidade',
    unidade: '%',
    leitura: 'humidity',
    atual: (weather) => weather?.humidity ?? null,
    min: 0,
    max: 100,
    decimais: 0,
  },
  pressure: {
    label: 'Pressão',
    unidade: 'hPa',
    leitura: 'pressure',
    atual: (weather) => weather?.pressure ?? null,
    min: 850,
    max: 1100,
    decimais: 0,
  },
  wind: {
    label: 'Vento',
    unidade: 'm/s',
    leitura: 'wind',
    atual: (weather) => weather?.wind_speed ?? null,
    min: 0,
    max: 120,
    decimais: 1,
  },
  aqi: {
    label: 'Qualidade do ar',
    unidade: '',
    leitura: 'aqi',
    // O indice vem do servico de ar, nao do clima.
    atual: (_weather, ar) => (ar?.success ? ar.aqi : null),
    min: 1,
    max: 5,
    decimais: 0,
  },
});

export const CHAVES_METRICA = Object.freeze(Object.keys(METRICAS));

export const OPERADORES = Object.freeze({
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
});

export const SIMBOLO_OPERADOR = Object.freeze({
  '>': 'acima de',
  '>=': 'igual ou acima de',
  '<': 'abaixo de',
  '<=': 'igual ou abaixo de',
});

/** Valores atuais de todas as metricas, no formato que a avaliacao espera. */
export function lerMetricas(weather, airQuality) {
  const valores = {};
  for (const [chave, spec] of Object.entries(METRICAS)) {
    const valor = spec.atual(weather, airQuality);
    valores[chave] = Number.isFinite(valor) ? valor : null;
  }
  return valores;
}

export function rotuloDe(chave) {
  return METRICAS[chave]?.label ?? chave;
}

export function unidadeDe(chave) {
  return METRICAS[chave]?.unidade ?? '';
}

/** Formata valor com a precisao da metrica, para a mensagem do alerta. */
export function formatarValor(chave, valor) {
  if (!Number.isFinite(valor)) return '--';
  const spec = METRICAS[chave];
  return `${valor.toFixed(spec?.decimais ?? 1)}${spec?.unidade ?? ''}`;
}
