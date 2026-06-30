# 🌍 Monitoramento Ambiental Real-Time

Dashboard de monitoramento climático e sísmico em tempo real, com alertas automáticos, mapa interativo e comparativo de cidades.


## ✨ Funcionalidades

- 🌡 **Clima em tempo real** — temperatura, umidade, vento, pressão e descrição do tempo
- 🌿 **Qualidade do ar (AQI)** — índice e componentes via OpenWeatherMap Air Pollution API
- 📊 **Previsão de 48h** — gráfico de temperatura e gráfico de precipitação (chuva/neve)
- 🌐 **Mapa sísmico interativo** — eventos globais via USGS com marcadores clicáveis (Leaflet.js)
- ⊞ **Comparativo de cidades** — dois locais lado a lado em tempo real
- 🔔 **Alertas automáticos** — por e-mail (Nodemailer) e push notification nativa do browser
- 📋 **Histórico de alertas** — log persistente salvo em `alerts_log.json` no servidor
- 📦 **Cache offline** — serve último resultado quando a API estiver indisponível
- 🕐 **Widget de hora mundial** — relógios em tempo real de 5 cidades globais
- 🔍 **Busca livre de localização** — autocomplete com geocodificação via OWM Geocoding API

---

## 🗂 Estrutura do Projeto

```
Monitoramento/
├── backend/
│   ├── back.js            ← Servidor Node.js + Express (API principal)
│   ├── package.json
│   ├── alerts_log.json    ← Gerado automaticamente ao disparar alertas
│   ├── .env               ← Variáveis de ambiente (API Keys, e-mail)
│   └── .gitignore
├── frontend/
│   ├── index.html         ← Estrutura da aplicação
│   ├── style.css          ← Tema sci-fi azul escuro
│   ├── index.js           ← Lógica do dashboard
│   └── .gitignore
├── .gitignore
└── README.md
```

---

## 🚀 Como rodar

### 1. Backend

```bash
cd backend
npm install
npm start
```

### 2. Frontend

```bash
cd frontend
npx serve .
```
## 📝 Projeto Integrador — UTP 2026

Desenvolvido como **Projeto Integrador (PI)** do curso de Análise e Desenvolvimento de Sistemas da **Universidade Tuiuti do Paraná**.

**Alunos:** Guilherme Colodel, Enzo Age da Silveira, Giovanni Filippi da Silva, Gabriel da Freiria  
**Orientador:** Prof. Luiz Altamir Correa Junior
