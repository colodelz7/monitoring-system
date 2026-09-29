# Monitoring System

Painel de monitoramento ambiental em tempo real. Acompanha clima, qualidade do ar e atividade sísmica global de qualquer cidade, dispara alertas por limite, por regra composta, por variação e por anomalia, e mantém o histórico completo de tudo que já disparou.

Backend em Node com Express, frontend em React com Vite, e Docker Compose para subir os dois.

## O que o sistema faz

**Painel** com temperatura, umidade, vento, pressão, qualidade do ar e contagem de eventos sísmicos, atualizando sozinho no intervalo escolhido.

**Previsão de 7 dias** em uma aba própria, com mínima, máxima, chance de chuva e céu de cada dia, mais um gráfico da faixa de temperatura e da chuva prevista. Vem da Open-Meteo, que publica a semana sem exigir chave, então não consome cota da OpenWeatherMap.

**Mapa sísmico** global sobre um globo interativo, com janelas de 24 horas até um ano, classificado por magnitude. Dá para alternar entre globo e mapa plano, filtrar faixas de magnitude clicando na legenda, voar até a cidade atual e reenquadrar. Um raio opcional recorta o feed ao redor da cidade: o mundo inteiro tremendo não diz nada sobre onde você está, e um M4 a duzentos quilômetros diz.

**Comparação** de duas cidades lado a lado, com o melhor valor de cada métrica destacado.

**Alertas** de quatro origens. Os limites da barra lateral disparam por temperatura máxima, mínima e magnitude sísmica. As regras, criadas na aba Regras, cobrem o que limite fixo não alcança: uma regra de valor combina condições que precisam valer ao mesmo tempo, como calor com umidade alta, e uma regra de variação dispara quando a métrica anda muito dentro de uma janela, como a temperatura caindo 8 graus em 3 horas, que não cruza limite nenhum. E a detecção de anomalia avisa sozinha quando o dia foge do que é normal naquela cidade, comparando com os últimos 30 dias gravados, sem precisar de configuração. Opcionalmente também por e-mail e por notificação do navegador.

**Comparação com o próprio histórico** em cada painel: quanto o agora está acima ou abaixo da média recente daquela cidade, e os recordes do período, com o dia em que aconteceram. Um número sozinho não diz se o dia está quente, porque 18 graus é frio em Cuiabá e ameno em Curitiba.

**Cidades acompanhadas**, uma lista curta na barra lateral que mostra a temperatura de cada uma sem trocar o painel de cidade. Um clique leva o painel inteiro para a escolhida.

**Histórico de alertas** com a trilha completa de cada evento: quando disparou, qual sensor, qual cidade, qual gravidade, qual valor foi medido e qual limite foi ultrapassado. Alertas de regra guardam também de qual regra vieram, então a trilha continua legível depois de a regra ser apagada. Filtra por tipo, cidade, gravidade e período, com intervalo de datas escolhido à mão quando o período relativo não serve, tem busca por texto, e cada alerta abre em detalhe.

**ColodelBot**, o assistente no botão flutuante. Ele recebe o estado real do sistema a cada pergunta: a leitura atual da cidade que está na tela, a previsão, o resumo sísmico, os alertas disparados com valor e limite, e as estatísticas do histórico. As respostas chegam em streaming. Ele consulta qualquer cidade do mundo, compara duas, olha o histórico, responde sobre tendência a partir dos dias gravados, ajusta o painel e cria regras de alerta a pedido, sempre pela mesma validação das rotas normais. Também responde perguntas gerais, avisando quando a resposta não vem dos dados do painel. Sem `GEMINI_API_KEY` configurada, o botão simplesmente não aparece.

**Tema claro e escuro**, com densidade confortável ou compacta. A escolha fica nesta máquina e sobrevive a recarregar a página. Os cartões do painel também podem ser reordenados e escondidos.

**Endereço por aba**: cada aba tem seu próprio hash, então recarregar a página volta para onde você estava, o botão de voltar do navegador funciona e dá para mandar o link de uma aba específica.

