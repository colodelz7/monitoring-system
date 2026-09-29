import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = process.env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],


  server: {
    port: Number(process.env.FRONTEND_PORT) || 5175,
    host: '127.0.0.1',
    // Sem porta alternativa silenciosa: se 5175 estiver ocupada o servidor falha
    // em vez de subir em outra, porque o endereco combinado importa.
    strictPort: true,
    // O proxy faz o dev server e a API compartilharem a origem, então o
    // navegador nunca emite requisição cross-origin e o caminho exercitado em
    // desenvolvimento é o mesmo de produção atrás do nginx.
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },

  preview: {
    port: Number(process.env.PREVIEW_PORT) || 4175,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
    },
  },

  build: {
    target: 'es2022',
    sourcemap: false,
    // Mapa e gráficos são as duas bibliotecas pesadas e nenhuma das duas faz
    // parte da primeira tela. Separadas, entram sob demanda e o carregamento
    // inicial deixa de arrastar o bundle inteiro.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          plotly: ['plotly.js-basic-dist-min'],
          maplibre: ['maplibre-gl'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
