import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'monitoring:theme';
const THEMES = ['dark', 'light'];

function stored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    // Navegação privada ou storage bloqueado. Sem escolha salva, seguimos o sistema.
    return null;
  }
}

/**
 * Aplica o tema no elemento raiz.
 *
 * Precisa ser síncrono e acontecer antes da re-renderização, não dentro de um
 * efeito. Quem lê a paleta com getComputedStyle durante o render, como o tema
 * dos gráficos, leria os valores do tema anterior se o atributo só chegasse
 * depois: o resultado eram eixos brancos sobre fundo branco.
 */
function apply(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--bg0').trim();
    if (bg) meta.setAttribute('content', bg);
  }
}

function systemTheme() {
  if (typeof matchMedia !== 'function') return 'dark';
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Tema da interface, com três estados possíveis de origem.
 *
 * Sem escolha salva, vale a preferência do sistema, e ela continua valendo se a
 * pessoa trocar o tema do sistema com a página aberta. Assim que alguém usa o
 * botão, a escolha passa a ser explícita e para de acompanhar o sistema, que é
 * o que se espera de um controle manual.
 *
 * O atributo entra no elemento raiz porque o CSS inteiro pendura a paleta em
 * :root[data-theme], e a cor da barra do navegador acompanha pelo meta
 * theme-color, senão o celular mostra uma faixa escura sobre a página clara.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => stored() ?? systemTheme());
  const [explicit, setExplicit] = useState(() => stored() != null);

  // Cobre a montagem inicial e a mudança vinda do sistema. A troca manual já
  // aplicou o tema de forma síncrona, e repetir aqui é inofensivo.
  useEffect(() => {
    apply(theme);
  }, [theme]);

  // Só acompanha o sistema enquanto ninguém escolheu manualmente.
  useEffect(() => {
    if (explicit || typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-color-scheme: light)');
    const onChange = (event) => setTheme(event.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [explicit]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      // Antes do setState, para que o próximo render já leia a paleta nova.
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Não poder gravar não impede de trocar agora.
      }
      return next;
    });
    setExplicit(true);
  }, []);

  return { theme, toggle, isLight: theme === 'light' };
}
