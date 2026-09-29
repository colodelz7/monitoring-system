export const TIMEZONES = {
  // Brasil
  'Curitiba': -3, 'São Paulo': -3, 'Rio de Janeiro': -3,
  'Brasília': -3, 'Manaus': -4, 'Belém': -3, 'Fortaleza': -3,
  'Recife': -3, 'Salvador': -3, 'Porto Alegre': -3,
  'Belo Horizonte': -3, 'Florianópolis': -3, 'Goiânia': -3,
  // Américas
  'Nova York': -5, 'Los Angeles': -8, 'Chicago': -6,
  'Toronto': -5, 'México': -6, 'Buenos Aires': -3,
  'Lima': -5, 'Santiago': -4, 'Bogotá': -5, 'Miami': -5,
  // Europa
  'Londres': 1, 'Paris': 2, 'Berlim': 2, 'Madri': 2,
  'Roma': 2, 'Lisboa': 1, 'Amsterdã': 2, 'Moscou': 3,
  // Ásia/Oceania
  'Tóquio': 9, 'Dubai': 4, 'Singapura': 8, 'Pequim': 8,
  'Mumbai': 5.5, 'Bangkok': 7, 'Seul': 9, 'Sydney': 10,
  // África
  'Cairo': 2, 'Joanesburgo': 2, 'Lagos': 1, 'Nairóbi': 3,
};

export const WORLD_CLOCK_CITIES = [
  { name: 'São Paulo',    offset: -3 },
  { name: 'Nova York',    offset: -5 },
  { name: 'Los Angeles',  offset: -8 },
  { name: 'Buenos Aires', offset: -3 },
  { name: 'Lima',         offset: -5 },
  { name: 'México',       offset: -6 },
  { name: 'Miami',        offset: -5 },
  { name: 'Toronto',      offset: -5 },
  { name: 'Londres',      offset: 1 },
  { name: 'Paris',        offset: 2 },
  { name: 'Berlim',       offset: 2 },
  { name: 'Madri',        offset: 2 },
  { name: 'Roma',         offset: 2 },
  { name: 'Lisboa',       offset: 1 },
  { name: 'Moscou',       offset: 3 },
  { name: 'Cairo',        offset: 2 },
  { name: 'Nairóbi',      offset: 3 },
  { name: 'Joanesburgo',  offset: 2 },
  { name: 'Lagos',        offset: 1 },
  { name: 'Dubai',        offset: 4 },
  { name: 'Mumbai',       offset: 5.5 },
  { name: 'Bangkok',      offset: 7 },
  { name: 'Singapura',    offset: 8 },
  { name: 'Pequim',       offset: 8 },
  { name: 'Seul',         offset: 9 },
  { name: 'Tóquio',       offset: 9 },
  { name: 'Sydney',       offset: 10 },
];

export const MOCK_WEATHER = {
  'Curitiba':       { temp: 18.2, temp_min: 14.0, temp_max: 22.5, humidity: 78, wind_speed: 3.5, wind_deg: 120, pressure: 1018, description: 'Nublado' },
  'São Paulo':      { temp: 24.5, temp_min: 20.0, temp_max: 28.0, humidity: 65, wind_speed: 2.8, wind_deg: 200, pressure: 1012, description: 'Parcialmente nublado' },
  'Rio de Janeiro': { temp: 30.1, temp_min: 25.0, temp_max: 34.0, humidity: 80, wind_speed: 4.2, wind_deg: 90,  pressure: 1008, description: 'Ensolarado' },
  'Brasília':       { temp: 27.3, temp_min: 22.0, temp_max: 31.0, humidity: 55, wind_speed: 3.0, wind_deg: 45,  pressure: 1014, description: 'Céu claro' },
  'Manaus':         { temp: 33.0, temp_min: 28.0, temp_max: 36.5, humidity: 85, wind_speed: 1.5, wind_deg: 270, pressure: 1005, description: 'Chuva leve' },
  'Tóquio':         { temp: 22.0, temp_min: 17.0, temp_max: 25.0, humidity: 60, wind_speed: 5.1, wind_deg: 180, pressure: 1020, description: 'Limpo' },
  'Nova York':      { temp: 19.5, temp_min: 15.0, temp_max: 23.0, humidity: 70, wind_speed: 6.3, wind_deg: 315, pressure: 1016, description: 'Nublado' },
  'Londres':        { temp: 15.0, temp_min: 11.0, temp_max: 18.0, humidity: 82, wind_speed: 4.8, wind_deg: 240, pressure: 1010, description: 'Chuvoso' },
};

export const AQI_SCALE = [
  null,
  { level: 1, label: 'Boa',      color: 'var(--green)', advice: 'Qualidade do ar ideal para atividades ao ar livre.' },
  { level: 2, label: 'Razoável', color: 'var(--lime)', advice: 'Aceitável para a maioria das pessoas.' },
  { level: 3, label: 'Moderada', color: 'var(--orange)', advice: 'Grupos sensíveis devem reduzir esforço prolongado ao ar livre.' },
  { level: 4, label: 'Ruim',     color: 'var(--amber)', advice: 'Evite exercício intenso ao ar livre.' },
  { level: 5, label: 'Péssima',  color: 'var(--red)', advice: 'Permaneça em ambiente fechado sempre que possível.' },
];

export const COMPASS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

export const SEISMIC_PALETTE = {
  strong: '#ff2d55',
  alert: '#ff8c00',
  mild: '#7c3aed',
};

// Teto de eventos sismicos devolvidos ao cliente. O feed bruto da USGS chega a
// milhares de registros por semana e nada disso e renderizavel de forma util.
export const SEISMIC_EVENT_LIMIT = 400;

export const FORECAST_POINTS = 16;

export const SENSOR_LABELS = { clima: 'Clima', sismo: 'Sismo', regra: 'Regra', anomalia: 'Anomalia' };

export const SEVERITY_LABELS = { danger: 'Crítico', warning: 'Atenção' };

export const METRIC_LABELS = {
  temperature_high: 'Temperatura máxima',
  temperature_low: 'Temperatura mínima',
  temperature_swing: 'Variação de temperatura',
  magnitude: 'Magnitude sísmica',
  // Regras criadas por quem usa carregam a propria metrica, entao o rotulo
  // vem do catalogo em domain/metrics.js e nao desta lista.
  anomalia: 'Fora do normal',
};
