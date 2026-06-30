# 🌍 Monitoramento Ambiental Real-Time

Sistema de monitoramento climático e sísmico em tempo real com alertas automáticos, mapa interativo e comparativo de cidades.

## 🛠️ Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript |
| Backend | Node.js + Express |
| Bibliotecas | Plotly.js · Leaflet.js |
| APIs | OpenWeatherMap · USGS Earthquake · Nodemailer |

## 📁 Estrutura

```
├── frontend/
│   ├── index.html      # Entrada da aplicação
│   ├── index.js        # Lógica do dashboard
│   └── style.css       # Estilos (tema sci-fi azul escuro)
└── backend/
    ├── back.js         # Servidor Express
    ├── package.json
    ├── .gitignore
    └── .env            # Variáveis de ambiente necessárias
```

## 🚀 Rodando localmente

### ⚙️ Backend

```bash
cd backend
npm install
npm start
```

### 💻 Frontend

```bash
cd frontend
npx serve .
```
