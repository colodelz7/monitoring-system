import { useEffect, useRef, useState } from 'react';
import CitySearchInput from './CitySearchInput';
import WatchList from './WatchList';
import Icon from './Icon';

const TABS = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'weekly', icon: 'cloud', label: 'Semana' },
  { id: 'seismic', icon: 'globe', label: 'Mapa Sísmico' },
  { id: 'compare', icon: 'compare', label: 'Comparar' },
  { id: 'rules', icon: 'sliders', label: 'Regras' },
  { id: 'alerts', icon: 'alert', label: 'Alertas' },
  { id: 'history', icon: 'history', label: 'Histórico' },
];

/**
 * Raios oferecidos para o recorte sísmico.
 *
 * Passos discretos e não um slider contínuo: a diferença entre 480 e 520 km não
 * significa nada para ninguém, e um slider convidaria a ajustar um número que
 * não merece ajuste fino. Zero é o padrão e quer dizer o planeta inteiro.
 */
const RAIOS = [
  { valor: 0, label: 'Mundo' },
  { valor: 500, label: '500 km' },
  { valor: 1000, label: '1.000 km' },
  { valor: 2500, label: '2.500 km' },
  { valor: 5000, label: '5.000 km' },
];

export default function Sidebar({ open, filters, onChange, pushNotif, activeTab, onTabChange, alertsCount, prefs }) {
  // O limite vale assim que a pessoa mexe, sem botão de confirmar. O estado
  // local existe só para o slider responder no mesmo quadro do gesto.
  const [draft, setDraft] = useState({
    tempMin: filters.tempMin,
    tempMax: filters.tempMax,
    magThreshold: filters.magThreshold,
  });
  const [saved, setSaved] = useState(false);

  const commitTimer = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Quando o limite muda em outro lugar, por exemplo ao abrir um link com
  // parâmetros próprios, o slider precisa acompanhar.
  useEffect(() => {
    setDraft({
      tempMin: filters.tempMin,
      tempMax: filters.tempMax,
      magThreshold: filters.magThreshold,
    });
  }, [filters.tempMin, filters.tempMax, filters.magThreshold]);

  useEffect(() => () => clearTimeout(commitTimer.current), []);

  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  /**
   * Aplica o novo limite depois de uma pausa curta no gesto.
   *
   * Arrastar um slider emite dezenas de eventos por segundo, e cada aplicação
   * dispara uma busca no painel, que por sua vez consome cota de API paga e
   * conta no rate limit. Esperar o gesto parar é o que torna "salvar na hora"
   * viável: para quem usa é imediato, para o servidor é uma chamada só.
   */
  function patchDraft(patch) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        onChangeRef.current(next);
        setSaved(true);
      }, 400);
      return next;
    });
  }

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon"><Icon name="globe" size={21} strokeWidth={1.5} /></div>
        <div>
          <div className="logo-title">MONITORING SYSTEM</div>
          <div className="logo-sub">Tempo Real</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <Icon name={tab.icon} size={16} /> {tab.label}
            {tab.id === 'alerts' && alertsCount > 0 && <span className="nav-badge">{alertsCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <div className="section-label"><Icon name="settings" size={12} /> Configurações</div>

        <div className="field">
          <label className="field-label">Cidade</label>
          <CitySearchInput
            placeholder="Pesquisar cidade..."
            defaultValue={filters.city}
            onSelect={(result) => onChange({ city: result.name })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="refreshSlider">
            Auto-refresh: <span className="val-hi tabular">{filters.refreshSecs}</span>s
          </label>
          <input
            id="refreshSlider"
            type="range"
            className="slider"
            min="10"
            max="300"
            step="10"
            value={filters.refreshSecs}
            onChange={(event) => onChange({ refreshSecs: Number.parseInt(event.target.value, 10) })}
          />
        </div>

        {/* Densidade compacta encolhe espaçamento e altura de cartão. Existe
            para tela pequena e para quem prefere ver tudo sem rolar. */}
        <div className="field">
          <label className="field-label">Densidade</label>
          <div className="segmented">
            <button
              className={`segmented-btn${prefs?.prefs.densidade !== 'compacta' ? ' is-on' : ''}`}
              onClick={() => prefs?.update({ densidade: 'confortavel' })}
              aria-pressed={prefs?.prefs.densidade !== 'compacta'}
            >
              Confortável
            </button>
            <button
              className={`segmented-btn${prefs?.prefs.densidade === 'compacta' ? ' is-on' : ''}`}
              onClick={() => prefs?.update({ densidade: 'compacta' })}
              aria-pressed={prefs?.prefs.densidade === 'compacta'}
            >
              Compacta
            </button>
          </div>
        </div>
      </div>

      {/* Cidades acompanhadas: a pergunta "e as minhas?" sem trocar o painel
          de cidade e sem esperar o ciclo inteiro recarregar. */}
      <WatchList
        cidades={prefs?.prefs.cidadesAcompanhadas ?? []}
        cidadeAtual={filters.city}
        thresholds={{ tempMin: filters.tempMin, tempMax: filters.tempMax }}
        max={prefs?.maxAcompanhadas ?? 6}
        onToggle={prefs?.acompanhar}
        onSelect={(cidade) => onChange({ city: cidade })}
      />

      <div className="sidebar-section">
        <div className="section-label"><Icon name="sliders" size={12} /> Limites de Alerta</div>

        <div className="field">
          <label className="field-label" htmlFor="tempMinSlider">
            Temp. Mín: <span className="val-blue tabular">{draft.tempMin}</span>°C
          </label>
          <input
            id="tempMinSlider"
            type="range"
            className="slider slider-blue"
            min="-10"
            max="25"
            step="1"
            value={draft.tempMin}
            onChange={(event) => patchDraft({ tempMin: Number.parseInt(event.target.value, 10) })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="tempMaxSlider">
            Temp. Máx: <span className="val-red tabular">{draft.tempMax}</span>°C
          </label>
          <input
            id="tempMaxSlider"
            type="range"
            className="slider slider-red"
            min="20"
            max="45"
            step="1"
            value={draft.tempMax}
            onChange={(event) => patchDraft({ tempMax: Number.parseInt(event.target.value, 10) })}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="magSlider">
            Magnitude: <span className="val-orange tabular">M {Number(draft.magThreshold).toFixed(1)}</span>
          </label>
          <input
            id="magSlider"
            type="range"
            className="slider slider-orange"
            min="1"
            max="9"
            step="0.5"
            value={draft.magThreshold}
            onChange={(event) => patchDraft({ magThreshold: Number.parseFloat(event.target.value) })}
          />
        </div>

        {/* O raio não é um limite de alerta, é um recorte do feed sísmico: o
            mundo inteiro tremendo não diz nada sobre onde a pessoa está, e um
            M4 a duzentos quilômetros diz. Fica aqui porque é da mesma família
            de decisões que os limites. */}
        <div className="field">
          <label className="field-label">
            Sismos ao redor: <span className="val-orange tabular">
              {RAIOS.find((r) => r.valor === filters.seismicRadiusKm)?.label ?? 'Mundo'}
            </span>
          </label>
          <div className="segmented segmented--wrap">
            {RAIOS.map((raio) => (
              <button
                key={raio.valor}
                className={`segmented-btn${filters.seismicRadiusKm === raio.valor ? ' is-on' : ''}`}
                onClick={() => onChange({ seismicRadiusKm: raio.valor })}
                aria-pressed={filters.seismicRadiusKm === raio.valor}
              >
                {raio.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sem botão de salvar: o aviso só confirma o que já aconteceu, e
            some sozinho para não virar enfeite permanente. */}
        <div className={`autosave${saved ? ' is-visible' : ''}`} aria-live="polite">
          <Icon name="check" size={12} />
          Limites aplicados
        </div>
      </div>

      <div className="sidebar-section">
        <div className="section-label"><Icon name="bell" size={12} /> Notificações</div>
        <button
          className={`primary-btn primary-btn--violet${pushNotif.enabled ? ' is-active' : ''}`}
          onClick={pushNotif.toggle}
          disabled={!pushNotif.supported}
        >
          <Icon name={pushNotif.enabled ? 'check' : 'bell'} size={14} />
          {!pushNotif.supported ? 'Push não suportado' : pushNotif.enabled ? 'Push ativo' : 'Ativar push alerts'}
        </button>
      </div>
    </aside>
  );
}
