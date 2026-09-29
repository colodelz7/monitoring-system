/**
 * Conjunto de ícones em SVG.
 *
 * Antes a interface usava caracteres geométricos do Unicode como ícone. Isso
 * depende da fonte instalada na máquina de quem abre: quando o glifo não
 * existe, o navegador desenha um retângulo vazio, e boa parte deles não existe
 * nas fontes padrão do Windows. Um traçado que vem junto com a página desenha
 * igual em qualquer máquina, herda a cor do texto por currentColor e acompanha
 * o tamanho da fonte.
 */

const PATHS = {
  // Navegação
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" /></>,
  compare: <><path d="M12 3v18" /><rect x="3" y="7" width="6" height="12" rx="1.5" /><rect x="15" y="4" width="6" height="15" rx="1.5" /></>,
  alert: <><path d="M10.3 4.3 2.6 17.4A1.9 1.9 0 0 0 4.3 20.3h15.4a1.9 1.9 0 0 0 1.7-2.9L13.7 4.3a1.9 1.9 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17.2h.01" /></>,
  history: <><path d="M3.2 12a8.8 8.8 0 1 0 2.6-6.2" /><path d="M3 4v4.5h4.5" /><path d="M12 7.5V12l3 1.8" /></>,

  // Painel lateral
  settings: <><circle cx="12" cy="12" r="3.1" /><path d="M19.1 14.4a1.6 1.6 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.4v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.4-1h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.7.3h.1a1.6 1.6 0 0 0 1-1.4v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.7v.1a1.6 1.6 0 0 0 1.4 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.4 1Z" /></>,
  sliders: <><path d="M4 20v-7M4 9V4M12 20v-9M12 7V4M20 20v-4M20 12V4" /><circle cx="4" cy="11" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="20" cy="14" r="2" /></>,
  bell: <><path d="M18 8.4a6 6 0 1 0-12 0c0 6.2-2.4 8-2.4 8h16.8s-2.4-1.8-2.4-8" /><path d="M13.7 20.2a2 2 0 0 1-3.4 0" /></>,
  save: <><path d="M19.5 21h-15A1.5 1.5 0 0 1 3 19.5v-15A1.5 1.5 0 0 1 4.5 3h11L21 8.5v11A1.5 1.5 0 0 1 19.5 21Z" /><path d="M7 3v6h8V3" /><path d="M7 21v-7h10v7" /></>,
  check: <path d="m4.5 12.6 5 5L19.5 6.5" />,

  // Ações
  trash: <><path d="M3.5 6h17" /><path d="M8.5 6V4.4A1.4 1.4 0 0 1 9.9 3h4.2a1.4 1.4 0 0 1 1.4 1.4V6" /><path d="M18.4 6v13.6a1.4 1.4 0 0 1-1.4 1.4H7a1.4 1.4 0 0 1-1.4-1.4V6" /><path d="M10 11v5.5M14 11v5.5" /></>,
  refresh: <><path d="M20.4 11.3a8.6 8.6 0 1 0-.6 4.6" /><path d="M21 5.5V12h-6.4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4.4-4.4" /></>,
  close: <path d="M18.5 5.5 5.5 18.5M5.5 5.5l13 13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eyeOff: <><path d="M10.6 6.2A9 9 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.4 3" /><path d="M6.3 6.4A15 15 0 0 0 3 12s4 6 9 6a8.7 8.7 0 0 0 4-1" /><path d="M3 3l18 18" /></>,
  menu: <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />,
  filter: <path d="M21 4.5H3l7.2 8.5v5.6l3.6 1.9V13L21 4.5Z" />,
  external: <><path d="M14 4h6v6" /><path d="M20 4 10.5 13.5" /><path d="M19 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5h4" /></>,
  send: <><path d="M21 3 10.5 13.5" /><path d="M21 3 14.3 21l-3.8-7.5L3 9.7 21 3Z" /></>,
  chevronLeft: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />,
  arrowUp: <><path d="M12 20V4.5" /><path d="m5.5 11 6.5-6.5L18.5 11" /></>,
  arrowDown: <><path d="M12 4v15.5" /><path d="M18.5 13 12 19.5 5.5 13" /></>,

  // Métricas e dados
  thermometer: <><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4.5 4.5 0 1 0 4 0Z" /><path d="M12 16.2v-5" /></>,
  droplet: <path d="M12 3.2s6 6 6 10.1a6 6 0 1 1-12 0c0-4.1 6-10.1 6-10.1Z" />,
  wind: <><path d="M3 8.5h10.5a3 3 0 1 0-3-3" /><path d="M3 12.8h15a3 3 0 1 1-3 3" /><path d="M3 17h7.5a2.4 2.4 0 1 1-2.4 2.4" /></>,
  leaf: <><path d="M20.5 3.5c0 9-5.3 14.8-12.5 14.8a6 6 0 0 1-4.4-1.8C8.7 6.3 14 3.5 20.5 3.5Z" /><path d="M3.5 20.5C6 14.5 10 10.8 15.5 8.5" /></>,
  quake: <path d="M2.5 12.5h3l2.2-6.4 3.4 12.4L14 9.2l1.8 4.6h5.7" />,
  pin: <><path d="M20 10.3c0 5.4-8 12-8 12s-8-6.6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="8.8" /><path d="M12 6.8V12l3.4 2" /></>,
  depth: <><path d="M12 3.5v13" /><path d="M7 11.5 12 16.5l5-5" /><path d="M4 20.5h16" /></>,
  bolt: <path d="M13.5 2.5 4 14h7l-.5 7.5L20 10h-7l.5-7.5Z" />,
  chart: <><path d="M3.5 20.5h17" /><path d="M6.5 17V10M11 17V5.5M15.5 17v-4.5M20 17V8" /></>,
  cloud: <><path d="M17.3 18.5H7a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.8a4.9 4.9 0 0 1-.7 9.7Z" /></>,
  list: <><path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12" /><path d="M3.8 6.5h.01M3.8 12h.01M3.8 17.5h.01" /></>,
  package: <><path d="M20.5 8.2v7.6a1.6 1.6 0 0 1-.8 1.4l-6.9 3.9a1.6 1.6 0 0 1-1.6 0l-6.9-3.9a1.6 1.6 0 0 1-.8-1.4V8.2a1.6 1.6 0 0 1 .8-1.4l6.9-3.9a1.6 1.6 0 0 1 1.6 0l6.9 3.9a1.6 1.6 0 0 1 .8 1.4Z" /><path d="m3.8 7.4 8.2 4.7 8.2-4.7" /><path d="M12 21v-8.9" /></>,
  trophy: <><path d="M7.5 4h9v5.5a4.5 4.5 0 1 1-9 0V4Z" /><path d="M7.5 5.5H5a2 2 0 0 0 2.5 4" /><path d="M16.5 5.5H19a2 2 0 0 1-2.5 4" /><path d="M12 14v3.5" /><path d="M8.5 20.5h7" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3.5 12.5 8.5 4.7 8.5-4.7" /><path d="m3.5 16.8 8.5 4.7 8.5-4.7" /></>,
  dot: <circle cx="12" cy="12" r="5" />,
  sparkle: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6-5.7-1.8L10.2 9 12 3.5Z" /><path d="M18.5 16.5 19.3 19l2.2.8-2.2.8-.8 2.2" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></>,
  moon: <><path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7Z" /></>,
  bot: <><rect x="4" y="7.5" width="16" height="12" rx="4" /><path d="M12 7.5V4" /><circle cx="12" cy="3" r="1.4" /><path d="M9.5 13v1.6M14.5 13v1.6" /><path d="M1.8 12.5v3M22.2 12.5v3" /></>,
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.7, style }) {
  const content = PATHS[name];
  if (!content) return null;

  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {content}
    </svg>
  );
}

/** Marcador sólido, para legenda e listas onde a cor é a informação. */
export function Bullet({ color, size = 9, glow = true, className = '' }) {
  return (
    <span
      className={`bullet${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: glow ? `0 0 ${Math.round(size * 0.9)}px ${color}` : 'none',
      }}
      aria-hidden="true"
    />
  );
}
