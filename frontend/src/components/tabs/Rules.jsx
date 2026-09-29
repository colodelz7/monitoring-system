import { useCallback, useMemo, useState } from 'react';
import { useRules } from '../../hooks/useRules';
import Icon from '../Icon';

/**
 * Regras de alerta criadas por quem usa o painel.
 *
 * O formulário é montado a partir do catálogo que o servidor manda: as
 * métricas, os operadores e as faixas aceitas chegam junto da listagem. Assim
 * esta tela nunca oferece uma combinação que a validação de lá vai recusar, e
 * uma métrica nova no backend aparece aqui sozinha.
 */

const VAZIO = {
  nome: '',
  tipo: 'valor',
  severidade: 'warning',
  cidade: '',
  condicoes: [{ metrica: 'temp', operador: '>=', valor: 30 }],
  variacao: { metrica: 'temp', direcao: 'cai', delta: 8, janelaHoras: 3 },
};

function Campo({ label, children, htmlFor }) {
  return (
    <div className="rule-field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export default function Rules({ cidadeAtual }) {
  const { status, regras, metricas, operadores, limites, erro, criar, atualizar, remover } = useRules();

  const [form, setForm] = useState(VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [recusa, setRecusa] = useState(null);
  const [armado, setArmado] = useState(null);

  const porChave = useMemo(
    () => Object.fromEntries(metricas.map((m) => [m.chave, m])),
    [metricas],
  );

  const patch = useCallback((mudanca) => {
    setForm((prev) => ({ ...prev, ...mudanca }));
    setRecusa(null);
  }, []);

  const patchCondicao = useCallback((indice, mudanca) => {
    setForm((prev) => ({
      ...prev,
      condicoes: prev.condicoes.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)),
    }));
    setRecusa(null);
  }, []);

  const addCondicao = useCallback(() => {
    setForm((prev) => {
      // Só métricas ainda não usadas: o servidor recusa a mesma métrica duas
      // vezes na mesma regra, então nem oferecer é melhor que deixar errar.
      const usadas = prev.condicoes.map((c) => c.metrica);
      const livre = metricas.find((m) => !usadas.includes(m.chave));
      if (!livre) return prev;
      return {
        ...prev,
        condicoes: [...prev.condicoes, { metrica: livre.chave, operador: '>=', valor: livre.min }],
      };
    });
  }, [metricas]);

  const removeCondicao = useCallback((indice) => {
    setForm((prev) => ({
      ...prev,
      condicoes: prev.condicoes.length > 1 ? prev.condicoes.filter((_, i) => i !== indice) : prev.condicoes,
    }));
  }, []);

  const salvar = useCallback(async () => {
    setSalvando(true);
    setRecusa(null);

    // Só o que o tipo escolhido usa é enviado. Mandar os dois blocos faria o
    // servidor validar uma variação que ninguém preencheu.
    const corpo = {
      nome: form.nome,
      tipo: form.tipo,
      severidade: form.severidade,
      cidade: form.cidade || '',
      ...(form.tipo === 'valor'
        ? { condicoes: form.condicoes.map((c) => ({ ...c, valor: Number(c.valor) })) }
        : {
          variacao: {
            ...form.variacao,
            delta: Number(form.variacao.delta),
            janelaHoras: Number(form.variacao.janelaHoras),
          },
        }),
    };

    const resultado = await criar(corpo);
    setSalvando(false);

    if (resultado.ok) {
      setForm(VAZIO);
      setAberto(false);
    } else {
      setRecusa(resultado.erro);
    }
  }, [criar, form]);

  const apagar = useCallback(async (id) => {
    if (armado !== id) {
      setArmado(id);
      return;
    }
    setArmado(null);
    await remover(id);
  }, [armado, remover]);

  const carregando = status === 'loading';

  return (
    <>
      <div className="alerts-header">
        <div>
          <h2 className="alerts-title">Regras de Alerta</h2>
          <span className="alerts-count">
            {regras.length} regra{regras.length === 1 ? '' : 's'}
            {limites ? ` · até ${limites.maxRegras}` : ''}
            {regras.some((r) => !r.ativa) && ` · ${regras.filter((r) => !r.ativa).length} desligada${regras.filter((r) => !r.ativa).length === 1 ? '' : 's'}`}
          </span>
        </div>
        <button
          className={`primary-btn${aberto ? ' is-active' : ''}`}
          onClick={() => { setAberto((v) => !v); setRecusa(null); }}
          disabled={Boolean(limites) && regras.length >= limites.maxRegras}
        >
          <Icon name={aberto ? 'close' : 'plus'} size={14} />
          {aberto ? 'Cancelar' : 'Nova regra'}
        </button>
      </div>

      {/* O que os limites embutidos não conseguem dizer, explicado uma vez no
          topo, em vez de um tooltip que ninguém abre. */}
      {!aberto && !regras.length && status === 'done' && (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="sliders" size={30} /></div>
          <div className="empty-text">Nenhuma regra criada</div>
          <div className="empty-sub">
            Os limites da barra lateral respondem se está quente ou frio demais. Uma regra responde o
            resto: calor com umidade alta ao mesmo tempo, ou a temperatura caindo rápido, que limite
            fixo nunca pega porque não cruza linha nenhuma.
          </div>
        </div>
      )}

      {aberto && (
        <section className="rule-form">
          <div className="rule-form-grid">
            <Campo label="Nome" htmlFor="ruleNome">
              <input
                id="ruleNome"
                className="input-select"
                maxLength={limites?.nomeMaxChars ?? 60}
                placeholder="Abafado, frente fria, ar ruim..."
                value={form.nome}
                onChange={(e) => patch({ nome: e.target.value })}
              />
            </Campo>

            <Campo label="Tipo" htmlFor="ruleTipo">
              <select id="ruleTipo" className="input-select" value={form.tipo} onChange={(e) => patch({ tipo: e.target.value })}>
                <option value="valor">Valor: condições ao mesmo tempo</option>
                <option value="variacao">Variação: o quanto mudou</option>
              </select>
            </Campo>

            <Campo label="Gravidade" htmlFor="ruleSev">
              <select id="ruleSev" className="input-select" value={form.severidade} onChange={(e) => patch({ severidade: e.target.value })}>
                <option value="warning">Atenção</option>
                <option value="danger">Crítico</option>
              </select>
            </Campo>

            <Campo label="Cidade" htmlFor="ruleCidade">
              <select id="ruleCidade" className="input-select" value={form.cidade} onChange={(e) => patch({ cidade: e.target.value })}>
                <option value="">Qualquer cidade</option>
                <option value={cidadeAtual}>Só {cidadeAtual}</option>
              </select>
            </Campo>
          </div>

          {form.tipo === 'valor' ? (
            <div className="rule-conditions">
              <div className="rule-hint">Dispara quando todas as condições valerem ao mesmo tempo.</div>

              {form.condicoes.map((condicao, i) => {
                const spec = porChave[condicao.metrica];
                return (
                  <div className="rule-condition" key={i}>
                    {i > 0 && <span className="rule-and">e</span>}

                    <select
                      className="input-select"
                      aria-label="Métrica"
                      value={condicao.metrica}
                      onChange={(e) => patchCondicao(i, { metrica: e.target.value })}
                    >
                      {metricas.map((m) => (
                        <option
                          key={m.chave}
                          value={m.chave}
                          disabled={m.chave !== condicao.metrica && form.condicoes.some((c) => c.metrica === m.chave)}
                        >
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="input-select"
                      aria-label="Operador"
                      value={condicao.operador}
                      onChange={(e) => patchCondicao(i, { operador: e.target.value })}
                    >
                      {operadores.map((op) => (
                        <option key={op.valor} value={op.valor}>{op.label}</option>
                      ))}
                    </select>

                    <input
                      className="input-select input-number"
                      type="number"
                      aria-label="Valor"
                      min={spec?.min}
                      max={spec?.max}
                      step={spec?.decimais ? 0.1 : 1}
                      value={condicao.valor}
                      onChange={(e) => patchCondicao(i, { valor: e.target.value })}
                    />

                    <span className="rule-unit">{spec?.unidade}</span>

                    {form.condicoes.length > 1 && (
                      <button className="icon-btn" onClick={() => removeCondicao(i)} aria-label="Remover condição">
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </div>
                );
              })}

              {form.condicoes.length < (limites?.maxCondicoes ?? 4) && form.condicoes.length < metricas.length && (
                <button className="ghost-btn" onClick={addCondicao}>
                  <Icon name="plus" size={12} /> Adicionar condição
                </button>
              )}
            </div>
          ) : (
            <div className="rule-conditions">
              <div className="rule-hint">
                Dispara quando a métrica andar essa quantidade dentro da janela. É o que pega frente
                fria: cair de 28 para 18 graus não cruza limite nenhum.
              </div>

              <div className="rule-condition">
                <select
                  className="input-select"
                  aria-label="Métrica"
                  value={form.variacao.metrica}
                  onChange={(e) => patch({ variacao: { ...form.variacao, metrica: e.target.value } })}
                >
                  {metricas.map((m) => <option key={m.chave} value={m.chave}>{m.label}</option>)}
                </select>

                <select
                  className="input-select"
                  aria-label="Direção"
                  value={form.variacao.direcao}
                  onChange={(e) => patch({ variacao: { ...form.variacao, direcao: e.target.value } })}
                >
                  <option value="cai">cair</option>
                  <option value="sobe">subir</option>
                  <option value="qualquer">variar</option>
                </select>

                <input
                  className="input-select input-number"
                  type="number"
                  aria-label="Quanto"
                  min={0.1}
                  step={0.5}
                  value={form.variacao.delta}
                  onChange={(e) => patch({ variacao: { ...form.variacao, delta: e.target.value } })}
                />
                <span className="rule-unit">{porChave[form.variacao.metrica]?.unidade}</span>

                <span className="rule-and">em</span>

                <input
                  className="input-select input-number"
                  type="number"
                  aria-label="Janela em horas"
                  min={limites?.janelaMinHoras ?? 1}
                  max={limites?.janelaMaxHoras ?? 48}
                  step={1}
                  value={form.variacao.janelaHoras}
                  onChange={(e) => patch({ variacao: { ...form.variacao, janelaHoras: e.target.value } })}
                />
                <span className="rule-unit">horas</span>
              </div>
            </div>
          )}

          {recusa && <div className="inline-notice inline-notice--error">{recusa}</div>}

          <div className="rule-actions">
            <button className="primary-btn" onClick={salvar} disabled={salvando || !form.nome.trim()}>
              <Icon name="check" size={14} />
              {salvando ? 'Criando...' : 'Criar regra'}
            </button>
          </div>
        </section>
      )}

      {status === 'error' && (
        <div className="inline-notice inline-notice--error">{erro}</div>
      )}

      <div className="rules-list">
        {carregando && Array.from({ length: 3 }, (_, i) => <div className="alert-skeleton" key={i} />)}

        {!carregando && regras.map((regra) => (
          <article className={`rule-item${regra.ativa ? '' : ' is-off'}`} key={regra.id}>
            <div className={`rule-badge rule-badge--${regra.severidade}`}>
              <Icon name={regra.tipo === 'variacao' ? 'chart' : 'sliders'} size={14} />
            </div>

            <div className="rule-body">
              <div className="rule-name">
                {regra.nome}
                {regra.cidade && <span className="rule-chip"><Icon name="pin" size={10} /> {regra.cidade}</span>}
                <span className="rule-chip">{regra.tipo === 'variacao' ? 'variação' : 'valor'}</span>
              </div>
              <div className="rule-desc">{regra.descricao}</div>
            </div>

            <div className="rule-controls">
              <button
                className={`toggle-btn${regra.ativa ? ' is-on' : ''}`}
                onClick={() => atualizar(regra.id, { ativa: !regra.ativa })}
                aria-pressed={regra.ativa}
                title={regra.ativa ? 'Desligar sem apagar' : 'Ligar'}
              >
                <span className="toggle-knob" />
              </button>

              <button
                className={`icon-btn icon-btn--danger${armado === regra.id ? ' is-armed' : ''}`}
                onClick={() => apagar(regra.id)}
                onBlur={() => setArmado((id) => (id === regra.id ? null : id))}
                title={armado === regra.id ? 'Clique de novo para apagar' : 'Apagar regra'}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
