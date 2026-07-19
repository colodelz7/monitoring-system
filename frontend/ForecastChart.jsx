import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import { PLOTLY_BASE, AXIS } from '../../lib/plotlyTheme';

export default function ForecastChart({ points }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !points?.length) return;
    const xs = points.map((p) => p.datetime);
    const ys = points.map((p) => p.temp);

    Plotly.react(ref.current, [{
      x: xs, y: ys,
      type: 'scatter', mode: 'lines+markers',
      line: { shape: 'spline', color: '#00e5ff', width: 2.5, smoothing: 1.3 },
      marker: { size: 4.5, color: '#00e5ff', line: { color: '#010812', width: 1.5 } },
      fill: 'tozeroy', fillcolor: 'rgba(0,229,255,0.05)',
      hovertemplate: '<b>%{x|%d/%m %H:%M}</b><br>%{y:.1f}°C<extra></extra>',
    }], {
      ...PLOTLY_BASE,
      autosize: true,
      height: 220,
      xaxis: { ...AXIS, tickformat: '%d/%m\n%H:%M' },
      yaxis: { ...AXIS, ticksuffix: '°' },
      showlegend: false,
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#0d1f38', bordercolor: '#00e5ff', font: { color: '#fff', size: 11 } },
    }, { responsive: true, displayModeBar: false });

    const el = ref.current;
    const ro = new ResizeObserver(() => {
      if (el) Plotly.Plots.resize(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [points]);

  const next = points?.[1]?.temp;

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-title">
          <span className="chart-dot dot-cyan"></span>
          Previsão de Temperatura — 48h
        </div>
        <div className="chart-badge">{next != null ? `próx: ${next.toFixed(1)}°C` : '—'}</div>
      </div>
      <div className="chart-area" ref={ref}></div>
    </div>
  );
}