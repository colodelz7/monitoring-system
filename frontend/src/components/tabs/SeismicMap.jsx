import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, Popup, ScaleControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { setupMapLibre } from '../../lib/maplibreSetup';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import SeismicCharts from './SeismicCharts';
import Icon, { Bullet } from '../Icon';

const SEVERITY_LABEL = { strong: 'FORTE', alert: 'ALERTA', mild: 'LEVE' };

function element(tag, { text, className, style, attrs } = {}) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  if (style) node.style.cssText = style;
  if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/**
 * Monta o conteúdo do popup como nós do DOM.
 *
 * `place` e `url` vêm do feed da USGS, ou seja, de fora. Montando com
 * createElement e textContent, o texto nunca é interpretado como marcação e o
 * caminho de injeção deixa de existir, independentemente do sanitizador da
 * biblioteca. A URL ainda assim já foi validada no backend.
 */
function buildPopupContent(props) {
  const root = element('div', { className: 'ml-popup-body' });
  const color = props.color || '#7c3aed';

  const heading = element('div', { className: 'ml-popup-mag', style: `color:${color}` });
  heading.append(element('span', { text: `M ${Number(props.magnitude).toFixed(1)}` }));
  heading.append(
    element('span', {
      text: SEVERITY_LABEL[props.severity] ?? 'EVENTO',
      className: 'ml-popup-badge',
      style: `background:${color}`,
    }),
  );
  root.append(heading);

  root.append(element('div', { className: 'ml-popup-line', text: props.place || 'Local desconhecido' }));

  const when = props.time ? new Date(props.time) : null;
  const whenText = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'horário desconhecido';
  root.append(element('div', { className: 'ml-popup-meta', text: whenText }));
  root.append(element('div', { className: 'ml-popup-meta', text: `Profundidade: ${props.depth ?? '?'} km` }));

  if (props.url) {
    root.append(element('a', {
      text: 'Abrir no USGS',
      className: 'ml-popup-link',
      attrs: { href: props.url, target: '_blank', rel: 'noreferrer noopener' },
    }));
  }

  return root;
}

const SEVERITY_ORDER = ['strong', 'alert', 'mild'];

