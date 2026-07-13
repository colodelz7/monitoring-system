import { useState } from 'react';
import CitySearchInput from '../CitySearchInput';
import { api } from '../../lib/api';

function winner(v1, v2, higherIsBetter = false) {
  if (v1 == null || v2 == null) return ['', ''];
  if (higherIsBetter) return v1 > v2 ? ['🏆', ''] : v1 < v2 ? ['', '🏆'] : ['', ''];
  return v1 < v2 ? ['🏆', ''] : v1 > v2 ? ['', '🏆'] : ['', ''];
}

function CompareCard({ result, badge }) {
  const w = result.weather;
  if (!w || !w.success) {
    return (
      <div className="compare-card">
        <div className="compare-city-name">{result.city}</div>
        <div className="empty-text" style={{ fontSize: '.75rem', marginTop: 12 }}>Cidade não encontrada</div>
      </div>
    );
  }
  return (
    <div className="compare-card">
      <div className="compare-city-name">{w.city || result.city}</div>
      <div className="compare-temp">{w.temp?.toFixed?.(1) ?? w.temp ?? '—'}°C</div>
      <div className="compare-desc">{w.description || '—'}</div>
      <div className="compare-stats">
        <div className="cstat"><span className="cstat-l">↓ Mín</span><span className="cstat-v">{w.temp_min ?? '—'}°C</span></div>
        <div className="cstat"><span className="cstat-l">↑ Máx</span><span className="cstat-v">{w.temp_max ?? '—'}°C</span></div>
        <div className="cstat"><span className="cstat-l">💧 Umidade {badge.hum}</span><span className="cstat-v">{w.humidity ?? '—'}%</span></div>
        <div className="cstat"><span className="cstat-l">💨 Vento {badge.wind}</span><span className="cstat-v">{w.wind_speed ?? '—'} m/s</span></div>
        <div className="cstat"><span className="cstat-l">🔵 Pressão {badge.pres}</span><span className="cstat-v">{w.pressure ?? '—'} hPa</span></div>
      </div>
      {w.mock && <div style={{ marginTop: 8, fontSize: '.6rem', color: 'rgba(255,255,255,.25)', fontFamily: 'var(--mono)' }}>⚠ DADOS SIMULADOS</div>}
    </div>
  );
}

export default function Compare() {
  const [city1, setCity1] = useState('São Paulo');
  const [city2, setCity2] = useState('Tóquio');
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | error | done

  async function doCompare() {
    const c1 = city1.split(',')[0].trim();
    const c2 = city2.split(',')[0].trim();
    if (!c1 || !c2) { setState({ status: 'error', message: 'Preencha as duas cidades' }); return; }

    setState({ status: 'loading', c1, c2 });
    try {
      const data = await api.compare(c1, c2);
      if (!data.results?.length) throw new Error('Resposta inválida do servidor');
      setState({ status: 'done', results: data.results });
    } catch (e) {
      setState({ status: 'error', message: e.message });
    }
  }

  let badges1 = { hum: '', wind: '', pres: '' };
  let badges2 = { hum: '', wind: '', pres: '' };
  if (state.status === 'done') {
    const [r1, r2] = state.results;
    const w1 = r1.weather, w2 = r2.weather;
    const [h1, h2] = winner(w1?.humidity, w2?.humidity, true);
    const [wi1, wi2] = winner(w1?.wind_speed, w2?.wind_speed, false);
    const [p1, p2] = winner(w1?.pressure, w2?.pressure, true);
    badges1 = { hum: h1, wind: wi1, pres: p1 };
    badges2 = { hum: h2, wind: wi2, pres: p2 };
  }

  return (
    <>
      <div className="compare-controls">
        <div className="compare-inputs">
          <div className="compare-city-wrap">
            <label className="field-label">Cidade A</label>
            <CitySearchInput id="compareCity1" wrapId="compareWrap1" placeholder="Ex: São Paulo"
              defaultValue={city1} onSelect={(r) => setCity1(r.label)} />
          </div>
          <div className="compare-vs">VS</div>
          <div className="compare-city-wrap">
            <label className="field-label">Cidade B</label>
            <CitySearchInput id="compareCity2" wrapId="compareWrap2" placeholder="Ex: Tóquio"
              defaultValue={city2} onSelect={(r) => setCity2(r.label)} />
          </div>
          <button className="save-limits-btn" style={{ marginTop: 18 }} onClick={doCompare}>⊞ Comparar</button>
        </div>
      </div>

      <div className="compare-result">
        {state.status === 'idle' && (
          <div className="empty-state">
            <div className="empty-icon">⊞</div>
            <div className="empty-text">Selecione duas cidades para comparar</div>
            <div className="empty-sub">Dados de clima em tempo real lado a lado</div>
          </div>
        )}
        {state.status === 'loading' && (
          <div className="empty-state">
            <div className="empty-icon"><span className="spinner"></span></div>
            <div className="empty-text">Comparando {state.c1} e {state.c2}...</div>
          </div>
        )}
        {state.status === 'error' && (
          <div className="empty-state">
            <div className="empty-icon" style={{ color: '#ff2d55' }}>✕</div>
            <div className="empty-text">Erro ao comparar cidades</div>
            <div className="empty-sub" style={{ fontSize: '.65rem', marginTop: 4 }}>{state.message}</div>
            <div className="empty-sub" style={{ fontSize: '.6rem', marginTop: 8, opacity: .4 }}>Verifique se o backend está rodando na porta 3001</div>
          </div>
        )}
        {state.status === 'done' && (
          <div className="compare-grid">
            <CompareCard result={state.results[0]} badge={badges1} />
            <CompareCard result={state.results[1]} badge={badges2} />
          </div>
        )}
      </div>
    </>
  );
}