Sem chave da OpenWeatherMap o sistema roda em modo demo, com dados simulados e um selo indicando isso na tela.

## Como rodar

Requisitos: Node 20.19 ou superior. As chaves de API são opcionais para experimentar, necessárias para dados reais.

### Docker, que é o caminho mais curto

```bash
cp backend/.env.example backend/.env   # preencha OWM_KEY e STADIA_KEY
docker compose up --build
```

O painel fica em `http://localhost:8080`. Para outra porta, defina `WEB_PORT`.

O backend não publica porta nenhuma: só é alcançável pela rede interna do compose, através do nginx. O histórico de alertas fica no volume `alerts-data`, então sobrevive a `docker compose down` e a reconstruções da imagem.

### Local, para desenvolver

Em um terminal:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Em outro:

```bash
cd frontend
npm install
npm run dev
```

O painel abre em `http://localhost:5175`. O dev server do Vite faz proxy de `/api` para o backend, então o navegador enxerga uma origem só, igual ao que acontece em produção.

### Servir em uma origem só

Em desenvolvimento são dois processos. Para rodar como um, o backend serve também o build do frontend, e página e API passam a viver na mesma origem, atrás de uma senha.

```bash
cd frontend && npm run build
cd ../backend
# defina ACCESS_USER e ACCESS_PASSWORD no .env
npm run serve
```

`npm run serve` recusa subir sem `ACCESS_PASSWORD`. Esta API é uma ponte para serviços que cobram por cota; deixá-la sem senha fora do loopback abre essa ponte para quem descobrir o endereço, e o rate limit segura abuso, não acesso.

A porta de entrada vale para tudo, página e API. A única exceção é `GET /api/health`, deixada aberta para que o healthcheck do container consiga medir que o serviço está vivo; ela revela apenas tempo de atividade.

### Verificações

```bash
cd backend
npm run check          # tudo: smoke, segurança e porta de entrada
npm run smoke          # só o smoke
npm run check:security # só a segurança
npm run check:access   # só a porta de entrada
```

`check:security` apaga o histórico em um dos testes e `smoke` grava alertas ao exercitar `GET /api/data`. Por isso os dois forçam um `DATA_DIR` temporário antes de carregar qualquer módulo do servidor, e abortam se a isolação não tiver funcionado.

```bash
cd frontend
npm run build
npm run lint
```

Os dois scripts de verificação do backend rodam com `DATA_DIR` apontado para um diretório temporário. O histórico real nunca é tocado por uma verificação.

## O que o projeto faz de segurança

O backend é uma ponte para APIs de terceiros que cobram por cota. A maior parte do que está aqui existe para que essa ponte não vire um proxy gratuito para qualquer um.

**CORS restrito.** Só as origens listadas em `CORS_ORIGIN` recebem resposta no navegador. Atrás do nginx, a API é servida na mesma origem do frontend e nenhuma requisição é cross-origin.

**Rate limit em tudo.** Teto global por IP, mais tetos específicos: rotas que consomem cota externa, autocomplete de cidades (que dispara a cada tecla) e operações destrutivas têm limites próprios. O limite só confia em `X-Forwarded-For` quando `TRUST_PROXY` está ligado, porque confiar por padrão permitiria burlar o controle forjando o cabeçalho.

**Cache de resposta com coalescência.** Cada chamada externa é memorizada por um tempo, e requisições simultâneas para a mesma coisa compartilham uma única ida ao upstream. Uma rajada de clientes não vira uma rajada de chamadas na API paga. Se o upstream cair, o último resultado bom é servido no lugar.

**Limites do cliente não controlam o servidor.** Os limites de alerta vêm da query string e ficam presos a uma faixa sensata antes de qualquer uso. Se a combinação for absurda, volta para o padrão. E o disparo de e-mail usa limites próprios, definidos no servidor: antes, um `GET /api/data?tempMax=-50` forçava alerta crítico e mandava e-mail.

**Deduplicação de alertas.** Cada alerta tem uma identidade estável, então uma condição que persiste entre ciclos de atualização é gravada uma vez, não a cada 30 segundos.

