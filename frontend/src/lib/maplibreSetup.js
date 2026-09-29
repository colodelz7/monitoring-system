import { setWorkerUrl } from 'maplibre-gl';

/**
 * O MapLibre decodifica tile vetorial em um web worker. Deixado por conta
 * própria, ele monta a URL do worker a partir de import.meta.url, e essa
 * referência não sobrevive nem ao servidor de desenvolvimento nem ao
 * empacotamento: em dev o arquivo chega com um import de /@vite/client dentro,
 * que quebra em contexto de worker, e no build o arquivo simplesmente não é
 * emitido, então a URL dá 404.
 *
 * O worker é copiado para public/maplibre por scripts/copy-maplibre-worker.mjs,
 * e apontar para lá é o que faz o mapa desenhar. Como a falha é silenciosa, sem
 * evento de erro e sem exceção, vale dizer o que ela parece: mapa preto, com
 * fundo do estilo pintado e controles por cima.
 */
let done = false;

export function setupMapLibre() {
  if (done) return;
  done = true;
  setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}
