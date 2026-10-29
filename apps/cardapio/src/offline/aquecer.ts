import { rotaCom, ROTAS_DO_CARDAPIO_PUBLICO } from '@cardapio/contratos/publico';
import type { RespostaCardapioPublico } from '@cardapio/contratos';
import { ARQUIVO_DO_APP, nomeDoCacheDoApp, nomeDoCacheDoCardapio } from './regras.ts';

export function arquivosCarregados(origem: string): string[] {
  return performance
    .getEntriesByType('resource')
    .map((entrada) => new URL(entrada.name))
    .filter((url) => url.origin === origem && url.pathname.startsWith('/assets/'))
    .map((url) => url.pathname);
}

export async function aquecerCache(cardapio: RespostaCardapioPublico, versao: string): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  const app = await caches.open(nomeDoCacheDoApp(versao));
  await app.addAll([ARQUIVO_DO_APP, ...arquivosCarregados(location.origin)]);
  const dados = await caches.open(nomeDoCacheDoCardapio(cardapio.restaurante.slug));
  await dados.put(
    rotaCom(ROTAS_DO_CARDAPIO_PUBLICO.cardapio, { slug: cardapio.restaurante.slug }),
    Response.json(cardapio),
  );
}

export function registrarTrabalhador(): Promise<unknown> {
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve();
  }
  return navigator.serviceWorker.register('/sw.js', { type: 'module', scope: '/' });
}
