/// <reference lib="webworker" />
import { configuracaoDoBuild } from '@cardapio/observabilidade/web/configuracao';
import { ARQUIVO_DO_APP, cachesAntigos, estrategiaPara, type Estrategia } from './regras.ts';

declare const self: ServiceWorkerGlobalScope;

const VERSAO = configuracaoDoBuild().release;

async function redePrimeiro(pedido: Request, cache: string, chave: Request | string): Promise<Response> {
  const guardado = await caches.open(cache);
  return fetch(pedido).then(
    async (resposta) => {
      if (resposta.ok) {
        await guardado.put(chave, resposta.clone());
      }
      return resposta;
    },
    async (erro: unknown) => {
      const copia = await guardado.match(chave, { ignoreVary: true });
      if (copia === undefined) {
        throw erro;
      }
      return copia;
    },
  );
}

async function cachePrimeiro(pedido: Request, cache: string): Promise<Response> {
  const guardado = await caches.open(cache);
  const copia = await guardado.match(pedido, { ignoreVary: true });
  if (copia !== undefined) {
    return copia;
  }
  const resposta = await fetch(pedido);
  if (resposta.ok || resposta.type === 'opaque') {
    await guardado.put(pedido, resposta.clone());
  }
  return resposta;
}

function responder(pedido: Request, estrategia: Exclude<Estrategia, { tipo: 'rede' }>): Promise<Response> {
  switch (estrategia.tipo) {
    case 'pagina':
      return redePrimeiro(pedido, estrategia.cache, ARQUIVO_DO_APP);
    case 'cardapio':
      return redePrimeiro(pedido, estrategia.cache, pedido);
    case 'arquivo-do-app':
    case 'imagem':
      return cachePrimeiro(pedido, estrategia.cache);
  }
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(cachesAntigos(nomes, VERSAO).map((nome) => caches.delete(nome))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request: pedido } = evento;
  const estrategia = estrategiaPara(
    {
      metodo: pedido.method,
      url: pedido.url,
      modo: pedido.mode,
      destino: pedido.destination,
      referencia: pedido.referrer,
    },
    self.location.origin,
    VERSAO,
  );
  if (estrategia.tipo !== 'rede') {
    evento.respondWith(responder(pedido, estrategia));
  }
});
