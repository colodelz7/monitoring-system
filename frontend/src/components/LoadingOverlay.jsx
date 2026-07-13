import { useState, useEffect } from 'react';

const LOADING_MSGS = [
  'INICIALIZANDO SISTEMA...',
  'CONECTANDO AO SERVIDOR...',
  'CARREGANDO APIS...',
  'PRONTO.',
];

export default function LoadingOverlay({ onDone }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setMsgIdx((i) => {
        const next = i + 1;
        if (next >= LOADING_MSGS.length) {
          clearInterval(iv);
          setTimeout(() => {
            setHidden(true);
            setTimeout(() => { setRemoved(true); onDone(); }, 600);
          }, 300);
        }
        return next;
      });
    }, 420);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (removed) return null;

  return (
    <div id="loadingOverlay" className={hidden ? 'hidden' : ''}>
      <div className="loading-logo">🌍</div>
      <div className="loading-title">MONITORING SYSTEM</div>
      <div className="loading-bar-wrap"><div className="loading-bar"></div></div>
      <div className="loading-sub" id="loadingMsg">
        {LOADING_MSGS[Math.min(msgIdx, LOADING_MSGS.length - 1)]}
      </div>
    </div>
  );
}
