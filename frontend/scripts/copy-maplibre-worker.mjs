/**
 * Copia o worker do MapLibre para public/, onde o Vite serve arquivos como
 * estão, sem transformar nem empacotar.
 *
 * Sem isso o mapa não desenha, e falha calado nos dois ambientes por motivos
 * diferentes. Em desenvolvimento o Vite injeta um import de /@vite/client no
 * arquivo do worker, e esse módulo toca document, que não existe dentro de um
 * worker, então ele morre ao subir. No build de produção o Rollup nem emite o
 * arquivo, porque o MapLibre monta a URL do worker em tempo de execução a
 * partir de import.meta.url, e a referência escapa da análise estática: o
 * navegador acaba pedindo /assets/maplibre-gl-worker.mjs e recebe 404.
 *
 * Nos dois casos o sintoma é o mesmo e enganoso: o estilo carrega, o fundo
 * pinta, os controles aparecem e nenhum evento de erro dispara, mas nenhum tile
 * é decodificado e o evento load nunca chega. O mapa fica preto.
 *
 * Servindo os dois arquivos de public/ e apontando setWorkerUrl para eles, o
 * worker sobe intacto e o mesmo caminho vale para dev, preview e container.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const from = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const to = path.join(root, 'public', 'maplibre');

// O worker importa o chunk compartilhado por caminho relativo, então os dois
// precisam ficar lado a lado.
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!fs.existsSync(from)) {
  console.error('[maplibre] node_modules/maplibre-gl não encontrado. Rode npm install antes.');
  process.exit(1);
}

fs.mkdirSync(to, { recursive: true });

for (const file of FILES) {
  const source = path.join(from, file);
  if (!fs.existsSync(source)) {
    console.error(`[maplibre] arquivo esperado não existe: ${source}`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(to, file));
}

console.log(`[maplibre] worker copiado para public/maplibre (${FILES.join(', ')})`);