export default function SeismicMap({ seismic, mapStyleUrl, cityName, cityCoords, theme }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const reduced = useReducedMotion();

  const [failure, setFailure] = useState(null);
  const [ready, setReady] = useState(false);
  const [globe, setGlobe] = useState(true);
  const [hidden, setHidden] = useState(() => new Set());

  const geojson = seismic?.geojson;
  const summary = seismic?.summary;
  const hasEvents = Boolean(geojson?.features?.length);

  useEffect(() => {
    if (!containerRef.current || !mapStyleUrl || mapRef.current) return undefined;

    // Sem isto o worker do MapLibre não sobe e o mapa fica preto sem avisar.
    setupMapLibre();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleUrl,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');

    // O mapa falhava calado: quando o estilo ou os tiles não carregavam, a tela
    // ficava preta sem nenhuma explicação. Agora o erro aparece.
    map.on('error', (event) => {
      const message = event?.error?.message || 'Falha desconhecida ao carregar o mapa.';
      setFailure(message);
    });

    map.on('load', () => {
      readyRef.current = true;
      setReady(true);
      setFailure(null);

      try {
        map.setProjection({ type: 'globe' });
      } catch {
        // Projeção plana é um fallback aceitável.
      }
      try {
        map.setSky({
          'sky-color': '#010812',
          'sky-horizon-blend': 0.6,
          'horizon-color': 'rgba(0, 20, 60, 0.8)',
          'horizon-fog-blend': 0.6,
          'fog-color': 'rgba(10, 15, 30, 0.9)',
          'fog-ground-blend': 0.1,
        });
      } catch {
        // Sem céu estilizado o mapa segue legível.
      }

      map.addSource('seismic', { type: 'geojson', data: emptyCollection() });

      map.addLayer({
        id: 'seismic-halo',
        type: 'circle',
        source: 'seismic',
        filter: ['==', ['get', 'severity'], 'strong'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 6, 16, 8, 24, 10, 30],
          'circle-color': '#ff2d55',
          'circle-opacity': 0.15,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ff2d55',
          'circle-stroke-opacity': 0.35,
        },
      });

      map.addLayer({
        id: 'seismic-circles',
        type: 'circle',
        source: 'seismic',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 1, 2, 4, 4, 6, 7, 8, 11, 10, 14],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': 1,
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-opacity': 0.9,
          'circle-radius-transition': { duration: reduced ? 0 : 500 },
          'circle-opacity-transition': { duration: reduced ? 0 : 500 },
        },
      });

      map.on('click', 'seismic-circles', (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        new Popup({ className: 'ml-popup', maxWidth: '280px', closeButton: true })
          .setLngLat(event.lngLat)
          .setDOMContent(buildPopupContent(feature.properties))
          .addTo(map);
      });

      map.on('mouseenter', 'seismic-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'seismic-circles', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    // O mapa nasce dentro de uma aba que acabou de entrar na tela. Se ele medir
    // o container no meio da transição, o canvas fica com o tamanho errado e
    // não se corrige sozinho.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
      setReady(false);
    };
    // `reduced` só ajusta a duração de uma transição de pintura: recriar o mapa
    // inteiro por causa disso jogaria fora o enquadramento de quem está olhando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyleUrl]);

  // Atualiza os dados sem recriar o mapa, preservando zoom e rotação do usuário.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !geojson) return;
    const source = map.getSource('seismic');
    if (source) source.setData(geojson);
  }, [geojson, ready]);

  // Esconder uma faixa de magnitude é filtro de leitura, não recorte de dados:
  // o servidor continua mandando tudo e a contagem total segue verdadeira.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const visible = SEVERITY_ORDER.filter((key) => !hidden.has(key));
    const filter = ['in', ['get', 'severity'], ['literal', visible]];
    if (map.getLayer('seismic-circles')) map.setFilter('seismic-circles', filter);
    if (map.getLayer('seismic-halo')) {
      map.setFilter('seismic-halo', hidden.has('strong')
        ? ['==', ['get', 'severity'], '__nenhum__']
        : ['==', ['get', 'severity'], 'strong']);
    }
  }, [hidden, ready]);

  const toggleSeverity = useCallback((key) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleProjection = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setGlobe((prev) => {
      const next = !prev;
      try {
        map.setProjection({ type: next ? 'globe' : 'mercator' });
      } catch {
        // Se a projeção não trocar, o estado visual acompanha o que de fato ficou.
        return prev;
      }
      return next;
    });
  }, []);

  const flyToCity = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !cityCoords) return;
    map.flyTo({
      center: [cityCoords.lon, cityCoords.lat],
      zoom: 4.2,
      duration: reduced ? 0 : 1600,
      essential: true,
    });
  }, [cityCoords, reduced]);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.flyTo({ center: [0, 20], zoom: 1.5, pitch: 0, bearing: 0, duration: reduced ? 0 : 1200, essential: true });
  }, [reduced]);

  return (
    <section className="chart-card full-height">
      <header className="chart-header">
        <h3 className="chart-title">
          <span className="chart-dot dot-ind" />
          Atividade sísmica global
        </h3>

        <div className="map-toolbar">
          <button className="map-tool" onClick={toggleProjection} disabled={!ready} title="Alternar entre globo e mapa plano">
            <Icon name={globe ? 'layers' : 'globe'} size={13} />
            {globe ? 'Plano' : 'Globo'}
          </button>
          <button className="map-tool" onClick={flyToCity} disabled={!ready || !cityCoords} title={cityName ? `Ir para ${cityName}` : 'Cidade sem coordenadas'}>
            <Icon name="pin" size={13} />
            {cityName || 'Cidade'}
          </button>
          <button className="map-tool" onClick={resetView} disabled={!ready} title="Voltar ao enquadramento inicial">
            <Icon name="refresh" size={13} />
            Reenquadrar
          </button>
          <div className="chart-badge">
            {summary?.total ?? 0} evento{summary?.total === 1 ? '' : 's'}
            {summary?.truncated && ` de ${summary.totalAvailable}`}
          </div>

          {/* Com raio ligado, a contagem cai muito. Sem dizer o porquê, um mapa
              quase vazio parece defeito em vez de filtro funcionando. */}
          {seismic?.raio && (
            <div className="chart-badge chart-badge--filter" title={`Recorte de ${seismic.raio.km} km ao redor de ${cityName}`}>
              <Icon name="filter" size={11} />
              {seismic.raio.km} km
              {summary?.maisProximo && ` · mais perto: ${Math.round(summary.maisProximo.distanciaKm)} km`}
            </div>
          )}
        </div>
      </header>

      <div className="chart-area chart-area--tall map-wrap">
        <div ref={containerRef} className="map-canvas" />

        {!mapStyleUrl && (
          <div className="map-message">
            <Icon name="alert" size={16} /> Chave do Stadia Maps não configurada no servidor.
          </div>
        )}

        {failure && (
          <div className="map-message map-message--error">
            <Icon name="alert" size={16} /> Falha ao carregar o mapa: {failure}
          </div>
        )}

        {mapStyleUrl && !failure && !ready && (
          <div className="map-message">
            <span className="spinner" /> Carregando mapa...
          </div>
        )}

        {/* Com raio ligado, "nenhum evento" é um resultado e não uma falha, e
            precisa dizer isso: um globo vazio sem explicação parece o mapa que
            não carregou. A saída também está aqui, porque quem chegou a um
            mapa vazio provavelmente quer voltar a olhar o mundo. */}
        {mapStyleUrl && ready && !hasEvents && (
          <div className="map-message">
            {seismic?.raio ? (
              <>
                Nenhum sismo dentro de {seismic.raio.km} km de {cityName} neste período.
                {seismic.raio.deUmTotalDe > 0 && ` O mundo teve ${seismic.raio.deUmTotalDe}.`}
              </>
            ) : (
              'Nenhum evento sísmico no período.'
            )}
          </div>
        )}

        {hasEvents && summary && (
          <>
            <div className="map-counter">
              <div className="map-counter-title">Eventos: {summary.total}</div>
              <div className="map-counter-row" style={{ color: '#ff2d55' }}>
                <Bullet color="#ff2d55" size={7} /> Fortes: {summary.strong}
              </div>
              <div className="map-counter-row" style={{ color: '#ff8c00' }}>
                <Bullet color="#ff8c00" size={7} /> Alertas: {summary.alert}
              </div>
              <div className="map-counter-row" style={{ color: '#7c3aed' }}>
                <Bullet color="#7c3aed" size={7} /> Leves: {summary.mild}
              </div>
            </div>

            <div className="map-legend">
              <div className="map-legend-title">
                <Icon name="bolt" size={11} /> Magnitude
              </div>
              {(seismic?.legend ?? []).map((item) => (
                <button
                  type="button"
                  className={`map-legend-row${hidden.has(item.key) ? ' is-off' : ''}`}
                  key={item.key}
                  onClick={() => toggleSeverity(item.key)}
                  title={hidden.has(item.key) ? 'Mostrar esta faixa' : 'Ocultar esta faixa'}
                >
                  <Bullet color={item.color} size={8} glow={!hidden.has(item.key)} />
                  {item.label}
                </button>
              ))}
              <div className="map-legend-hint">Clique para filtrar</div>
            </div>
          </>
        )}
      </div>

      {/* O mapa diz onde tremeu. Estes dizem com que força, a que profundidade
          e quando, que o mapa sozinho não mostra sem virar sopa de pontos. */}
      <SeismicCharts
        charts={seismic?.charts}
        theme={theme}
        vazio={seismic?.raio
          ? `Nenhum sismo dentro de ${seismic.raio.km} km de ${cityName} neste período.`
          : undefined}
      />
    </section>
  );
}

function emptyCollection() {
  return { type: 'FeatureCollection', features: [] };
}
