# 🌍 Monitoramento Ambiental Real-Time

Dashboard de monitoramento climático e sísmico em tempo real.

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

### 3️⃣ Abrir o Frontend

Depois, na pasta `frontend/`:
```bash
cd ../frontend
serve .
```