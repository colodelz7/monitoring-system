import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { PLOTLY_BASE, AXIS } from '../../lib/plotlyTheme';

export default function RainChart({ points }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !points?.length) return;
    const xs = points.map((p) => p.datetime);
    const ys = points.map((p) => p.rain || 0);

    Plotly.react(ref.current, [{
      x: xs, y: ys,
      type: 'bar',
      marker: {
        color: ys.map((v) => (v > 2 ? '#4dabf7' : v > 0.5 ? '#74c0fc' : 'rgba(77,171,247,0.3)')),
        line: { color: 'rgba(0,180,255,0.2)', width: 0.5 },
      },
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.2f} mm<extra></extra>',
    }], {
      ...PLOTLY_BASE,
      height: 220,
      xaxis: { ...AXIS, tickformat: '%d/%m\n%H:%M' },
      yaxis: { ...AXIS, ticksuffix: ' mm', rangemode: 'nonnegative' },
      showlegend: false,
      bargap: 0.15,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#4dabf7', font: { color: '#fff', size: 11 } },
    }, { responsive: true, displayModeBar: false });
  }, [points]);

  const total = points?.length ? points.reduce((a, b) => a + (b.rain || 0), 0).toFixed(1) : null;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title">
          <span className="chart-dot dot-blue"></span>
          Precipitação Prevista — 48h
        </div>
        <div className="chart-badge">{total != null ? `total: ${total}mm` : '—'}</div>
      </div>
      <div className="chart-area" ref={ref}></div>
    </div>
  );
}
