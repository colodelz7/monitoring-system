import AnimatedNumber from './AnimatedNumber';
import Icon, { Bullet } from './Icon';
import PeriodFilter from './PeriodFilter';

export default function Topbar({
  status, city, cityTime, countdown, isMock, isCached, isStale, cacheAge,
  loading, onMenuClick, theme, onToggleTheme, period, onPeriodChange, periodLoading,
}) {
  const cacheMinutes = Math.floor((cacheAge || 0) / 60);

  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenuClick} aria-label="Abrir menu"><Icon name="menu" size={18} /></button>

      <div className="topbar-left">
        <div className={`status-pill ${status.type}`} aria-live="polite">
          <span className="status-dot" />
          <span className="status-text">{status.text}</span>
        </div>

        {!isMock && !isCached && <span className="badge badge--live"><Bullet color="var(--green)" size={7} /> LIVE</span>}
        {isMock && <span className="badge badge--demo"><Icon name="alert" size={11} /> DEMO</span>}
        {isCached && (
          <span
            className="badge badge--cache"
            title={cacheMinutes ? `Dados de ${cacheMinutes}min atrás` : 'Servido do cache do servidor'}
          >
            <Icon name="package" size={11} /> {isStale ? 'OFFLINE' : 'CACHE'}
          </span>
        )}
      </div>

      {/* O recorte do que está na tela: qual cidade, na barra direita, e qual
          janela de tempo, aqui. */}
      <PeriodFilter value={period} onChange={onPeriodChange} loading={periodLoading} />

      <div className="topbar-right">
        <div className="topbar-stat">
          <span className="stat-label">Cidade</span>
          <span className="stat-val">{city || '--'}</span>
        </div>
        <div className="divider" />
        <div className="topbar-stat">
          <span className="stat-label">Hora Local</span>
          <span className="stat-val tabular">{cityTime || '--:--:--'}</span>
        </div>
        <div className="divider" />
        {/* Sem botão de atualizar: o painel se atualiza sozinho no intervalo
            escolhido na barra lateral. Este contador é o que conta isso, e
            por isso ele também precisa dizer quando a busca está em curso. */}
        <div className="topbar-stat">
          <span className="stat-label">{loading ? 'Atualizando' : 'Próx. Update'}</span>
          <span className={`stat-val${loading ? ' is-busy' : ''}`}>
            {loading
              ? <><Icon name="refresh" size={12} /> agora</>
              : <AnimatedNumber value={countdown} decimals={0} suffix="s" />}
          </span>
        </div>
        <button
          className="theme-btn"
          title={theme === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
          aria-label={theme === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
          aria-pressed={theme === 'light'}
          onClick={onToggleTheme}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
        </button>

      </div>
    </header>
  );
}
