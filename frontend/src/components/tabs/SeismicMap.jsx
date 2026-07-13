import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

function buildGeoJSON(events, mag) {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => {
      let color, opacity;
      if (e.magnitude >= 6) { color = '#ff2d55'; opacity = 0.9; }
      else if (e.magnitude >= mag) { color = '#ff8c00'; opacity = 0.8; }
      else { color = '#7c3aed'; opacity = 0.5; }
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
        properties: { ...e, color, opacity },
      };
    }),
  };
}

export default function SeismicMap({ events, mag, stadiaKey }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const loadedRef = useRef(false);
  const [counter, setCounter] = useState({ critical: 0, alert: 0, mild: 0, total: 0 });

  const sorted = [...events].sort((a, b) => b.magnitude - a.magnitude).slice(0, 300);

  useEffect(() => {
    const critical = sorted.filter((e) => e.magnitude >= 6).length;
    const alert = sorted.filter((e) => e.magnitude >= mag && e.magnitude < 6).length;
    const mild = sorted.length - critical - alert;
    setCounter({ critical, alert, mild, total: sorted.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mag]);

  useEffect(() => {
    if (!sorted.length || !mapElRef.current) return;

    if (!mapRef.current) {
      const map = new maplibregl.Map({
        container: mapElRef.current,
        style: `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${stadiaKey}`,
        center: [0, 20],
        zoom: 1.5,
        projection: 'globe',
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

      map.on('load', () => {
        try {
          map.setFog({
            color: 'rgba(10, 15, 30, 0.9)',
            'high-color': 'rgba(0, 20, 60, 0.8)',
            'horizon-blend': 0.04,
            'space-color': '#010812',
            'star-intensity': 0.6,
          });
        } catch { /* setFog pode não existir em todas versões */ }

        loadedRef.current = true;
        const geoData = buildGeoJSON(sorted, mag);
        map.addSource('seismic', { type: 'geojson', data: geoData });

        map.addLayer({
          id: 'seismic-halo', type: 'circle', source: 'seismic',
          filter: ['>=', ['get', 'magnitude'], 6],
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 6, 16, 8, 24, 10, 30],
            'circle-color': '#ff2d55', 'circle-opacity': 0.15,
            'circle-stroke-width': 1, 'circle-stroke-color': '#ff2d55', 'circle-stroke-opacity': 0.35,
          },
        });

        map.addLayer({
          id: 'seismic-circles', type: 'circle', source: 'seismic',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 1, 2, 4, 4, 6, 7, 8, 11, 10, 14],
            'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'],
            'circle-stroke-width': 1, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0.9,
          },
        });

        map.on('click', 'seismic-circles', (e) => {
          const p = e.features[0].properties;
          const time = new Date(p.time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
          const badgeColor = p.magnitude >= 6 ? '#ff2d55' : p.magnitude >= mag ? '#ff8c00' : '#7c3aed';
          const badgeLabel = p.magnitude >= 6 ? 'FORTE' : p.magnitude >= mag ? 'ALERTA' : 'LEVE';

          new maplibregl.Popup({ className: 'ml-popup', maxWidth: '280px', closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family:'JetBrains Mono',monospace;padding:2px;">
                <div style="font-size:15px;font-weight:700;color:${badgeColor};margin-bottom:6px">
                  M ${parseFloat(p.magnitude).toFixed(1)}
                  <span style="background:${badgeColor};color:#fff;padding:1px 7px;border-radius:4px;font-size:10px;margin-left:6px">${badgeLabel}</span>
                </div>
                <div style="font-size:11px;color:#ccc;margin-bottom:3px">📍 ${p.place || 'Local desconhecido'}</div>
                <div style="font-size:10px;color:#888">🕓 ${time}</div>
                <div style="font-size:10px;color:#888">⬇ Prof: ${p.depth ?? '?'} km</div>
                ${p.url ? `<a href="${p.url}" target="_blank" style="color:#00e5ff;font-size:10px;display:block;margin-top:8px">↗ Ver no USGS</a>` : ''}
              </div>
            `)
            .addTo(map);
        });
        map.on('mouseenter', 'seismic-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'seismic-circles', () => { map.getCanvas().style.cursor = ''; });
      });
    } else if (loadedRef.current) {
      const src = mapRef.current.getSource('seismic');
      if (src) src.setData(buildGeoJSON(sorted, mag));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mag, stadiaKey]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div className="chart-card full-height">
      <div className="chart-header">
        <div className="chart-title">
          <span className="chart-dot dot-ind"></span>
          Atividade Sísmica Global — Mapa Interativo
        </div>
        <div className="chart-badge">{counter.total} eventos</div>
      </div>
      <div id="leafletMap" className="chart-area chart-area--tall leaflet-container-wrap" style={{ position: 'relative' }}>
        {!sorted.length && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,.2)', fontSize: '.8rem', fontFamily: 'var(--mono)' }}>
            ◉ Nenhum evento sísmico no período.
          </div>
        )}
        <div ref={mapElRef} style={{ width: '100%', height: '100%' }} />
        {sorted.length > 0 && (
          <>
            <div className="map-counter" style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, pointerEvents: 'none' }}>
              <div className="map-counter-title">◉ EVENTOS: {counter.total}</div>
              <div className="map-counter-row" style={{ color: '#ff2d55' }}>⬤ Fortes: {counter.critical}</div>
              <div className="map-counter-row" style={{ color: '#ff8c00' }}>⬤ Alertas: {counter.alert}</div>
              <div className="map-counter-row" style={{ color: '#7c3aed' }}>⬤ Leves: {counter.mild}</div>
            </div>
            <div className="map-legend" style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, pointerEvents: 'none' }}>
              <div className="map-legend-title">⚡ MAGNITUDE</div>
              <div className="map-legend-row"><span className="map-legend-dot" style={{ background: '#ff2d55', boxShadow: '0 0 8px #ff2d55' }}></span>M ≥ 6.0 — Forte</div>
              <div className="map-legend-row"><span className="map-legend-dot" style={{ background: '#ff8c00', boxShadow: '0 0 8px #ff8c00' }}></span>{mag.toFixed(1)} ≤ M &lt; 6.0 — Alerta</div>
              <div className="map-legend-row"><span className="map-legend-dot" style={{ background: '#7c3aed', boxShadow: '0 0 6px #7c3aed' }}></span>M &lt; {mag.toFixed(1)} — Leve</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
