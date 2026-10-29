export const PREFIXO_DO_APP = 'cardapio-app-';
export const PREFIXO_DO_CARDAPIO = 'cardapio-dados-';
export const PREFIXO_DAS_IMAGENS = 'cardapio-imagens-';
export const ARQUIVO_DO_APP = '/index.html';

const ROTA_DO_CARDAPIO = /^\/api\/v1\/cardapios\/([a-z0-9-]{1,80})$/;
const PAGINA_DA_MESA = /^\/([a-z0-9-]{1,80})\/mesa\//;

export interface PedidoObservado {
  readonly metodo: string;
  readonly url: string;
  readonly modo: string;
  readonly destino: string;
  readonly referencia: string;
}

export type Estrategia =
  | { readonly tipo: 'rede' }
  | { readonly tipo: 'pagina'; readonly cache: string }
  | { readonly tipo: 'arquivo-do-app'; readonly cache: string }
  | { readonly tipo: 'cardapio'; readonly cache: string }
  | { readonly tipo: 'imagem'; readonly cache: string };

export const nomeDoCacheDoApp = (versao: string) => `${PREFIXO_DO_APP}${versao}`;
export const nomeDoCacheDoCardapio = (slug: string) => `${PREFIXO_DO_CARDAPIO}${slug}`;
export const nomeDoCacheDasImagens = (slug: string) => `${PREFIXO_DAS_IMAGENS}${slug}`;

function slugDaPagina(endereco: string, origem: string): string | undefined {
  if (endereco === '') {
    return undefined;
  }
  const url = new URL(endereco);
  return url.origin === origem ? PAGINA_DA_MESA.exec(url.pathname)?.[1] : undefined;
}

export function estrategiaPara(pedido: PedidoObservado, origem: string, versao: string): Estrategia {
  if (pedido.metodo !== 'GET') {
    return { tipo: 'rede' };
  }
  const url = new URL(pedido.url);
  if (url.origin !== origem) {
    const slug = pedido.destino === 'image' ? slugDaPagina(pedido.referencia, origem) : undefined;
    return slug === undefined ? { tipo: 'rede' } : { tipo: 'imagem', cache: nomeDoCacheDasImagens(slug) };
  }
  if (pedido.modo === 'navigate') {
    return { tipo: 'pagina', cache: nomeDoCacheDoApp(versao) };
  }
  if (url.pathname.startsWith('/assets/')) {
    return { tipo: 'arquivo-do-app', cache: nomeDoCacheDoApp(versao) };
  }
  const slug = url.search === '' ? ROTA_DO_CARDAPIO.exec(url.pathname)?.[1] : undefined;
  return slug === undefined ? { tipo: 'rede' } : { tipo: 'cardapio', cache: nomeDoCacheDoCardapio(slug) };
}

export function cachesAntigos(nomes: readonly string[], versao: string): string[] {
  return nomes.filter((nome) => nome.startsWith(PREFIXO_DO_APP) && nome !== nomeDoCacheDoApp(versao));
}