**Entrada higienizada.** Nome de cidade e termo de busca viram parte de uma URL de terceiros, então só passam letras, números e a pontuação usada em topônimos, com teto de tamanho.

**Saída de terceiros tratada como hostil.** As URLs de evento da USGS são validadas contra o domínio e o protocolo esperados, e o conteúdo do popup do mapa é montado com nós do DOM em vez de HTML concatenado, então texto vindo de fora nunca é interpretado como marcação.

**O assistente não é uma porta aberta.** A chave do modelo nunca sai do servidor, o contexto é montado no backend a partir dos mesmos serviços que alimentam o painel (o cliente manda a pergunta, nunca os dados), a rota tem o teto de requisições mais apertado do sistema, o tamanho da mensagem e do histórico é limitado, e fechar o painel aborta a chamada em andamento em vez de continuar gastando cota. A resposta do modelo é renderizada como elementos React, não como HTML: não existe `dangerouslySetInnerHTML` em lugar nenhum, então não há o que sanitizar.

**Cabeçalhos de segurança** via helmet, com política de conteúdo mínima, já que a API só devolve JSON. `x-powered-by` desligado e `Cache-Control: no-store` em toda a API.

**Escuta no loopback.** Por padrão o servidor aceita conexões apenas de `127.0.0.1`. No container, onde a rede já é isolada e o nginx é a única porta de entrada, o Dockerfile define `HOST=0.0.0.0` explicitamente.

**Teto de tamanho de corpo** e timeout nas chamadas externas, para que um upstream lento ou uma resposta gigante não segurem o processo.

**Porta de entrada quando sai do loopback.** Com `ACCESS_PASSWORD` definida, toda requisição precisa passar por HTTP Basic, incluindo os assets da página e o stream do assistente. A escolha foi Basic sobre HTTPS em vez de sessão própria: o navegador cuida do formulário, a credencial acompanha toda requisição sem cookie, e menos código próprio no caminho da autenticação significa menos lugar para errar.

**Limpar o histórico exige autorização e intenção.** Em produção, sem `ADMIN_TOKEN` configurado, a operação fica indisponível em vez de aberta. E em qualquer ambiente ela só acontece com o cabeçalho `x-confirm-clear: apagar-historico`, porque sem isso um DELETE disparado de passagem, por um script de teste ou por uma varredura de rotas, apagava a trilha inteira sem pedir nada. Na interface o botão pede um segundo clique. Antes de truncar, o servidor guarda uma cópia do arquivo ao lado, então uma limpeza indevida se desfaz com um rename.

**Container sem privilégio.** O backend roda como usuário `node`, com `tini` como PID 1 para que o desligamento seja limpo.

## Onde fica o histórico de alertas

Em `DATA_DIR` (por padrão `backend/data/`), num arquivo NDJSON append-only. No Docker é um volume montado em `/data`.

A escolha é deliberada. Um array JSON obrigaria a reescrever o arquivo inteiro a cada alerta e não sobreviveria a duas escritas simultâneas. SQLite resolveria as consultas, mas traria módulo nativo para um volume de dados que é de milhares de linhas, não de milhões. NDJSON dá append em uma única chamada, uma linha truncada por queda de energia é descartada na leitura sem levar o resto junto, o arquivo rotaciona com `mv` e é legível com `grep`. Nesse tamanho, os filtros rodam em memória em microssegundos.

O ponto principal é outro: o estado passa a morar onde a configuração manda, e não onde o `.gitignore` deixou.

Na primeira execução, um `alerts_log.json` antigo é migrado automaticamente e deduplicado, e o original é preservado como `alerts_log.json.migrado`.

Apagar o histórico pela interface ou pela API grava antes uma cópia `alerts-<data>.snapshot.ndjson` no mesmo diretório, e as cinco mais recentes são mantidas. Nenhuma limpeza é definitiva por acidente.

## Estrutura

