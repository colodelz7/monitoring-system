/**
 * Seletor de período do painel inteiro (item 1).
 *
 * Saiu da barra lateral, onde se chamava "Período Sísmico" e parecia valer só
 * para o mapa, e subiu para a barra superior, ao lado da cidade. Os dois juntos
 * são o recorte do que está na tela: qual lugar e qual janela de tempo.
 *
 * É um grupo de botões e não um menu suspenso porque são cinco opções curtas,
 * usadas com frequência, e um menu esconderia justamente a informação de qual
 * janela está ativa.
 */
export const PERIOD_OPTIONS = [
  { value: 'day', label: '24h', title: 'Últimas 24 horas' },
  { value: 'week', label: '7d', title: 'Últimos 7 dias' },
  { value: 'month', label: '30d', title: 'Últimos 30 dias' },
  { value: 'quarter', label: '90d', title: 'Últimos 90 dias, sismos a partir de M4.5' },
  { value: 'year', label: '1a', title: 'Último ano, sismos a partir de M5.0' },
];

export default function PeriodFilter({ value, onChange, loading }) {
  return (
    <div className="period-filter" role="group" aria-label="Período">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`period-btn${value === option.value ? ' is-active' : ''}${value === option.value && loading ? ' is-loading' : ''}`}
          title={value === option.value && loading ? `${option.title}, buscando...` : option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
