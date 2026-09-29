import Icon from '../Icon';

/**
 * Comparação com o próprio histórico, recordes do período e o que fugiu do
 * normal hoje.
 *
 * Um número sozinho não diz se o dia está quente: 18 graus é frio em Cuiabá e
 * ameno em Curitiba. A referência é a própria cidade nos últimos dias, e é isso
 * que esta faixa entrega.
 *
 * Fica escondida enquanto não houver dias gravados suficientes. Preferi sumir a
 * mostrar uma base inventada a partir de dois pontos: uma média de dois dias
 * não é uma média, é um palpite com cara de dado.
 */
function formatarDia(iso) {
  if (!iso) return '--';
  const [, mes, dia] = String(iso).split('-');
  return dia && mes ? `${dia}/${mes}` : iso;
}

/** Um recorde só aparece se existir. Cidade nova não tem recorde de nada. */
function Recorde({ icone, valor, unidade, dia, titulo, prefixo }) {
  if (!valor) return null;
  return (
    <span className="trend-record" title={titulo}>
      <Icon name={icone} size={11} />
      {prefixo} {valor.valor}{unidade} em {formatarDia(valor.dia ?? dia)}
    </span>
  );
}

export default function TrendStrip({ trend, anomalia }) {
  const achados = anomalia?.disponivel ? (anomalia.achados ?? []) : [];

  if (!trend?.resumo && !achados.length) return null;

  const { diferenca, media7, recordes, diasObservados, janelaDias } = trend ?? {};
  const tom = diferenca == null || Math.abs(diferenca) < 1
    ? 'neutro'
    : diferenca > 0 ? 'quente' : 'frio';

  const janela = `Nos últimos ${janelaDias ?? diasObservados} dias`;

  return (
    <>
      {/* A anomalia vem antes da comparação porque é a informação mais forte
          das duas: "fora do normal" muda o que a pessoa faz a seguir, a média
          só contextualiza. */}
      {achados.map((achado) => (
        <div className={`anomaly-strip anomaly-strip--${achado.direcao}`} key={achado.metrica}>
          <Icon name="sparkle" size={15} />
          <div className="anomaly-text">
            <strong>Fora do normal:</strong> {achado.mensagem}
          </div>
          <span className="anomaly-score" title="A quantos desvios padrão da média desta cidade">
            {achado.escore > 0 ? '+' : ''}{achado.escore}σ
          </span>
        </div>
      ))}

      {trend?.resumo && (
        <div className="trend-strip" aria-label="Comparação com o histórico desta cidade">
          <div className={`trend-main trend-main--${tom}`}>
            <Icon name="chart" size={14} />
            <span className="trend-text">{trend.resumo}</span>
            {media7 != null && (
              <span className="trend-sub">média de 7 dias: {media7}°C</span>
            )}
          </div>

          <div className="trend-records">
            <Recorde icone="thermometer" valor={recordes?.maisQuente} unidade="°C" titulo={`${janela}, o dia mais quente`} prefixo="máx" />
            <Recorde icone="thermometer" valor={recordes?.maisFrio} unidade="°C" titulo={`${janela}, o dia mais frio`} prefixo="mín" />
            <Recorde icone="wind" valor={recordes?.maisVentoso} unidade=" m/s" titulo={`${janela}, o dia mais ventoso`} prefixo="vento" />
            <Recorde icone="droplet" valor={recordes?.maisUmido} unidade="%" titulo={`${janela}, o dia mais úmido`} prefixo="umidade" />
            <Recorde icone="droplet" valor={recordes?.maisSeco} unidade="%" titulo={`${janela}, o dia mais seco`} prefixo="seco" />
            {/* Da pressão interessa o fundo: é ele que antecede tempo ruim. */}
            <Recorde icone="depth" valor={recordes?.menorPressao} unidade=" hPa" titulo={`${janela}, a menor pressão`} prefixo="pressão" />
            <span className="trend-base">{diasObservados} dias registrados</span>
          </div>
        </div>
      )}
    </>
  );
}
