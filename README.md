# 🌍 Monitoramento Ambiental Real-Time

Dashboard de monitoramento climático e sísmico em tempo real.
**Projeto Integrador — Universidade Tuiuti do Paraná, 2026**

---

## 📁 Estrutura do Projeto

```
monitoramento/
├── backend/
│   ├── back.js          ← Servidor Node.js + Express (API)
│   ├── package.json
│   ├── .env             ← Configurações (API Key)
│   └── .gitignore
├── frontend/
│   ├── index.html       ← Página principal
│   ├── style.css        ← Estilos (tema azul escuro)
│   ├── index.js         ← Lógica do dashboard
│   └── .gitignore
├── .gitignore
└── README.md
```

---

## 🚀 Passo a Passo para Rodar

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 18 ou superior instalado
- Um navegador moderno (Chrome, Firefox, Edge)

---

### 1️⃣ Instalar dependências do Backend

Abra o terminal, entre na pasta `backend` e instale:

```bash
cd backend
npm install
```

---

### 2️⃣ Iniciar o Backend

Ainda dentro da pasta `backend`:

```bash
npm start
```

Você verá a mensagem:
```
🌍  Backend rodando em http://localhost:3001
```

> Deixe este terminal aberto.

---

### 3️⃣ Abrir o Frontend

Abra o arquivo `frontend/index.html` diretamente no navegador.

**Opção A — Arraste o arquivo para o navegador:**
- Abra o explorador de arquivos
- Vá até a pasta `frontend/`
- Arraste `index.html` para a janela do Chrome/Firefox

**Opção B — Via terminal (recomendado para evitar erros de CORS):**

Instale o servidor estático global (só precisa fazer uma vez):
```bash
npm install -g serve
```

Depois, na pasta `frontend/`:
```bash
cd ../frontend
serve .
```

Acesse: **http://localhost:3000**

---

### 4️⃣ (Opcional) Usar dados reais do clima

Para ativar dados climáticos reais (em vez do modo demo):

1. Crie uma conta gratuita em [openweathermap.org](https://openweathermap.org/)
2. Vá em **API Keys** e copie sua chave
3. Cole no campo **"API Key OpenWeatherMap"** na sidebar do dashboard

> **Dados sísmicos** (USGS) já são públicos e funcionam sem chave!

---

## 📊 Funcionalidades

| Recurso | Descrição |
|---|---|
| 🌡 Temperatura | Atual, mín, máx, descrição |
| 💧 Umidade & Ventos | Umidade, velocidade do vento, pressão |
| 🌐 Mapa Sísmico | Eventos globais via USGS (24h ou 7 dias) |
| 🔔 Alertas | Temperatura crítica, sismos, variação brusca |
| 📈 Previsão | Gráfico de temperatura nas próximas 48h |
| 🔄 Auto-refresh | Intervalo configurável de 10 a 300 segundos |

---

## 👨‍💻 Desenvolvedores

- Enzo Age da Silveira
- Giovanni Filippi da Silva
- Guilherme Colodel
- Gabriel da Freiria

**Orientador:** Prof. Luiz Altamir Correa Junior
