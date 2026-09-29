import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../lib/api';

/**
 * Preferências de apresentação desta máquina.
 *
 * Densidade, ordem dos cartões e lista de cidades acompanhadas. Nenhuma delas
 * descreve o que está sendo mostrado, então nenhuma vai para o endereço: um
 * link compartilhado não deve carregar o gosto de quem o mandou.
 *
 * A densidade é aplicada no elemento raiz assim que o estado muda, porque é o
 * CSS que resolve `--densidade` e ele precisa do atributo já no lugar antes do
 * próximo quadro.
 */

const MAX_ACOMPANHADAS = 6;

export function usePrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    // Confortável é o padrão e não precisa de atributo: assim o CSS base vale
    // sem nada escrito no HTML.
    if (prefs.densidade === 'compacta') document.documentElement.setAttribute('data-densidade', 'compacta');
    else document.documentElement.removeAttribute('data-densidade');
  }, [prefs.densidade]);

  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const toggleDensidade = useCallback(() => {
    update({ densidade: prefs.densidade === 'compacta' ? 'confortavel' : 'compacta' });
  }, [prefs.densidade, update]);

  const toggleCartao = useCallback((id) => {
    setPrefs((prev) => {
      const ocultos = prev.cartoesOcultos.includes(id)
        ? prev.cartoesOcultos.filter((item) => item !== id)
        : [...prev.cartoesOcultos, id];
      const next = { ...prev, cartoesOcultos: ocultos };
      savePrefs(next);
      return next;
    });
  }, []);

  /**
   * Move um cartão uma posição para cada lado.
   *
   * A ordem só é gravada quando alguém a muda pela primeira vez, e nesse
   * momento ela é congelada a partir da ordem que estava valendo. Gravar antes
   * disso prenderia o painel a uma lista antiga: um cartão novo no servidor
   * nunca apareceria, porque não estaria na ordem salva.
   */
  const moverCartao = useCallback((id, direcao, ordemAtual) => {
    setPrefs((prev) => {
      const base = prev.ordemCartoes.length ? prev.ordemCartoes : ordemAtual;
      const de = base.indexOf(id);
      const para = de + direcao;
      if (de < 0 || para < 0 || para >= base.length) return prev;

      const ordem = [...base];
      [ordem[de], ordem[para]] = [ordem[para], ordem[de]];

      const next = { ...prev, ordemCartoes: ordem };
      savePrefs(next);
      return next;
    });
  }, []);

  const acompanhar = useCallback((cidade) => {
    setPrefs((prev) => {
      const nome = String(cidade || '').trim();
      if (!nome) return prev;

      const jaTem = prev.cidadesAcompanhadas.some((c) => c.toLowerCase() === nome.toLowerCase());
      const lista = jaTem
        ? prev.cidadesAcompanhadas.filter((c) => c.toLowerCase() !== nome.toLowerCase())
        : [...prev.cidadesAcompanhadas, nome].slice(-MAX_ACOMPANHADAS);

      const next = { ...prev, cidadesAcompanhadas: lista };
      savePrefs(next);
      return next;
    });
  }, []);

  const restaurarCartoes = useCallback(() => {
    update({ ordemCartoes: [], cartoesOcultos: [] });
  }, [update]);

  return useMemo(
    () => ({
      prefs,
      update,
      toggleDensidade,
      toggleCartao,
      moverCartao,
      acompanhar,
      restaurarCartoes,
      maxAcompanhadas: MAX_ACOMPANHADAS,
      personalizado: prefs.ordemCartoes.length > 0 || prefs.cartoesOcultos.length > 0,
    }),
    [prefs, update, toggleDensidade, toggleCartao, moverCartao, acompanhar, restaurarCartoes],
  );
}

export { DEFAULT_PREFS };