```
backend/
  src/
    config/      leitura e validação do ambiente
    lib/         cliente HTTP, cache TTL, log
    domain/      constantes e saneamento de entrada
    services/    clima, sismos, qualidade do ar, alertas, e-mail, histórico
    middleware/  CORS, cabeçalhos, rate limit, erros
    routes/      as rotas da API
  scripts/       smoke e verificação de segurança
frontend/
  scripts/       cópia do worker do MapLibre para public
  src/
    components/  interface, dividida por aba
    hooks/       dados, animação, atalhos, preferências
    lib/         cliente da API, tema dos gráficos, markdown mínimo
    styles/      folha do assistente, carregada pelo próprio componente
```

## Uma armadilha que vale conhecer

O MapLibre decodifica os tiles vetoriais em um web worker, e ele monta a URL
desse worker em tempo de execução, a partir de `import.meta.url`. Essa
referência não sobrevive a nenhum dos dois ambientes: em desenvolvimento o Vite
injeta um import de `/@vite/client` dentro do arquivo, e esse módulo toca
`document`, que não existe em worker; no build o Rollup não emite o arquivo,
porque a referência escapa da análise estática, e o navegador recebe 404.

O sintoma engana: o estilo carrega, o fundo pinta, os controles de zoom
aparecem, nenhum evento de erro dispara, e o mapa fica preto. É o evento
`load` que nunca chega, porque nenhum tile é decodificado.

A saída é `scripts/copy-maplibre-worker.mjs`, que copia o worker e o chunk
compartilhado para `public/maplibre`, onde o Vite serve arquivos sem tocar
neles. O script roda sozinho pelos ganchos `predev` e `prebuild`, e
`src/lib/maplibreSetup.js` aponta o `setWorkerUrl` para lá. O mapa também
passou a mostrar o erro na tela quando algo falha, em vez de ficar preto em
silêncio.

Toda a lógica vive no backend. As rotas devolvem o painel já resolvido: os cartões chegam com valor, cor e legenda prontos, os gráficos chegam como séries, o mapa chega como GeoJSON, e o estado do sistema chega calculado. O frontend decide apenas como apresentar.

## API

| Rota | O que faz |
| --- | --- |
| `GET /api/data` | Painel completo de uma cidade: clima, previsão, sismos, ar, alertas, cartões e séries |
| `GET /api/compare` | Duas cidades lado a lado, com os vencedores de cada métrica resolvidos |
| `GET /api/geocode` | Autocomplete de cidades |
| `GET /api/alerts-log` | Histórico filtrado e paginado, com as facetas dos filtros |
| `GET /api/alerts-log/:id` | Um evento do histórico |
| `GET /api/alerts-log/export` | Baixa o histórico filtrado em `csv` ou `json` |
| `DELETE /api/alerts-log` | Limpa o histórico; exige confirmação explícita sempre e `ADMIN_TOKEN` em produção |
| `GET /api/assistant/status` | Se o assistente está ativo e com qual modelo |
| `POST /api/assistant/chat` | Conversa com o assistente, resposta em streaming SSE |
| `GET /api/world-clock` | Horário das cidades da barra superior |
| `GET /api/config` | Configuração pública do cliente, incluindo o estilo do mapa |
| `GET /api/cache-status` | Estado do cache offline por cidade |
| `GET /api/health` | Saúde do serviço |
| `GET /api/stats` | Tamanho do histórico e aproveitamento dos caches |

## Acessibilidade e movimento

As animações ajudam a leitura: a troca de aba e de cidade acontece em dois tempos para o olho acompanhar, os contadores interpolam a partir do valor anterior em vez de contar do zero, os gráficos crescem a partir do eixo quando entram em tela, e os espaços reservados têm a altura do conteúdo real para o layout não saltar quando os dados chegam.

Com `prefers-reduced-motion: reduce`, tudo que se move por decoração para. O que comunica estado continua legível: o ponto de status mantém a cor sem pulsar, e o botão de atualizar indica que está ocupado pela opacidade em vez do giro.

## Créditos de dados

Clima, qualidade do ar e geocodificação pela [OpenWeatherMap](https://openweathermap.org/). Atividade sísmica pelo [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/). Tiles do mapa pela [Stadia Maps](https://stadiamaps.com/).

## Licença

MIT. Veja [LICENSE](LICENSE).
