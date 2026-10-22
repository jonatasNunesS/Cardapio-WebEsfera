import { Resultado, termosDeBusca, type ErroDeNegocio } from '@cardapio/dominio';
import type { FonteDoCardapioPublico, PratoEncontrado } from '../portas/fonte-do-cardapio-publico.ts';
import { CARDAPIO_NAO_ENCONTRADO } from './obter-cardapio-publicado.ts';

export type BuscaParaOCliente =
  | { readonly tipo: 'redirecionar'; readonly slug: string }
  | { readonly tipo: 'resultados'; readonly pratos: readonly PratoEncontrado[] };

export async function buscarPratos(
  dependencias: { readonly fonte: FonteDoCardapioPublico },
  slug: string,
  termo: string,
): Promise<Resultado<BuscaParaOCliente, ErroDeNegocio>> {
  const resolucao = await dependencias.fonte.resolver(slug);
  if (resolucao.situacao === 'inexistente') {
    return Resultado.falha(CARDAPIO_NAO_ENCONTRADO);
  }
  if (resolucao.situacao === 'redirecionar') {
    return Resultado.ok({ tipo: 'redirecionar', slug: resolucao.slugAtual });
  }
  const termos = termosDeBusca(termo);
  const pratos = termos.length === 0 ? [] : await dependencias.fonte.buscar(resolucao.restauranteId, termos);
  return Resultado.ok({ tipo: 'resultados', pratos });
}
