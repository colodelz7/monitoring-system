import { useWorldClock } from '../hooks/useWorldClock';

export default function WorldClockBar({ currentCity, onSelectCity }) {
  const clocks = useWorldClock();

  return (
    <div className="world-clock-bar" id="worldClockBar">
      {clocks.map((c) => (
        <div
          key={c.name}
          className={`wc-item${c.name === currentCity ? ' wc-item--active' : ''}`}
          title={`Clique para monitorar ${c.name}`}
          onClick={() => onSelectCity(c.name)}
        >
          <span className="wc-name">{c.name}</span>
          <span className="wc-time">{c.time}</span>
          <span className="wc-date">{c.date}</span>
        </div>
      ))}
    </div>
  );
}
