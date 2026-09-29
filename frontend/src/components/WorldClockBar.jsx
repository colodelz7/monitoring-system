import { useWorldClock } from '../hooks/useWorldClock';

export default function WorldClockBar({ currentCity, onSelectCity }) {
  const clocks = useWorldClock();

  return (
    <div className="world-clock-bar">
      {clocks.map((clock) => (
        <button
          type="button"
          key={clock.name}
          className={`wc-item${clock.name === currentCity ? ' wc-item--active' : ''}`}
          title={`Monitorar ${clock.name}`}
          onClick={() => onSelectCity(clock.name)}
        >
          <span className="wc-name">{clock.name}</span>
          <span className="wc-time tabular">{clock.time}</span>
          <span className="wc-date tabular">{clock.date}</span>
        </button>
      ))}
    </div>
  );
}
